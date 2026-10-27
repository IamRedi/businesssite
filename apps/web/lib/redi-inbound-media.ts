import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { acquireTenantConcurrency, enforceTenantQuota } from "./tenant-usage-policy";
import { maximumImageBytes, safeWebpFilename, webpDimensions } from "./upload-security";

export class RediMediaError extends Error {
  constructor(public readonly code: string, public readonly status: 400 | 429 | 503) {
    super(code);
    this.name = "RediMediaError";
  }
}

export async function storeRediInformationMedia(input: {
  siteId: string;
  integrationId: string;
  filename: string;
  dataBase64: string;
  altText?: string;
  information: PostgresInformationRepository;
  sites?: PostgresSiteRepository;
}) {
  const data = Buffer.from(input.dataBase64, "base64");
  if (!data.length || data.length > maximumImageBytes || data.toString("base64") !== input.dataBase64)
    throw new RediMediaError("invalid_media_data", 400);
  const dimensions = webpDimensions(data);
  if (!dimensions || dimensions.width > 2_000 || dimensions.height > 2_000)
    throw new RediMediaError("invalid_media_dimensions", 400);

  const sites = input.sites ?? new PostgresSiteRepository({ boundary: "system", integrationId: input.integrationId });
  const information = input.information;
  const countQuota = await enforceTenantQuota(sites, { siteId: input.siteId, metric: "media_upload" });
  if (!countQuota.allowed) throw new RediMediaError("media_quota_exceeded", 429);
  const bytesQuota = await enforceTenantQuota(sites, { siteId: input.siteId, metric: "media_upload_bytes", amount: data.length });
  if (!bytesQuota.allowed) throw new RediMediaError("media_quota_exceeded", 429);
  const concurrency = await acquireTenantConcurrency(sites, {
    siteId: input.siteId,
    operation: "media_upload",
    ttlSeconds: 60,
  });
  if (!concurrency.allowed) throw new RediMediaError("media_upload_busy", 429);

  try {
    const filename = safeWebpFilename(input.filename);
    const token = process.env.INFORMATION_BLOB_READ_WRITE_TOKEN?.trim();
    let storageProvider: "vercel_blob" | "postgres";
    let storageKey: string;
    if (token) {
      const uploaded = await put(`sites/${input.siteId}/editorial/${randomUUID()}-${filename}`, data, {
        access: "private",
        contentType: "image/webp",
        addRandomSuffix: false,
        token,
      });
      storageProvider = "vercel_blob";
      storageKey = uploaded.pathname;
    } else {
      storageProvider = "postgres";
      storageKey = await sites.saveMediaBlob(input.siteId, filename, data);
    }
    const asset = await information.registerMediaAsset({
      actorType: "integration",
      actorId: input.integrationId,
      siteId: input.siteId,
      storageProvider,
      storageKey,
      storageAccess: "private",
      mimeType: "image/webp",
      altText: input.altText,
      width: dimensions.width,
      height: dimensions.height,
      byteSize: data.length,
    });
    return {
      id: asset.id as string,
      url: `/api/media/${asset.id}`,
      mimeType: "image/webp" as const,
      width: dimensions.width,
      height: dimensions.height,
      byteSize: data.length,
      altText: input.altText ?? null,
    };
  } finally {
    await sites.releaseTenantConcurrency(input.siteId, concurrency.leaseId).catch(() => undefined);
  }
}
