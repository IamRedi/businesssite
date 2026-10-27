import { describe, expect, it } from "vitest";
import type { WebsiteResearch } from "./safe-website-reader";
import {
  buildSourceWebsiteModel,
  classifySourcePage,
  enforcePlanGuards,
  selectVisionCandidates,
  websiteImportContentHash,
  websiteImportPlanCacheKey,
  websiteImportUnderstandingCacheKey,
} from "./website-understanding";
import type { WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";

const research = (imageUrls: string[]): WebsiteResearch => ({
  sourceUrl: "https://old-business-site.de/",
  pagesRead: 2,
  pages: [
    {
      url: "https://old-business-site.de/",
      title: "Startseite",
      text: "Willkommen. Wir liefern Stahlkonstruktionen.",
      structuredData: [],
      images: [],
    },
    {
      url: "https://old-business-site.de/kontakt",
      title: "Kontakt",
      text: "Kontakt. Rufen Sie an.",
      structuredData: [],
      images: [],
    },
  ],
  images: imageUrls.map((url, index) => ({ url, alt: index === 0 ? "logo" : "", pageUrl: "https://old-business-site.de/" })),
  contactHints: { emails: [], phones: [], socialLinks: [] },
});

describe("buildSourceWebsiteModel", () => {
  it("classifies pages semantically from url and content", () => {
    const model = buildSourceWebsiteModel(research([]));
    expect(model.pages[0].type).toBe("homepage");
    expect(model.pages[1].type).toBe("contact");
    expect(model.pages[0].hint).toBe("root document");
  });

  it("collapses duplicate sized variants of the same asset", () => {
    const model = buildSourceWebsiteModel(research([
      "https://old-business-site.de/img/work.jpg",
      "https://old-business-site.de/img/work-300x200.jpg",
      "https://old-business-site.de/img/other.png",
    ]));
    expect(model.images).toHaveLength(3);
    expect(model.images[1].duplicateOf).toBe("https://old-business-site.de/img/work.jpg");
    const candidates = selectVisionCandidates(model.images);
    expect(candidates.map((candidate) => candidate.index)).toEqual([0, 2]);
  });

  it("drops icons, tracking pixels and thumbnails from vision candidates", () => {
    const model = buildSourceWebsiteModel(research([
      "https://old-business-site.de/img/icon-facebook.png",
      "https://old-business-site.de/js/pixel.gif",
      "https://old-business-site.de/img/thumb_gallery.jpg",
      "https://old-business-site.de/img/hero-banner.webp",
    ]));
    expect(selectVisionCandidates(model.images).map((candidate) => candidate.filename)).toEqual(["hero-banner.webp"]);
  });

  it("produces a stable content-addressed cache key", () => {
    const first = websiteImportContentHash(research(["https://old-business-site.de/img/work.jpg"]));
    const second = websiteImportContentHash(research(["https://old-business-site.de/img/work.jpg"]));
    const changed = websiteImportContentHash(research(["https://old-business-site.de/img/other.jpg"]));
    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });

  it("separates plan cache keys per locale while keeping understanding shared", () => {
    const researchA = research(["https://old-business-site.de/img/work.jpg"]);
    const sqPlan = websiteImportPlanCacheKey(researchA, "gpt-5.6-luna", "sq");
    const itPlan = websiteImportPlanCacheKey(researchA, "gpt-5.6-luna", "it");
    const dePlan = websiteImportPlanCacheKey(researchA, "gpt-5.6-luna", "de");
    const sqAgain = websiteImportPlanCacheKey(researchA, "gpt-5.6-luna", "sq");
    expect(new Set([sqPlan, itPlan, dePlan]).size).toBe(3);
    expect(sqAgain).toBe(sqPlan);
    expect(websiteImportUnderstandingCacheKey(researchA, "gpt-5.6-luna"))
      .toBe(websiteImportUnderstandingCacheKey(researchA, "gpt-5.6-luna"));
  });

  it("changes plan cache keys when the model changes", () => {
    const researchA = research(["https://old-business-site.de/img/work.jpg"]);
    expect(websiteImportPlanCacheKey(researchA, "model-a", "sq"))
      .not.toBe(websiteImportPlanCacheKey(researchA, "model-b", "sq"));
  });
});

describe("enforcePlanGuards", () => {
  const images = [
    { index: 0, url: "https://old-business-site.de/img/logo.png", sourcePage: "x", alt: "", filename: "logo.png", duplicateOf: null },
    { index: 1, url: "https://old-business-site.de/img/work.jpg", sourcePage: "x", alt: "", filename: "work.jpg", duplicateOf: null },
    { index: 2, url: "https://old-business-site.de/img/building.jpg", sourcePage: "x", alt: "", filename: "building.jpg", duplicateOf: null },
  ];
  const understanding = (overrides: Partial<WebsiteUnderstanding["images"][number]>[]) => ({
    business: { summary: "s", does: "d", customers: "c", industries: [], valueProposition: "v", differentiators: [], primaryCta: "cta" },
    suggestedCategory: null,
    services: [], projects: [], certifications: [], locations: [],
    contact: { phone: null, email: null, address: null, city: null },
    openingHours: [], socialLinks: [], pageTypes: [],
    images: [
      { index: 0, classification: "logo", description: "logo", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 0, confidence: 0.9, reason: "brand mark" },
      { index: 1, classification: "work_process", description: "welding", relatedService: "Steel", relatedProject: null, quality: "good", heroSuitability: 2, confidence: 0.5, reason: "process shot" },
      { index: 2, classification: "project", description: "hall", relatedService: null, relatedProject: "Warehouse", quality: "excellent", heroSuitability: 8, confidence: 0.9, reason: "finished building" },
      ...overrides,
    ] as WebsiteUnderstanding["images"],
    weakMaterials: [], sourceLanguage: "de", notes: [],
  });
  const planWith = (heroIndex: number | null): WebsiteBuildPlan => ({
    language: "sq", themeKey: "auto", templateKey: "forge",
    hero: { headline: "H", supporting: "S", cta: "C", imageIndex: heroIndex },
    about: { title: "A", body: "B", imageIndexes: [] },
    services: [], projects: [], trust: [],
    contact: { phone: null, email: null, address: null, city: null },
    needsHeroImage: false, notes: [],
  });

  it("never allows a logo to be the hero", () => {
    const { plan, heroDroppedReason } = enforcePlanGuards(planWith(0), understanding([]), images);
    expect(plan.hero.imageIndex).toBeNull();
    expect(plan.needsHeroImage).toBe(true);
    expect(heroDroppedReason).toContain("logo");
  });

  it("drops heroes with low suitability or low confidence", () => {
    const low = enforcePlanGuards(planWith(1), understanding([]), images);
    expect(low.plan.hero.imageIndex).toBeNull();
    expect(low.heroDroppedReason).toContain("suitability too low");
  });

  it("keeps a genuinely strong hero", () => {
    const ok = enforcePlanGuards(planWith(2), understanding([]), images);
    expect(ok.plan.hero.imageIndex).toBe(2);
    expect(ok.plan.needsHeroImage).toBe(false);
    expect(ok.heroDroppedReason).toBeNull();
  });

  it("drops heroes that are not part of the inventory or not raster files", () => {
    const outside = enforcePlanGuards(planWith(9), understanding([]), images);
    expect(outside.plan.hero.imageIndex).toBeNull();
    expect(outside.heroDroppedReason).toContain("not part of the source inventory");
  });
});

describe("classifySourcePage", () => {
  it("prefers content signals over path guesses", () => {
    expect(classifySourcePage("https://x.de/kontakt", "Kontakt", "Kontakt").type).toBe("contact");
    expect(classifySourcePage("https://x.de/rreth-nesh", "Rreth nesh", "Rreth nesh").type).toBe("about");
    expect(classifySourcePage("https://x.de/irgendwas", "Irgendwas", "nothing").type).toBe("other");
  });
});
