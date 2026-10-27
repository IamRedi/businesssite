import { NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import type { AuthorizedOwner } from "./owner-authorization";
import { freshOwnerCredentials } from "./owner-authorization";
import { readUrlEncodedBody } from "./request-body";

export const validLegalIdentifier = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function readOwnerLegalForm(request: Request) {
  const body = await readUrlEncodedBody(request, 24 * 1024);
  return body.ok
    ? { ok: true as const, body: body.value }
    : { ok: false as const, response: NextResponse.json({ error: body.error }, { status: body.status }) };
}

export async function freshLegalActor(owner: AuthorizedOwner, body: URLSearchParams) {
  const fresh = await freshOwnerCredentials(
    owner,
    String(body.get("currentPassword") ?? "").slice(0, 200),
    String(body.get("code") ?? "").slice(0, 20),
  );
  if (!fresh) {
    await new PostgresOwnerAuthRepository().recordAudit({
      ownerId: owner.ownerId, correlationId: owner.correlationId,
      action: "owner.legal_fresh_auth", outcome: "failure",
      details: { category: "reauthentication_failed" },
    });
    return null;
  }
  return { actorId: owner.ownerId, correlationId: owner.correlationId, ...fresh };
}

export function legalMutationResponse(request: Request, result: string) {
  return NextResponse.redirect(new URL(`/owner/legal?result=${encodeURIComponent(result)}`, request.url), 303);
}
