import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { informationMediaAccess } from "../../../../lib/information-media-access";
import { requireSiteAdminSession, trustedSiteAdminSessionHash } from "../../../../lib/site-admin-auth";
import { R2MediaStore, r2MediaConfiguration } from "../../../../lib/r2-media-store";

const privateMediaHeaders = {
  "cache-control": "private, no-store",
  "content-disposition": "inline",
  "x-content-type-options": "nosniff",
};

async function informationMediaResponse(request: Request, id: string) {
  let repository = new PostgresInformationRepository({ boundary: "public" });
  let asset = await repository.getMediaAssetForDelivery(id);
  let sameSiteAdmin = false;
  if (!asset) {
    const session = await requireSiteAdminSession();
    if (session) {
      repository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) });
      asset = await repository.getMediaAssetForDelivery(id);
      sameSiteAdmin = Boolean(asset && asset.siteId === session.siteId);
    }
  }
  if (!asset) return null;
  const access = informationMediaAccess({
    host: request.headers.get("host"),
    customDomain: asset.customDomain,
    customDomainVerified: asset.customDomainVerified,
    publiclyAvailable: asset.publiclyAvailable,
    sameSiteAdmin,
  });
  if (access === "invalid-host") return new NextResponse("Invalid Host", { status: 400 });
  if (access === "deny") return new NextResponse(null, { status: 404 });

  if (asset.storageProvider === "r2") {
    if (!asset.providerAuthority) return new NextResponse(null, { status: 503 });
    try {
      const stored = await new R2MediaStore(r2MediaConfiguration()).read({ siteId: asset.siteId, key: asset.storageKey, access: asset.storageAccess, authority: asset.providerAuthority, mimeType: asset.mimeType, expectedBytes: asset.byteSize });
      return new NextResponse(stored.stream, { headers: { ...privateMediaHeaders, "content-type": asset.mimeType, "content-length": String(stored.bytes), etag: stored.etag! } });
    } catch { return new NextResponse(null, { status: 503, headers: privateMediaHeaders }); }
  }

  if (asset.storageProvider === "postgres") {
    const media = await repository.getInformationMediaBlob(asset.siteId, asset.storageKey, id);
    if (!media || media.contentType !== asset.mimeType) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(media.data), {
      headers: {
        ...privateMediaHeaders,
        "content-type": asset.mimeType,
        "content-length": String(media.data.byteLength),
      },
    });
  }

  const token = asset.storageAccess === "private"
    ? process.env.INFORMATION_BLOB_READ_WRITE_TOKEN?.trim()
    : process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (asset.storageAccess === "private" && !token)
    return NextResponse.json({ error: "Information media storage is not configured." }, { status: 503 });
  const stored = await get(asset.storageKey, {
    access: asset.storageAccess,
    ...(token ? { token } : {}),
  });
  if (!stored || stored.statusCode !== 200 || stored.blob.contentType !== asset.mimeType)
    return new NextResponse(null, { status: 404 });
  return new NextResponse(stored.stream, {
    headers: {
      ...privateMediaHeaders,
      "content-type": asset.mimeType,
      "content-length": String(stored.blob.size),
      etag: stored.blob.etag,
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const information = await informationMediaResponse(request, id);
  if (information) return information;

  const media = await new PostgresSiteRepository({ boundary: "runtime" }).getMediaBlob(id);
  if (!media || media.siteKind !== "business") return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(media.data), {
    headers: {
      "content-type": media.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
