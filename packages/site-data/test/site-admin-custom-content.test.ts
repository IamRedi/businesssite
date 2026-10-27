import { describe, expect, it } from "vitest";
import { premiumCustomDesign, type SiteDocument } from "@platform/website-engine";
import { customerCustomValue } from "../src/site-admin-custom-content";

const site = { customDesign: premiumCustomDesign, customMedia: { images: [], videos: [] }, priceList: { title: "Preise", serviceLabel: "Leistung", fromLabel: "ab", currency: "EUR", groups: [{ title: "Damen", columns: ["Kurz", "Mittel", "Lang"], items: [{ label: "Haarschnitt", prices: [{ amountCents: 1600, from: true }, { amountCents: 2000 }, { amountCents: 2400 }], confirmationNote: "Vor Ort" }] }] } } as SiteDocument;
describe("customer custom content contract", () => {
  it("edits exact cents, label and from while preserving every column and note", () => {
    const next = structuredClone(site.priceList!); next.groups[0].items[0].label = "Schnitt"; next.groups[0].items[0].prices[0] = { amountCents: 1699, from: false };
    expect(customerCustomValue(site, "priceList", next)).toEqual(next);
    expect(site.priceList!.groups[0].items[0].prices[0].amountCents).toBe(1600);
  });
  it.each(["columns", "items", "title", "note", "fraction", "negative", "overflow"])("rejects invalid or structural price edit %s", kind => {
    const next = structuredClone(site.priceList!);
    if (kind === "columns") next.groups[0].columns.reverse();
    if (kind === "items") next.groups[0].items.push(next.groups[0].items[0]);
    if (kind === "title") next.title = "Changed";
    if (kind === "note") next.groups[0].items[0].confirmationNote = "Changed";
    if (kind === "fraction") next.groups[0].items[0].prices[0].amountCents = 16.99;
    if (kind === "negative") next.groups[0].items[0].prices[0].amountCents = -1;
    if (kind === "overflow") next.groups[0].items[0].prices[0].amountCents = 100_000_001;
    expect(() => customerCustomValue(site, "priceList", next)).toThrow();
  });
  it("does not enable a parallel custom editor on legacy sites", () => {
    expect(() => customerCustomValue({ ...site, customDesign: undefined }, "priceList", site.priceList)).toThrow();
  });
  it("requires a poster and enforces existing composition duration", () => {
    const video = { id: "video", title: "Video", posterId: "poster", width: 100, height: 100, durationSeconds: 31, sources: [{ src: "/video.mp4", type: "video/mp4", bytes: 100 }] };
    expect(() => customerCustomValue(site, "customMedia", { images: [], videos: [video] })).toThrow();
    expect(() => customerCustomValue(site, "customMedia", { images: [{ id: "poster", role: "video-poster", src: "/poster.webp", alt: "", width: 100, height: 100 }], videos: [video] })).toThrow();
  });
});
