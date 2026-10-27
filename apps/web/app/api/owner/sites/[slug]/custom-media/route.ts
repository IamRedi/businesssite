import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { PostgresOwnerCustomDesignRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";
import { businessMediaProvider } from "../../../../../../lib/media-upload-provider";
import { boundedCustomMediaForm, customMediaFilename, CustomMediaError, validateCustomMedia } from "../../../../../../lib/owner-custom-media-validation";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "websites.manage");
  if (!authorization.ok) return authorization.response;
  const headers = { "Cache-Control": "no-store" }, { slug } = await params;
  try {
    const repository = new PostgresOwnerCustomDesignRepository(), session = authorization.owner.sessionHash;
    const context = await repository.mediaContext(session, slug);
    if (!context) return NextResponse.json({ error: "Media editing is unavailable for this website." }, { status: 403, headers });
    const provider = businessMediaProvider();
    if (!provider) throw new CustomMediaError("Media storage authority is unavailable.", 503);
    const authority = provider.authority;
    const form = await boundedCustomMediaForm(request), file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1 || [...form.keys()].some(k => k !== "file")) throw new CustomMediaError("One media file is required.");
    const buffer = Buffer.from(await file.arrayBuffer()), metadata = await validateCustomMedia(buffer, file.type, context.maxDurationSeconds);
    if (!/^[A-Za-z0-9_-]+$/.test(context.siteId)) throw new CustomMediaError("Unavailable website.", 403);
    const key = `sites/${context.siteId}/custom/${randomUUID()}-${customMediaFilename(file.name, metadata.mimeType)}`;
    const uploaded = await provider.put(context.siteId, key, buffer, metadata.mimeType);
    // Rollback uses OUR exact newly allocated key, never an untrusted returned
    // URL. Conditional ETag deletion cannot remove a concurrently changed object.
    const rollback = async () => {
      try { await provider.rollback(key, uploaded.etag); }
      catch { throw new CustomMediaError("Upload cleanup requires operator review. No website changes were saved.", 503, { storageKey: key, providerAuthority: authority }); }
    };
    const expectedUrl = `https://${authority.slice(6).toLowerCase()}.public.blob.vercel-storage.com/${key}`;
    if (uploaded.pathname !== key || uploaded.contentType !== metadata.mimeType) {
      await rollback(); throw new CustomMediaError("Provider media authority mismatch.", 502);
    }
    let assetId: string | null;
    try { assetId = await repository.registerMedia(session, slug, { authority, key, url: uploaded.url, ...metadata }); if (!assetId) throw new Error("Registration rejected."); }
    catch { await rollback(); throw new CustomMediaError("Media registration failed; upload removed.", 409); }
    return NextResponse.json({ assetId, url: uploaded.url, storage: provider.provider === "r2" ? "r2" : "blob", storageKey: key, providerAuthority: authority, ...metadata }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof CustomMediaError ? error.message : "Media upload unavailable. No website changes were saved.", ...(error instanceof CustomMediaError && error.reconciliation ? { cleanupRequired: true, ...error.reconciliation } : {}) }, { status: error instanceof CustomMediaError ? error.status : 503, headers });
  }
}
