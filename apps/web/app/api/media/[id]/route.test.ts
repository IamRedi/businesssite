import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMediaAssetForDelivery: vi.fn(),
  getInformationMediaBlob: vi.fn(),
  getMediaBlob: vi.fn(),
  requireSiteAdminSession: vi.fn(),
  trustedSiteAdminSessionHash: vi.fn(),
  getBlob: vi.fn(),
  readR2: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresInformationRepository: class {
    getMediaAssetForDelivery = mocks.getMediaAssetForDelivery;
    getInformationMediaBlob = mocks.getInformationMediaBlob;
  },
  PostgresSiteRepository: class { getMediaBlob = mocks.getMediaBlob; },
}));
vi.mock("../../../../lib/site-admin-auth", () => ({
  requireSiteAdminSession: mocks.requireSiteAdminSession,
  trustedSiteAdminSessionHash: mocks.trustedSiteAdminSessionHash,
}));
vi.mock("@vercel/blob", () => ({ get: mocks.getBlob }));
vi.mock("../../../../lib/r2-media-store", () => ({ r2MediaConfiguration: () => ({}), R2MediaStore: class { read = mocks.readR2; } }));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const request = (host = "platform.example") => new Request("https://platform.example/api/media/11111111-1111-4111-8111-111111111111", { headers: { host } });
const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  siteId: "site-a",
  storageProvider: "postgres" as const,
  storageKey: "22222222-2222-4222-8222-222222222222",
  storageAccess: "private" as const,
  mimeType: "image/webp",
  width: 1200,
  height: 800,
  byteSize: 10,
  customDomain: "news.example",
  customDomainVerified: true,
  publiclyAvailable: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_APP_URL", "https://platform.example");
  mocks.requireSiteAdminSession.mockResolvedValue(null);
  mocks.trustedSiteAdminSessionHash.mockReturnValue("session-hash");
  mocks.getMediaAssetForDelivery.mockResolvedValue(asset);
  mocks.getInformationMediaBlob.mockResolvedValue({ contentType: "image/webp", data: Buffer.from("webp-bytes") });
  mocks.getMediaBlob.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllEnvs());

describe("information media delivery", () => {
  it("reads private R2 only after the exact editorial session authorizes the asset", async () => {
    const r2 = { ...asset, publiclyAvailable: false, storageProvider: "r2", storageKey: "sites/site-a/editorial/key.webp", providerAuthority: "exact-private-authority" };
    mocks.getMediaAssetForDelivery.mockResolvedValueOnce(null).mockResolvedValueOnce(r2);
    mocks.requireSiteAdminSession.mockResolvedValue({ siteId: "site-a" });
    mocks.readR2.mockResolvedValue({ stream: null, bytes: 10, etag: '"etag"' });
    const response = await GET(request(), params);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.readR2).toHaveBeenCalledWith(expect.objectContaining({ authority: "exact-private-authority", siteId: "site-a", access: "private", key: r2.storageKey }));
  });
  it("rejects foreign-domain R2 media before reading the bucket", async () => {
    mocks.getMediaAssetForDelivery.mockResolvedValue({ ...asset, storageProvider: "r2", providerAuthority: "exact-private-authority" });
    expect((await GET(request("other.example"), params)).status).toBe(404);
    expect(mocks.readR2).not.toHaveBeenCalled();
  });
  it("serves published media on the platform and exact custom domain", async () => {
    expect((await GET(request(), params)).status).toBe(200);
    expect((await GET(request("news.example"), params)).status).toBe(200);
  });

  it("denies draft media, cross-tenant domains and spoofed hosts", async () => {
    mocks.getMediaAssetForDelivery.mockResolvedValueOnce({ ...asset, publiclyAvailable: false });
    expect((await GET(request(), params)).status).toBe(404);
    expect((await GET(request("other.example"), params)).status).toBe(404);
    expect((await GET(request("news.example,attacker.example"), params)).status).toBe(400);
    expect(mocks.getInformationMediaBlob).not.toHaveBeenCalled();
  });

  it("allows a same-site administrator to preview private media without public caching", async () => {
    mocks.getMediaAssetForDelivery
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...asset, publiclyAvailable: false });
    mocks.requireSiteAdminSession.mockResolvedValue({ siteId: "site-a" });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("streams private Vercel Blob media through the authorized route", async () => {
    vi.stubEnv("INFORMATION_BLOB_READ_WRITE_TOKEN", "private-information-token");
    mocks.getMediaAssetForDelivery.mockResolvedValue({ ...asset, storageProvider: "vercel_blob", storageKey: "sites/site-a/editorial/image.webp" });
    mocks.getBlob.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("blob")); controller.close(); } }),
      headers: new Headers(),
      blob: { contentType: "image/webp", size: 4, etag: "etag-1" },
    });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.getBlob).toHaveBeenCalledWith("sites/site-a/editorial/image.webp", { access: "private", token: "private-information-token" });
  });

  it("fails closed when the private information Blob store is not configured", async () => {
    vi.stubEnv("INFORMATION_BLOB_READ_WRITE_TOKEN", "");
    mocks.getMediaAssetForDelivery.mockResolvedValue({ ...asset, storageProvider: "vercel_blob", storageKey: "sites/site-a/editorial/image.webp" });
    expect((await GET(request(), params)).status).toBe(503);
    expect(mocks.getBlob).not.toHaveBeenCalled();
  });

  it("does not expose an information site's underlying database blob id", async () => {
    mocks.getMediaAssetForDelivery.mockResolvedValue(null);
    mocks.getMediaBlob.mockResolvedValue({ siteId: "site-a", siteKind: "information", contentType: "image/webp", data: Buffer.from("private") });
    expect((await GET(request(), params)).status).toBe(404);
  });

  it("preserves existing business media delivery", async () => {
    mocks.getMediaAssetForDelivery.mockResolvedValue(null);
    mocks.getMediaBlob.mockResolvedValue({ siteId: "business-a", siteKind: "business", contentType: "image/webp", data: Buffer.from("business") });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
  });
});
