import { NextResponse } from "next/server";
import { PostgresSiteAdminCustomContentRepository } from "@platform/site-data";
import { requireSiteAdmin, trustedSiteAdminSessionHash } from "../../../../../lib/site-admin-auth";
import { expirePublicSiteFromRoute } from "../../../../../lib/public-site-cache";
import { isSameOriginRequest } from "../../../../../lib/same-origin";

const headers = { "Cache-Control": "no-store" };
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session) return NextResponse.json({ error: "Bitte erneut anmelden." }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Anfrage nicht erlaubt." }, { status: 403, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Body required");
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 850_000) { await reader.cancel(); return NextResponse.json({ error: "Änderung zu groß." }, { status: 413, headers }); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || !["priceList", "customMedia"].includes(body.field) || Object.keys(body).some(key => !["field", "expected", "expectedDesign", "value"].includes(key))) throw new Error("Invalid fields");
    const repository = new PostgresSiteAdminCustomContentRepository(), hash = trustedSiteAdminSessionHash(session);
    const context = await repository.context(hash, slug, body.field === "customMedia");
    if (!context || context.siteId !== session.siteId) return NextResponse.json({ error: "Bearbeitung ist zurzeit nicht verfügbar." }, { status: 403, headers });
    const value = await repository.apply(hash, slug, context.document, body.field, body.expected, body.expectedDesign, body.value);
    if (!value) return NextResponse.json({ error: "Änderung nicht gespeichert. Bitte neu laden." }, { status: 409, headers });
    expirePublicSiteFromRoute({ kind: "slug", value: slug });
    if (context.customDomain) expirePublicSiteFromRoute({ kind: "domain", value: context.customDomain });
    return NextResponse.json({ value }, { headers });
  } catch (error) {
    const conflict = error instanceof Error && error.message.includes("custom_content_conflict");
    return NextResponse.json({ error: conflict ? "Die Website wurde inzwischen geändert. Bitte neu laden." : "Bitte Angaben prüfen und erneut versuchen." }, { status: conflict ? 409 : 400, headers });
  }
}
