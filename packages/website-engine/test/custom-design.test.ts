import { describe, expect, it } from "vitest";
import { generateSiteDocument, applyCustomDesign, exportCustomPreset, importCustomPreset, premiumCustomDesign, parseCustomMedia, hasCustomDesign, type PreparedBusinessProfile } from "../src/index";

const profile = (name: string): PreparedBusinessProfile => ({ id: name, version: 1, sourceLeadId: name, business: { name, category: "barber", phone: "+49000000", address: "Example street" }, locale: "de", services: [{ title: "Haircut" }], approvedSources: [], preparedAt: "2026-10-03T00:00:00Z" });
const media = { images: [{ id: "own-photo", role: "hero", src: "/own-photo.webp", alt: "New business image", width: 640, height: 960 }], videos: [] };
describe("custom composition / content-free preset boundary", () => {
  it("serializes only allowlisted design and instantiates a different business without source content or media", () => {
    const source = generateSiteDocument(profile("Source business"));
    const dirty = { ...premiumCustomDesign, name: "Source business", content: source.content, media: { src: "/source-personal.mp4" }, tokens: { ...premiumCustomDesign.tokens, businessName: "Source business" }, gallery: { ...premiumCustomDesign.gallery, personalPhotos: ["https://personal.example/image.jpg"] } };
    const json = JSON.stringify(exportCustomPreset(dirty));
    expect(json).not.toMatch(/Source business|source-personal|personal\.example|businessName|personalPhotos/);
    const target = generateSiteDocument(profile("Other business"));
    const custom = applyCustomDesign(target, importCustomPreset(JSON.parse(json)), media);
    expect(custom.content).toEqual(target.content);
    expect(custom.contact).toEqual(target.contact);
    expect(custom.customMedia?.images[0].src).toBe("/own-photo.webp");
    expect(custom.content.name).toBe("Other business");
    expect(hasCustomDesign(custom)).toBe(true);
    expect(source.customDesign).toBeUndefined();
  });
  it("rejects unsafe URLs, raw oversized videos, missing posters and duplicate media IDs", () => {
    expect(() => parseCustomMedia({ ...media, images: [{ ...media.images[0], src: "javascript:alert(1)" }] })).toThrow();
    expect(() => parseCustomMedia({ ...media, images: [...media.images, media.images[0]] })).toThrow();
    expect(() => parseCustomMedia({ images: [], videos: [{ id: "clip", title: "Clip", width: 600, height: 900, durationSeconds: 12, posterId: "missing", sources: [{ src: "/raw.mp4", type: "video/mp4", bytes: 20_000_000 }] }] })).toThrow();
  });
  it("rejects personal text in categorical configuration and inaccessible palettes", () => {
    expect(() => exportCustomPreset({ ...premiumCustomDesign, typography: "Source business" })).toThrow();
    expect(() => exportCustomPreset({ ...premiumCustomDesign, tokens: { ...premiumCustomDesign.tokens, muted: "#222222" } })).toThrow(/WCAG/);
    expect(() => exportCustomPreset({ ...premiumCustomDesign, sections: ["hero", "footer"] })).toThrow();
  });
  it("leaves invalid/missing custom blocks on the original rendering path", () => {
    const legacy = generateSiteDocument(profile("Original"));
    expect(hasCustomDesign(legacy)).toBe(false);
    expect(hasCustomDesign({ ...legacy, customDesign: { ...premiumCustomDesign, version: "bad" } as never, customMedia: media as never })).toBe(false);
  });
});
