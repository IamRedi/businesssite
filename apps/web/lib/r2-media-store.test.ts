import { describe, expect, it, vi } from "vitest";
import { r2MediaAuthority, r2MediaConfiguration, R2MediaStore, validMediaRange, validTenantMediaKey } from "./r2-media-store";
const env = { MEDIA_R2_ACCOUNT_ID: "a".repeat(32), MEDIA_R2_PUBLIC_BUCKET: "media-public", MEDIA_R2_PRIVATE_BUCKET: "media-private", MEDIA_R2_ACCESS_KEY_ID: "b".repeat(32), MEDIA_R2_SECRET_ACCESS_KEY: "c".repeat(64), PUBLIC_APP_URL: "https://platform.example" };
const config = r2MediaConfiguration(env);
const key = "sites/tenant-a/custom/11111111-1111-4111-8111-111111111111-image.webp";
describe("R2 media authority", () => {
  it("separates exact private/public buckets and excludes backups", () => {
    expect(r2MediaAuthority(config, "public")).not.toBe(r2MediaAuthority(config, "private"));
    for (const overrides of [{ MEDIA_R2_PRIVATE_BUCKET: "media-public" }, { MEDIA_R2_PUBLIC_BUCKET: "recovery-backups" }, { MEDIA_R2_ENDPOINT: "https://attacker.example" }, { MEDIA_R2_ENDPOINT: `http://${env.MEDIA_R2_ACCOUNT_ID}.r2.cloudflarestorage.com` }, { MEDIA_R2_ENDPOINT: `https://${env.MEDIA_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/?x=1` }, { MEDIA_R2_ACCOUNT_ID: "invalid" }, { PUBLIC_APP_URL: "https://user:pass@platform.example" }, { MEDIA_R2_ACCESS_KEY_ID: "" }]) expect(() => r2MediaConfiguration({ ...env, ...overrides })).toThrow();
  });
  it("rejects cross-tenant, traversal and editorial/public key confusion", () => {
    expect(validTenantMediaKey("tenant-a", key, "public")).toBe(true);
    for (const bad of [key.replace("tenant-a", "tenant-b"), key.replace("custom/", "../"), key + "?secret=x", key.replace("custom/", "editorial/"), key.replace("/custom/", "//custom/"), key.replace("image.webp", "image.svg")]) expect(validTenantMediaKey("tenant-a", bad, "public")).toBe(false);
    expect(validTenantMediaKey("tenant-a", key, "private")).toBe(false);
    expect(validTenantMediaKey("tenant-a", key.replace("custom/", "editorial/"), "private")).toBe(true);
  });
  it("accepts one bounded range and rejects multipart/ambiguous/zero suffix requests", () => {
    for (const value of ["bytes=0-9", "bytes=10-", "bytes=-10"]) expect(validMediaRange(value)).toBe(value);
    for (const value of ["bytes=10-0", "bytes=-0", "bytes=0-1,2-3", "bytes=1--2", "bytes=", "bytes=9999999999999-", "bytes=0-1\r\nx-evil:yes"]) expect(() => validMediaRange(value)).toThrow();
  });
  it("uses immutable writes, exact authority and no public/private ACL", async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"etag"' });
    const store = new R2MediaStore(config, { send } as never);
    const result = await store.put({ siteId: "tenant-a", key, access: "public", mimeType: "image/webp", bytes: new Uint8Array([1, 2]) });
    expect(result.url).toBe(`/api/media/r2/${key}`);
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: "media-public", Key: key, IfNoneMatch: "*", ContentType: "image/webp", Metadata: { "site-id": "tenant-a", access: "public" } });
    expect(send.mock.calls[0][0].input).not.toHaveProperty("ACL");
    send.mockClear();
    await expect(store.put({ siteId: "tenant-b", key, access: "public", mimeType: "image/webp", bytes: new Uint8Array([1]) })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("refuses a private-object request with public-bucket authority before I/O", async () => {
    const send = vi.fn();const store = new R2MediaStore(config, { send } as never);
    await expect(store.read({ siteId: "tenant-a", key: key.replace("custom/", "editorial/"), access: "private", authority: r2MediaAuthority(config, "public"), mimeType: "image/webp", expectedBytes: 10 })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("refuses mismatched MIME/size/site metadata before opening a body stream", async () => {
    for (const overrides of [{ ContentType: "text/html" }, { ContentLength: 20 }, { Metadata: { "site-id": "tenant-b", access: "public", sha256: "a".repeat(64) } }]) {
      const send = vi.fn().mockResolvedValue({ ETag: '"etag"', ContentType: "image/webp", ContentLength: 10, Metadata: { "site-id": "tenant-a", access: "public", sha256: "a".repeat(64) }, ...overrides });
      const store = new R2MediaStore(config, { send } as never);
      await expect(store.read({ siteId: "tenant-a", key, access: "public", authority: r2MediaAuthority(config, "public"), mimeType: "image/webp", expectedBytes: 10 })).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
  it("streams a single MP4 range with exact length, total and immutable ETag", async () => {
    const movie = key.replace(".webp", ".mp4");
    const send = vi.fn().mockResolvedValueOnce({ ETag: '"etag"', ContentType: "video/mp4", ContentLength: 10, Metadata: { "site-id": "tenant-a", access: "public", sha256: "a".repeat(64) } }).mockResolvedValueOnce({ ETag: '"etag"', ContentType: "video/mp4", ContentLength: 4, ContentRange: "bytes 2-5/10", Body: { transformToWebStream: () => new ReadableStream() } });
    const result = await new R2MediaStore(config, { send } as never).read({ siteId: "tenant-a", key: movie, access: "public", authority: r2MediaAuthority(config, "public"), mimeType: "video/mp4", expectedBytes: 10, range: "bytes=2-5" });
    expect(result.status).toBe(206); expect(result.bytes).toBe(4);
    expect(send.mock.calls[1][0].input).toMatchObject({ Range: "bytes=2-5", IfMatch: '"etag"', Bucket: "media-public", Key: movie });
  });
  it("uses metadata only for HEAD, and rejects missing upload/read receipts", async () => {
    const send = vi.fn().mockResolvedValue({ ETag: '"etag"', ContentType: "image/webp", ContentLength: 10, Metadata: { "site-id": "tenant-a", access: "public", sha256: "a".repeat(64) } });
    const store = new R2MediaStore(config, { send } as never);
    const result = await store.read({ siteId: "tenant-a", key, access: "public", authority: r2MediaAuthority(config, "public"), mimeType: "image/webp", expectedBytes: 10, headOnly: true });
    expect(result.stream).toBeNull(); expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce({});
    await expect(store.put({ siteId: "tenant-a", key, access: "public", mimeType: "image/webp", bytes: new Uint8Array([1]) })).rejects.toThrow();
    send.mockResolvedValueOnce({ ContentType: "image/webp", ContentLength: 10, Metadata: { "site-id": "tenant-a", access: "public", sha256: "a".repeat(64) } });
    await expect(store.read({ siteId: "tenant-a", key, access: "public", authority: r2MediaAuthority(config, "public"), mimeType: "image/webp", expectedBytes: 10 })).rejects.toThrow();
  });
});
