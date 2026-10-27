import { NextResponse } from "next/server";
import { PostgresOwnerAuthRepository } from "@platform/site-data";
import type { AuthorizedOwner } from "./owner-authorization";
import { freshOwnerCredentials } from "./owner-authorization";
import { readUrlEncodedBody } from "./request-body";

export const validTeamIdentifier = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function readFreshOwnerMutation(request: Request, owner: AuthorizedOwner) {
  const body = await readUrlEncodedBody(request, 8 * 1024);
  if (!body.ok) return { ok: false as const, response: NextResponse.json({ error: body.error }, { status: body.status }) };
  const fresh = await freshOwnerCredentials(
    owner,
    String(body.value.get("currentPassword") ?? "").slice(0, 200),
    String(body.value.get("code") ?? "").slice(0, 20),
  );
  if (!fresh) {
    await new PostgresOwnerAuthRepository().recordAudit({
      ownerId: owner.ownerId, correlationId: owner.correlationId,
      action: "owner.team_fresh_auth", outcome: "failure",
      details: { category: "reauthentication_failed" },
    });
    return { ok: false as const, response: NextResponse.redirect(new URL("/owner/team?result=reauthentication_failed", request.url), 303) };
  }
  return { ok: true as const, body: body.value, fresh };
}

export function teamMutationResponse(request: Request, result: { ok: boolean; reason?: string }) {
  const value = result.ok ? "success" : result.reason ?? "failed";
  return NextResponse.redirect(new URL(`/owner/team?result=${encodeURIComponent(value)}`, request.url), 303);
}
