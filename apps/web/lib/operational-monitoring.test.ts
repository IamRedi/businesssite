import { describe, expect, it, vi } from "vitest";
import {
  operationalHeartbeatThresholds,
  operationalMonitoringThresholds,
  runScheduledOperationalMonitoringCheck,
  runOperationalMonitoringCheck,
  productionHeartbeatConfiguration,
  stagingSchedulerConfiguration,
} from "./operational-monitoring";

const cleanSnapshot = {
  schema: "businesssite.operational-snapshot.v1" as const,
  checkedAt: "2026-08-28T10:00:00.000Z",
  status: "ok" as const,
  thresholds: {
    webhookWindowMinutes: 15,
    staleLeaseMinutes: 5,
    databaseConnectionWarningPercent: 80,
  },
  metrics: {},
  signals: [],
};

describe("operational monitoring check", () => {
  it("validates bounded thresholds", () => {
    expect(operationalMonitoringThresholds({})).toEqual(cleanSnapshot.thresholds);
    expect(() => operationalMonitoringThresholds({
      MONITORING_DATABASE_CONNECTION_WARNING_PERCENT: "100",
    })).toThrow("MONITORING_DATABASE_CONNECTION_WARNING_PERCENT");
  });

  it("does no database or delivery work while disabled", async () => {
    const repository = { snapshot: vi.fn() };
    const reporter = vi.fn();
    await expect(runOperationalMonitoringCheck({
      environment: {}, repository, reporter,
    })).resolves.toEqual({ enabled: false });
    expect(repository.snapshot).not.toHaveBeenCalled();
    expect(reporter).not.toHaveBeenCalled();
  });

  it("delivers live aggregate signals", async () => {
    const signal = { code: "privacy_job_blocked" as const, severity: "warning" as const, count: 2 };
    const reporter = vi.fn().mockResolvedValue("delivered");
    const result = await runOperationalMonitoringCheck({
      environment: { MONITORING_ALERTS_ENABLED: "true" },
      repository: { snapshot: vi.fn().mockResolvedValue({ ...cleanSnapshot, status: "alert", signals: [signal] }) },
      reporter,
    });
    expect(result).toMatchObject({ enabled: true, synthetic: false, deliveryHealthy: true });
    expect(reporter).toHaveBeenCalledWith(signal, false, expect.any(Object));
  });

  it("adds fixed synthetic acceptance signals only in non-production staging", async () => {
    const reporter = vi.fn().mockResolvedValue("delivered");
    const result = await runOperationalMonitoringCheck({
      environment: {
        MONITORING_ALERTS_ENABLED: "true",
        MONITORING_SYNTHETIC_PROBE_ENABLED: "true",
        RELEASE_TARGET: "staging",
        VERCEL_ENV: "preview",
      },
      repository: { snapshot: vi.fn().mockResolvedValue(cleanSnapshot) },
      reporter,
      synthetic: true,
    });
    expect(result).toMatchObject({ enabled: true, synthetic: true, deliveryHealthy: true });
    expect(reporter).toHaveBeenCalledTimes(3);
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ code: "database_connection_saturation" }),
      true,
      expect.any(Object),
    );
  });

  it("allows fixed synthetic signals in production only behind the explicit gate", async () => {
    const reporter = vi.fn().mockResolvedValue("delivered");
    const base = {
      MONITORING_ALERTS_ENABLED: "true",
      RELEASE_TARGET: "production",
      VERCEL_ENV: "production",
    };
    const repository = { snapshot: vi.fn().mockResolvedValue(cleanSnapshot) };
    const disabled = await runOperationalMonitoringCheck({
      environment: base, repository, reporter, synthetic: true,
    });
    expect(disabled.synthetic).toBe(false);
    expect(reporter).not.toHaveBeenCalled();

    const enabled = await runOperationalMonitoringCheck({
      environment: {
        ...base,
        MONITORING_PRODUCTION_SYNTHETIC_PROBE_ENABLED: "true",
      },
      repository,
      reporter,
      synthetic: true,
    });
    expect(enabled).toMatchObject({ synthetic: true, deliveryHealthy: true });
    expect(reporter).toHaveBeenCalledTimes(3);
  });

  it("records a healthy scheduled run and closes it with aggregate state", async () => {
    const repository = {
      beginRun: vi.fn().mockResolvedValue("run-1"),
      snapshot: vi.fn().mockResolvedValue(cleanSnapshot),
      completeRun: vi.fn().mockResolvedValue(undefined),
      heartbeat: vi.fn(),
    };
    await expect(runScheduledOperationalMonitoringCheck({
      environment: { MONITORING_ALERTS_ENABLED: "true" },
      repository,
      reporter: vi.fn(),
    })).resolves.toMatchObject({ enabled: true, deliveryHealthy: true });
    expect(repository.completeRun).toHaveBeenCalledWith({
      runId: "run-1", status: "healthy", signalCount: 0, deliveryHealthy: true,
    });
  });

  it("records an error when a scheduled snapshot fails", async () => {
    const repository = {
      beginRun: vi.fn().mockResolvedValue("run-2"),
      snapshot: vi.fn().mockRejectedValue(new Error("database unavailable")),
      completeRun: vi.fn().mockResolvedValue(undefined),
      heartbeat: vi.fn(),
    };
    await expect(runScheduledOperationalMonitoringCheck({
      environment: { MONITORING_ALERTS_ENABLED: "true" }, repository,
    })).rejects.toThrow("database unavailable");
    expect(repository.completeRun).toHaveBeenCalledWith({
      runId: "run-2", status: "error", signalCount: 0, deliveryHealthy: false,
    });
  });

  it("keeps the query-secret scheduler staging-only and validates heartbeat ages", () => {
    const valid = {
      RELEASE_TARGET: "staging",
      VERCEL_ENV: "preview",
      MONITORING_STAGING_SCHEDULER_ENABLED: "true",
      MONITORING_STAGING_SCHEDULER_SECRET: "s".repeat(32),
    };
    expect(stagingSchedulerConfiguration(valid)).toMatchObject({ enabled: true });
    expect(stagingSchedulerConfiguration({ ...valid, VERCEL_ENV: "production" }))
      .toEqual({ enabled: false, secret: "s".repeat(32) });
    expect(() => stagingSchedulerConfiguration({
      ...valid, MONITORING_STAGING_SCHEDULER_SECRET: "short",
    })).toThrow("scheduler secret");
    const production = {
      RELEASE_TARGET: "production",
      VERCEL_ENV: "production",
      MONITORING_PRODUCTION_HEARTBEAT_ENABLED: "true",
      CRON_SECRET: "p".repeat(32),
    };
    expect(productionHeartbeatConfiguration(production)).toMatchObject({ enabled: true });
    expect(productionHeartbeatConfiguration({ ...production, VERCEL_ENV: "preview" }))
      .toEqual({ enabled: false, secret: "p".repeat(32) });
    expect(() => productionHeartbeatConfiguration({ ...production, CRON_SECRET: "short" }))
      .toThrow("heartbeat secret");
    expect(operationalHeartbeatThresholds({})).toEqual({
      maxAgeSeconds: 900, staleRunSeconds: 180,
    });
    expect(() => operationalHeartbeatThresholds({
      MONITORING_HEARTBEAT_MAX_AGE_SECONDS: "60",
      MONITORING_HEARTBEAT_STALE_RUN_SECONDS: "180",
    })).toThrow("exceeds heartbeat age");
  });
});
