import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { syntheticMp4 } from "../../../../../../lib/owner-custom-media-fixtures";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), context: vi.fn(), register: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock("../../../../../../lib/owner-authorization", () => ({ authorizeOwnerRequest: mocks.authorize }));
vi.mock("@platform/site-data", () => ({ PostgresOwnerCustomDesignRepository: class { mediaContext=mocks.context; registerMedia=mocks.register; } }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del }));
import { POST } from "./route";
const authority = "store_ExampleStore0001", context = { params: Promise.resolve({ slug: "synthetic" }) };
async function request(mime = "image/webp", extra = false) {
  const bytes = mime === "image/webp" ? await sharp({ create: { width: 16, height: 16, channels: 3, background: "black" } }).webp().toBuffer() : syntheticMp4;
  const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], "../prepared.test", { type: mime }));
  if (extra) form.set("siteId", "other-tenant");
  return new Request("https://control.example/api/owner/sites/synthetic/custom-media", { method: "POST", body: form });
}
describe("Owner managed media upload", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("BLOB_STORE_ID", authority); vi.stubEnv("PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID", authority); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    mocks.authorize.mockResolvedValue({ ok: true, owner: { sessionHash: "server-session" } }); mocks.context.mockResolvedValue({ siteId: "server-site", maxDurationSeconds: 30 }); mocks.register.mockResolvedValue("registered-id");
    mocks.put.mockImplementation(async (key, _buffer, options) => ({ pathname: key, url: `https://examplestore0001.public.blob.vercel-storage.com/${key}`, contentType: options.contentType, etag: "new-object-etag" }));
    mocks.del.mockResolvedValue(undefined);
  });
  it("requires Owner authorization before any DB or storage access", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST(await request(), context)).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("denies unavailable tenant/lifecycle and never falls back to private or database storage", async () => {
    mocks.context.mockResolvedValue(null); expect((await POST(await request(), context)).status).toBe(403);
    mocks.context.mockResolvedValue({ siteId: "server-site", maxDurationSeconds: 30 }); vi.stubEnv("PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID", "store_KZTiY4mQqmSqD0wx"); expect((await POST(await request(), context)).status).toBe(503); expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["image/webp", "video/mp4"])("registers genuine %s through exact tenant/provider authority", async mime => {
    const response = await POST(await request(mime), context); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    const value = await response.json(); expect(value).toMatchObject({ storage: "blob", providerAuthority: authority, assetId: "registered-id", mimeType: mime }); expect(value.storageKey).toMatch(/^sites\/server-site\/custom\/[a-f0-9-]{36}-/);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request), "websites.manage"); expect(mocks.register).toHaveBeenCalledWith("server-session", "synthetic", expect.objectContaining({ authority, key: value.storageKey, width: 16, height: 16 }));
    expect(mocks.put.mock.calls[0][2]).toMatchObject({ access: "public", storeId: authority, allowOverwrite: false, addRandomSuffix: false }); expect(mocks.del).not.toHaveBeenCalled();
  });
  it("rejects caller-provided site/URL fields and unsupported WebM without storage writes", async () => {
    expect((await POST(await request("image/webp", true), context)).status).toBe(400);
    expect((await POST(await request("video/webm"), context)).status).toBe(415); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("rolls back ONLY the newly allocated key when provider returns another store/path", async () => {
    mocks.put.mockResolvedValue({ url: "https://private.other.example/another-site", pathname: "sites/another/private", etag: "new-object-etag", contentType: "image/webp" });
    expect((await POST(await request(), context)).status).toBe(502); expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.del).toHaveBeenCalledWith(mocks.put.mock.calls[0][0], expect.objectContaining({ storeId: authority, ifMatch: "new-object-etag" }));
  });
  it("deletes new object on stale/unauthorized registration and never exposes provider/DB details", async () => {
    mocks.register.mockResolvedValue(null); expect((await POST(await request(), context)).status).toBe(409); expect(mocks.del).toHaveBeenCalledTimes(1);
    mocks.register.mockRejectedValue(new Error("private db credentials")); const response = await POST(await request(), context); expect(response.status).toBe(409); expect(await response.text()).not.toContain("credentials");
    mocks.del.mockRejectedValue(new Error("private provider token")); const failed = await POST(await request(), context); expect(failed.status).toBe(503); const recovery = await failed.json(); expect(JSON.stringify(recovery)).not.toContain("token"); expect(recovery).toMatchObject({ cleanupRequired: true, providerAuthority: authority, storageKey: mocks.put.mock.calls.at(-1)![0] });
  });
});
