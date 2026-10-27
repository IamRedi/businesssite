import { describe, expect, it } from "vitest";
import { legalDocumentEvidence, legalDocumentSource, legalDocumentSources } from "./legal-documents";
import { b2bLaunchCopy } from "./b2b-policy";

describe("B2B legal document source", () => {
  it("keeps versioned EN/DE sources with deterministic SHA-256 evidence", () => {
    expect(legalDocumentSources).toHaveLength(8);
    for (const source of legalDocumentSources) {
      const first = legalDocumentEvidence(source.documentKey, source.locale);
      expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(legalDocumentEvidence(source.documentKey, source.locale)).toEqual(first);
      expect(source.version).toContain("draft");
    }
  });

  it("states the B2B boundary and does not expose a consumer withdrawal promise", () => {
    const terms = JSON.stringify(legalDocumentSource("terms", "en"));
    const cancellation = JSON.stringify(legalDocumentSource("cancellation", "de"));
    expect(terms).toContain("solely for businesses and self-employed professionals");
    expect(`${terms}${cancellation}`).not.toMatch(/14-day|14 Tage|Widerruf/i);
    expect(b2bLaunchCopy("en").privacy).toContain("not general consent");
    expect(b2bLaunchCopy("de").restriction).toContain("Unternehmen");
  });

  it("fails closed for an unsupported or missing exact locale", () => {
    expect(() => legalDocumentSource("terms", "fr" as never)).toThrow(/unavailable/i);
    expect(() => legalDocumentEvidence("privacy", "sq" as never)).toThrow(/locale/i);
  });
});
