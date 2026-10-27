import { NextRequest, NextResponse } from "next/server";
import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { sendOwnerTeamInvitation } from "../../../../../lib/email";
import { newOwnerToken, normalizeOwnerEmail, ownerTokenHash } from "../../../../../lib/owner-auth";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import { isOwnerRole } from "../../../../../lib/owner-permissions";
import { readFreshOwnerMutation, teamMutationResponse } from "../../../../../lib/owner-team-http";
import { platformConfig } from "../../../../../lib/platform-config";
import { enforceSubjectRateLimit } from "../../../../../lib/rate-limit";
import { resolveTransactionalEmailLocale } from "../../../../../lib/locale-model";

export async function POST(request: NextRequest) {
  const authorization = await authorizeOwnerRequest(request, "team.manage");
  if (!authorization.ok) return authorization.response;
  if (!(await enforceSubjectRateLimit("owner_team_invite_create", authorization.owner.sessionId, 10, 60 * 60)).allowed)
    return teamMutationResponse(request, { ok: false, reason: "rate_limited" });
  const parsed = await readFreshOwnerMutation(request, authorization.owner);
  if (!parsed.ok) return parsed.response;
  const email = normalizeOwnerEmail(parsed.body.get("email"));
  const role = parsed.body.get("role");
  const recipientLocale = resolveTransactionalEmailLocale(parsed.body.get("recipientLocale"));
  if (!email.includes("@") || !isOwnerRole(role)) return teamMutationResponse(request, { ok: false, reason: "invalid" });
  const token = newOwnerToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const repository = new PostgresOwnerTeamRepository(undefined, authorization.owner.sessionHash);
  const result = await repository.createInvitation({
    actorId: authorization.owner.ownerId, correlationId: authorization.owner.correlationId,
    ...parsed.fresh, email, role, tokenHash: ownerTokenHash(token), expiresAt, recipientLocale,
  });
  if (!result.ok || !result.invitationId) return teamMutationResponse(request, result);
  const delivery = await sendOwnerTeamInvitation({ to: email, token, role, expiresAt, brandName: platformConfig.brand.name, locale: recipientLocale });
  await repository.updateInvitationDelivery(result.invitationId, delivery.status);
  if (process.env.NODE_ENV !== "production" && process.env.OWNER_INVITATION_DEV_LINKS === "true" && parsed.body.get("format") === "json") {
    return NextResponse.json({ ok: true, invitationUrl: `${process.env.PUBLIC_APP_URL?.trim() || "http://localhost:3000"}/owner/invitation#token=${token}`, delivery: delivery.status });
  }
  return teamMutationResponse(request, { ok: true });
}
