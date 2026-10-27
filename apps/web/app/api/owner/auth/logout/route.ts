import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import { isSameOriginRequest } from "../../../../../lib/same-origin";
import {
  OWNER_CHALLENGE_COOKIE, OWNER_SESSION_COOKIE, ownerCookieOptions,
  ownerTokenHash, validOwnerToken,
} from "../../../../../lib/owner-auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Logout is unavailable." }, { status: 403 });
  const token = request.cookies.get(OWNER_SESSION_COOKIE)?.value;
  if (validOwnerToken(token)) {
    try { await new PostgresOwnerAuthRepository().revokeCurrentSession(ownerTokenHash(token)); }
    catch { return NextResponse.json({ error: "Logout is temporarily unavailable." }, { status: 503 }); }
  }
  const response = NextResponse.redirect(new URL("/owner/login", request.url), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, "", ownerCookieOptions(0));
  response.cookies.set(OWNER_CHALLENGE_COOKIE, "", ownerCookieOptions(0));
  return response;
}
