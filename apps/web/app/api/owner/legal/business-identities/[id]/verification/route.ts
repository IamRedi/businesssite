import { PostgresLegalRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../../../lib/owner-authorization";
import { freshLegalActor, legalMutationResponse, readOwnerLegalForm, validLegalIdentifier } from "../../../../../../../lib/owner-legal-http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOwnerRequest(request, "platform.configure");
  if (!authorization.ok) return authorization.response;
  const parsed = await readOwnerLegalForm(request);
  if (!parsed.ok) return parsed.response;
  const identityId = (await params).id;
  const state = parsed.body.get("state");
  if (!validLegalIdentifier(identityId) || !["manually_verified", "review_required", "rejected"].includes(state ?? ""))
    return legalMutationResponse(request, "invalid");
  const fresh = await freshLegalActor(authorization.owner, parsed.body);
  if (!fresh) return legalMutationResponse(request, "activation_denied");
  const updated = await new PostgresLegalRepository({ boundary: "owner", sessionHash: authorization.owner.sessionHash }).setBusinessVerification(
    fresh, identityId, state as "manually_verified" | "review_required" | "rejected",
    parsed.body.get("reasonCode")?.trim().slice(0, 80),
  );
  return legalMutationResponse(request, updated ? "identity_reviewed" : "not_found");
}
