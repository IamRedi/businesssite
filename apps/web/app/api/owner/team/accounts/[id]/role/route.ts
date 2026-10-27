import { NextRequest } from "next/server";
import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../../../lib/owner-authorization";
import { isOwnerRole } from "../../../../../../../lib/owner-permissions";
import { readFreshOwnerMutation, teamMutationResponse, validTeamIdentifier } from "../../../../../../../lib/owner-team-http";
import { enforceSubjectRateLimit } from "../../../../../../../lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "team.manage");
  if (!authorization.ok) return authorization.response;
  if (!(await enforceSubjectRateLimit("owner_team_role_change", authorization.owner.sessionId, 20, 60 * 60)).allowed)
    return teamMutationResponse(request, { ok: false, reason: "rate_limited" });
  const parsed = await readFreshOwnerMutation(request, authorization.owner);
  if (!parsed.ok) return parsed.response;
  const role = parsed.body.get("role");
  if (!isOwnerRole(role) || parsed.body.get("confirm") !== "yes") return teamMutationResponse(request, { ok: false, reason: "invalid" });
  const id = (await params).id;
  if (!validTeamIdentifier(id)) return teamMutationResponse(request, { ok: false, reason: "invalid" });
  const result = await new PostgresOwnerTeamRepository(undefined, authorization.owner.sessionHash).changeRole({ actorId: authorization.owner.ownerId, correlationId: authorization.owner.correlationId, ...parsed.fresh, targetOwnerId: id, role });
  return teamMutationResponse(request, result);
}
