import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const secret = "c".repeat(32);
const request = (authorization?: string) =>
  new Request("https://staging.example/api/internal/monitoring/error-probe", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

describe("staging monitoring error probe", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("denies unauthenticated requests", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await POST(request())).status).toBe(401);
  });

  it("is absent unless the exact staging gate is enabled", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("MONITORING_SYNTHETIC_PROBE_ENABLED", "false");
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(404);
  });

  it("cannot run in the Production Vercel environment", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("MONITORING_SYNTHETIC_PROBE_ENABLED", "true");
    vi.stubEnv("RELEASE_TARGET", "staging");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request(`Bearer ${secret}`))).status).toBe(404);
  });

  it("throws one recognizable error only in authenticated staging", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("MONITORING_SYNTHETIC_PROBE_ENABLED", "true");
    vi.stubEnv("RELEASE_TARGET", "staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    await expect(POST(request(`Bearer ${secret}`))).rejects.toThrow(
      "B6A_SYNTHETIC_OPERATIONAL_ERROR",
    );
  });
});
