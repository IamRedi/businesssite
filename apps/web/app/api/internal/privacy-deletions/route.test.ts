import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock("@platform/site-data", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PostgresPrivacyRepository: class {},
  DeterministicFakeProviderCleanupAdapter: class {},
  runProviderCleanupDeletionWorker: state.worker,
}));
import { POST } from "./route";
const request = (secret?: string) =>
  new Request("https://example.test/api/internal/privacy-deletions", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
describe("customer deletion worker route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "secret");
    vi.stubEnv("PRIVACY_DELETION_EXECUTION_ENABLED", "false");
    vi.stubEnv("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("RELEASE_TARGET", "");
  });
  it("authenticates before work", async () => {
    expect((await POST(request())).status).toBe(401);
    expect(state.worker).not.toHaveBeenCalled();
  });
  it("does zero worker work while disabled", async () => {
    expect((await POST(request("secret"))).status).toBe(503);
    expect(state.worker).not.toHaveBeenCalled();
  });
  it("rejects a local production target", async () => {
    vi.stubEnv("PRIVACY_DELETION_EXECUTION_ENABLED", "true");
    vi.stubEnv("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request("secret"))).status).toBe(503);
    expect(state.worker).not.toHaveBeenCalled();
  });
  it("rejects an explicit Vercel production target", async () => {
    vi.stubEnv("PRIVACY_DELETION_EXECUTION_ENABLED", "true");
    vi.stubEnv("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await POST(request("secret"))).status).toBe(503);
    expect(state.worker).not.toHaveBeenCalled();
  });
  it("allows an explicitly staged Vercel Preview despite Next.js production mode", async () => {
    vi.stubEnv("PRIVACY_DELETION_EXECUTION_ENABLED", "true");
    vi.stubEnv("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "true");
    vi.stubEnv("PRIVACY_PROVIDER_CLEANUP_ADAPTER", "platform_v1");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("RELEASE_TARGET", "staging");
    state.worker.mockResolvedValueOnce({ leased: 0, completed: 0 });
    const response = await POST(request("secret"));
    expect(response.status).toBe(200);
    expect(state.worker).toHaveBeenCalledOnce();
  });
});
