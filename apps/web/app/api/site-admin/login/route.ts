import { NextRequest, NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { clientAddress, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../lib/same-origin";
import {
  DUMMY_PASSWORD_HASH,
  normalizeSiteAdminEmail,
  passwordMatches,
  rotateSiteAdminSession,
  SITE_ADMIN_SESSION_COOKIE,
  siteAdminSessionCookieOptions,
  tokenHash,
} from "../../../../lib/site-admin-auth";

const loginRedirect = (request: Request, reason: "invalid" | "rate") =>
  NextResponse.redirect(new URL(`/site-admin/login?error=${reason}`, request.url), 303);

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Authentication request is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 4 * 1024);
  if (!body.ok) return loginRedirect(request, "invalid");

  const email = normalizeSiteAdminEmail(body.value.get("email"));
  const password = String(body.value.get("password") ?? "").slice(0, 200);
  const repository = new PostgresSiteRepository({ boundary: "runtime" });
  const policy = abusePolicy.siteAdminLogin;
  const [networkLimit, accountLimit] = await Promise.all([
    enforceSubjectRateLimit("site_admin_login_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("site_admin_login_account", email, policy.account.limit, policy.account.windowSeconds),
  ]);
  if (!networkLimit.allowed || !accountLimit.allowed)
    return loginRedirect(request, "rate");

  const account = email.includes("@")
    ? await repository.getAdminByEmail(email)
    : null;
  const credentialsMatch = await passwordMatches(
    password,
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!account || !credentialsMatch)
    return loginRedirect(request, "invalid");
  const token = await rotateSiteAdminSession(
    repository,
    account.id,
    request.cookies.get(SITE_ADMIN_SESSION_COOKIE)?.value,
    undefined,
    account.passwordHash,
  );
  const sessionHash = tokenHash(token);
  let slug: string | null;
  try {
    slug = await repository.getSiteAdminLoginSlug(sessionHash);
  } catch (error) {
    await repository.revokeAdminSession(sessionHash);
    throw error;
  }
  if (!slug) {
    await repository.revokeAdminSession(sessionHash);
    return loginRedirect(request, "invalid");
  }
  const response = NextResponse.redirect(new URL(`/site-admin/${slug}`, request.url), 303);
  response.cookies.set(
    SITE_ADMIN_SESSION_COOKIE,
    token,
    siteAdminSessionCookieOptions(),
  );
  return response;
}
