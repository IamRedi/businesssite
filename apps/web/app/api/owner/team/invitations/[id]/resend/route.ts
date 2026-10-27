import { NextRequest } from "next/server";
import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { sendOwnerTeamInvitation } from "../../../../../../../lib/email";
import { newOwnerToken, ownerTokenHash } from "../../../../../../../lib/owner-auth";
import { authorizeOwnerRequest } from "../../../../../../../lib/owner-authorization";
import { readFreshOwnerMutation, teamMutationResponse, validTeamIdentifier } from "../../../../../../../lib/owner-team-http";
import { platformConfig } from "../../../../../../../lib/platform-config";
import { enforceSubjectRateLimit } from "../../../../../../../lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "team.manage");
  if (!authorization.ok) return authorization.response;
  if (!(await enforceSubjectRateLimit("owner_team_invite_resend", authorization.owner.sessionId, 20, 60 * 60)).allowed)
    return teamMutationResponse(request, { ok: false, reason: "rate_limited" });
  const parsed = await readFreshOwnerMutation(request, authorization.owner);
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  if (!validTeamIdentifier(id)) return teamMutationResponse(request, { ok: false, reason: "invalid" });
  const token = newOwnerToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const repository = new PostgresOwnerTeamRepository(undefined, authorization.owner.sessionHash);
  const result = await repository.resendInvitation({ actorId: authorization.owner.ownerId, correlationId: authorization.owner.correlationId, ...parsed.fresh, invitationId: id, tokenHash: ownerTokenHash(token), expiresAt });
  if (!result.ok || !result.replacementId || !result.email || !result.role) return teamMutationResponse(request, result);
  const delivery = await sendOwnerTeamInvitation({ to: result.email, token, role: result.role, expiresAt, brandName: platformConfig.brand.name, locale: result.recipientLocale });
  await repository.updateInvitationDelivery(result.replacementId, delivery.status);
  return teamMutationResponse(request, { ok: true });
}
