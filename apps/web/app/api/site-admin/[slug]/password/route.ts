import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { abusePolicy } from "../../../../../lib/abuse-policy";
import { clientAddress, enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../lib/same-origin";
import {
  passwordHash,
  passwordMatches,
  requireSiteAdmin,
  SITE_ADMIN_SESSION_COOKIE,
  siteAdminSessionCookieOptions,
  trustedSiteAdminSessionHash,
} from "../../../../../lib/site-admin-auth";

const rejected = (request: Request, slug: string) =>
  NextResponse.redirect(new URL(`/site-admin/${slug}?password=invalid#security`, request.url), 303);

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Password change is unavailable." }, { status: 403 });
  const { slug } = await context.params;
  const session = await requireSiteAdmin(slug);
  if (!session)
    return NextResponse.json({ error: "Password change is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 4 * 1024);
  if (!body.ok) return rejected(request, slug);
  const currentPassword = String(body.value.get("currentPassword") ?? "").slice(0, 200);
  const newPassword = String(body.value.get("newPassword") ?? "").slice(0, 201);
  if (newPassword.length < 12 || newPassword.length > 200)
    return rejected(request, slug);

  const repository = new PostgresSiteRepository({ boundary: "site_admin", sessionHash: trustedSiteAdminSessionHash(session) });
  const policy = abusePolicy.passwordChange;
  const [networkLimit, accountLimit] = await Promise.all([
    enforceSubjectRateLimit("manual_password_change_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("manual_password_change_account", session.accountId, policy.token.limit, policy.token.windowSeconds),
  ]);
  if (!networkLimit.allowed || !accountLimit.allowed) return rejected(request, slug);

  const account = await repository.getAdminByEmail(session.email);
  if (
    !account ||
    account.id !== session.accountId ||
    !(await passwordMatches(currentPassword, account.passwordHash)) ||
    (await passwordMatches(newPassword, account.passwordHash))
  )
    return rejected(request, slug);
  const changed = await repository.changeAdminPassword(
    account.id,
    account.passwordHash,
    await passwordHash(newPassword),
    trustedSiteAdminSessionHash(session),
  );
  if (!changed) return rejected(request, slug);

  const response = NextResponse.redirect(new URL("/site-admin/login?reset=1", request.url), 303);
  response.cookies.set(
    SITE_ADMIN_SESSION_COOKIE,
    "",
    siteAdminSessionCookieOptions(0),
  );
  return response;
}
