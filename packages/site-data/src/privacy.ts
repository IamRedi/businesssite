import {
  getOwnerPostgresPool,
  getRuntimePostgresPool,
  getSystemPostgresPool,
  type Pool,
} from "@platform/database";
import { randomUUID } from "node:crypto";
import {
  buildPrivacyArchive,
  encryptPrivacyArchive,
  privacyExportKeys,
  privacyExportObjectKey,
  sha256,
  type PrivacyArtifactBinding,
  type PrivacyArtifactStore,
  type PrivacyExportSnapshot,
} from "./privacy-export";
import type {
  ProviderCleanupOutcome,
  ProviderCleanupWork,
} from "./provider-cleanup";

export const privacySubjectKinds = [
  "customer_account",
  "site",
  "owner_account",
  "appointment",
  "lead",
  "editorial_member",
  "invitation",
  "integration",
] as const;
export const privacyDataClasses = [
  "appointments",
  "finder_cache",
  "abandoned_finder_searches",
  "qualified_leads",
  "ai_detail",
  "usage_events",
  "usage_aggregates",
  "canceled_customer",
  "export_artifacts",
  "security_audit",
  "webhook_redi_evidence",
  "ephemeral_security",
  "media_content",
  "active_subscription",
  "owner_account",
  "contract_billing_accounting",
  "trial_demo",
] as const;
export const privacyHoldReasons = [
  "litigation",
  "regulatory_request",
  "billing_dispute",
  "security_incident",
  "contract_dispute",
  "data_subject_dispute",
] as const;
export type PrivacySubjectKind = (typeof privacySubjectKinds)[number];
export type PrivacyDataClass = (typeof privacyDataClasses)[number];
export type PrivacyHoldReason = (typeof privacyHoldReasons)[number];
export type PrivacyFreshActor = {
  currentPasswordHash: string;
  totpStep: number;
  correlationId?: string;
};
export type PrivacyExportStatus = {
  jobId: string;
  status: string;
  errorCode?: string;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  artifact?: null | {
    artifactId: string;
    createdAt: string;
    expiresAt: string;
    archiveBytes: number;
    fileCount: number;
    status: string;
  };
};
export type PrivacyDownloadDescriptor = {
  artifactId: string;
  jobId: string;
  provider: "memory_test" | "vercel_blob";
  storeAuthority: string;
  environmentIdentity: string;
  objectKey: string;
  keyVersion: string;
  ciphertextChecksum: string;
  plaintextChecksum: string;
  archiveBytes: number;
  encryptedBytes: number;
};

export type PrivacySnapshot = {
  policy: null | {
    id: string;
    policyKey: string;
    version: number;
    status: string;
    manifestHash: string;
    valid: boolean;
    activatedAt: string;
    manifest: Record<string, unknown>;
  };
  rules: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  holds: Array<Record<string, unknown>>;
  deletions: Array<Record<string, unknown>>;
};

export const customerDeletionReasons = [
  "business_closed",
  "service_no_longer_needed",
  "business_transferred",
  "privacy_request",
  "other",
] as const;
export type CustomerDeletionReason = (typeof customerDeletionReasons)[number];
export type CustomerDeletionStatus = Record<string, unknown> & {
  jobId: string;
  phase: string;
};
export type DeletionProviderItem = {
  id: string;
  jobId: string;
  provider: string;
  referenceHash: string;
};

