import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { PostgresOwnerTeamRepository, type OwnerSession } from "@platform/site-data";
import { decryptOwnerMfaSecret, ownerPasswordMatches, requireOwnerSession, verifyOwnerTotp } from "./owner-auth";
import { hasOwnerPermission, ownerActionPermissions, ownerRoutePermissions, type OwnerPermission } from "./owner-permissions";
import { isSameOriginHeaders, isSameOriginRequest } from "./same-origin";

export type AuthorizedOwner = OwnerSession & { correlationId: string; sessionHash: string };

async function denied(session: OwnerSession | null, permission: OwnerPermission, correlationId: string) {
  if (!session) return;
  try {
    await new PostgresOwnerTeamRepository().recordPermissionDenial(session.ownerId, permission, correlationId);
  } catch {
    // Authorization must remain fail-closed even if audit persistence is unavailable.
  }
}

export async function authorizeOwnerRequest(request: Request, permission: OwnerPermission) {
  const correlationId = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();
  if (!isSameOriginRequest(request)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Owner authorization required." }, { status: 403 }),
    };
  }
  const session = await requireOwnerSession();
  if (!session?.sessionHash || !hasOwnerPermission(session.role, permission)) {
    await denied(session, permission, correlationId);
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Owner authorization required." }, { status: 403 }),
    };
  }
  return { ok: true as const, owner: { ...session, sessionHash: session.sessionHash, correlationId } as AuthorizedOwner };
}

export async function requireOwnerPagePermission(permission: OwnerPermission) {
  const correlationId = randomUUID();
  const session = await requireOwnerSession();
  if (!session?.sessionHash) redirect("/owner/login");
  if (!hasOwnerPermission(session.role, permission)) {
    await denied(session, permission, correlationId);
    redirect("/owner?error=forbidden");
  }
  return { ...session, correlationId } as AuthorizedOwner;
}

export async function requireOwnerActionPermission(action: keyof typeof ownerActionPermissions) {
  const permission = ownerActionPermissions[action];
  const correlationId = randomUUID();
  const session = await requireOwnerSession();
  const requestHeaders = await headers();
  if (!session?.sessionHash || !hasOwnerPermission(session.role, permission) || !isSameOriginHeaders(requestHeaders)) {
    await denied(session, permission, correlationId);
    throw new Error("Owner authorization required.");
  }
  return { ...session, correlationId } as AuthorizedOwner;
}

export function routePermission(key: keyof typeof ownerRoutePermissions) {
  const classification = ownerRoutePermissions[key];
  return classification.access === "authenticated" ? classification.permission : null;
}

export async function freshOwnerCredentials(owner: AuthorizedOwner, password: string, code: string) {
  const repository = new (await import("@platform/site-data")).PostgresOwnerAuthRepository();
  const account = await repository.getOwnerByEmail(owner.email);
  if (!account?.mfaSecretEncrypted || !(await ownerPasswordMatches(password, account.passwordHash))) return null;
  let step: number | null = null;
  try {
    step = verifyOwnerTotp(decryptOwnerMfaSecret(account.mfaSecretEncrypted), code);
  } catch {
    return null;
  }
  return step === null ? null : { currentPasswordHash: account.passwordHash, totpStep: step };
}
