import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ attest: vi.fn() }));
vi.mock("@platform/database", () => ({ attestRuntimeDatabase: state.attest }));
import { POST } from "./route";
import { canonicalRuntimeFingerprint, cutoverSafeFlags } from "../../../../lib/cutover-verification";
const token = "a".repeat(64);
const host = "candidate-test.vercel.app";
const request = (bearer = token, hostname = host) => new Request(`https://${hostname}/api/internal/cutover-verification`,
  { method: "POST", headers: { authorization: `Bearer ${bearer}` } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CUTOVER_VERIFICATION_TOKEN_SHA256", createHash("sha256").update(token).digest("hex"));
  vi.stubEnv("CUTOVER_VERIFICATION_NOT_BEFORE", new Date(Date.now() - 1000).toISOString());
  vi.stubEnv("CUTOVER_VERIFICATION_EXPIRES_AT", new Date(Date.now() + 300_000).toISOString());
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("VERCEL_URL", host);
  vi.stubEnv("RELEASE_TARGET", "production"); vi.stubEnv("DATABASE_RLS_MODE", "enforced");
  for (const name of ["BILLING_EXECUTION_ENABLED", "AI_EXECUTION_ENABLED", "DEMO_CLEANUP_EXECUTION_ENABLED",
    "PRIVACY_RETENTION_EXECUTION_ENABLED", "PRIVACY_DELETION_EXECUTION_ENABLED", "PRIVACY_DELETION_REQUESTS_ENABLED",
    "PRIVACY_EXPORT_ENABLED", "PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "PRIVACY_PROVIDER_RECONCILIATION_ENABLED",
    "PRIVACY_SCHEDULER_ENABLED", "PADDLE_ENABLED", "REDI_CONTROL_ENABLED", "REDI_IMPORT_ENABLED"])
    vi.stubEnv(name, "false");
  state.attest.mockResolvedValue([{ role: "runtime-test", authenticated: true }]);
});
afterEach(() => vi.unstubAllEnvs());
describe("short-lived runtime verifier", () => {
  it.each(["", "wrong", "b".repeat(64)])("denies invalid tokens before DB work", async bearer => {
    expect((await POST(request(bearer))).status).toBe(404); expect(state.attest).not.toHaveBeenCalled();
  });
  it.each([["CUTOVER_VERIFICATION_TOKEN_SHA256", ""], ["CUTOVER_VERIFICATION_EXPIRES_AT", "invalid"],
    ["CUTOVER_VERIFICATION_EXPIRES_AT", new Date(0).toISOString()],
    ["CUTOVER_VERIFICATION_EXPIRES_AT", new Date(Date.now() + 7_200_000).toISOString()],
    ["CUTOVER_VERIFICATION_NOT_BEFORE", new Date(Date.now() + 60_000).toISOString()],
    ["VERCEL_ENV", "preview"], ["VERCEL_URL", ""]])("fails closed for %s", async (key, value) => {
    vi.stubEnv(key, value); expect((await POST(request())).status).toBe(404); expect(state.attest).not.toHaveBeenCalled();
  });
  it("rejects a different deployment or customer host", async () => {
    expect((await POST(request(token, "customer.example"))).status).toBe(404); expect(state.attest).not.toHaveBeenCalled();
  });
  it("returns fixed canonical fingerprint and in-process evidence with no-store", async () => {
    expect(canonicalRuntimeFingerprint()).toBe("99040886955bdfed2cabe1c84510289e4c0cc7962e8460104e280a37816a00b6");
    const response = await POST(request());
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ scope: "deployed_process", deploymentHost: host, flags: { billing: "off", ai: "off" } });
  });
  it.each(["BILLING_EXECUTION_ENABLED", "AI_EXECUTION_ENABLED", "DEMO_CLEANUP_EXECUTION_ENABLED",
    "PRIVACY_RETENTION_EXECUTION_ENABLED", "PRIVACY_DELETION_EXECUTION_ENABLED", "PRIVACY_EXPORT_ENABLED",
    "PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "PADDLE_ENABLED", "REDI_IMPORT_ENABLED"])("stops before DB when %s is on", async key => {
    vi.stubEnv(key, "true"); expect((await POST(request())).status).toBe(503); expect(state.attest).not.toHaveBeenCalled();
  });
  it("requires explicit master false and enforced RLS", () => {
    expect(() => cutoverSafeFlags({ RELEASE_TARGET: "production", DATABASE_RLS_MODE: "enforced" })).toThrow();
    vi.stubEnv("DATABASE_RLS_MODE", "off"); expect(() => cutoverSafeFlags()).toThrow();
  });
  it("accepts existing scheduler no-op and rejects its execution mode", async () => {
    vi.stubEnv("PRIVACY_SCHEDULER_ENABLED", "true"); vi.stubEnv("PRIVACY_SCHEDULER_NOOP", "true");
    expect((await POST(request())).status).toBe(200);
    vi.stubEnv("PRIVACY_SCHEDULER_NOOP", "false"); expect((await POST(request())).status).toBe(503);
  });
  it("suppresses raw database errors and releases the overlap lock", async () => {
    state.attest.mockRejectedValueOnce(new Error("postgresql://sensitive-password@private-host"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.text()).toBe('{"error":"Runtime verification failed."}');
    expect((await POST(request())).status).toBe(200);
  });
  it("rejects concurrent work and clears its lock after completion", async () => {
    let finish!: (value: unknown) => void;
    state.attest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = POST(request());
    expect((await POST(request())).status).toBe(409); finish([]); expect((await pending).status).toBe(200);
  });
});
