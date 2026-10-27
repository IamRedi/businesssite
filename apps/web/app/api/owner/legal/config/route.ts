import { PostgresLegalRepository, taxDisplayModes, type PlatformLegalConfigInput } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import { freshLegalActor, legalMutationResponse, readOwnerLegalForm, validLegalIdentifier } from "../../../../../lib/owner-legal-http";

const text = (body: URLSearchParams, name: string, limit = 240) => body.get(name)?.trim().slice(0, limit) ?? "";
const optional = (body: URLSearchParams, name: string, limit = 240) => text(body, name, limit) || undefined;

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "platform.configure");
  if (!authorization.ok) return authorization.response;
  const parsed = await readOwnerLegalForm(request);
  if (!parsed.ok) return parsed.response;
  const action = parsed.body.get("action");
  const repository = new PostgresLegalRepository({ boundary: "owner", sessionHash: authorization.owner.sessionHash });
  if (action === "activate") {
    const configId = text(parsed.body, "configId", 64);
    const fresh = await freshLegalActor(authorization.owner, parsed.body);
    if (!fresh || !validLegalIdentifier(configId) || parsed.body.get("reviewConfirmed") !== "true") return legalMutationResponse(request, "activation_denied");
    return legalMutationResponse(request, await repository.activateConfig(fresh, configId) ? "config_activated" : "activation_denied");
  }
  if (action !== "create") return legalMutationResponse(request, "invalid");
  const fresh = await freshLegalActor(authorization.owner, parsed.body);
  if (!fresh) return legalMutationResponse(request, "activation_denied");
  const taxDisplayMode = text(parsed.body, "taxDisplayMode") as PlatformLegalConfigInput["taxDisplayMode"];
  const currency = text(parsed.body, "currency") as PlatformLegalConfigInput["currency"];
  const input: PlatformLegalConfigInput = {
    legalBusinessName: text(parsed.body, "legalBusinessName", 200),
    legalForm: optional(parsed.body, "legalForm"),
    street: text(parsed.body, "street", 200),
    addressLine2: optional(parsed.body, "addressLine2", 200),
    postalCode: text(parsed.body, "postalCode", 24),
    city: text(parsed.body, "city", 120),
    countryCode: text(parsed.body, "countryCode", 2).toUpperCase(),
    countryName: text(parsed.body, "countryName", 120),
    authorizedRepresentative: optional(parsed.body, "authorizedRepresentative", 200),
    contactEmail: text(parsed.body, "contactEmail", 160).toLowerCase(),
    supportEmail: text(parsed.body, "supportEmail", 160).toLowerCase(),
    phone: optional(parsed.body, "phone", 60),
    registerName: optional(parsed.body, "registerName", 120),
    registerCourt: optional(parsed.body, "registerCourt", 120),
    registerNumber: optional(parsed.body, "registerNumber", 120),
    vatId: optional(parsed.body, "vatId", 40),
    supervisoryAuthority: optional(parsed.body, "supervisoryAuthority", 200),
    editorialResponsiblePerson: optional(parsed.body, "editorialResponsiblePerson", 200),
    disputeMetadata: optional(parsed.body, "disputeMetadata", 500),
    taxDisplayMode,
    currency,
    priceTaxLabel: text(parsed.body, "priceTaxLabel", 200),
    specialTaxNote: optional(parsed.body, "specialTaxNote", 500),
  };
  const invalid = !input.legalBusinessName || !input.street || !input.postalCode || !input.city ||
    !/^[A-Z]{2}$/.test(input.countryCode) || !input.countryName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.supportEmail) ||
    !taxDisplayModes.includes(input.taxDisplayMode) || !["EUR", "USD", "ALL"].includes(input.currency) ||
    !input.priceTaxLabel || (input.taxDisplayMode === "tax_exempt_or_special_note" && !input.specialTaxNote);
  if (invalid) return legalMutationResponse(request, "invalid");
  await repository.createConfig(fresh, input);
  return legalMutationResponse(request, "config_created_review_required");
}
