import { NextResponse } from "next/server";
import { PostgresOwnerCustomDesignRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";
import { expirePublicSiteFromRoute } from "../../../../../../lib/public-site-cache";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "websites.manage");
  if (!authorization.ok) return authorization.response;
  const { slug } = await params;
  const headers = { "Cache-Control": "no-store" };
  try {
    // Bound bytes before parsing; content-length alone is caller-controlled.
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Missing body." }, { status: 400, headers });
    const chunks: Uint8Array[] = []; let bytes = 0;
    // Allow a bounded full document (including its rollback slot) plus media.
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 2_000_000) { await reader.cancel(); return NextResponse.json({ error: "Request too large." }, { status: 413, headers }); } chunks.push(value); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const owner = authorization.owner, repository = new PostgresOwnerCustomDesignRepository();
    const snapshot = await repository.read(owner.sessionHash, slug);
    if (!snapshot) return NextResponse.json({ error: "Website not found." }, { status: 404, headers });
    if (body.action === "read") return NextResponse.json(snapshot, { headers });
    if (!["publish", "restore"].includes(body.action)) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
    if (JSON.stringify(body.expected) !== JSON.stringify(snapshot.document)) return NextResponse.json({ error: "Website changed. Reload before publishing." }, { status: 409, headers });
    const document = body.action === "restore" ? await repository.restore(owner.sessionHash, slug, snapshot.document, owner.correlationId) : await repository.publish(owner.sessionHash, slug, snapshot.document, body.design, body.media, owner.correlationId);
    if (!document) return NextResponse.json({ error: "Change was rejected." }, { status: 409, headers });
    expirePublicSiteFromRoute({ kind: "slug", value: slug });
    if (snapshot.domain.customDomain) expirePublicSiteFromRoute({ kind: "domain", value: snapshot.domain.customDomain });
    return NextResponse.json({ document }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Change failed.";
    if (message.includes("custom_design_conflict")) return NextResponse.json({ error: "Website changed. Reload." }, { status: 409, headers });
    if (message.includes("custom_design_lifecycle_denied")) return NextResponse.json({ error: "Editing is unavailable for this website." }, { status: 403, headers });
    // Never expose database/provider details or customer data in an error.
    return NextResponse.json({ error: "Invalid design/media or unavailable website. Check the configuration and legal identity." }, { status: 400, headers });
  }
}
