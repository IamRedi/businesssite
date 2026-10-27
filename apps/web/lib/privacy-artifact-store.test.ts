import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({
  ...mocks,
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));

import { configuredPrivacyArtifactStore } from "./privacy-artifact-store";
import { privacyExportObjectKey } from "@platform/site-data";

const storeId = "store_1234567890ABCDEF";
const token = "vercel_blob_rw_1234567890ABCDEF_synthetic";
const target = () => {
  const artifactId = randomUUID();
  return {
    artifactId,
    jobId: randomUUID(),
    provider: "vercel_blob" as const,
    storeAuthority: storeId,
    environmentIdentity: "staging-b6c",
    objectKey: privacyExportObjectKey("staging-b6c", artifactId),
  };
};
const environment = {
  PRIVACY_EXPORT_ARTIFACT_STORE: "vercel_blob_private",
  PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN: token,
  PRIVACY_EXPORT_BLOB_STORE_ID: storeId,
  PRIVACY_EXPORT_ENVIRONMENT_ID: "staging-b6c",
};
const providerResult = (pathname: string, size = 3) => ({
  pathname,
  url: `https://1234567890abcdef.private.blob.vercel-storage.com/${pathname}`,
  downloadUrl: `https://1234567890abcdef.private.blob.vercel-storage.com/${pathname}?download=1`,
  etag: '"synthetic"',
  size,
  contentType: "application/octet-stream",
  contentDisposition: "attachment",
  cacheControl: "private",
  uploadedAt: new Date(),
});

describe("private privacy artifact store", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows memory fixtures only in an explicit non-production Preview", () => {
    expect(configuredPrivacyArtifactStore({
      PRIVACY_EXPORT_ARTIFACT_STORE: "memory_test",
      PRIVACY_EXPORT_ENVIRONMENT_ID: "b6f1-staging",
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      RELEASE_TARGET: "staging",
    }).adapter).toBe("memory_test");
    expect(() => configuredPrivacyArtifactStore({
      PRIVACY_EXPORT_ARTIFACT_STORE: "memory_test",
      VERCEL_ENV: "production",
    })).toThrow("private_store_required");
  });

  it("requires the token, exact store and environment authority to agree", () => {
    expect(() =>
      configuredPrivacyArtifactStore({
        ...environment,
        PRIVACY_EXPORT_BLOB_STORE_ID: "store_FEDCBA0987654321",
      }),
    ).toThrow("unconfigured");
    expect(() =>
      configuredPrivacyArtifactStore({
        ...environment,
        PRIVACY_EXPORT_ENVIRONMENT_ID: "Production/unsafe",
      }),
    ).toThrow("unconfigured");
  });

  it("verifies private provider identity on create/read and exact ETag deletion", async () => {
    const binding = target();
    mocks.put.mockResolvedValue(providerResult(binding.objectKey));
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(new Uint8Array([1, 2, 3])).body,
      // Private Blob currently reports zero here for some streamed objects;
      // HEAD remains authoritative and the streamed bytes must match it.
      blob: providerResult(binding.objectKey, 0),
    });
    mocks.head
      .mockResolvedValueOnce(providerResult(binding.objectKey))
      .mockResolvedValueOnce(providerResult(binding.objectKey))
      .mockRejectedValueOnce(
        new (await import("@vercel/blob")).BlobNotFoundError(),
      );
    const store = configuredPrivacyArtifactStore(environment);
    await store.create(binding, new Uint8Array([1, 2, 3]));
    await expect(store.read(binding, 3)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await store.delete(binding);
    expect(mocks.put).toHaveBeenCalledWith(
      binding.objectKey,
      expect.any(Buffer),
      expect.objectContaining({ access: "private", token }),
    );
    expect(mocks.get).toHaveBeenCalledWith(
      binding.objectKey,
      expect.objectContaining({ access: "private", useCache: false, token }),
    );
    expect(mocks.del).toHaveBeenCalledWith(binding.objectKey, {
      token,
      ifMatch: '"synthetic"',
    });
  });

  it("blocks wrong object/store bindings before provider transport", async () => {
    const binding = target();
    const store = configuredPrivacyArtifactStore(environment);
    await expect(
      store.read({ ...binding, storeAuthority: "store_FEDCBA0987654321" }, 3),
    ).rejects.toThrow("authority_mismatch");
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
