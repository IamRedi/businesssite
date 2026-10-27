import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ heartbeat: vi.fn() }));
vi.mock("@platform/site-data", () => ({
  PostgresOperationalMonitoringRepository: class {
    heartbeat = state.heartbeat;
  },
}));
import { GET } from "./route";

const secret = "s".repeat(32);
const request = (key?: string) =>
  new Request(`https://staging.example/api/internal/monitoring/heartbeat${key ? `?key=${key}` : ""}`);
const productionRequest = (credential?: string) =>
  new Request("https://production.example/api/internal/monitoring/heartbeat", {
    headers: credential ? { authorization: `Bearer ${credential}` } : {},
  });

describe("staging monitoring heartbeat route", () => {
  afterEach(() => { vi.unstubAllEnvs(); state.heartbeat.mockReset(); });
  const enable = () => {
    vi.stubEnv("RELEASE_TARGET", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("MONITORING_STAGING_SCHEDULER_ENABLED", "true");
    vi.stubEnv("MONITORING_STAGING_SCHEDULER_SECRET", secret);
  };

  it("denies non-staging and wrong-secret requests before database work", async () => {
    enable();
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await GET(request(secret))).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await GET(request("x".repeat(32)))).status).toBe(401);
    expect(state.heartbeat).not.toHaveBeenCalled();
  });

  it("reports current heartbeats as healthy", async () => {
    enable();
    state.heartbeat.mockResolvedValue({
      schema: "businesssite.operational-heartbeat.v1", status: "healthy",
      reason: "within_threshold", signalCount: 0, deliveryHealthy: true,
      runCount: 2, maxAgeSeconds: 900, staleRunSeconds: 180,
    });
    const response = await GET(request(secret));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("supports production heartbeat only with explicit gate and bearer auth", async () => {
    vi.stubEnv("RELEASE_TARGET", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("MONITORING_PRODUCTION_HEARTBEAT_ENABLED", "true");
    vi.stubEnv("CRON_SECRET", secret);
    state.heartbeat.mockResolvedValue({
      schema: "businesssite.operational-heartbeat.v1", status: "healthy",
      reason: "within_threshold", signalCount: 0, deliveryHealthy: true,
      runCount: 1, maxAgeSeconds: 900, staleRunSeconds: 180,
    });
    expect((await GET(productionRequest())).status).toBe(401);
    expect((await GET(productionRequest("x".repeat(32)))).status).toBe(401);
    expect((await GET(productionRequest(secret))).status).toBe(200);
  });

  it.each(["missed", "stalled", "unhealthy"])("returns 503 for %s state", async (status) => {
    enable();
    state.heartbeat.mockResolvedValue({
      schema: "businesssite.operational-heartbeat.v1", status,
      reason: "acceptance", signalCount: 0, deliveryHealthy: false,
      runCount: 1, maxAgeSeconds: 900, staleRunSeconds: 180,
    });
    expect((await GET(request(secret))).status).toBe(503);
  });
});
