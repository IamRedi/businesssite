import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import { readUrlEncodedBody } from "../../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../../lib/same-origin";
import { enforceSubjectRateLimit } from "../../../../../../lib/rate-limit";
import {
  OWNER_CHALLENGE_COOKIE, OWNER_SESSION_COOKIE, OWNER_SESSION_SECONDS,
  decryptOwnerMfaSecret, newOwnerToken, normalizeOwnerRecoveryCode,
  ownerCookieOptions, ownerRecoveryCodeHash, ownerTokenHash, validOwnerToken,
  verifyOwnerTotp,
} from "../../../../../../lib/owner-auth";

const invalid = (request: Request) => NextResponse.redirect(new URL("/owner/mfa?error=invalid", request.url), 303);

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "MFA verification is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 2 * 1024);
  if (!body.ok) return invalid(request);
  const challengeToken = request.cookies.get(OWNER_CHALLENGE_COOKIE)?.value;
  if (!validOwnerToken(challengeToken)) return invalid(request);
  const challengeHash = ownerTokenHash(challengeToken);
  const repository = new PostgresOwnerAuthRepository();
  const challenge = await repository.getChallenge(challengeHash);
  if (!challenge || challenge.purpose !== "mfa_verify" || !challenge.mfaSecretEncrypted) return invalid(request);
  const limit = await enforceSubjectRateLimit("owner_mfa_challenge", challengeHash, 8, 5 * 60);
  if (!limit.allowed) return invalid(request);
  const session = newOwnerToken();
  const previous = request.cookies.get(OWNER_SESSION_COOKIE)?.value;
  const shared = {
    challengeHash, sessionHash: ownerTokenHash(session),
    sessionExpiresAt: new Date(Date.now() + OWNER_SESSION_SECONDS * 1000).toISOString(),
    previousSessionHash: validOwnerToken(previous) ? ownerTokenHash(previous) : undefined,
  };
  let result: { ownerId: string } | null = null;
  const recoveryCode = normalizeOwnerRecoveryCode(String(body.value.get("recoveryCode") ?? ""));
  if (recoveryCode) {
    result = await repository.completeRecoveryCodeVerification({ ...shared, recoveryCodeHash: ownerRecoveryCodeHash(recoveryCode) });
  } else {
    let step: number | null = null;
    try { step = verifyOwnerTotp(decryptOwnerMfaSecret(challenge.mfaSecretEncrypted), String(body.value.get("code") ?? "")); } catch { return invalid(request); }
    if (step !== null) result = await repository.completeMfaVerification({ ...shared, totpStep: step });
  }
  if (!result) {
    await repository.recordAudit({ ownerId: challenge.ownerId, action: "owner.mfa_verification", outcome: "failure", details: { category: "invalid_or_replayed_code" } });
    return invalid(request);
  }
  const response = NextResponse.redirect(new URL("/owner", request.url), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, session, ownerCookieOptions(OWNER_SESSION_SECONDS));
  response.cookies.set(OWNER_CHALLENGE_COOKIE, "", ownerCookieOptions(0));
  return response;
}
