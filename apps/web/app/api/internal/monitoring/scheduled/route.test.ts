import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("../../../../../lib/operational-monitoring", async (original) => {
  const actual = await original<typeof import("../../../../../lib/operational-monitoring")>();
  return { ...actual, runScheduledOperationalMonitoringCheck: state.run };
});
import { GET } from "./route";

const secret = "s".repeat(32);
const request = (key?: string) =>
  new Request(`https://staging.example/api/internal/monitoring/scheduled${key ? `?key=${key}` : ""}`);

describe("staging monitoring scheduler route", () => {
  afterEach(() => { vi.unstubAllEnvs(); state.run.mockReset(); });

  const enable = () => {
    vi.stubEnv("RELEASE_TARGET", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MONITORING_STAGING_SCHEDULER_ENABLED", "true");
    vi.stubEnv("MONITORING_STAGING_SCHEDULER_SECRET", secret);
  };

  it("is absent in production and denies a wrong staging secret before work", async () => {
    enable();
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await GET(request(secret))).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await GET(request("x".repeat(32)))).status).toBe(401);
    expect(state.run).not.toHaveBeenCalled();
  });

  it("returns a no-store success for a healthy scheduled run", async () => {
    enable();
    state.run.mockResolvedValue({
      enabled: true,
      snapshot: { schema: "businesssite.operational-snapshot.v1", checkedAt: "now", status: "ok", signals: [] },
      delivery: [], deliveryHealthy: true,
    });
    const response = await GET(request(secret));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 when the scheduled run finds a signal", async () => {
    enable();
    state.run.mockResolvedValue({
      enabled: true,
      snapshot: {
        schema: "businesssite.operational-snapshot.v1", checkedAt: "now", status: "alert",
        signals: [{ code: "privacy_job_failed" }],
      },
      delivery: ["delivered"], deliveryHealthy: true,
    });
    expect((await GET(request(secret))).status).toBe(503);
  });
});
