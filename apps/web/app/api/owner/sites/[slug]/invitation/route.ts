import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { sendOwnerDemoInvitation } from "../../../../../../lib/email";
import { previewToken } from "../../../../../../lib/preview-token";
import { tokenHash } from "../../../../../../lib/site-admin-auth";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";

function origin(request: Request) {
  return process.env.PUBLIC_APP_URL?.trim() || new URL(request.url).origin;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authorization = await authorizeOwnerRequest(request, "websites.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  const { slug } = await params;
  const token = randomBytes(32).toString("hex");
  const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  let invitation;
  try {
    invitation = await sites.prepareOwnerDemoInvitation(slug, tokenHash(token), new Date(Date.now() + 60 * 60 * 1000).toISOString());
  } catch {
    return NextResponse.json({ error: "Site or business administrator is unavailable." }, { status: 409 });
  }
  const delivery = await sendOwnerDemoInvitation({
    to: invitation.email,
    businessName: invitation.document.content.name,
    previewUrl: `${origin(request)}/preview/${previewToken(invitation.previewTokenId)}`,
    passwordSetupToken: token,
    expiresAt: invitation.demoExpiresAt,
    locale: invitation.preferredLocale,
  });
  return NextResponse.json({ delivery: delivery.status });
}
