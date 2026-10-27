import { NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { abusePolicy } from "../../../../lib/abuse-policy";
import { clientAddress, enforceSubjectRateLimit } from "../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../lib/same-origin";
import {
  passwordHash,
  SITE_ADMIN_SESSION_COOKIE,
  siteAdminSessionCookieOptions,
  tokenHash,
  validSiteAdminToken,
} from "../../../../lib/site-admin-auth";

const rejected = (request: Request) =>
  NextResponse.redirect(new URL("/site-admin/forgot-password?expired=1", request.url), 303);

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Password reset is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 4 * 1024);
  if (!body.ok) return rejected(request);
  const token = String(body.value.get("token") ?? "");
  const password = String(body.value.get("password") ?? "");
  if (!validSiteAdminToken(token) || password.length < 12 || password.length > 200)
    return rejected(request);

  const repository = new PostgresSiteRepository({ boundary: "runtime" });
  const policy = abusePolicy.passwordChange;
  const [networkLimit, tokenLimit] = await Promise.all([
    enforceSubjectRateLimit("password_change_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("password_change_token", token, policy.token.limit, policy.token.windowSeconds),
  ]);
  if (!networkLimit.allowed || !tokenLimit.allowed) return rejected(request);

  const updated = await repository.consumePasswordReset(
    tokenHash(token),
    await passwordHash(password),
  );
  if (!updated) return rejected(request);
  const response = NextResponse.redirect(new URL("/site-admin/login?reset=1", request.url), 303);
  response.cookies.set(
    SITE_ADMIN_SESSION_COOKIE,
    "",
    siteAdminSessionCookieOptions(0),
  );
  return response;
}
