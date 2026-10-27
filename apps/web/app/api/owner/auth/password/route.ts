import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
import { enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import {
  OWNER_CHALLENGE_COOKIE, OWNER_SESSION_COOKIE, decryptOwnerMfaSecret,
  ownerCookieOptions, ownerPasswordHash, ownerPasswordMatches,
  verifyOwnerTotp,
} from "../../../../../lib/owner-auth";

const invalid = (request: Request) => NextResponse.redirect(new URL("/owner/security?error=invalid", request.url), 303);

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerRequest(request, "security.self");
  if (!authorization.ok) return authorization.response;
  const session = authorization.owner;
  if (!(await enforceSubjectRateLimit("owner_password_change", session.sessionId, 5, 60 * 60)).allowed)
    return invalid(request);
  const body = await readUrlEncodedBody(request, 4 * 1024);
  if (!body.ok) return invalid(request);
  const currentPassword = String(body.value.get("currentPassword") ?? "").slice(0, 200);
  const newPassword = String(body.value.get("newPassword") ?? "");
  if (newPassword.length < 16 || newPassword.length > 200 || newPassword === currentPassword) return invalid(request);
  const repository = new PostgresOwnerAuthRepository();
  const account = await repository.getOwnerByEmail(session.email);
  if (!account?.mfaSecretEncrypted || !(await ownerPasswordMatches(currentPassword, account.passwordHash))) {
    await repository.recordAudit({ ownerId: session.ownerId, action: "owner.password_change", outcome: "failure", details: { category: "reauthentication_failed" } });
    return invalid(request);
  }
  let step: number | null = null;
  try { step = verifyOwnerTotp(decryptOwnerMfaSecret(account.mfaSecretEncrypted), String(body.value.get("code") ?? "")); } catch { return invalid(request); }
  if (step === null) return invalid(request);
  const changed = await repository.changePassword({ ownerId: session.ownerId, sessionHash: session.sessionHash, currentPasswordHash: account.passwordHash, newPasswordHash: await ownerPasswordHash(newPassword), totpStep: step });
  if (!changed) return invalid(request);
  const response = NextResponse.redirect(new URL("/owner/login?changed=1", request.url), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, "", ownerCookieOptions(0));
  response.cookies.set(OWNER_CHALLENGE_COOKIE, "", ownerCookieOptions(0));
  return response;
}
