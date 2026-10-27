import { NextRequest } from "next/server";
import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../../../lib/owner-authorization";
import { readFreshOwnerMutation, teamMutationResponse, validTeamIdentifier } from "../../../../../../../lib/owner-team-http";
import { enforceSubjectRateLimit } from "../../../../../../../lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "team.manage");
  if (!authorization.ok) return authorization.response;
  if (!(await enforceSubjectRateLimit("owner_team_invite_revoke", authorization.owner.sessionId, 30, 60 * 60)).allowed)
    return teamMutationResponse(request, { ok: false, reason: "rate_limited" });
  const parsed = await readFreshOwnerMutation(request, authorization.owner);
  if (!parsed.ok) return parsed.response;
  const id = (await params).id;
  if (!validTeamIdentifier(id)) return teamMutationResponse(request, { ok: false, reason: "invalid" });
  const result = await new PostgresOwnerTeamRepository(undefined, authorization.owner.sessionHash).revokeInvitation({ actorId: authorization.owner.ownerId, correlationId: authorization.owner.correlationId, ...parsed.fresh, invitationId: id });
  return teamMutationResponse(request, result);
}
