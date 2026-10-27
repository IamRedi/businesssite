import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { informationMediaAccess } from "../../../../../lib/information-media-access";
import { R2MediaStore, r2MediaConfiguration, validMediaRange, validTenantMediaKey } from "../../../../../lib/r2-media-store";

export const runtime = "nodejs";
async function deliver(request: Request, params: Promise<{ key: string[] }>, headOnly: boolean) {
  const { key: segments } = await params;
  const key = segments.join("/");
  if (segments[0] !== "sites" || !validTenantMediaKey(segments[1] ?? "", key, "public")) return new NextResponse(null, { status: 404 });
  const asset = await new PostgresSiteRepository({ boundary: "runtime" }).getPublicR2Media(key);
  if (!asset) return new NextResponse(null, { status: 404 });
  const access = informationMediaAccess({ host: request.headers.get("host"), customDomain: asset.customDomain, customDomainVerified: asset.customDomainVerified, publiclyAvailable: true, sameSiteAdmin: false });
  if (access !== "public") return new NextResponse(null, { status: access === "invalid-host" ? 400 : 404 });
  let range: string | undefined;
  try { range = validMediaRange(request.headers.get("range")); }
  catch { return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${asset.byteSize}` } }); }
  try {
    const store = new R2MediaStore(r2MediaConfiguration());
    const object = await store.read({ siteId: asset.siteId, key: asset.storageKey, authority: asset.providerAuthority, access: "public", mimeType: asset.mimeType, expectedBytes: asset.byteSize, range, ifRange: request.headers.get("if-range"), headOnly });
    return new NextResponse(object.stream, { status: object.status, headers: {
      "content-type": object.contentType, "content-length": String(object.bytes),
      "content-disposition": "inline", "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes",
      etag: object.etag!, ...(object.contentRange ? { "content-range": object.contentRange } : {}),
    } });
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return new NextResponse(null, { status: status === 416 ? 416 : status === 404 ? 404 : 503, headers: { "cache-control": "no-store", ...(status === 416 ? { "content-range": `bytes */${asset.byteSize}` } : {}) } });
  }
}
export const GET = (request: Request, { params }: { params: Promise<{ key: string[] }> }) => deliver(request, params, false);
export const HEAD = (request: Request, { params }: { params: Promise<{ key: string[] }> }) => deliver(request, params, true);
