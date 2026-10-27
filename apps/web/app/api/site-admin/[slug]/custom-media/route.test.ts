import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { syntheticMp4 } from "../../../../../lib/owner-custom-media-fixtures";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), register: vi.fn(), put: vi.fn(), del: vi.fn(), quota: vi.fn(), acquire: vi.fn(), release: vi.fn() }));
vi.mock("../../../../../lib/site-admin-auth", () => ({ requireSiteAdmin: mocks.auth, trustedSiteAdminSessionHash: () => "trusted" }));
vi.mock("@platform/site-data", () => ({ PostgresSiteAdminCustomContentRepository: class { context = mocks.context; registerMedia = mocks.register; }, PostgresSiteRepository: class { releaseTenantConcurrency = mocks.release; } }));
vi.mock("../../../../../lib/tenant-usage-policy", () => ({ enforceTenantQuota: mocks.quota, acquireTenantConcurrency: mocks.acquire }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del, head: vi.fn(), BlobNotFoundError: class extends Error {} }));
import { POST } from "./route";
const params = { params: Promise.resolve({ slug: "example" }) }, authority = "store_localux000000001";
async function request(video = false) {
  const data = video ? syntheticMp4 : await sharp({ create: { width: 16, height: 16, channels: 3, background: "#dddddd" } }).webp().toBuffer();
  const form = new FormData(); form.set("file", new File([new Uint8Array(data)], video ? "clip.mp4" : "image.webp", { type: video ? "video/mp4" : "image/webp" }));
  return new Request("http://localhost/api/site-admin/example/custom-media", { method: "POST", headers: { origin: "http://localhost" }, body: form });
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ siteId: "site-a" }); mocks.context.mockResolvedValue({ siteId: "site-a", maxDurationSeconds: 30 }); mocks.register.mockResolvedValue("asset"); mocks.quota.mockResolvedValue({ allowed: true }); mocks.acquire.mockResolvedValue({ allowed: true, leaseId: "lease" });
  vi.stubEnv("BLOB_STORE_ID", authority); vi.stubEnv("PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID", authority); vi.stubEnv("VERCEL_OIDC_TOKEN", "synthetic");
  mocks.put.mockImplementation(async (key, _data, options) => ({ pathname: key, url: `https://${authority.slice(6)}.public.blob.vercel-storage.com/${key}`, contentType: options.contentType, etag: "etag" }));
});
afterEach(() => vi.unstubAllEnvs());
describe("customer managed media pipeline", () => {
  it.each([false, true])("validates and registers WebP/MP4 %s without exposing provider keys", async video => {
    const response = await POST(await request(video), params); expect(response.status).toBe(201);
    const body = await response.json(); expect(body.storageKey).toBeUndefined(); expect(body.providerAuthority).toBeUndefined(); expect(body.assetId).toBeUndefined(); expect(body.width).toBe(16);
    expect(mocks.quota).toHaveBeenCalledWith(expect.anything(), { siteId: "site-a", metric: "media_upload_bytes", amount: body.bytes });
    expect(mocks.register).toHaveBeenCalledWith("trusted", "example", expect.objectContaining({ authority, mimeType: video ? "video/mp4" : "image/webp" })); expect(mocks.release).toHaveBeenCalledWith("site-a", "lease");
  });
  it.each([null, { siteId: "site-b" }])("denies missing lifecycle/feature or foreign tenant before upload", async context => {
    mocks.context.mockResolvedValue(context); expect((await POST(await request(), params)).status).toBe(403); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("denies missing auth and cross-origin", async () => {
    mocks.auth.mockResolvedValue(null); expect((await POST(await request(), params)).status).toBe(401);
    mocks.auth.mockResolvedValue({ siteId: "site-a" }); const req = await request(); req.headers.set("origin", "https://other.test"); expect((await POST(req, params)).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled();
  });
  it("requires configured cleanup authority", async () => { vi.stubEnv("PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID", "store_other00000000001"); expect((await POST(await request(), params)).status).toBe(503); expect(mocks.put).not.toHaveBeenCalled(); });
  it("honors existing tenant quotas and concurrency", async () => {
    mocks.quota.mockResolvedValue({ allowed: false }); expect((await POST(await request(), params)).status).toBe(429); expect(mocks.acquire).not.toHaveBeenCalled();
    mocks.quota.mockResolvedValue({ allowed: true }); mocks.acquire.mockResolvedValue({ allowed: false }); expect((await POST(await request(), params)).status).toBe(429); expect(mocks.put).not.toHaveBeenCalled();
  });
  it("compensates an upload when fresh registration rejects lifecycle or session", async () => {
    mocks.register.mockResolvedValue(null); expect((await POST(await request(), params)).status).toBe(409); expect(mocks.del).toHaveBeenCalledWith(expect.stringMatching(/^sites\/site-a\/custom\//), expect.objectContaining({ ifMatch: "etag" })); expect(mocks.release).toHaveBeenCalled();
  });
  it("rejects a different returned Blob store and compensates only the intended key", async () => {
    mocks.put.mockResolvedValue({ pathname: "foreign", url: "https://other.test/file", contentType: "image/webp", etag: "etag" }); expect((await POST(await request(), params)).status).toBe(502); expect(mocks.register).not.toHaveBeenCalled(); expect(mocks.del).toHaveBeenCalledWith(expect.stringMatching(/^sites\/site-a\/custom\//), expect.anything());
  });
  it("rejects overlong video before storage and releases the lease", async () => { mocks.context.mockResolvedValue({ siteId: "site-a", maxDurationSeconds: 1 }); expect((await POST(await request(true), params)).status).toBe(400); expect(mocks.put).not.toHaveBeenCalled(); expect(mocks.release).toHaveBeenCalled(); });
});
