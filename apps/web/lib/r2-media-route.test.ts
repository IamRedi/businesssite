import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ lookup: vi.fn(), read: vi.fn() }));
vi.mock("@platform/site-data", () => ({ PostgresSiteRepository: class { getPublicR2Media = mock.lookup; } }));
vi.mock("./r2-media-store", async original => ({ ...await original<typeof import("./r2-media-store")>(), r2MediaConfiguration: () => ({}), R2MediaStore: class { read = mock.read; } }));
import { GET, HEAD } from "../app/api/media/r2/[...key]/route";
const key = "sites/tenant-a/custom/11111111-1111-4111-8111-111111111111-image.webp";
const asset = { siteId: "tenant-a", storageKey: key, providerAuthority: "registered-authority", mimeType: "image/webp", byteSize: 4, customDomain: "tenant-a.example", customDomainVerified: true };
function request(host: string, range?: string) { return new Request(`https://${host}/api/media/r2/${key}`, { headers: { host, ...(range ? { range } : {}) } }); }
const params = () => Promise.resolve({ key: key.split("/") });
beforeEach(() => { vi.stubEnv("PUBLIC_APP_URL", "https://platform.example"); mock.lookup.mockReset().mockResolvedValue(asset); mock.read.mockReset().mockResolvedValue({ stream: null, bytes: 4, status: 200, contentType: "image/webp", etag: '"etag"' }); });
describe("registered public R2 HTTP delivery", () => {
  it("rejects traversal and editorial keys before querying or contacting R2", async () => {
    for (const bad of [key.replace("custom/", "editorial/"), key.replace("tenant-a", ".."), key + "%2e"]) {
      expect((await GET(request("platform.example"), { params: Promise.resolve({ key: bad.split("/") }) })).status).toBe(404);
    }
    expect(mock.lookup).not.toHaveBeenCalled(); expect(mock.read).not.toHaveBeenCalled();
  });
  it("does not serve another tenant's object on a customer domain", async () => {
    expect((await GET(request("tenant-b.example"), { params: params() })).status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it("requires a registered object and verified exact domain", async () => {
    mock.lookup.mockResolvedValueOnce(null); expect((await GET(request("tenant-a.example"), { params: params() })).status).toBe(404);
    mock.lookup.mockResolvedValueOnce({ ...asset, customDomainVerified: false }); expect((await GET(request("tenant-a.example"), { params: params() })).status).toBe(404);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it("passes only DB authority to R2 and preserves immutable nosniff headers", async () => {
    const result = await GET(request("tenant-a.example"), { params: params() });
    expect(result.status).toBe(200); expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mock.read).toHaveBeenCalledWith(expect.objectContaining({ authority: asset.providerAuthority, siteId: asset.siteId, key, access: "public", headOnly: false }));
  });
  it("rejects multipart ranges and handles HEAD without requesting a body", async () => {
    expect((await GET(request("platform.example", "bytes=0-1,2-3"), { params: params() })).status).toBe(416);
    expect(mock.read).not.toHaveBeenCalled();
    expect((await HEAD(request("platform.example"), { params: params() })).status).toBe(200);
    expect(mock.read).toHaveBeenCalledWith(expect.objectContaining({ headOnly: true }));
  });
  it("fails closed without leaking provider errors", async () => {
    mock.read.mockRejectedValueOnce(Error("secret diagnostic"));
    const result = await GET(request("platform.example"), { params: params() });
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("secret diagnostic");
  });
});
