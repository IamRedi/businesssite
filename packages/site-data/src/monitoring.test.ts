import { describe, expect, it, vi } from "vitest";
import type { Pool } from "@platform/database";
import { PostgresOperationalMonitoringRepository } from "./monitoring";

describe("PostgresOperationalMonitoringRepository", () => {
  it("calls only the bounded system snapshot routine", async () => {
    const snapshot = {
      schema: "businesssite.operational-snapshot.v1",
      checkedAt: "2026-08-28T10:00:00.000Z",
      status: "ok",
      thresholds: {
        webhookWindowMinutes: 15,
        staleLeaseMinutes: 5,
        databaseConnectionWarningPercent: 80,
      },
      metrics: {},
      signals: [],
    };
    const query = vi.fn().mockResolvedValue({ rows: [{ value: snapshot }] });
    const repository = new PostgresOperationalMonitoringRepository({ query } as unknown as Pool);

    await expect(repository.snapshot({
      webhookWindowMinutes: 15,
      staleLeaseMinutes: 5,
      databaseConnectionWarningPercent: 80,
    })).resolves.toEqual(snapshot);
    expect(query).toHaveBeenCalledWith(
      "select monitoring_system_snapshot($1,$2,$3) value",
      [15, 5, 80],
    );
  });

  it("fails closed when the routine projection is unavailable", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PostgresOperationalMonitoringRepository({ query } as unknown as Pool);
    await expect(repository.snapshot({
      webhookWindowMinutes: 15,
      staleLeaseMinutes: 5,
      databaseConnectionWarningPercent: 80,
    })).rejects.toThrow("snapshot unavailable");
  });

  it("uses only bounded routines for scheduler lifecycle and heartbeat", async () => {
    const heartbeat = {
      schema: "businesssite.operational-heartbeat.v1",
      checkedAt: "2026-08-28T10:00:00.000Z",
      status: "healthy",
      reason: "within_threshold",
      signalCount: 0,
      deliveryHealthy: true,
      runCount: 1,
      maxAgeSeconds: 900,
      staleRunSeconds: 180,
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ value: "60000000-0000-4000-8000-000000000001" }] })
      .mockResolvedValueOnce({ rows: [{ value: true }] })
      .mockResolvedValueOnce({ rows: [{ value: heartbeat }] });
    const repository = new PostgresOperationalMonitoringRepository({ query } as unknown as Pool);
    const runId = await repository.beginRun();
    await repository.completeRun({ runId, status: "healthy", signalCount: 0, deliveryHealthy: true });
    await expect(repository.heartbeat({ maxAgeSeconds: 900, staleRunSeconds: 180 }))
      .resolves.toEqual(heartbeat);
    expect(query.mock.calls).toEqual([
      ["select monitoring_system_begin($1) value", ["operational_monitoring_scheduler"]],
      ["select monitoring_system_complete($1,$2,$3,$4) value", [runId, "healthy", 0, true]],
      ["select monitoring_system_heartbeat($1,$2) value", [900, 180]],
    ]);
  });

  it("exposes an overlapping scheduler lease as unavailable without retrying", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value: null }] });
    const repository = new PostgresOperationalMonitoringRepository({ query } as unknown as Pool);
    await expect(repository.tryBeginRun()).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledOnce();
  });

  it("rejects stale scheduler completion and invalid heartbeat projections", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ value: false }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = new PostgresOperationalMonitoringRepository({ query } as unknown as Pool);
    await expect(repository.completeRun({
      runId: "60000000-0000-4000-8000-000000000002",
      status: "error",
      signalCount: 0,
      deliveryHealthy: false,
    })).rejects.toThrow("completion rejected");
    await expect(repository.heartbeat({ maxAgeSeconds: 900, staleRunSeconds: 180 }))
      .rejects.toThrow("heartbeat unavailable");
  });
});
