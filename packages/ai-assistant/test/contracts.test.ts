import { describe, expect, it } from "vitest";
import { validateTextRewrite, validateWebsiteBlueprint } from "../src/index";

describe("AI output contracts", () => {
  it("rejects template keys outside the buyer catalog", () => {
    expect(() => validateWebsiteBlueprint({ templateKey: "invented" }, ["barber"])).toThrow();
  });
  it("limits client rewrites to a validated text value", () => {
    expect(validateTextRewrite({ text: "  Clear copy.  ", ignored: true })).toEqual({ text: "Clear copy." });
    expect(() => validateTextRewrite({ text: "" })).toThrow();
  });
  it("validates sourced contacts and normalized opening hours", () => {
    const blueprint = validateWebsiteBlueprint({
      summary: "A stronger salon website.", businessType: "Beauty salon", targetAudience: "Local clients", tone: "Premium", templateKey: "beauty", themeKey: "gold",
      reasons: ["Matches the category", "Supports appointments"],
      content: { description: "Beauty services.", heroTitle: "Feel your best", heroSubtitle: "Personal care in Essen.", aboutTitle: "About us", aboutBody: "Experienced local care.", servicesTitle: "Services", contactTitle: "Contact" },
      services: [{ title: "Facials", description: "Personal facial care." }, { title: "Styling", description: "Professional styling." }, { title: "Consultation", description: "A personal consultation." }],
      media: { heroImageUrl: "https://business.example/hero.jpg", serviceImageUrls: ["https://business.example/facials.jpg"], galleryImageUrls: ["https://business.example/facials.jpg"] },
      businessDetails: { phone: "+49 201 1234", email: "hello@example.de", address: "Markt 1", city: "Essen", country: "DE", socialLinks: { instagram: "", facebook: "", tiktok: "" }, openingHours: [{ day: "monday", open: "09:00", close: "18:00", closed: false }] },
      sourceFindings: ["Opening hours were found on the contact page."],
    }, ["beauty"]);
    expect(blueprint.businessDetails.openingHours[0]).toEqual({ day: "monday", open: "09:00", close: "18:00", closed: false });
    expect(blueprint.media.serviceImageUrls).toEqual(["https://business.example/facials.jpg"]);
    expect(blueprint.media.heroImageUrl).toBe("https://business.example/hero.jpg");
  });
});
