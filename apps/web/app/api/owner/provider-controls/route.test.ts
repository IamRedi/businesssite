import { beforeEach, describe, expect, it, vi } from "vitest";
const { authorize, run } = vi.hoisted(() => ({ authorize: vi.fn(), run: vi.fn() }));
vi.mock("../../../../lib/owner-authorization", () => ({ authorizeOwnerRequest: authorize }));
vi.mock("@platform/site-data", () => ({ PostgresSiteRepository: class { ownerProviderControl = run; } }));
import { POST } from "./route";
const data = { action: "save", revision: 0, requestId: "00000000-0000-4000-8000-000000000001", settings: { aiEnabled: true, aiModel: "gpt-5.6-luna", aiBudgetEur: 5, googleEnabled: true, googleDailyLimit: 30, googleMonthlyLimit: 1000, geocodingMonthlyLimit: 10000 } };
const request = (body: unknown = data) => new Request("https://control.example.test/api/owner/provider-controls", { method: "POST", headers: { origin: "https://control.example.test", "content-type": "application/json" }, body: JSON.stringify(body) });
describe("owner provider settings API", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("FINDER_PROVIDER_CALL_LIMIT", "30"); authorize.mockResolvedValue({ ok: true, owner: { sessionHash: "synthetic-session", correlationId: "fixture" } }); run.mockResolvedValue({ settings: { revision: 1 } }); });
  it("requires platform.configure and never persists a denied request", async () => {
    authorize.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request())).status).toBe(403); expect(authorize).toHaveBeenCalledWith(expect.any(Request), "platform.configure"); expect(run).not.toHaveBeenCalled();
  });
  it("validates before persistence", async () => { expect((await POST(request({ ...data, settings: { ...data.settings, aiModel: "arbitrary" } }))).status).toBe(400); expect(run).not.toHaveBeenCalled(); });
  it("cannot raise the server Google ceiling", async () => { expect((await POST(request({ ...data, settings: { ...data.settings, googleDailyLimit: 31 } }))).status).toBe(400); expect(run).not.toHaveBeenCalled(); });
  it("saves through the canonical routine and does not cache", async () => { const response = await POST(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(run).toHaveBeenCalledWith("save", data); });
  it("rejects stale edits and hides database errors", async () => {
    run.mockRejectedValueOnce(new Error("provider_settings_changed")); expect((await POST(request())).status).toBe(409);
    run.mockRejectedValueOnce(new Error("password=sentinel-sensitive")); const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("sentinel-sensitive");
  });
  it("does not expose admission or settlement as browser actions", async () => { expect((await POST(request({ ...data, action: "settle_ai" }))).status).toBe(400); expect(run).not.toHaveBeenCalled(); });
});