const mutation = (
  row:
    | {
        ok?: boolean;
        reason?: string;
        job_id?: string;
        hold_id?: string;
        policy_id?: string;
      }
    | undefined,
) => ({
  ok: Boolean(row?.ok),
  reason: row?.reason ?? undefined,
  jobId: row?.job_id ?? undefined,
  holdId: row?.hold_id ?? undefined,
  policyId: row?.policy_id ?? undefined,
});
const download = (
  row: Record<string, unknown> | undefined,
): PrivacyDownloadDescriptor | undefined =>
  row
    ? {
        artifactId: String(row.artifact_id),
        jobId: String(row.job_id),
        provider: String(row.provider) as PrivacyDownloadDescriptor["provider"],
        storeAuthority: String(row.store_authority),
        environmentIdentity: String(row.environment_identity),
        objectKey: String(row.object_key),
        keyVersion: String(row.key_version),
        ciphertextChecksum: String(row.ciphertext_checksum),
        plaintextChecksum: String(row.plaintext_checksum),
        archiveBytes: Number(row.archive_bytes),
        encryptedBytes: Number(row.encrypted_bytes),
      }
    : undefined;

export function privacyRetentionExecutionEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.PRIVACY_RETENTION_EXECUTION_ENABLED?.trim() === "true";
}

export function privacyDeletionRequestsEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.PRIVACY_DELETION_REQUESTS_ENABLED?.trim() === "true";
}

export function privacyDeletionExecutionEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.PRIVACY_DELETION_EXECUTION_ENABLED?.trim() === "true";
}

