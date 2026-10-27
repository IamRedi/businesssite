import { describe, expect, it } from "vitest";
import { normalizeVatIdSyntax, publicLegalConfig, type PlatformLegalConfigVersion } from "../src/index";

const config: PlatformLegalConfigVersion = {
  id: "private-id", version: 1, legalBusinessName: "Configured Operator", street: "Example 1",
  postalCode: "45127", city: "Essen", countryCode: "DE", countryName: "Germany",
  contactEmail: "legal@example.test", supportEmail: "support@example.test",
  taxDisplayMode: "net_plus_tax", currency: "EUR", priceTaxLabel: "plus VAT",
  disputeMetadata: "private workflow metadata", legalReviewStatus: "reviewed", status: "active",
  reviewedAt: "2026-08-24T00:00:00.000Z", effectiveFrom: "2026-08-24T00:00:00.000Z",
  createdAt: "2026-08-24T00:00:00.000Z",
};

describe("legal/commercial projections", () => {
  it("does not expose private identifiers or review metadata", () => {
    const projection = publicLegalConfig(config);
    expect(projection).toMatchObject({ legalBusinessName: "Configured Operator", taxDisplayMode: "net_plus_tax" });
    expect(projection).not.toHaveProperty("id");
    expect(projection).not.toHaveProperty("reviewedAt");
    expect(projection).not.toHaveProperty("disputeMetadata");
  });

  it("normalizes VAT syntax without claiming provider verification", () => {
    expect(normalizeVatIdSyntax(" de 123-456-789 ")).toEqual({ normalized: "DE123456789", syntacticallyPlausible: true });
    expect(normalizeVatIdSyntax("")).toEqual({ normalized: undefined, syntacticallyPlausible: true });
    expect(normalizeVatIdSyntax("123")).toMatchObject({ syntacticallyPlausible: false });
  });
});
