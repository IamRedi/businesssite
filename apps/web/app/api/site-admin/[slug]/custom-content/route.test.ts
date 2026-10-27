import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), apply: vi.fn(), invalidate: vi.fn() }));
vi.mock("../../../../../lib/site-admin-auth", () => ({ requireSiteAdmin: mocks.auth, trustedSiteAdminSessionHash: () => "trusted" }));
vi.mock("../../../../../lib/public-site-cache", () => ({ expirePublicSiteFromRoute: mocks.invalidate }));
vi.mock("@platform/site-data", () => ({ PostgresSiteAdminCustomContentRepository: class { context = mocks.context; apply = mocks.apply; } }));
import { PATCH } from "./route";
const params = { params: Promise.resolve({ slug: "example" }) };
const body = { field: "priceList", expected: {}, expectedDesign: {}, value: {} };
const request = (value: unknown = body, origin = "http://localhost") => new Request("http://localhost/api/site-admin/example/custom-content", { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ siteId: "site-a" }); mocks.context.mockResolvedValue({ siteId: "site-a", document: {}, customDomain: "example.test" }); mocks.apply.mockResolvedValue({ saved: true }); });
describe("customer custom content endpoint", () => {
  it("requires authentication and same origin before accessing content", async () => {
    mocks.auth.mockResolvedValue(null); expect((await PATCH(request(), params)).status).toBe(401); expect(mocks.context).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ siteId: "site-a" }); expect((await PATCH(request(body, "https://other.test"), params)).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled();
  });
  it.each([null, { siteId: "site-b" }])("denies unavailable lifecycle/capability and foreign site context", async context => {
    mocks.context.mockResolvedValue(context); expect((await PATCH(request(), params)).status).toBe(403); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("allowlists only the requested content fields", async () => {
    for (const value of [{ ...body, field: "customDesign" }, { ...body, visibility: "public" }]) expect((await PATCH(request(value), params)).status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("bounds actual streamed bytes", async () => { expect((await PATCH(request("x".repeat(850_001)), params)).status).toBe(413); expect(mocks.context).not.toHaveBeenCalled(); });
  it("preserves compare-and-swap inputs and invalidates both public targets only after success", async () => {
    expect((await PATCH(request(), params)).status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith("trusted", "example", {}, "priceList", {}, {}, {});
    expect(mocks.invalidate).toHaveBeenCalledWith({ kind: "domain", value: "example.test" });
  });
  it("returns a recoverable stale-edit error without invalidation", async () => {
    mocks.apply.mockRejectedValue(new Error("custom_content_conflict private details"));
    const response = await PATCH(request(), params); expect(response.status).toBe(409); expect(await response.text()).not.toContain("private details"); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("requires media capability for media edits", async () => { await PATCH(request({ ...body, field: "customMedia" }), params); expect(mocks.context).toHaveBeenCalledWith("trusted", "example", true); });
});
