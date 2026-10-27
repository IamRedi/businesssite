import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ run: vi.fn(), configured: vi.fn() }));
vi.mock("../../../../lib/privacy-scheduler", () => ({
  privacySchedulerConfiguration: state.configured,
  runPrivacyScheduler: state.run,
}));
import { GET } from "./route";

const secret = "c".repeat(32);
const request = (credential?: string) => new Request(
  "https://staging.example/api/internal/privacy-scheduler",
  { headers: credential ? { authorization: `Bearer ${credential}` } : {} },
);

describe("privacy scheduler GET boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", secret);
    state.configured.mockReturnValue({ enabled: true, secret });
  });

  it("fails anonymous and weak-secret requests closed before orchestration", async () => {
    expect((await GET(request())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "short");
    expect((await GET(request("short"))).status).toBe(401);
    expect(state.run).not.toHaveBeenCalled();
  });

  it("returns a no-store kill-switch response without work", async () => {
    state.configured.mockReturnValue({ enabled: false, secret });
    const response = await GET(request(secret));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.run).not.toHaveBeenCalled();
  });

  it("accepts a Vercel Cron bearer request and treats overlap as successful deferral", async () => {
    state.run.mockResolvedValue({ enabled: true, acquired: false, reason: "already_running" });
    expect((await GET(request(secret))).status).toBe(202);
    expect(state.run).toHaveBeenCalledOnce();
  });

  it("returns 503 without details for a controlled worker failure", async () => {
    state.run.mockRejectedValue(new Error("sensitive-provider-detail"));
    const response = await GET(request(secret));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Privacy scheduler failed." });
  });
});
