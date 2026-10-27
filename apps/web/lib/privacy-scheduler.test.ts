import { describe, expect, it, vi } from "vitest";
import { privacySchedulerConfiguration, runPrivacyScheduler } from "./privacy-scheduler";

const environment = {
  PRIVACY_SCHEDULER_ENABLED: "true",
  CRON_SECRET: "c".repeat(32),
  MONITORING_ALERTS_ENABLED: "true",
  RELEASE_TARGET: "staging",
  VERCEL_ENV: "preview",
};

const dependencies = () => ({
  monitoringRepository: {
    tryBeginRun: vi.fn().mockResolvedValue("run-1"),
    completeRun: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn(),
  },
  privacyRepository: {} as never,
  artifactStore: vi.fn(),
  retentionWorker: vi.fn().mockResolvedValue({ enabled: false, claimed: false, planned: false }),
  deletionWorker: vi.fn(),
  exportCleanup: vi.fn(),
  exportWorker: vi.fn(),
  monitoringCheck: vi.fn().mockResolvedValue({
    enabled: true,
    snapshot: { checkedAt: "2026-09-01T12:00:00.000Z", status: "ok", signals: [] },
    delivery: [],
    deliveryHealthy: true,
  }),
  reporter: vi.fn().mockResolvedValue("delivered" as const),
  now: vi.fn().mockReturnValue(1_000),
});

describe("privacy scheduler orchestration", () => {
  it("defaults off and validates strong auth plus monitoring before work", () => {
    expect(privacySchedulerConfiguration({})).toMatchObject({ enabled: false });
    expect(() => privacySchedulerConfiguration({
      ...environment, CRON_SECRET: "short",
    })).toThrow("CRON_SECRET");
    expect(() => privacySchedulerConfiguration({
      ...environment, MONITORING_ALERTS_ENABLED: "false",
    })).toThrow("monitoring");
  });

  it("does not construct dependencies while the master kill switch is off", async () => {
    await expect(runPrivacyScheduler({ environment: {} })).resolves.toEqual({
      enabled: false, acquired: false,
    });
  });

  it("returns safely when a concurrent run owns the durable lease", async () => {
    const deps = dependencies();
    deps.monitoringRepository.tryBeginRun.mockResolvedValue(undefined);
    await expect(runPrivacyScheduler({ environment, dependencies: deps }))
      .resolves.toMatchObject({ enabled: true, acquired: false, reason: "already_running" });
    expect(deps.retentionWorker).not.toHaveBeenCalled();
    expect(deps.monitoringRepository.completeRun).not.toHaveBeenCalled();
  });

  it("keeps destructive workers off while recording a healthy heartbeat", async () => {
    const deps = dependencies();
    await expect(runPrivacyScheduler({ environment, dependencies: deps }))
      .resolves.toMatchObject({ enabled: true, acquired: true, status: "healthy", deletion: [], privacyExport: null });
    expect(deps.deletionWorker).not.toHaveBeenCalled();
    expect(deps.exportCleanup).not.toHaveBeenCalled();
    expect(deps.monitoringRepository.completeRun).toHaveBeenCalledWith({
      runId: "run-1", status: "healthy", signalCount: 0, deliveryHealthy: true,
    });
  });

  it("requires and enforces explicit no-op mode in production", async () => {
    expect(() => privacySchedulerConfiguration({
      ...environment,
      RELEASE_TARGET: "production",
      VERCEL_ENV: "production",
    })).toThrow("requires no-op mode");
    const deps = dependencies();
    const production = {
      ...environment,
      RELEASE_TARGET: "production",
      VERCEL_ENV: "production",
      PRIVACY_SCHEDULER_NOOP: "true",
    };
    await expect(runPrivacyScheduler({ environment: production, dependencies: deps }))
      .resolves.toMatchObject({
        enabled: true, acquired: true, mode: "noop", retention: null,
        deletion: [], privacyExport: null,
      });
    expect(deps.retentionWorker).not.toHaveBeenCalled();
    expect(deps.deletionWorker).not.toHaveBeenCalled();
    expect(deps.exportCleanup).not.toHaveBeenCalled();
  });

  it("bounds deletion progression and runs export cleanup once", async () => {
    const deps = dependencies();
    deps.deletionWorker
      .mockResolvedValueOnce({ enabled: true, action: "planned" })
      .mockResolvedValueOnce({ enabled: true, action: "provider", outcome: "completed" })
      .mockResolvedValueOnce({ enabled: true, action: "none" });
    deps.artifactStore.mockReturnValue({ privateOnly: true });
    deps.exportCleanup.mockResolvedValue({ scanned: 0, deleted: 0, failed: 0, securityFailed: 0 });
    deps.exportWorker.mockResolvedValue({ enabled: true, claimed: false, completed: false, recoveredStuck: 0 });
    await runPrivacyScheduler({
      environment: {
        ...environment,
        PRIVACY_DELETION_EXECUTION_ENABLED: "true",
        PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED: "true",
        PRIVACY_PROVIDER_CLEANUP_ADAPTER: "fake_test",
        PRIVACY_EXPORT_ENABLED: "true",
        PRIVACY_EXPORT_ENVIRONMENT_ID: "b6f1-staging",
      },
      dependencies: deps,
    });
    expect(deps.deletionWorker).toHaveBeenCalledTimes(3);
    expect(deps.exportCleanup).toHaveBeenCalledOnce();
    expect(deps.exportWorker).toHaveBeenCalledOnce();
  });

  it("signals and closes the lease as error on controlled failure", async () => {
    const deps = dependencies();
    deps.monitoringCheck.mockRejectedValue(new Error("synthetic_monitoring_failure"));
    await expect(runPrivacyScheduler({ environment, dependencies: deps }))
      .rejects.toThrow("synthetic_monitoring_failure");
    expect(deps.reporter).toHaveBeenCalledWith(
      { code: "privacy_job_failed", severity: "critical", count: 1 },
      false,
      environment,
    );
    expect(deps.monitoringRepository.completeRun).toHaveBeenCalledWith({
      runId: "run-1", status: "error", signalCount: 1, deliveryHealthy: false,
    });
  });
});
