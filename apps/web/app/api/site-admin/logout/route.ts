import { NextRequest, NextResponse } from "next/server";
import { PostgresSiteRepository } from "@platform/site-data";
import { isSameOriginRequest } from "../../../../lib/same-origin";
import {
  SITE_ADMIN_SESSION_COOKIE,
  siteAdminSessionCookieOptions,
  tokenHash,
  validSiteAdminToken,
} from "../../../../lib/site-admin-auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Logout is unavailable." }, { status: 403 });
  const token = request.cookies.get(SITE_ADMIN_SESSION_COOKIE)?.value;
  if (validSiteAdminToken(token)) {
    try {
      await new PostgresSiteRepository({ boundary: "runtime" }).revokeAdminSession(tokenHash(token));
    } catch {
      return NextResponse.json({ error: "Logout is temporarily unavailable." }, { status: 503 });
    }
  }
  const response = NextResponse.redirect(new URL("/site-admin/login", request.url), 303);
  response.cookies.set(
    SITE_ADMIN_SESSION_COOKIE,
    "",
    siteAdminSessionCookieOptions(0),
  );
  return response;
}
