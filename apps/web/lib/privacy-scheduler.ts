import { randomUUID } from "node:crypto";
import {
  cleanupPrivacyExportArtifacts,
  DeterministicFakeProviderCleanupAdapter,
  PostgresOperationalMonitoringRepository,
  PostgresPrivacyRepository,
  privacyExportExecutionEnabled,
  providerCleanupWorkerEnabled,
  runPrivacyExportWorker,
  runPrivacyRetentionScheduler,
  runProviderCleanupDeletionWorker,
  type OperationalSignal,
} from "@platform/site-data";
import { configuredPrivacyArtifactStore } from "./privacy-artifact-store";
import {
  PlatformProviderCleanupAdapter,
  providerCleanupAdapterConfigured,
} from "./provider-cleanup-adapters";
import { reportOperationalSignal } from "./operational-errors";
import {
  operationalMonitoringThresholds,
  runOperationalMonitoringCheck,
} from "./operational-monitoring";

type Environment = Record<string, string | undefined>;
type MonitoringRepository = Pick<
  PostgresOperationalMonitoringRepository,
  "tryBeginRun" | "completeRun" | "snapshot"
>;
type PrivacyRepository = ConstructorParameters<typeof PostgresPrivacyRepository>[0] extends never
  ? never
  : PostgresPrivacyRepository;
type Reporter = typeof reportOperationalSignal;

const integerSetting = (
  environment: Environment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const value = Number.parseInt(environment[name] || String(fallback), 10);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`Invalid ${name}.`);
  return value;
};

export function privacySchedulerConfiguration(environment: Environment = process.env) {
  const enabled = environment.PRIVACY_SCHEDULER_ENABLED?.trim() === "true";
  const noOp = environment.PRIVACY_SCHEDULER_NOOP?.trim() === "true";
  const secret = environment.CRON_SECRET?.trim() || "";
  if (enabled && secret.length < 32)
    throw new Error("Invalid privacy scheduler CRON_SECRET.");
  if (enabled && environment.MONITORING_ALERTS_ENABLED?.trim() !== "true")
    throw new Error("Privacy scheduler monitoring is disabled.");
  if (
    enabled &&
    environment.RELEASE_TARGET?.trim() === "production" &&
    !noOp
  )
    throw new Error("Production privacy scheduler requires no-op mode.");
  return {
    enabled,
    noOp,
    secret,
    maxDeletionSteps: integerSetting(
      environment,
      "PRIVACY_SCHEDULER_MAX_DELETION_STEPS",
      5,
      1,
      25,
    ),
    maxDurationMs: integerSetting(
      environment,
      "PRIVACY_SCHEDULER_MAX_DURATION_MS",
      50_000,
      1_000,
      120_000,
    ),
  };
}

type SchedulerDependencies = {
  monitoringRepository: MonitoringRepository;
  privacyRepository: PrivacyRepository;
  artifactStore: typeof configuredPrivacyArtifactStore;
  retentionWorker: typeof runPrivacyRetentionScheduler;
  deletionWorker: typeof runProviderCleanupDeletionWorker;
  exportCleanup: typeof cleanupPrivacyExportArtifacts;
  exportWorker: typeof runPrivacyExportWorker;
  monitoringCheck: typeof runOperationalMonitoringCheck;
  reporter: Reporter;
  now: () => number;
};

const defaultDependencies = (): SchedulerDependencies => ({
  monitoringRepository: new PostgresOperationalMonitoringRepository(),
  privacyRepository: new PostgresPrivacyRepository({ boundary: "system" }),
  artifactStore: configuredPrivacyArtifactStore,
  retentionWorker: runPrivacyRetentionScheduler,
  deletionWorker: runProviderCleanupDeletionWorker,
  exportCleanup: cleanupPrivacyExportArtifacts,
  exportWorker: runPrivacyExportWorker,
  monitoringCheck: runOperationalMonitoringCheck,
  reporter: reportOperationalSignal,
  now: Date.now,
});

const problematicProviderOutcome = (outcome: string | undefined) =>
  Boolean(outcome && [
    "blocked", "retryable_failure", "permanent_failure", "uncertain",
    "manual_review_required", "unsupported",
  ].includes(outcome));

