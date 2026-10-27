import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { previewToken } from "../../../../../../lib/preview-token";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authorization = await authorizeOwnerRequest(request, "websites.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  const { slug } = await params;
  const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const siteId = await sites.getSiteIdBySlug(slug);
  if (!siteId) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const tokenId = await sites.regeneratePreviewTokenId(siteId);
  return NextResponse.json({ previewUrl: `/preview/${previewToken(tokenId)}` });
}
