import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import { abusePolicy } from "../../../../../lib/abuse-policy";
import { clientAddress, enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../lib/same-origin";
import {
  DUMMY_PASSWORD_HASH, OWNER_CHALLENGE_COOKIE, OWNER_CHALLENGE_SECONDS,
  createOwnerMfaEnrollment, encryptOwnerMfaSecret, newOwnerToken,
  normalizeOwnerEmail, ownerCookieOptions, ownerIdentityHash, ownerPasswordMatches,
  ownerMfaEncryptionConfigured, ownerTokenHash,
} from "../../../../../lib/owner-auth";

const redirect = (request: Request, reason: "invalid" | "rate" | "configuration") =>
  NextResponse.redirect(new URL(`/owner/login?error=${reason}`, request.url), 303);

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Authentication request is unavailable." }, { status: 403 });
  const body = await readUrlEncodedBody(request, 4 * 1024);
  if (!body.ok) return redirect(request, "invalid");
  const email = normalizeOwnerEmail(body.value.get("email"));
  const password = String(body.value.get("password") ?? "").slice(0, 200);
  const repository = new PostgresOwnerAuthRepository();
  const policy = abusePolicy.ownerLogin;
  const [networkLimit, identityLimit] = await Promise.all([
    enforceSubjectRateLimit("owner_login_network", clientAddress(request.headers), policy.network.limit, policy.network.windowSeconds),
    enforceSubjectRateLimit("owner_login_identity", email || "invalid", policy.identity.limit, policy.identity.windowSeconds),
  ]);
  if (!networkLimit.allowed || !identityLimit.allowed) return redirect(request, "rate");

  const account = email.includes("@") ? await repository.getOwnerByEmail(email) : null;
  const credentialsMatch = await ownerPasswordMatches(password, account?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const canContinue = account?.status === "active" || (account?.status === "pending" && !account.mfaEnrolledAt);
  if (!account || !credentialsMatch || !canContinue) {
    await repository.recordAudit({
      ownerId: account?.id, action: account?.status === "disabled" ? "owner.account_disabled_denial" : "owner.password_login",
      outcome: account?.status === "disabled" ? "denied" : "failure", identityHash: ownerIdentityHash(email),
      details: { category: "invalid_credentials" },
    });
    return redirect(request, "invalid");
  }

  let purpose: "mfa_enroll" | "mfa_verify";
  let pendingMfaSecretEncrypted: string | undefined;
  try {
    if (!ownerMfaEncryptionConfigured()) throw new Error("MFA encryption is unavailable.");
    purpose = account.mfaEnrolledAt ? "mfa_verify" : "mfa_enroll";
    if (purpose === "mfa_enroll") {
      const enrollment = createOwnerMfaEnrollment(account.email);
      pendingMfaSecretEncrypted = encryptOwnerMfaSecret(enrollment.secret);
    }
  } catch {
    await repository.recordAudit({ ownerId: account.id, action: "owner.password_login", outcome: "denied", details: { category: "mfa_configuration" } });
    return redirect(request, "configuration");
  }
  const challenge = newOwnerToken();
  await repository.createPasswordChallenge({
    ownerId: account.id, tokenHash: ownerTokenHash(challenge), purpose,
    pendingMfaSecretEncrypted, identityHash: ownerIdentityHash(email),
    expiresAt: new Date(Date.now() + OWNER_CHALLENGE_SECONDS * 1000).toISOString(),
  });
  const response = NextResponse.redirect(new URL("/owner/mfa", request.url), 303);
  response.cookies.set(OWNER_CHALLENGE_COOKIE, challenge, ownerCookieOptions(OWNER_CHALLENGE_SECONDS));
  return response;
}
