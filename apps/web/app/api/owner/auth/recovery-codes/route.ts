import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
import { recoveryCodesResponse } from "../../../../../lib/owner-auth-response";
import { enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import {
  decryptOwnerMfaSecret, generateOwnerRecoveryCodes, ownerPasswordMatches,
  ownerRecoveryCodeHash, verifyOwnerTotp,
} from "../../../../../lib/owner-auth";

const invalid = (request: Request) => NextResponse.redirect(new URL("/owner/security?error=invalid", request.url), 303);

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerRequest(request, "security.self");
  if (!authorization.ok) return authorization.response;
  const session = authorization.owner;
  if (!(await enforceSubjectRateLimit("owner_recovery_regeneration", session.sessionId, 5, 60 * 60)).allowed)
    return invalid(request);
  const body = await readUrlEncodedBody(request, 3 * 1024);
  if (!body.ok) return invalid(request);
  const repository = new PostgresOwnerAuthRepository();
  const account = await repository.getOwnerByEmail(session.email);
  const currentPassword = String(body.value.get("currentPassword") ?? "").slice(0, 200);
  if (!account?.mfaSecretEncrypted || !(await ownerPasswordMatches(currentPassword, account.passwordHash))) return invalid(request);
  let step: number | null = null;
  try { step = verifyOwnerTotp(decryptOwnerMfaSecret(account.mfaSecretEncrypted), String(body.value.get("code") ?? "")); } catch { return invalid(request); }
  if (step === null) return invalid(request);
  const codes = generateOwnerRecoveryCodes();
  const changed = await repository.regenerateRecoveryCodes({ ownerId: session.ownerId, sessionHash: session.sessionHash, currentPasswordHash: account.passwordHash, totpStep: step, recoveryCodeHashes: codes.map(ownerRecoveryCodeHash) });
  if (!changed) return invalid(request);
  return recoveryCodesResponse(codes, "/owner/security");
}
