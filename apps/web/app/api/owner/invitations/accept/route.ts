import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { clientAddress, enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../lib/same-origin";
import {
  OWNER_CHALLENGE_COOKIE, OWNER_CHALLENGE_SECONDS, createOwnerMfaEnrollment,
  encryptOwnerMfaSecret, newOwnerToken, ownerCookieOptions, ownerPasswordHash,
  ownerTokenHash, validOwnerToken,
} from "../../../../../lib/owner-auth";

const invalid = (request: Request) => NextResponse.redirect(new URL("/owner/invitation?error=invalid", request.url), 303);

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invitation acceptance is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 5 * 1024);
  if (!body.ok) return invalid(request);
  const token = String(body.value.get("token") ?? "");
  const password = String(body.value.get("password") ?? "");
  const confirmation = String(body.value.get("passwordConfirmation") ?? "");
  if (!validOwnerToken(token) || password.length < 16 || password.length > 200 || password !== confirmation) return invalid(request);
  const [networkLimit, tokenLimit] = await Promise.all([
    enforceSubjectRateLimit("owner_invitation_accept_network", clientAddress(request.headers), 20, 60 * 60),
    enforceSubjectRateLimit("owner_invitation_accept_token", ownerTokenHash(token), 8, 60 * 60),
  ]);
  if (!networkLimit.allowed || !tokenLimit.allowed) return invalid(request);
  const repository = new PostgresOwnerTeamRepository();
  const current = await repository.getInvitationByToken(ownerTokenHash(token));
  if (!current) return invalid(request);
  const enrollment = createOwnerMfaEnrollment(current.email);
  const challenge = newOwnerToken();
  const accepted = await repository.acceptInvitation({
    tokenHash: ownerTokenHash(token),
    passwordHash: await ownerPasswordHash(password),
    challengeHash: ownerTokenHash(challenge),
    pendingMfaSecretEncrypted: encryptOwnerMfaSecret(enrollment.secret),
    challengeExpiresAt: new Date(Date.now() + OWNER_CHALLENGE_SECONDS * 1000).toISOString(),
  });
  if (!accepted) return invalid(request);
  const response = NextResponse.redirect(new URL("/owner/mfa", request.url), 303);
  response.cookies.set(OWNER_CHALLENGE_COOKIE, challenge, ownerCookieOptions(OWNER_CHALLENGE_SECONDS));
  return response;
}
