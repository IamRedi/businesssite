import { mediaStorageProvider } from "../../../../lib/media-upload-provider";
import { R2MediaStore, r2MediaConfiguration } from "../../../../lib/r2-media-store";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { PostgresInformationRepository, PostgresSiteRepository, roleHasEditorialPermission } from "@platform/site-data";
import { capabilityIsInternallyAvailable } from "@platform/product-catalog";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../../lib/site-admin-auth";
import { acquireTenantConcurrency, enforceTenantQuota } from "../../../../lib/tenant-usage-policy";
import { maximumImageBytes, maximumImageRequestBytes, safeWebpFilename, webpDimensions } from "../../../../lib/upload-security";
import { authorizedSiteCapability } from "../../../../lib/product-access";
import { vercelBlobCommandOptions, vercelBlobUrlMatchesAuthority } from "../../../../lib/provider-cleanup-adapters";

export async function POST(request: Request) {
  const slug = request.headers.get("x-site-slug")?.trim() ?? "";
  const session = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/.test(slug)
    ? await requireSiteAdmin(slug)
    : null;
  if (!session)
    return NextResponse.json(
      { error: "Business admin authorization required." },
      { status: 403 },
    );
  const sites = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) });
  const siteId = session.siteId;
  const editorial = request.headers.get("x-media-purpose") === "editorial";
  const information = editorial ? new PostgresInformationRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) }) : null;
  if (editorial) {
    if (!capabilityIsInternallyAvailable("information_news"))
      return NextResponse.json({ error: "Information media is unavailable." }, { status: 410 });
    const role = await information!.getEditorialRole(session.accountId, siteId);
    if (!role || !roleHasEditorialPermission(role, "article:create"))
      return NextResponse.json({ error: "Editorial permission required." }, { status: 403 });
  } else if (!(await authorizedSiteCapability(sites, session, slug, "media"))) {
    return NextResponse.json({ error: "Media upload is unavailable for this subscription." }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength < 1)
    return NextResponse.json({ error: "Content-Length is required." }, { status: 411 });
  if (contentLength > maximumImageRequestBytes)
    return NextResponse.json({ error: "Upload request is too large." }, { status: 413 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.type !== "image/webp" || file.size > maximumImageBytes)
    return NextResponse.json(
      { error: "Upload a WebP image smaller than 4 MB." },
      { status: 400 },
    );
  const countQuota = await enforceTenantQuota(sites, {
    siteId,
    metric: "media_upload",
  });
  if (!countQuota.allowed)
    return NextResponse.json(
      { error: "Upload limit reached. Please try again later.", state: countQuota.state },
      { status: 429, headers: { "retry-after": String(countQuota.retryAfterSeconds ?? 60) } },
    );
  const bytesQuota = await enforceTenantQuota(sites, {
    siteId,
    metric: "media_upload_bytes",
    amount: file.size,
  });
  if (!bytesQuota.allowed)
    return NextResponse.json(
      { error: "Monthly upload allowance reached.", state: bytesQuota.state },
      { status: 429, headers: { "retry-after": String(bytesQuota.retryAfterSeconds ?? 60) } },
    );
  const concurrency = await acquireTenantConcurrency(sites, {
    siteId,
    operation: "media_upload",
    ttlSeconds: 60,
  });
  if (!concurrency.allowed)
    return NextResponse.json(
      { error: "Too many uploads are already in progress." },
      { status: 429, headers: { "retry-after": String(concurrency.retryAfterSeconds) } },
    );
  const leaseId = concurrency.leaseId;
  const filename = safeWebpFilename(file.name);
  try {
    const data = Buffer.from(await file.arrayBuffer());
    const dimensions = webpDimensions(data);
    if (!dimensions || dimensions.width > 2_000 || dimensions.height > 2_000)
      return NextResponse.json(
        { error: "The uploaded file is not a valid WebP image up to 2000 × 2000 pixels." },
        { status: 400 },
      );
    if (mediaStorageProvider() === "r2") {
      const store = new R2MediaStore(r2MediaConfiguration());
      const pathname = editorial ? `sites/${siteId}/editorial/${randomUUID()}-${filename}` : `sites/${siteId}/${randomUUID()}-${filename}`;
      const uploaded = await store.put({ siteId, key: pathname, bytes: data, mimeType: "image/webp", access: editorial ? "private" : "public" });
      try {
        const asset = editorial ? await information!.registerMediaAsset({ actorType: "site_admin", actorId: session.accountId, siteId, storageProvider: "r2", providerAuthority: uploaded.authority, storageKey: pathname, storageAccess: "private", mimeType: "image/webp", width: dimensions.width, height: dimensions.height, byteSize: data.byteLength }) : await sites.registerBusinessProviderMediaForAuthenticatedSession({ sessionHash: trustedSiteAdminSessionHash(session), slug, providerAuthority: uploaded.authority, storageKey: pathname, publicUrl: uploaded.url!, contentType: "image/webp", byteSize: data.byteLength });
        if (!asset) throw Error("Media registration rejected.");
        return NextResponse.json({ url: editorial ? (typeof asset === "object" ? asset.public_url : undefined) : uploaded.url, storage: "r2", storageKey: pathname, assetId: typeof asset === "object" ? asset.id : asset }, { status: 201 });
      } catch {
        console.error("r2_media_registration_cleanup_required", { siteId, storageKey: pathname, providerAuthority: uploaded.authority });
        return NextResponse.json({ error: "Media upload could not be registered. Operator reconciliation required." }, { status: 503 });
      }
    }
    const informationBlobToken = process.env.INFORMATION_BLOB_READ_WRITE_TOKEN?.trim();
    const useInformationBlob = editorial && Boolean(informationBlobToken);
    const businessBlobAuthority = process.env.BLOB_STORE_ID?.trim() ?? "";
    const businessBlobOptions = !editorial ? vercelBlobCommandOptions(process.env,businessBlobAuthority) : null;
    const useBusinessBlob = !editorial && Boolean(businessBlobOptions);
    if (useInformationBlob || useBusinessBlob) {
      const pathname = editorial
        ? `sites/${siteId}/editorial/${randomUUID()}-${filename}`
        : `sites/${siteId}/${randomUUID()}-${filename}`;
      const uploaded = await put(pathname, data, {
        access: editorial ? "private" : "public",
        contentType: "image/webp",
        addRandomSuffix: false,
        ...(editorial ? { token: informationBlobToken } : businessBlobOptions!),
      });
      const asset = editorial ? await information!.registerMediaAsset({
        actorType: "site_admin",
        actorId: session.accountId,
        siteId,
        storageProvider: "vercel_blob",
        storageKey: uploaded.pathname,
        storageAccess: "private",
        mimeType: "image/webp",
        width: dimensions.width,
        height: dimensions.height,
        byteSize: data.byteLength,
      }) : await (async () => {
        if (!vercelBlobUrlMatchesAuthority(uploaded.url,uploaded.pathname,businessBlobAuthority)) {
          await del(uploaded.pathname,{ ...businessBlobOptions!, ifMatch: uploaded.etag }).catch(() => undefined);
          throw new Error("Blob provider authority mismatch.");
        }
        try {
          return await sites.registerBusinessProviderMediaForAuthenticatedSession({
            sessionHash: trustedSiteAdminSessionHash(session), slug,
            providerAuthority: businessBlobAuthority, storageKey: uploaded.pathname,
            publicUrl: uploaded.url, contentType: "image/webp", byteSize: data.byteLength,
          });
        } catch (error) {
          await del(uploaded.pathname,{ ...businessBlobOptions!, ifMatch: uploaded.etag }).catch(() => undefined);
          throw error;
        }
      })();
      return NextResponse.json({
        url: editorial ? (typeof asset === "object" ? asset?.public_url : undefined) ?? uploaded.url : uploaded.url,
        storage: "blob", storageKey: uploaded.pathname,
        assetId: editorial ? (typeof asset === "object" ? asset?.id : undefined) : asset,
      }, { status: 201 });
    }
    const id = await sites.saveMediaBlobForAuthenticatedSession(
          trustedSiteAdminSessionHash(session), slug, filename, data,
        );
    const url = `/api/media/${id}`;
    const asset = editorial ? await information!.registerMediaAsset({
      actorType: "site_admin",
      actorId: session.accountId,
      siteId,
      storageProvider: "postgres",
      storageKey: id,
      storageAccess: "private",
      mimeType: "image/webp",
      width: dimensions.width,
      height: dimensions.height,
      byteSize: data.byteLength,
    }) : null;
    return NextResponse.json({ url: asset?.public_url ?? url, storage: "database", storageKey: id, assetId: asset?.id }, { status: 201 });
  } finally {
    await sites.releaseTenantConcurrency(siteId, leaseId).catch(() => undefined);
  }
}
