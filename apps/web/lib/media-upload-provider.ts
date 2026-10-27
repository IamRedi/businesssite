import { put, del } from "@vercel/blob";
import { vercelBlobCommandOptions, vercelBlobUrlMatchesAuthority } from "./provider-cleanup-adapters";
import { R2MediaStore, r2MediaAuthority, r2MediaConfiguration } from "./r2-media-store";
import { CustomMediaError } from "./owner-custom-media-validation";

export function mediaStorageProvider(environment: Record<string, string | undefined> = process.env) {
  const selected = environment.MEDIA_STORAGE_PROVIDER?.trim() || "vercel";
  if (selected !== "vercel" && selected !== "r2") throw Error("Unknown media provider.");
  return selected;
}
export function businessMediaProvider(environment: Record<string, string | undefined> = process.env) {
  if (mediaStorageProvider(environment) === "r2") {
    const store = new R2MediaStore(r2MediaConfiguration(environment));
    return {
      provider: "r2" as const, authority: r2MediaAuthority(store.configuration, "public"),
      put: async (siteId: string, key: string, bytes: Uint8Array, mimeType: "image/webp" | "video/mp4") => {
        const uploaded = await store.put({ siteId, key, bytes, mimeType, access: "public" });
        return { ...uploaded, url: uploaded.url! };
      },
      rollback: async (key: string, etag: string) => {
        // R2 S3 does not document atomic conditional DeleteObject parity.
        // Keep an unregistered object private for operator reconciliation; never
        // turn a failed registration into an unconditional destructive request.
        void etag;
        console.error("r2_media_registration_cleanup_required", { key, authority: r2MediaAuthority(store.configuration, "public") });
        throw Error("R2 upload requires exact operator reconciliation.");
      },
    };
  }
  const authority = environment.BLOB_STORE_ID?.trim() ?? "";
  const options = vercelBlobCommandOptions(environment, authority);
  if (!options || environment.PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID?.trim() !== authority) return null;
  return {
    provider: "vercel_blob" as const, authority,
    put: async (_siteId: string, key: string, bytes: Uint8Array, mimeType: "image/webp" | "video/mp4") => {
      const uploaded = await put(key, Buffer.from(bytes), { ...options, access: "public", contentType: mimeType, addRandomSuffix: false, allowOverwrite: false });
      if (uploaded.pathname !== key || uploaded.contentType !== mimeType || !vercelBlobUrlMatchesAuthority(uploaded.url, key, authority)) {
        try { await del(key, { ...options, ifMatch: uploaded.etag }); }
        catch { throw new CustomMediaError("Upload cleanup requires operator review.", 503, { storageKey: key, providerAuthority: authority }); }
        throw new CustomMediaError("Provider media authority mismatch.", 502);
      }
      return uploaded;
    },
    rollback: (key: string, etag: string) => del(key, { ...options, ifMatch: etag }),
  };
}
