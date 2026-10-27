import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import { NextResponse } from "next/server";
import { PostgresSiteAdminCustomContentRepository, PostgresSiteRepository } from "@platform/site-data";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../../../lib/site-admin-auth";
import { boundedCustomMediaForm, customMediaFilename, CustomMediaError } from "../../../../../lib/owner-custom-media-validation";
import { prepareCustomerCustomMedia } from "../../../../../lib/site-admin-custom-media";
import { businessMediaProvider } from "../../../../../lib/media-upload-provider";
import { acquireTenantConcurrency, enforceTenantQuota } from "../../../../../lib/tenant-usage-policy";
import { isSameOriginRequest } from "../../../../../lib/same-origin";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session) return NextResponse.json({ error: "Bitte erneut anmelden." }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Anfrage nicht erlaubt." }, { status: 403, headers });
  const hash = trustedSiteAdminSessionHash(session);
  const repository = new PostgresSiteAdminCustomContentRepository();
  const sites = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: hash });
  let leaseId: string | undefined;
  try {
    const context = await repository.context(hash, slug, true);
    if (!context || context.siteId !== session.siteId) return NextResponse.json({ error: "Medienbearbeitung ist zurzeit nicht verfügbar." }, { status: 403, headers });
    const provider = businessMediaProvider();
    if (!provider) throw new CustomMediaError("Media storage authority is unavailable.", 503);
    const authority = provider.authority;
    const form = await boundedCustomMediaForm(request), file = form.get("file");
    if (!(file instanceof File) || [...form.keys()].length !== 1) throw new CustomMediaError("Bitte eine Datei auswählen.");
    const count = await enforceTenantQuota(sites, { siteId: context.siteId, metric: "media_upload" });
    if (!count.allowed) throw new CustomMediaError("Upload-Limit erreicht. Bitte später versuchen.", 429);
    const concurrency = await acquireTenantConcurrency(sites, { siteId: context.siteId, operation: "media_upload", ttlSeconds: 60 });
    if (!concurrency.allowed) throw new CustomMediaError("Ein Upload läuft bereits. Bitte kurz warten.", 429);
    leaseId = concurrency.leaseId;
    const { buffer, metadata } = await prepareCustomerCustomMedia(Buffer.from(await file.arrayBuffer()), file.type, context.maxDurationSeconds);
    const quota = await enforceTenantQuota(sites, { siteId: context.siteId, metric: "media_upload_bytes", amount: metadata.bytes });
    if (!quota.allowed) throw new CustomMediaError("Upload-Limit erreicht. Bitte später versuchen.", 429);
    const key = `sites/${context.siteId}/custom/${randomUUID()}-${customMediaFilename(file.name, metadata.mimeType)}`;
    const uploaded = await provider.put(context.siteId, key, buffer, metadata.mimeType);
    const rollback = async () => {
      try { await provider.rollback(key, uploaded.etag); }
      catch {
        // Reconciliation details belong in server operations logs, never the customer UI.
        console.error("custom_media_cleanup_required", { siteId: context.siteId, storageKey: key, providerAuthority: authority });
        throw new CustomMediaError("Upload konnte nicht abgeschlossen werden. Bitte Support kontaktieren.", 503);
      }
    };
    if (uploaded.pathname !== key || uploaded.contentType !== metadata.mimeType) {
      await rollback(); throw new CustomMediaError("Upload fehlgeschlagen.", 502);
    }
    let assetId: string | null;
    try { assetId = await repository.registerMedia(hash, slug, { authority, key, url: uploaded.url, ...metadata }); }
    catch { await rollback(); throw new CustomMediaError("Upload nicht gespeichert.", 409); }
    if (!assetId) { await rollback(); throw new CustomMediaError("Upload nicht gespeichert. Bitte neu laden.", 409); }
    // Provider identifiers remain server-side. URL is used only to render the preview.
    return NextResponse.json({ url: uploaded.url, ...metadata }, { status: 201, headers });
  } catch (error) {
    const messages: Record<number, string> = { 400: "Bitte ein gültiges Foto oder MP4 innerhalb der angezeigten Grenzen auswählen.", 413: "Datei ist zu groß. Bitte maximal 4 MB auswählen.", 415: "Bitte ein Foto oder eine MP4-Datei auswählen." };
    const message = error instanceof CustomMediaError
      ? (messages[error.status] ?? error.message)
      : "Upload fehlgeschlagen. Bitte erneut versuchen.";
    return NextResponse.json({ error: message }, { status: error instanceof CustomMediaError ? error.status : 503, headers });
  } finally {
    if (leaseId) await sites.releaseTenantConcurrency(session.siteId, leaseId);
  }
}
