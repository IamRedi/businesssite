import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";
import {
  MemoryPrivacyArtifactStore,
  PRIVACY_EXPORT_MAX_ARCHIVE_BYTES,
  privacyArtifactBindingValid,
  privacyExportEnvironmentIdentityValid,
  type PrivacyArtifactAuthority,
  type PrivacyArtifactBinding,
  type PrivacyArtifactStore,
} from "@platform/site-data";

const safeStoreAuthority = (value: string | undefined) =>
  /^store_[A-Za-z0-9]{16}$/.test(value ?? "") ? value! : undefined;
const tokenStoreAuthority = (value: string | undefined) => {
  const storeId = value?.trim().split("_")[3];
  return /^[A-Za-z0-9]{16}$/.test(storeId ?? "")
    ? `store_${storeId}`
    : undefined;
};
const privateBlobUrlMatchesAuthority = (
  url: string,
  pathname: string,
  authority: string,
) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.hostname ===
        `${authority.replace(/^store_/, "").toLowerCase()}.private.blob.vercel-storage.com` &&
      decodeURIComponent(parsed.pathname.slice(1)) === pathname
    );
  } catch {
    return false;
  }
};

class VercelPrivatePrivacyArtifactStore implements PrivacyArtifactStore {
  readonly adapter = "vercel_blob_private" as const;
  readonly privateOnly = true as const;
  readonly authority: PrivacyArtifactAuthority;
  constructor(
    private readonly token: string,
    storeAuthority: string,
    environmentIdentity: string,
  ) {
    this.authority = {
      provider: "vercel_blob",
      storeAuthority,
      environmentIdentity,
    };
  }
  private assertBinding(binding: PrivacyArtifactBinding) {
    if (!privacyArtifactBindingValid(binding, this.authority))
      throw new Error("privacy_export_authority_mismatch");
  }
  async create(binding: PrivacyArtifactBinding, bytes: Uint8Array) {
    this.assertBinding(binding);
    const created = await put(binding.objectKey, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      token: this.token,
      contentType: "application/octet-stream",
    });
    if (
      created.pathname !== binding.objectKey ||
      !privateBlobUrlMatchesAuthority(
        created.url,
        binding.objectKey,
        binding.storeAuthority,
      )
    )
      throw new Error("privacy_export_provider_identity_mismatch");
  }
  async read(binding: PrivacyArtifactBinding, maximumBytes: number) {
    this.assertBinding(binding);
    let current;
    try {
      current = await head(binding.objectKey, { token: this.token });
    } catch (error) {
      if (error instanceof BlobNotFoundError)
        throw new Error("artifact_unavailable");
      throw error;
    }
    if (
      current.pathname !== binding.objectKey ||
      !privateBlobUrlMatchesAuthority(
        current.url,
        binding.objectKey,
        binding.storeAuthority,
      ) ||
      current.size >
        Math.min(maximumBytes, PRIVACY_EXPORT_MAX_ARCHIVE_BYTES + 1024)
    )
      throw new Error("artifact_unavailable");
    const result = await get(binding.objectKey, {
      access: "private",
      token: this.token,
      useCache: false,
    });
    if (
      !result ||
      result.statusCode !== 200 ||
      result.blob.pathname !== binding.objectKey ||
      !privateBlobUrlMatchesAuthority(
        result.blob.url,
        binding.objectKey,
        binding.storeAuthority,
      ) ||
      (result.blob.size !== 0 && result.blob.size !== current.size)
    )
      throw new Error("artifact_unavailable");
    const bytes = new Uint8Array(
      await new Response(result.stream).arrayBuffer(),
    );
    if (bytes.byteLength !== current.size)
      throw new Error("artifact_integrity_failed");
    return bytes;
  }
  async delete(binding: PrivacyArtifactBinding) {
    this.assertBinding(binding);
    let current;
    try {
      current = await head(binding.objectKey, { token: this.token });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return;
      throw error;
    }
    if (
      current.pathname !== binding.objectKey ||
      !privateBlobUrlMatchesAuthority(
        current.url,
        binding.objectKey,
        binding.storeAuthority,
      )
    )
      throw new Error("privacy_export_provider_identity_mismatch");
    await del(binding.objectKey, { token: this.token, ifMatch: current.etag });
    try {
      await head(binding.objectKey, { token: this.token });
      throw new Error("privacy_export_delete_unverified");
    } catch (error) {
      if (error instanceof BlobNotFoundError) return;
      throw error;
    }
  }
}

export function configuredPrivacyArtifactStore(
  environment: Record<string, string | undefined> = process.env,
): PrivacyArtifactStore {
  const adapter =
    environment.PRIVACY_EXPORT_ARTIFACT_STORE?.trim() || "memory_test";
  if (adapter === "memory_test") {
    const productionTarget =
      environment.RELEASE_TARGET === "production" ||
      environment.VERCEL_ENV === "production" ||
      (!environment.VERCEL_ENV && environment.NODE_ENV === "production");
    if (
      productionTarget
    )
      throw new Error("privacy_export_private_store_required");
    const environmentIdentity =
      environment.PRIVACY_EXPORT_ENVIRONMENT_ID?.trim() || "local";
    if (!privacyExportEnvironmentIdentityValid(environmentIdentity))
      throw new Error("privacy_export_environment_invalid");
    return new MemoryPrivacyArtifactStore(environmentIdentity);
  }
  if (adapter !== "vercel_blob_private")
    throw new Error("privacy_export_artifact_store_invalid");
  const token = environment.PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN?.trim();
  const storeAuthority = safeStoreAuthority(
    environment.PRIVACY_EXPORT_BLOB_STORE_ID?.trim(),
  );
  const environmentIdentity =
    environment.PRIVACY_EXPORT_ENVIRONMENT_ID?.trim() || "";
  if (
    !token ||
    !storeAuthority ||
    tokenStoreAuthority(token) !== storeAuthority ||
    !privacyExportEnvironmentIdentityValid(environmentIdentity)
  )
    throw new Error("privacy_export_artifact_store_unconfigured");
  return new VercelPrivatePrivacyArtifactStore(
    token,
    storeAuthority,
    environmentIdentity,
  );
}
