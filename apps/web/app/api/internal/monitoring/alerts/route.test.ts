import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../../../../lib/operational-monitoring", () => ({
  runOperationalMonitoringCheck: state.run,
}));
import { POST } from "./route";

const secret = "c".repeat(32);
const request = (authorization?: string, probe = false) =>
  new Request("https://staging.example/api/internal/monitoring/alerts", {
    method: "POST",
    headers: {
      ...(authorization ? { authorization } : {}),
      ...(probe ? { "x-businesssite-monitoring-probe": "b6a" } : {}),
    },
  });

describe("operational monitoring alert route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    state.run.mockReset();
  });

  it("denies unauthenticated requests before database work", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await POST(request())).status).toBe(401);
    expect(state.run).not.toHaveBeenCalled();
  });

  it("is absent while operational alerts are disabled", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    state.run.mockResolvedValue({ enabled: false });
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(404);
  });

  it("returns healthy no-store evidence after a clean snapshot", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    state.run.mockResolvedValue({
      enabled: true,
      snapshot: {
        schema: "businesssite.operational-snapshot.v1",
        checkedAt: "2026-08-28T10:00:00.000Z",
        status: "ok",
        signals: [],
      },
      synthetic: true,
      delivery: ["delivered", "delivered", "delivered"],
      deliveryHealthy: true,
    });
    const response = await POST(request(`Bearer ${secret}`, true));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ synthetic: true, delivered: 3 });
    expect(state.run).toHaveBeenCalledWith({ synthetic: true });
  });

  it("returns 503 for a live alert or failed delivery", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    state.run.mockResolvedValue({
      enabled: true,
      snapshot: {
        schema: "businesssite.operational-snapshot.v1",
        checkedAt: "2026-08-28T10:00:00.000Z",
        status: "alert",
        signals: [{ code: "privacy_job_failed" }],
      },
      synthetic: false,
      delivery: ["delivery_failed"],
      deliveryHealthy: false,
    });
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(503);
  });
});
