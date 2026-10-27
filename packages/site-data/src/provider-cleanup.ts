export const providerCleanupKinds = [
  "vercel_blob",
  "vercel_domains",
  "stripe",
  "paddle",
  "resend",
  "openai",
  "google",
  "redi_control",
] as const;
export const providerCleanupOutcomes = [
  "completed",
  "already_absent",
  "detached",
  "retained_by_policy",
  "blocked",
  "retryable_failure",
  "permanent_failure",
  "uncertain",
  "manual_review_required",
  "unsupported",
  "no_provider_object",
] as const;
export type ProviderCleanupKind = (typeof providerCleanupKinds)[number];
export type ProviderCleanupOutcome = (typeof providerCleanupOutcomes)[number];
export type ProviderCleanupWork = {
  id: string;
  jobId: string;
  siteId: string;
  provider: ProviderCleanupKind;
  sourceKind: string;
  resourceKind: string;
  operation: "delete_exact" | "detach_exact" | "revoke_exact" | "retain";
  providerAuthority?: string;
  providerReference: string;
  referenceHash: string;
  attempt: number;
  maxAttempts: number;
  reconcile: boolean;
  correlationId?: string;
};
export type ProviderCleanupResult = {
  outcome: ProviderCleanupOutcome;
  reasonCode: string;
  receiptReference?: string;
  retryAfterSeconds?: number;
};
export interface ProviderCleanupAdapter {
  execute(work: ProviderCleanupWork): Promise<ProviderCleanupResult>;
  reconcile(work: ProviderCleanupWork): Promise<ProviderCleanupResult>;
}
export type ProviderCleanupRepository = {
  recoverCustomerDeletions(): Promise<number>;
  claimDeletionPlan(worker: string): Promise<string | undefined>;
  planCustomerDeletion(jobId: string, worker: string): Promise<string>;
  claimProviderCleanupWork(worker: string): Promise<ProviderCleanupWork | undefined>;
  recordProviderCleanupResult(input: {
    id: string;
    worker: string;
    outcome: ProviderCleanupOutcome;
    reasonCode: string;
    receiptReference?: string;
    retryAfterSeconds?: number;
  }): Promise<boolean>;
  claimDeletionExecution(worker: string): Promise<string | undefined>;
  executeCustomerDeletion(jobId: string, worker: string): Promise<boolean>;
  failCustomerDeletion(jobId: string, worker: string, error?: string): Promise<boolean>;
};

const enabled = (value: string | undefined) => value?.trim() === "true";
const production = (environment: Record<string, string | undefined>) =>
  environment.RELEASE_TARGET === "production" ||
  environment.VERCEL_ENV === "production" ||
  (!environment.VERCEL_ENV && environment.NODE_ENV === "production");
export function providerCleanupWorkerEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return enabled(environment.PRIVACY_DELETION_EXECUTION_ENABLED) &&
    enabled(environment.PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED);
}
export function providerCleanupReconciliationEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return providerCleanupWorkerEnabled(environment) &&
    enabled(environment.PRIVACY_PROVIDER_RECONCILIATION_ENABLED);
}
export function providerCleanupProviderEnabled(
  provider: ProviderCleanupKind,
  environment: Record<string, string | undefined> = process.env,
) {
  return providerCleanupWorkerEnabled(environment) &&
    enabled(environment[`PRIVACY_PROVIDER_${provider.toUpperCase()}_ENABLED`]);
}
export function isProviderCleanupProduction(environment: Record<string, string | undefined>) {
  return production(environment);
}
export class DeterministicFakeProviderCleanupAdapter
  implements ProviderCleanupAdapter
{
  constructor(
    private readonly outcomes: Partial<Record<ProviderCleanupKind, ProviderCleanupResult>> = {},
    environment: Record<string, string | undefined> = process.env,
  ) {
    if (production(environment)) throw new Error("fake_provider_cleanup_forbidden");
  }
  async execute(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    return this.outcomes[work.provider] ?? {
      outcome: work.operation === "retain" ? "retained_by_policy" : "completed",
      reasonCode: work.operation === "retain" ? "retention_required" : "fake_verified",
      receiptReference: `fake.${work.provider}.${work.id}`,
    };
  }
  async reconcile(work: ProviderCleanupWork): Promise<ProviderCleanupResult> {
    return this.outcomes[work.provider] ?? {
      outcome: "already_absent",
      reasonCode: "fake_reconciled_absent",
      receiptReference: `fake.reconcile.${work.provider}.${work.id}`,
    };
  }
}

export async function runProviderCleanupDeletionWorker(input: {
  repository: ProviderCleanupRepository;
  adapter: ProviderCleanupAdapter;
  workerReference: string;
  environment?: Record<string, string | undefined>;
}) {
  const environment = input.environment ?? process.env;
  if (!providerCleanupWorkerEnabled(environment))
    return { enabled: false, action: "none" as const };
  await input.repository.recoverCustomerDeletions();
  const planId = await input.repository.claimDeletionPlan(input.workerReference);
  if (planId)
    return {
      enabled: true,
      action: "planned" as const,
      jobId: planId,
      result: await input.repository.planCustomerDeletion(planId, input.workerReference),
    };
  const work = await input.repository.claimProviderCleanupWork(input.workerReference);
  if (work) {
    // Retention/no-provider-object evidence performs no destructive provider
    // transport, so it must remain classifiable while unrelated provider
    // cleanup flags stay off. Destructive operations still require their exact
    // provider flag.
    const permitted = work.operation === "retain" ||
      providerCleanupProviderEnabled(work.provider, environment);
    const result = !permitted
      ? { outcome: "manual_review_required" as const, reasonCode: "provider_disabled" }
      : work.reconcile && !providerCleanupReconciliationEnabled(environment)
        ? { outcome: "manual_review_required" as const, reasonCode: "reconciliation_disabled" }
        : work.reconcile
          ? await input.adapter.reconcile(work)
          : await input.adapter.execute(work);
    const recorded = await input.repository.recordProviderCleanupResult({
      id: work.id,
      worker: input.workerReference,
      outcome: result.outcome,
      reasonCode: result.reasonCode,
      receiptReference: result.receiptReference,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    if (!recorded) throw new Error("provider_cleanup_result_not_recorded");
    return { enabled: true, action: "provider" as const, jobId: work.jobId, outcome: result.outcome };
  }
  const jobId = await input.repository.claimDeletionExecution(input.workerReference);
  if (!jobId) return { enabled: true, action: "none" as const };
  try {
    return { enabled: true, action: "executed" as const, jobId, success: await input.repository.executeCustomerDeletion(jobId, input.workerReference) };
  } catch (error) {
    await input.repository.failCustomerDeletion(jobId, input.workerReference);
    throw error;
  }
}
