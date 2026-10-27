import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { passwordHash } from "../../../../../../lib/site-admin-auth";
import { authorizeOwnerRequest } from "../../../../../../lib/owner-authorization";
import { resolveCustomerUiLocale } from "../../../../../../lib/locale-model";
import { readJsonBody } from "../../../../../../lib/request-body";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const authorization = await authorizeOwnerRequest(request, "websites.manage");
  if (!authorization.ok) return authorization.response;
  const owner = authorization.owner;
  const { slug } = await params;
  const parsed = await readJsonBody<{
    email?: string;
    password?: string;
    preferredLocale?: unknown;
  }>(request, 4 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { email, password, preferredLocale } = parsed.value;
  if (!email?.includes("@") || !password || password.length < 12)
    return NextResponse.json(
      {
        error: "Use a valid email and a password with at least 12 characters.",
      },
      { status: 400 },
    );
  const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const siteId = await sites.getSiteIdBySlug(slug);
  if (!siteId)
    return NextResponse.json({ error: "Site not found." }, { status: 404 });
  await sites.createOrUpdateAdmin(siteId, email, await passwordHash(password), resolveCustomerUiLocale(preferredLocale));
  return NextResponse.json({ ok: true });
}
