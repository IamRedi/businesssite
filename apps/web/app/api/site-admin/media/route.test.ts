import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSiteAdmin: vi.fn(),
  authorizedSiteCapability: vi.fn(),
  getSiteIdBySlug: vi.fn(),
  registerBusinessMedia: vi.fn(),
  releaseTenantConcurrency: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("../../../../lib/site-admin-auth", () => ({
  requireSiteAdmin: mocks.requireSiteAdmin,
  trustedSiteAdminSessionHash: () => "a".repeat(64),
}));
vi.mock("../../../../lib/product-access", () => ({
  authorizedSiteCapability: mocks.authorizedSiteCapability,
}));
vi.mock("../../../../lib/tenant-usage-policy", () => ({
  enforceTenantQuota: vi.fn().mockResolvedValue({ allowed: true }),
  acquireTenantConcurrency: vi
    .fn()
    .mockResolvedValue({ allowed: true, leaseId: "lease-1" }),
}));
vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class extends Error {},
  put: mocks.put,
  del: mocks.del,
  head: vi.fn(),
}));
vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    getSiteIdBySlug = mocks.getSiteIdBySlug;
    registerBusinessProviderMediaForAuthenticatedSession =
      mocks.registerBusinessMedia;
    releaseTenantConcurrency = mocks.releaseTenantConcurrency;
  },
  PostgresInformationRepository: class {},
  roleHasEditorialPermission: vi.fn(),
}));

import { POST } from "./route";

describe("business media lifecycle gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSiteAdmin.mockResolvedValue({
      accountId: "account-1",
      siteId: "site-1",
    });
    mocks.getSiteIdBySlug.mockResolvedValue("site-1");
    mocks.authorizedSiteCapability.mockResolvedValue(null);
    mocks.releaseTenantConcurrency.mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
  });

  it("rejects unavailable media before parsing multipart data or calling storage", async () => {
    const formData = vi.fn();
    const request = {
      headers: new Headers({
        "x-site-slug": "example",
        "content-length": "100",
      }),
      formData,
    } as unknown as Request;
    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Media upload is unavailable for this subscription.",
    });
    expect(formData).not.toHaveBeenCalled();
  });

  it("persists the exact public Blob store authority after upload", async () => {
    mocks.authorizedSiteCapability.mockResolvedValue({ available: true });
    mocks.registerBusinessMedia.mockResolvedValue("asset-1");
    process.env.BLOB_STORE_ID = "store_ExampleStore0001";
    process.env.VERCEL_OIDC_TOKEN = "synthetic-oidc";
    mocks.put.mockImplementation(async (pathname: string) => ({
      pathname,
      url: `https://examplestore0001.public.blob.vercel-storage.com/${pathname}`,
      etag: '"etag"',
    }));
    const data = Buffer.alloc(30);
    data.write("RIFF", 0, "ascii");
    data.write("WEBP", 8, "ascii");
    data.write("VP8X", 12, "ascii");
    const form = new FormData();
    form.set("file", new File([data], "test.webp", { type: "image/webp" }));
    const response = await POST(
      new Request("http://localhost/api/site-admin/media", {
        method: "POST",
        headers: { "x-site-slug": "example", "content-length": "100" },
        body: form,
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^sites\/site-1\/.+-test\.webp$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        storeId: "store_ExampleStore0001",
        oidcToken: "synthetic-oidc",
      }),
    );
    expect(mocks.registerBusinessMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        providerAuthority: "store_ExampleStore0001",
        storageKey: expect.stringMatching(/^sites\/site-1\//),
      }),
    );
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("uses request-context OIDC on Vercel without a runtime token env var", async () => {
    mocks.authorizedSiteCapability.mockResolvedValue({ available: true });
    mocks.registerBusinessMedia.mockResolvedValue("asset-1");
    process.env.VERCEL = "1";
    process.env.BLOB_STORE_ID = "store_ExampleStore0001";
    mocks.put.mockImplementation(async (pathname: string) => ({
      pathname,
      url: `https://examplestore0001.public.blob.vercel-storage.com/${pathname}`,
      etag: '"etag"',
    }));
    const data = Buffer.alloc(30);
    data.write("RIFF", 0, "ascii");
    data.write("WEBP", 8, "ascii");
    data.write("VP8X", 12, "ascii");
    const form = new FormData();
    form.set("file", new File([data], "test.webp", { type: "image/webp" }));
    const response = await POST(
      new Request("http://localhost/api/site-admin/media", {
        method: "POST",
        headers: { "x-site-slug": "example", "content-length": "100" },
        body: form,
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^sites\/site-1\/.+-test\.webp$/),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        storeId: "store_ExampleStore0001",
      }),
    );
    expect(mocks.put.mock.calls.at(-1)?.[2]).not.toHaveProperty("oidcToken");
  });
});