export async function runPrivacyScheduler(input: {
  environment?: Environment;
  dependencies?: SchedulerDependencies;
} = {}) {
  const environment = input.environment ?? process.env;
  const configuration = privacySchedulerConfiguration(environment);
  if (!configuration.enabled)
    return { enabled: false as const, acquired: false as const };

  const dependencies = input.dependencies ?? defaultDependencies();
  const runId = await dependencies.monitoringRepository.tryBeginRun();
  if (!runId)
    return { enabled: true as const, acquired: false as const, reason: "already_running" as const };

  const startedAt = dependencies.now();
  const deliveries: Awaited<ReturnType<Reporter>>[] = [];
  let signalCount = 0;
  const signal = async (value: OperationalSignal) => {
    signalCount += value.count;
    deliveries.push(await dependencies.reporter(value, false, environment));
  };

  try {
    const retention = configuration.noOp
      ? null
      : await dependencies.retentionWorker({
          repository: dependencies.privacyRepository,
          workerReference: `privacy-retention-${runId}`,
          environment,
        });

    const deletion = [];
    if (!configuration.noOp && providerCleanupWorkerEnabled(environment)) {
      if (!providerCleanupAdapterConfigured(environment))
        throw new Error("provider_cleanup_adapter_unconfigured");
      const adapter = environment.PRIVACY_PROVIDER_CLEANUP_ADAPTER?.trim() === "platform_v1"
        ? new PlatformProviderCleanupAdapter(environment)
        : new DeterministicFakeProviderCleanupAdapter({}, environment);
      for (let step = 0; step < configuration.maxDeletionSteps; step++) {
        if (dependencies.now() - startedAt >= configuration.maxDurationMs) break;
        const result = await dependencies.deletionWorker({
          repository: dependencies.privacyRepository,
          adapter,
          workerReference: `privacy-deletion-${runId}-${step + 1}`,
          environment,
        });
        deletion.push(result);
        if (problematicProviderOutcome("outcome" in result ? result.outcome : undefined))
          await signal({ code: "privacy_provider_cleanup_problem", severity: "critical", count: 1 });
        if (result.action === "none") break;
      }
    }

    let privacyExport: null | { cleanup: Awaited<ReturnType<typeof cleanupPrivacyExportArtifacts>>; worker: Awaited<ReturnType<typeof runPrivacyExportWorker>> } = null;
    if (!configuration.noOp && privacyExportExecutionEnabled(environment)) {
      const store = dependencies.artifactStore(environment);
      const cleanup = await dependencies.exportCleanup({
        repository: dependencies.privacyRepository,
        store,
        limit: 25,
      });
      const worker = await dependencies.exportWorker({
        repository: dependencies.privacyRepository,
        store,
        workerReference: `privacy-export-${runId}-${randomUUID()}`,
        environment,
      });
      privacyExport = { cleanup, worker };
      if (cleanup.failed > 0)
        await signal({ code: "privacy_export_cleanup_failed", severity: "critical", count: cleanup.failed });
      if (cleanup.securityFailed > 0)
        await signal({ code: "privacy_export_security_invariant_violation", severity: "critical", count: cleanup.securityFailed });
      if ((worker.recoveredStuck ?? 0) > 0)
        await signal({ code: "privacy_export_stuck", severity: "critical", count: worker.recoveredStuck ?? 0 });
      if (worker.errorCode)
        await signal({ code: "privacy_export_generation_failed", severity: "critical", count: 1 });
    }

    const monitoring = await dependencies.monitoringCheck({
      environment,
      repository: dependencies.monitoringRepository,
      reporter: dependencies.reporter,
    });
    if (!monitoring.enabled)
      throw new Error("privacy_scheduler_monitoring_disabled");
    const deliveryHealthy = monitoring.deliveryHealthy &&
      deliveries.every((result) => result === "delivered");
    const aggregateSignals = monitoring.snapshot.signals.length + signalCount;
    const status = !deliveryHealthy
      ? "delivery_failed"
      : aggregateSignals > 0
        ? "alert"
        : "healthy";
    await dependencies.monitoringRepository.completeRun({
      runId,
      status,
      signalCount: aggregateSignals,
      deliveryHealthy,
    });
    return {
      enabled: true as const,
      acquired: true as const,
      mode: configuration.noOp ? "noop" as const : "workers" as const,
      runId,
      status,
      retention,
      deletion,
      privacyExport,
      monitoring: {
        checkedAt: monitoring.snapshot.checkedAt,
        status: monitoring.snapshot.status,
        signals: monitoring.snapshot.signals.map((item) => item.code),
        deliveryHealthy,
      },
    };
  } catch (error) {
    try {
      await dependencies.reporter(
        { code: "privacy_job_failed", severity: "critical", count: 1 },
        false,
        environment,
      );
    } catch {
      console.error("PRIVACY_SCHEDULER_FAILURE_SIGNAL_FAILED");
    }
    try {
      await dependencies.monitoringRepository.completeRun({
        runId,
        status: "error",
        signalCount: 1,
        deliveryHealthy: false,
      });
    } catch {
      console.error("PRIVACY_SCHEDULER_COMPLETION_FAILED");
    }
    throw error;
  }
}
