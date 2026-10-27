import { PostgresLegalRepository, legalDocumentKeys } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import { legalDocumentEvidence } from "../../../../../lib/legal-documents";
import { freshLegalActor, legalMutationResponse, readOwnerLegalForm, validLegalIdentifier } from "../../../../../lib/owner-legal-http";

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "platform.configure");
  if (!authorization.ok) return authorization.response;
  const parsed = await readOwnerLegalForm(request);
  if (!parsed.ok) return parsed.response;
  const repository = new PostgresLegalRepository({ boundary: "owner", sessionHash: authorization.owner.sessionHash });
  if (parsed.body.get("action") === "register") {
    const fresh = await freshLegalActor(authorization.owner, parsed.body);
    if (!fresh) return legalMutationResponse(request, "activation_denied");
    const documentKey = parsed.body.get("documentKey");
    const locale = parsed.body.get("locale") === "de" ? "de" : "en";
    if (!legalDocumentKeys.includes(documentKey as never)) return legalMutationResponse(request, "invalid");
    const evidence = legalDocumentEvidence(documentKey as (typeof legalDocumentKeys)[number], locale);
    await repository.registerDocument(fresh, evidence);
    return legalMutationResponse(request, "document_registered_review_required");
  }
  if (parsed.body.get("action") === "activate") {
    const documentId = parsed.body.get("documentId")?.trim() ?? "";
    const fresh = await freshLegalActor(authorization.owner, parsed.body);
    if (!fresh || !validLegalIdentifier(documentId) || parsed.body.get("reviewConfirmed") !== "true") return legalMutationResponse(request, "activation_denied");
    const activated = await repository.activateDocument(fresh, documentId, parsed.body.get("reviewerReference")?.trim().slice(0, 120));
    return legalMutationResponse(request, activated ? "document_activated" : "activation_denied");
  }
  return legalMutationResponse(request, "invalid");
}
