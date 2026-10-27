import { describe, expect, it } from "vitest";
import { applyCustomDesign, exportCustomPreset, generateSiteDocument, parsePriceList, premiumCustomDesign, type PreparedBusinessProfile } from "../src/index";

const input = { title: "Service prices", serviceLabel: "Service", fromLabel: "from", currency: "EUR", groups: [{ title: "Group", columns: ["Short", "Long"], items: [{ label: "Example service", prices: [{ amountCents: 1960 }, { amountCents: 2500, from: true }] }] }] };
describe("price content contract and reusable preset isolation", () => {
  it("rejects ambiguous amounts and mismatched columns", () => {
    for (const amountCents of [-1, 19.6, Infinity, "1960"]) {
      expect(() => parsePriceList({ ...input, groups: [{ ...input.groups[0], items: [{ label: "Service", prices: [{ amountCents }] }] }] })).toThrow(/integer cents/);
    }
    expect(() => parsePriceList({ ...input, groups: [{ ...input.groups[0], columns: [] }] })).toThrow(/count/);
    expect(() => parsePriceList({ ...input, currency: "USD" })).toThrow(/currency/);
    expect(() => parsePriceList({ ...input, groups: [{ ...input.groups[0], items: [{ label: "Service", prices: [{ amountCents: 100, from: "true" }] }] }] })).toThrow(/flag/);
  });
  it("preserves exact cents, starting flags and owner confirmation without leaking content into a preset", () => {
    const list = parsePriceList({ ...input, groups: [{ ...input.groups[0], items: [{ ...input.groups[0].items[0], confirmationNote: "Owner confirmation pending", hiddenCustomerField: "private" }] }] });
    const profile: PreparedBusinessProfile = { id: "example", version: 1, sourceLeadId: "example", locale: "de", business: { name: "Example" }, services: [], approvedSources: [], preparedAt: "2026-10-03T00:00:00Z" };
    const design = { ...premiumCustomDesign, sections: [...premiumCustomDesign.sections.slice(0, 2), "pricing", ...premiumCustomDesign.sections.slice(2)], priceList: list };
    const site = applyCustomDesign({ ...generateSiteDocument(profile), priceList: list }, design, { images: [], videos: [] });
    expect(site.priceList?.groups[0].items[0]).toEqual({ label: "Example service", prices: [{ amountCents: 1960 }, { amountCents: 2500, from: true }], confirmationNote: "Owner confirmation pending" });
    const preset = JSON.stringify(exportCustomPreset(design));
    expect(preset).toContain('"pricing"');
    expect(preset).not.toMatch(/Example service|amountCents|Owner confirmation|hiddenCustomerField|priceList/);
  });
});
