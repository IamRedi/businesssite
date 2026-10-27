import {
  PostgresOperationalMonitoringRepository,
  type OperationalSignal,
  type OperationalSnapshot,
} from "@platform/site-data";
import { reportOperationalSignal } from "./operational-errors";
import { isProductionHostingTarget, isStagingHostingTarget } from "./hosting-environment";

type Environment = Record<string, string | undefined>;
type Reporter = typeof reportOperationalSignal;

type MonitoringRepository = Pick<
  PostgresOperationalMonitoringRepository,
  "snapshot" | "beginRun" | "completeRun" | "heartbeat"
>;

const integerSetting = (
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = Number.parseInt(environment[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`Invalid ${name}.`);
  return value;
};

export function operationalMonitoringThresholds(
  environment: Environment = process.env,
) {
  return {
    webhookWindowMinutes: integerSetting(
      environment,
      "MONITORING_WEBHOOK_WINDOW_MINUTES",
      15,
      5,
      1440,
    ),
    staleLeaseMinutes: integerSetting(
      environment,
      "MONITORING_STALE_LEASE_MINUTES",
      5,
      1,
      60,
    ),
    databaseConnectionWarningPercent: integerSetting(
      environment,
      "MONITORING_DATABASE_CONNECTION_WARNING_PERCENT",
      80,
      50,
      95,
    ),
  };
}

export const syntheticAcceptanceSignals: OperationalSignal[] = [
  { code: "database_connection_saturation", severity: "critical", count: 1 },
  { code: "billing_webhook_rejected", severity: "warning", count: 1 },
  { code: "privacy_job_failed", severity: "critical", count: 1 },
];

export async function runOperationalMonitoringCheck(input: {
  environment?: Environment;
  repository?: Pick<PostgresOperationalMonitoringRepository, "snapshot">;
  reporter?: Reporter;
  synthetic?: boolean;
}) {
  const environment = input.environment ?? process.env;
  if (environment.MONITORING_ALERTS_ENABLED?.trim() !== "true")
    return { enabled: false as const };
  const repository = input.repository ?? new PostgresOperationalMonitoringRepository();
  const snapshot: OperationalSnapshot = await repository.snapshot(
    operationalMonitoringThresholds(environment),
  );
  const stagingSynthetic =
    input.synthetic === true &&
    environment.MONITORING_SYNTHETIC_PROBE_ENABLED?.trim() === "true" &&
    isStagingHostingTarget(environment);
  const productionSynthetic =
    input.synthetic === true &&
    environment.MONITORING_PRODUCTION_SYNTHETIC_PROBE_ENABLED?.trim() === "true" &&
    environment.RELEASE_TARGET?.trim() === "production" &&
    isProductionHostingTarget(environment);
  const synthetic = stagingSynthetic || productionSynthetic;
  const signals = synthetic
    ? [...snapshot.signals, ...syntheticAcceptanceSignals]
    : snapshot.signals;
  const reporter = input.reporter ?? reportOperationalSignal;
  const delivery = await Promise.all(
    signals.map((signal) => reporter(signal, syntheticAcceptanceSignals.includes(signal), environment)),
  );
  return {
    enabled: true as const,
    snapshot,
    synthetic,
    delivery,
    deliveryHealthy: delivery.every((result) => result === "delivered"),
  };
}

export async function runScheduledOperationalMonitoringCheck(input: {
  environment?: Environment;
  repository?: MonitoringRepository;
  reporter?: Reporter;
} = {}) {
  const environment = input.environment ?? process.env;
  if (environment.MONITORING_ALERTS_ENABLED?.trim() !== "true")
    return { enabled: false as const };
  const repository = input.repository ?? new PostgresOperationalMonitoringRepository();
  const runId = await repository.beginRun();
  try {
    const result = await runOperationalMonitoringCheck({
      environment,
      repository,
      reporter: input.reporter,
    });
    if (!result.enabled) throw new Error("Operational monitoring disabled after run start.");
    const hasSignals = result.snapshot.signals.length > 0;
    const status = !result.deliveryHealthy
      ? "delivery_failed"
      : hasSignals
        ? "alert"
        : "healthy";
    await repository.completeRun({
      runId,
      status,
      signalCount: result.snapshot.signals.length,
      deliveryHealthy: result.deliveryHealthy,
    });
    return result;
  } catch (error) {
    try {
      await repository.completeRun({
        runId,
        status: "error",
        signalCount: 0,
        deliveryHealthy: false,
      });
    } catch {
      console.error("OPERATIONAL_MONITORING_COMPLETION_FAILED");
    }
    throw error;
  }
}

export function stagingSchedulerConfiguration(
  environment: Environment = process.env,
) {
  const staging =
    isStagingHostingTarget(environment);
  const enabled =
    staging &&
    environment.MONITORING_STAGING_SCHEDULER_ENABLED?.trim() === "true";
  const secret = environment.MONITORING_STAGING_SCHEDULER_SECRET?.trim() || "";
  if (enabled && secret.length < 32)
    throw new Error("Invalid staging monitoring scheduler secret.");
  return { enabled, secret };
}

export function productionHeartbeatConfiguration(
  environment: Environment = process.env,
) {
  const production =
    environment.RELEASE_TARGET?.trim() === "production" &&
    isProductionHostingTarget(environment);
  const enabled =
    production &&
    environment.MONITORING_PRODUCTION_HEARTBEAT_ENABLED?.trim() === "true";
  const secret = environment.CRON_SECRET?.trim() || "";
  if (enabled && secret.length < 32)
    throw new Error("Invalid production monitoring heartbeat secret.");
  return { enabled, secret };
}

export function operationalHeartbeatThresholds(
  environment: Environment = process.env,
) {
  const thresholds = {
    maxAgeSeconds: integerSetting(
      environment,
      "MONITORING_HEARTBEAT_MAX_AGE_SECONDS",
      900,
      60,
      86400,
    ),
    staleRunSeconds: integerSetting(
      environment,
      "MONITORING_HEARTBEAT_STALE_RUN_SECONDS",
      180,
      30,
      3600,
    ),
  };
  if (thresholds.staleRunSeconds > thresholds.maxAgeSeconds)
    throw new Error("Monitoring stale-run threshold exceeds heartbeat age.");
  return thresholds;
}