export class PostgresPrivacyRepository {
  private readonly pool: Pool;
  private readonly sessionHash?: string;
  private readonly boundary: "runtime" | "owner" | "system";
  constructor(input: {
    boundary: "runtime" | "owner" | "system";
    sessionHash?: string;
    pool?: Pool;
  }) {
    this.boundary = input.boundary;
    this.sessionHash = input.sessionHash;
    this.pool =
      input.pool ??
      (input.boundary === "owner"
        ? getOwnerPostgresPool()
        : input.boundary === "runtime"
          ? getRuntimePostgresPool()
          : getSystemPostgresPool());
  }
  private ownerSession() {
    if (this.boundary !== "owner" || !this.sessionHash)
      throw new Error("Owner privacy boundary required.");
    return this.sessionHash;
  }
  private system() {
    if (this.boundary !== "system")
      throw new Error("System privacy boundary required.");
  }
  async snapshot(): Promise<PrivacySnapshot | null> {
    const result = await this.pool.query(
      "select owner_privacy_snapshot($1) value",
      [this.ownerSession()],
    );
    return result.rows[0]?.value ?? null;
  }
  async jobItems(jobId: string) {
    return (
      await this.pool.query("select * from owner_privacy_job_items($1,$2)", [
        this.ownerSession(),
        jobId,
      ])
    ).rows;
  }
  async startDryRun(
    actor: PrivacyFreshActor,
    subjectKind: PrivacySubjectKind,
    subjectReference: string,
  ) {
    return mutation(
      (
        await this.pool.query(
          "select * from owner_privacy_start_dry_run($1,$2,$3,$4,$5,$6)",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            subjectKind,
            subjectReference,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0],
    );
  }
  async createHold(
    actor: PrivacyFreshActor,
    input: {
      subjectKind: PrivacySubjectKind;
      subjectReference: string;
      dataClasses: PrivacyDataClass[];
      reason: PrivacyHoldReason;
      externalReference?: string;
      endsAt?: string;
    },
  ) {
    return mutation(
      (
        await this.pool.query(
          "select * from owner_privacy_create_hold($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            input.subjectKind,
            input.subjectReference,
            input.dataClasses,
            input.reason,
            input.externalReference ?? "",
            input.endsAt ?? null,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0],
    );
  }
  async releaseHold(actor: PrivacyFreshActor, holdId: string) {
    return Boolean(
      (
        await this.pool.query(
          "select owner_privacy_release_hold($1,$2,$3,$4,$5) ok",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            holdId,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async clonePolicy(actor: PrivacyFreshActor, version: number) {
    return mutation(
      (
        await this.pool.query(
          "select * from owner_privacy_clone_policy($1,$2,$3,$4,$5)",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            version,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0],
    );
  }
  async activatePolicy(actor: PrivacyFreshActor, policyId: string) {
    return Boolean(
      (
        await this.pool.query(
          "select owner_privacy_activate_policy($1,$2,$3,$4,$5) ok",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            policyId,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async controlJob(
    actor: PrivacyFreshActor,
    jobId: string,
    action: "retry" | "cancel",
  ) {
    return Boolean(
      (
        await this.pool.query(
          "select owner_privacy_control_job($1,$2,$3,$4,$5,$6) ok",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            jobId,
            action,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async enqueueRetentionScan(
    subjectKind: PrivacySubjectKind,
    subjectReference: string,
    correlationId?: string,
  ) {
    this.system();
    return (
      await this.pool.query(
        "select privacy_system_enqueue_retention_scan($1,$2,$3) id",
        [subjectKind, subjectReference, correlationId ?? null],
      )
    ).rows[0]?.id as string | undefined;
  }
  async claimRetentionScan(workerReference: string, leaseSeconds = 300) {
    this.system();
    return (
      await this.pool.query(
        "select privacy_system_claim_retention_job($1,$2) id",
        [workerReference, leaseSeconds],
      )
    ).rows[0]?.id as string | undefined;
  }
  async planRetentionScan(jobId: string, workerReference: string) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_plan_retention_job($1,$2) ok",
          [jobId, workerReference],
        )
      ).rows[0]?.ok,
    );
  }
  async recoverStuckRetentionScans() {
    this.system();
    return Number(
      (
        await this.pool.query(
          "select privacy_system_recover_stuck_jobs() count",
        )
      ).rows[0]?.count ?? 0,
    );
  }
  async requestCustomerExport(
    sessionHash: string,
    currentPasswordHash: string,
    correlationId?: string,
  ) {
    const row = (
      await this.pool.query(
        "select * from site_admin_request_privacy_export($1,$2,$3)",
        [sessionHash, currentPasswordHash, correlationId ?? null],
      )
    ).rows[0];
    return mutation(row);
  }
  async requestOwnerSelfExport(actor: PrivacyFreshActor) {
    const row = (
      await this.pool.query(
        "select * from owner_request_self_privacy_export($1,$2,$3,$4)",
        [
          this.ownerSession(),
          actor.currentPasswordHash,
          actor.totpStep,
          actor.correlationId ?? null,
        ],
      )
    ).rows[0];
    return mutation(row);
  }
  async customerExportStatus(sessionHash: string) {
    return (
      await this.pool.query(
        "select site_admin_privacy_export_status($1) value",
        [sessionHash],
      )
    ).rows[0]?.value as PrivacyExportStatus | null;
  }
  async requestCustomerDeletion(input: {
    sessionHash: string;
    currentPasswordHash: string;
    reason: CustomerDeletionReason;
    note?: string;
    acknowledged: boolean;
    correlationId?: string;
  }) {
    const row = (
      await this.pool.query(
        "select * from site_admin_request_customer_deletion($1,$2,$3,$4,$5,$6)",
        [
          input.sessionHash,
          input.currentPasswordHash,
          input.reason,
          input.note ?? null,
          input.acknowledged,
          input.correlationId ?? null,
        ],
      )
    ).rows[0];
    return mutation(row);
  }
  async customerDeletionStatus(sessionHash: string) {
    return (
      await this.pool.query(
        "select site_admin_customer_deletion_status($1) value",
        [sessionHash],
      )
    ).rows[0]?.value as CustomerDeletionStatus | null;
  }
  async cancelCustomerDeletion(input: {
    sessionHash: string;
    currentPasswordHash: string;
    jobId: string;
    correlationId?: string;
  }) {
    return Boolean(
      (
        await this.pool.query(
          "select site_admin_cancel_customer_deletion($1,$2,$3,$4) ok",
          [
            input.sessionHash,
            input.currentPasswordHash,
            input.jobId,
            input.correlationId ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async reviewCustomerDeletion(
    actor: PrivacyFreshActor,
    jobId: string,
    decision: "approve" | "reject",
    reason: string,
  ) {
    const row = (
      await this.pool.query(
        "select * from owner_review_customer_deletion($1,$2,$3,$4,$5,$6,$7)",
        [
          this.ownerSession(),
          actor.currentPasswordHash,
          actor.totpStep,
          jobId,
          decision,
          reason,
          actor.correlationId ?? null,
        ],
      )
    ).rows[0];
    return mutation(row);
  }
  async recordCustomerDeletionLegalReview(
    actor: PrivacyFreshActor,
    jobId: string,
    reference: string,
  ) {
    return Boolean(
      (
        await this.pool.query(
          "select owner_record_customer_deletion_legal_review($1,$2,$3,$4,$5,$6) ok",
          [
            this.ownerSession(),
            actor.currentPasswordHash,
            actor.totpStep,
            jobId,
            reference,
            actor.correlationId ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async recoverCustomerDeletions() {
    this.system();
    return Number(
      (
        await this.pool.query(
          "select privacy_system_recover_customer_deletions() count",
        )
      ).rows[0]?.count ?? 0,
    );
  }
  async claimDeletionPlan(worker: string) {
    this.system();
    return (
      await this.pool.query(
        "select privacy_system_claim_deletion_plan($1,$2) id",
        [worker, 300],
      )
    ).rows[0]?.id as string | undefined;
  }
  async planCustomerDeletion(jobId: string, worker: string) {
    this.system();
    return String(
      (
        await this.pool.query(
          "select privacy_system_plan_customer_deletion($1,$2) result",
          [jobId, worker],
        )
      ).rows[0]?.result ?? "denied",
    );
  }
  async claimDeletionProviderItem(worker: string) {
    this.system();
    const row = (
      await this.pool.query(
        "select * from privacy_system_claim_deletion_provider_item($1,$2)",
        [worker, 300],
      )
    ).rows[0];
    return row
      ? ({
          id: row.id,
          jobId: row.job_id,
          provider: row.provider,
          referenceHash: row.reference_hash,
        } as DeletionProviderItem)
      : undefined;
  }
  async finishDeletionProviderItem(
    id: string,
    worker: string,
    success: boolean,
    checksum?: string,
  ) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_finish_deletion_provider_item($1,$2,$3,$4) ok",
          [id, worker, success, checksum ?? null],
        )
      ).rows[0]?.ok,
    );
  }
  async claimProviderCleanupWork(worker: string) {
    this.system();
    const row = (
      await this.pool.query(
        "select * from privacy_system_claim_provider_cleanup_work_v2($1,$2)",
        [worker, 300],
      )
    ).rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      jobId: row.job_id,
      siteId: row.site_id,
      provider: row.provider,
      sourceKind: row.source_kind,
      resourceKind: row.resource_kind,
      operation: row.operation,
      providerAuthority: row.provider_authority ?? undefined,
      providerReference: row.provider_reference,
      referenceHash: row.reference_hash,
      attempt: Number(row.attempt),
      maxAttempts: Number(row.max_attempts),
      reconcile: Boolean(row.reconcile),
      correlationId: row.correlation_id ?? undefined,
    } as ProviderCleanupWork;
  }
  async recordProviderCleanupResult(input: {
    id: string;
    worker: string;
    outcome: ProviderCleanupOutcome;
    reasonCode: string;
    receiptReference?: string;
    retryAfterSeconds?: number;
  }) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_record_provider_cleanup_result($1,$2,$3,$4,$5,$6) ok",
          [
            input.id,
            input.worker,
            input.outcome,
            input.reasonCode,
            input.receiptReference ?? null,
            input.retryAfterSeconds ?? null,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async claimDeletionExecution(worker: string) {
    this.system();
    return (
      await this.pool.query(
        "select privacy_system_claim_deletion_execution($1,$2) id",
        [worker, 300],
      )
    ).rows[0]?.id as string | undefined;
  }
  async executeCustomerDeletion(jobId: string, worker: string) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_execute_customer_deletion($1,$2) ok",
          [jobId, worker],
        )
      ).rows[0]?.ok,
    );
  }
  async failCustomerDeletion(
    jobId: string,
    worker: string,
    error = "controlled_failure",
  ) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_fail_customer_deletion($1,$2,$3) ok",
          [jobId, worker, error],
        )
      ).rows[0]?.ok,
    );
  }
  async ownerSelfExportStatus() {
    return (
      await this.pool.query(
        "select owner_self_privacy_export_status($1) value",
        [this.ownerSession()],
      )
    ).rows[0]?.value as PrivacyExportStatus | null;
  }
  async claimExport(workerReference: string, leaseSeconds = 300) {
    this.system();
    return (
      await this.pool.query("select privacy_system_claim_export($1,$2) id", [
        workerReference,
        leaseSeconds,
      ])
    ).rows[0]?.id as string | undefined;
  }
  async exportSnapshot(jobId: string, workerReference: string) {
    this.system();
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read");
      const value = (
        await client.query(
          "select privacy_system_export_snapshot($1,$2) value",
          [jobId, workerReference],
        )
      ).rows[0]?.value as PrivacyExportSnapshot | null;
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async completeExport(input: {
    jobId: string;
    workerReference: string;
    artifactId: string;
    adapter: string;
    objectKey: string;
    keyVersion: string;
    ciphertextChecksum: string;
    plaintextChecksum: string;
    archiveBytes: number;
    encryptedBytes: number;
    fileCount: number;
  }) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_complete_export($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ok",
          [
            input.jobId,
            input.workerReference,
            input.artifactId,
            input.adapter,
            input.objectKey,
            input.keyVersion,
            input.ciphertextChecksum,
            input.plaintextChecksum,
            input.archiveBytes,
            input.encryptedBytes,
            input.fileCount,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async reserveExport(input: {
    jobId: string;
    workerReference: string;
    artifactId: string;
    adapter: string;
    provider: string;
    storeAuthority: string;
    environmentIdentity: string;
    objectKey: string;
    keyVersion: string;
    ciphertextChecksum: string;
    plaintextChecksum: string;
    archiveBytes: number;
    encryptedBytes: number;
    fileCount: number;
  }) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_reserve_export($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ok",
          [
            input.jobId,
            input.workerReference,
            input.artifactId,
            input.adapter,
            input.provider,
            input.storeAuthority,
            input.environmentIdentity,
            input.objectKey,
            input.keyVersion,
            input.ciphertextChecksum,
            input.plaintextChecksum,
            input.archiveBytes,
            input.encryptedBytes,
            input.fileCount,
          ],
        )
      ).rows[0]?.ok,
    );
  }
  async recoverStuckExports() {
    this.system();
    return Number(
      (
        await this.pool.query(
          "select privacy_system_recover_stuck_exports() recovered",
        )
      ).rows[0]?.recovered ?? 0,
    );
  }
  async failExport(jobId: string, workerReference: string, errorCode: string) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_fail_export($1,$2,$3) ok",
          [jobId, workerReference, errorCode],
        )
      ).rows[0]?.ok,
    );
  }
  async issueCustomerCapability(
    sessionHash: string,
    currentPasswordHash: string,
    jobId: string,
    tokenHash: string,
    correlationId?: string,
  ) {
    const row = (
      await this.pool.query(
        "select * from site_admin_issue_export_capability($1,$2,$3,$4,$5)",
        [
          sessionHash,
          currentPasswordHash,
          jobId,
          tokenHash,
          correlationId ?? null,
        ],
      )
    ).rows[0];
    return {
      ok: Boolean(row?.ok),
      reason: row?.reason as string | undefined,
      artifactId: row?.artifact_id as string | undefined,
    };
  }
  async issueOwnerCapability(
    actor: PrivacyFreshActor,
    jobId: string,
    tokenHash: string,
  ) {
    const row = (
      await this.pool.query(
        "select * from owner_issue_self_export_capability($1,$2,$3,$4,$5,$6)",
        [
          this.ownerSession(),
          actor.currentPasswordHash,
          actor.totpStep,
          jobId,
          tokenHash,
          actor.correlationId ?? null,
        ],
      )
    ).rows[0];
    return {
      ok: Boolean(row?.ok),
      reason: row?.reason as string | undefined,
      artifactId: row?.artifact_id as string | undefined,
    };
  }
  async consumeCustomerCapability(sessionHash: string, tokenHash: string) {
    return download(
      (
        await this.pool.query(
          "select * from site_admin_consume_export_capability($1,$2)",
          [sessionHash, tokenHash],
        )
      ).rows[0],
    );
  }
  async consumeOwnerCapability(tokenHash: string) {
    return download(
      (
        await this.pool.query(
          "select * from owner_consume_self_export_capability($1,$2)",
          [this.ownerSession(), tokenHash],
        )
      ).rows[0],
    );
  }
  async recordCustomerDownload(
    sessionHash: string,
    jobId: string,
    success: boolean,
  ) {
    return Boolean(
      (
        await this.pool.query(
          "select site_admin_record_export_download($1,$2,$3) ok",
          [sessionHash, jobId, success],
        )
      ).rows[0]?.ok,
    );
  }
  async recordOwnerDownload(jobId: string, success: boolean) {
    return Boolean(
      (
        await this.pool.query(
          "select owner_record_self_export_download($1,$2,$3) ok",
          [this.ownerSession(), jobId, success],
        )
      ).rows[0]?.ok,
    );
  }
  async expiredArtifacts(limit = 25) {
    this.system();
    return (
      await this.pool.query(
        "select * from privacy_system_expired_artifacts($1)",
        [limit],
      )
    ).rows.map((row) => ({
      artifactId: String(row.id),
      jobId: String(row.job_id),
      provider: String(row.provider) as PrivacyArtifactBinding["provider"],
      storeAuthority: String(row.store_authority),
      environmentIdentity: String(row.environment_identity),
      objectKey: String(row.object_key),
    })) as Array<PrivacyArtifactBinding>;
  }
  async markArtifactDeleted(id: string, deleted: boolean) {
    this.system();
    return Boolean(
      (
        await this.pool.query(
          "select privacy_system_mark_artifact_deleted($1,$2) ok",
          [id, deleted],
        )
      ).rows[0]?.ok,
    );
  }
}

export interface DeletionProviderAdapter {
  cleanup(
    item: DeletionProviderItem,
  ): Promise<{ success: boolean; tombstoneChecksum?: string }>;
}
export class DeterministicFakeDeletionProviderAdapter implements DeletionProviderAdapter {
  constructor(environment: Record<string, string | undefined> = process.env) {
    if (
      environment.NODE_ENV === "production" ||
      environment.RELEASE_TARGET === "production"
    )
      throw new Error("fake_deletion_provider_forbidden");
  }
  async cleanup(item: DeletionProviderItem) {
    return {
      success: true,
      tombstoneChecksum: sha256(
        `fake-deletion|${item.provider}|${item.referenceHash}`,
      ),
    };
  }
}
export async function runCustomerDeletionWorker(input: {
  repository: Pick<
    PostgresPrivacyRepository,
    | "recoverCustomerDeletions"
    | "claimDeletionPlan"
    | "planCustomerDeletion"
    | "claimDeletionProviderItem"
    | "finishDeletionProviderItem"
    | "claimDeletionExecution"
    | "executeCustomerDeletion"
    | "failCustomerDeletion"
  >;
  provider: DeletionProviderAdapter;
  workerReference: string;
  environment?: Record<string, string | undefined>;
}) {
  if (!privacyDeletionExecutionEnabled(input.environment))
    return { enabled: false, action: "none" as const };
  await input.repository.recoverCustomerDeletions();
  const planId = await input.repository.claimDeletionPlan(
    input.workerReference,
  );
  if (planId)
    return {
      enabled: true,
      action: "planned" as const,
      jobId: planId,
      result: await input.repository.planCustomerDeletion(
        planId,
        input.workerReference,
      ),
    };
  const item = await input.repository.claimDeletionProviderItem(
    input.workerReference,
  );
  if (item) {
    const result = await input.provider.cleanup(item);
    await input.repository.finishDeletionProviderItem(
      item.id,
      input.workerReference,
      result.success,
      result.tombstoneChecksum,
    );
    return {
      enabled: true,
      action: "provider" as const,
      jobId: item.jobId,
      success: result.success,
    };
  }
  const jobId = await input.repository.claimDeletionExecution(
    input.workerReference,
  );
  if (!jobId) return { enabled: true, action: "none" as const };
  try {
    return {
      enabled: true,
      action: "executed" as const,
      jobId,
      success: await input.repository.executeCustomerDeletion(
        jobId,
        input.workerReference,
      ),
    };
  } catch (error) {
    await input.repository.failCustomerDeletion(jobId, input.workerReference);
    throw error;
  }
}

export async function runPrivacyRetentionScheduler(input: {
  repository: Pick<
    PostgresPrivacyRepository,
    "recoverStuckRetentionScans" | "claimRetentionScan" | "planRetentionScan"
  >;
  workerReference: string;
  environment?: Record<string, string | undefined>;
}) {
  if (!privacyRetentionExecutionEnabled(input.environment))
    return { enabled: false, claimed: false, planned: false };
  await input.repository.recoverStuckRetentionScans();
  const jobId = await input.repository.claimRetentionScan(
    input.workerReference,
  );
  if (!jobId) return { enabled: true, claimed: false, planned: false };
  return {
    enabled: true,
    claimed: true,
    planned: await input.repository.planRetentionScan(
      jobId,
      input.workerReference,
    ),
    jobId,
  };
}

export function privacyExportExecutionEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.PRIVACY_EXPORT_ENABLED?.trim() === "true";
}
const controlledExportError = (error: unknown) =>
  error instanceof Error && /export_limit_exceeded/.test(error.message)
    ? "export_limit_exceeded"
    : error instanceof Error && /policy_unavailable/.test(error.message)
      ? "policy_unavailable"
      : error instanceof Error && /persistence/.test(error.message)
        ? "artifact_persistence_uncertain"
        : error instanceof Error &&
            /(store|provider|artifact_conflict|Blob|blob)/.test(error.message)
          ? "artifact_store_failed"
          : error instanceof Error && /archive/.test(error.message)
            ? "archive_failed"
            : error instanceof Error && /(key|encrypt)/.test(error.message)
              ? "encryption_failed"
              : "controlled_failure";
export async function runPrivacyExportWorker(input: {
  repository: Pick<
    PostgresPrivacyRepository,
    | "claimExport"
    | "exportSnapshot"
    | "reserveExport"
    | "completeExport"
    | "failExport"
    | "markArtifactDeleted"
    | "recoverStuckExports"
  >;
  store: PrivacyArtifactStore;
  workerReference: string;
  environment?: Record<string, string | undefined>;
}) {
  const environment = input.environment ?? process.env;
  if (!privacyExportExecutionEnabled(environment))
    return { enabled: false, claimed: false, completed: false };
  if (
    !input.store.privateOnly ||
    (input.store.adapter === "memory_test" &&
      (environment.RELEASE_TARGET === "production" ||
        environment.VERCEL_ENV === "production" ||
        (!environment.VERCEL_ENV && environment.NODE_ENV === "production")))
  )
    throw new Error("privacy_export_private_store_required");
  const keys = privacyExportKeys(environment);
  const recoveredStuck = await input.repository.recoverStuckExports();
  const jobId = await input.repository.claimExport(input.workerReference);
  if (!jobId)
    return {
      enabled: true,
      claimed: false,
      completed: false,
      recoveredStuck,
    };
  let binding: PrivacyArtifactBinding | undefined;
  let reserved = false;
  try {
    const snapshot = await input.repository.exportSnapshot(
      jobId,
      input.workerReference,
    );
    if (!snapshot) throw new Error("archive_snapshot_invalid");
    const archive = buildPrivacyArchive(snapshot);
    const encrypted = encryptPrivacyArchive(archive.bytes, keys);
    const artifactId = randomUUID();
    binding = {
      ...input.store.authority,
      artifactId,
      jobId,
      objectKey: privacyExportObjectKey(
        input.store.authority.environmentIdentity,
        artifactId,
      ),
    };
    reserved = await input.repository.reserveExport({
      jobId,
      workerReference: input.workerReference,
      artifactId,
      adapter: input.store.adapter,
      provider: binding.provider,
      storeAuthority: binding.storeAuthority,
      environmentIdentity: binding.environmentIdentity,
      objectKey: binding.objectKey,
      keyVersion: encrypted.keyVersion,
      ciphertextChecksum: encrypted.ciphertextChecksum,
      plaintextChecksum: archive.checksum,
      archiveBytes: archive.bytes.byteLength,
      encryptedBytes: encrypted.bytes.byteLength,
      fileCount: archive.fileCount,
    });
    if (!reserved) throw new Error("artifact_persistence_uncertain");
    await input.store.create(binding, encrypted.bytes);
    const completed = await input.repository.completeExport({
      jobId,
      workerReference: input.workerReference,
      artifactId,
      adapter: input.store.adapter,
      objectKey: binding.objectKey,
      keyVersion: encrypted.keyVersion,
      ciphertextChecksum: encrypted.ciphertextChecksum,
      plaintextChecksum: archive.checksum,
      archiveBytes: archive.bytes.byteLength,
      encryptedBytes: encrypted.bytes.byteLength,
      fileCount: archive.fileCount,
    });
    if (!completed) throw new Error("artifact_persistence_uncertain");
    return {
      enabled: true,
      claimed: true,
      completed: true,
      jobId,
      artifactId,
      recoveredStuck,
    };
  } catch (error) {
    let cleanupFailed = false;
    if (reserved && binding)
      try {
        await input.store.delete(binding);
        await input.repository.markArtifactDeleted(binding.artifactId, true);
      } catch {
        cleanupFailed = true;
        try {
          await input.repository.markArtifactDeleted(binding.artifactId, false);
        } catch {}
      }
    const errorCode = controlledExportError(error);
    await input.repository.failExport(jobId, input.workerReference, errorCode);
    return {
      enabled: true,
      claimed: true,
      completed: false,
      jobId,
      errorCode,
      cleanupFailed,
      recoveredStuck,
    };
  }
}
export async function cleanupPrivacyExportArtifacts(input: {
  repository: Pick<
    PostgresPrivacyRepository,
    "expiredArtifacts" | "markArtifactDeleted"
  >;
  store: PrivacyArtifactStore;
  limit?: number;
}) {
  const candidates = await input.repository.expiredArtifacts(input.limit ?? 25);
  let deleted = 0,
    failed = 0,
    securityFailed = 0;
  for (const artifact of candidates) {
    try {
      await input.store.delete(artifact);
      if (await input.repository.markArtifactDeleted(artifact.artifactId, true))
        deleted++;
    } catch (error) {
      await input.repository.markArtifactDeleted(artifact.artifactId, false);
      failed++;
      if (
        error instanceof Error &&
        /(authority|identity|binding)/.test(error.message)
      )
        securityFailed++;
    }
  }
  return { scanned: candidates.length, deleted, failed, securityFailed };
}
