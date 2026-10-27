import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn(), publish: vi.fn(), restore: vi.fn(), invalidate: vi.fn() }));
vi.mock("../../../../../../lib/owner-authorization", () => ({ authorizeOwnerRequest: mocks.authorize }));
vi.mock("../../../../../../lib/public-site-cache", () => ({ expirePublicSiteFromRoute: mocks.invalidate }));
vi.mock("@platform/site-data", () => ({ PostgresOwnerCustomDesignRepository: class { read=mocks.read; publish=mocks.publish; restore=mocks.restore; } }));
import { POST } from "./route";
const context = { params: Promise.resolve({ slug: "example" }) };
const request = (body: unknown) => new Request("https://control.example/api/owner/sites/example/custom-design", { method: "POST", body: JSON.stringify(body) });
describe("owner custom design request boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ ok: true, owner: { sessionHash: "server-derived", correlationId: "test" } }); mocks.read.mockResolvedValue({ document: { id: "server-site", slug: "example" }, domain: { customDomain: "site.example" } }); });
  it("denies unauthenticated/forbidden requests before reading customer data", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(request({ action: "read" }), context)).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns a no-store owner snapshot; reading never publishes", async () => {
    const response = await POST(request({ action: "read" }), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.read).toHaveBeenCalledWith("server-derived", "example"); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects stale documents and does not mutate or invalidate public caches", async () => {
    expect((await POST(request({ action: "publish", expected: { id: "another-site" } }), context)).status).toBe(409);
    expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("binds mutation to server identity and invalidates slug and verified domain", async () => {
    mocks.publish.mockResolvedValue({ id: "server-site", slug: "example" });
    const response = await POST(request({ action: "publish", expected: { id: "server-site", slug: "example" }, design: {}, media: {}, sessionHash: "attacker" }), context);
    expect(response.status).toBe(200); expect(mocks.publish.mock.calls[0][0]).toBe("server-derived");
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
  });
  it("caps actual body bytes and hides database error text", async () => {
    expect((await POST(request({ action: "read", oversized: "x".repeat(2000001) }), context)).status).toBe(413);
    mocks.publish.mockRejectedValue(new Error("secret database connection string"));
    const response = await POST(request({ action: "publish", expected: { id: "server-site", slug: "example" }, design: {}, media: {} }), context);
    expect(response.status).toBe(400); expect(await response.text()).not.toContain("secret database");
  });
  it("can restore a bounded large document with its rollback slot", async () => {
    const document = { id: "server-site", slug: "example", _customRestore: { document: { content: "x".repeat(900_000) } } };
    mocks.read.mockResolvedValue({ document, domain: { customDomain: null } });
    mocks.restore.mockResolvedValue({ id: "server-site", slug: "example" });
    const response = await POST(request({ action: "restore", expected: document }), context);
    expect(response.status).toBe(200);
    expect(mocks.restore).toHaveBeenCalledWith("server-derived", "example", document, "test");
  });
});
