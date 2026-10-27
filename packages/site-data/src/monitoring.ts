import { getSystemPostgresPool, type Pool } from "@platform/database";

export const operationalSignalCodes = [
  "database_connection_saturation",
  "billing_webhook_rejected",
  "privacy_job_failed",
  "privacy_job_blocked",
  "privacy_job_stale_lease",
  "privacy_job_overdue_retry",
  "privacy_provider_cleanup_problem",
  "scheduled_backup_failed",
  "backup_stale",
  "backup_integrity_failed",
  "restore_drill_failed",
  "recovery_target_readiness_failed",
  "privacy_export_generation_failed",
  "privacy_export_storage_failed",
  "privacy_export_persistence_uncertain",
  "privacy_export_cleanup_failed",
  "privacy_export_stuck",
  "privacy_export_object_missing",
  "privacy_export_security_invariant_violation",
] as const;

export type OperationalSignalCode = (typeof operationalSignalCodes)[number];
export type OperationalSignal = {
  code: OperationalSignalCode;
  severity: "warning" | "critical";
  count: number;
};
export type OperationalSnapshot = {
  schema: "businesssite.operational-snapshot.v1";
  checkedAt: string;
  status: "ok" | "alert";
  thresholds: {
    webhookWindowMinutes: number;
    staleLeaseMinutes: number;
    databaseConnectionWarningPercent: number;
  };
  metrics: Record<string, number>;
  signals: OperationalSignal[];
};

export type OperationalHeartbeat = {
  schema: "businesssite.operational-heartbeat.v1";
  checkedAt: string;
  status: "healthy" | "running" | "unhealthy" | "missed" | "stalled";
  reason:
    | "within_threshold"
    | "run_in_progress"
    | "last_run_unhealthy"
    | "no_completed_run"
    | "completion_too_old"
    | "run_not_completed";
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastHealthyAt?: string;
  lastRunStatus?: "running" | "healthy" | "alert" | "delivery_failed" | "error";
  signalCount: number;
  deliveryHealthy: boolean;
  runCount: number;
  maxAgeSeconds: number;
  staleRunSeconds: number;
};

export class PostgresOperationalMonitoringRepository {
  private readonly pool: Pool;

  constructor(pool: Pool = getSystemPostgresPool()) {
    this.pool = pool;
  }

  async snapshot(input: {
    webhookWindowMinutes: number;
    staleLeaseMinutes: number;
    databaseConnectionWarningPercent: number;
  }): Promise<OperationalSnapshot> {
    const result = await this.pool.query(
      "select monitoring_system_snapshot($1,$2,$3) value",
      [
        input.webhookWindowMinutes,
        input.staleLeaseMinutes,
        input.databaseConnectionWarningPercent,
      ],
    );
    const snapshot = result.rows[0]?.value as OperationalSnapshot | undefined;
    if (!snapshot || snapshot.schema !== "businesssite.operational-snapshot.v1")
      throw new Error("Operational monitoring snapshot unavailable.");
    return snapshot;
  }

  async beginRun(): Promise<string> {
    const result = await this.pool.query(
      "select monitoring_system_begin($1) value",
      ["operational_monitoring_scheduler"],
    );
    const runId = result.rows[0]?.value;
    if (typeof runId !== "string" || !runId)
      throw new Error("Operational monitoring run unavailable.");
    return runId;
  }

  async tryBeginRun(): Promise<string | undefined> {
    const result = await this.pool.query(
      "select monitoring_system_begin($1) value",
      ["operational_monitoring_scheduler"],
    );
    const runId = result.rows[0]?.value;
    if (runId === null || runId === undefined) return undefined;
    if (typeof runId !== "string" || !runId)
      throw new Error("Operational monitoring run unavailable.");
    return runId;
  }

  async completeRun(input: {
    runId: string;
    status: "healthy" | "alert" | "delivery_failed" | "error";
    signalCount: number;
    deliveryHealthy: boolean;
  }): Promise<void> {
    const result = await this.pool.query(
      "select monitoring_system_complete($1,$2,$3,$4) value",
      [input.runId, input.status, input.signalCount, input.deliveryHealthy],
    );
    if (result.rows[0]?.value !== true)
      throw new Error("Operational monitoring completion rejected.");
  }

  async heartbeat(input: {
    maxAgeSeconds: number;
    staleRunSeconds: number;
  }): Promise<OperationalHeartbeat> {
    const result = await this.pool.query(
      "select monitoring_system_heartbeat($1,$2) value",
      [input.maxAgeSeconds, input.staleRunSeconds],
    );
    const heartbeat = result.rows[0]?.value as OperationalHeartbeat | undefined;
    if (
      !heartbeat ||
      heartbeat.schema !== "businesssite.operational-heartbeat.v1"
    )
      throw new Error("Operational monitoring heartbeat unavailable.");
    return heartbeat;
  }
}
