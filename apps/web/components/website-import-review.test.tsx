import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";
import type { WebsiteImportPreview } from "../lib/website-import";
import {
  buildAssetCards,
  initialSelections,
  selectionsFromAi,
  submissionFromSelections,
} from "./website-import-review";

const preview: WebsiteImportPreview = {
  sourceUrl: "https://old-business-site.de/",
  fetchedAt: "2026-10-01T00:00:00.000Z",
  pagesRead: 3,
  businessName: "Meister Bau",
  suggestedHero: { title: "Meister Bau" },
  services: ["Alte Leistung"],
  contact: { phone: "+49 1", email: "info@old-business-site.de" },
  socialLinks: [],
  logoUrl: "https://old-business-site.de/img/logo.png",
  faviconUrl: undefined,
  colors: ["#123456"],
  fonts: [],
  photos: [
    { url: "https://old-business-site.de/img/logo.png", alt: "logo" },
    { url: "https://old-business-site.de/img/hero.jpg", alt: "steel hall" },
    { url: "https://old-business-site.de/img/process.jpg", alt: "welding" },
    { url: "https://old-business-site.de/img/cert.jpg", alt: "iso scan" },
  ],
  legalSuggestions: {},
  sourceLanguage: "de",
  openingHours: [],
};

const understanding = {
  business: { summary: "s", does: "d", customers: "c", industries: [], valueProposition: "v", differentiators: [], primaryCta: "cta" },
  services: [
    { name: "Steel halls", description: "d1", confidence: "high" },
    { name: "Renovations", description: "d2", confidence: "low" },
  ],
  projects: [], certifications: [], locations: [],
  contact: { phone: undefined, email: undefined, address: undefined, city: undefined } as never,
  openingHours: [], socialLinks: [],
  pageTypes: [],
  images: [
    { index: 0, url: "https://old-business-site.de/img/logo.png", classification: "logo", description: "logo", relatedService: undefined, relatedProject: undefined, quality: "good", heroSuitability: 0, confidence: 0.99, reason: "brand mark" },
    { index: 1, url: "https://old-business-site.de/img/hero.jpg", classification: "project", description: "steel hall exterior", relatedService: "Steel halls", relatedProject: undefined, quality: "excellent", heroSuitability: 9, confidence: 0.95, reason: "finished work" },
    { index: 2, url: "https://old-business-site.de/img/process.jpg", classification: "work_process", description: "welding", relatedService: "Steel halls", relatedProject: undefined, quality: "fair", heroSuitability: 3, confidence: 0.9, reason: "process" },
    { index: 3, url: "https://old-business-site.de/img/cert.jpg", classification: "certificate", description: "iso scan", relatedService: undefined, relatedProject: undefined, quality: "fair", heroSuitability: 0, confidence: 0.9, reason: "document" },
  ],
  weakMaterials: [], sourceLanguage: "de", notes: [],
} as unknown as WebsiteUnderstanding;

const plan = {
  language: "sq", themeKey: "forge", templateKey: "forge",
  hero: { headline: "H", supporting: "S", cta: "C", imageIndex: 1 },
  about: { title: "A", body: "B", imageIndexes: [2] },
  services: [
    { title: "Steel halls", description: "d1", imageIndex: 1 },
    { title: "Renovations", description: "d2", imageIndex: null },
  ],
  projects: [],
  trust: [], contact: { phone: undefined, email: undefined, address: undefined, city: undefined } as never,
  needsHeroImage: false, notes: [],
} as unknown as WebsiteBuildPlan;

describe("buildAssetCards", () => {
  it("orders hero first, keeps logo and certificate out of hero eligibility", () => {
    const cards = buildAssetCards(preview, understanding, plan);
    expect(cards[0].label).toBe("HERO");
    expect(cards[0].url).toContain("hero.jpg");
    expect(cards[0].aiRecommendedHero).toBe(true);
    const logo = cards.find((card) => card.url.endsWith("logo.png"))!;
    expect(logo.label).toBe("LOGO");
    expect(logo.heroEligible).toBe(false);
    const cert = cards.find((card) => card.url.endsWith("cert.jpg"))!;
    expect(cert.heroEligible).toBe(false);
  });

  it("assigns sections: process → ABOUT, plan hero → hero", () => {
    const cards = buildAssetCards(preview, understanding, plan);
    expect(cards.find((card) => card.url.endsWith("process.jpg"))?.section).toBe("about");
  });

  it("checkbox ordering cannot change the hero: selection model stores explicit heroUrl", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    expect(selections.heroUrl).toBe("https://old-business-site.de/img/hero.jpg");
    // shuffling the photo order must not change the chosen hero
    const shuffled = { ...preview, photos: [...preview.photos].reverse() };
    const again = selectionsFromAi(shuffled as unknown as WebsiteImportPreview, understanding, plan);
    expect(again.heroUrl).toBe("https://old-business-site.de/img/hero.jpg");
  });
});

describe("selectionsFromAi / submissionFromSelections", () => {
  it("excludes low-confidence services by default and keeps matched hero", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    const renovations = selections.services.find((service) => service.title === "Renovations")!;
    expect(renovations.selected).toBe(false);
    const halls = selections.services.find((service) => service.title === "Steel halls")!;
    expect(halls.selected).toBe(true);
    expect(selections.logoUrl).toContain("logo.png");
    expect(selections.heroUrl).toContain("hero.jpg");
  });

  it("builds a wire submission with explicit hero, logo and service mapping", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    selections.acknowledged = true;
    const submission = submissionFromSelections(preview.sourceUrl, selections);
    expect(submission).toMatchObject({
      sourceUrl: preview.sourceUrl,
      importAcknowledged: true,
      logoUrl: "https://old-business-site.de/img/logo.png",
      heroImageUrl: "https://old-business-site.de/img/hero.jpg",
    });
    // low-confidence service is excluded from the submission by default
    expect(submission.services).toHaveLength(1);
  });
});

describe("deterministic fallback selections", () => {
  it("initialSelections keeps explicit hero + separates logo without AI semantics", () => {
    const selections = initialSelections(preview);
    expect(selections.heroUrl).toBe("https://old-business-site.de/img/hero.jpg");
    expect(selections.logoUrl).toContain("logo.png");
    expect(selections.services[0]).toMatchObject({ title: "Alte Leistung", selected: true });
  });
});

describe("review render (huge-image containment classes)", () => {
  it("renders fixed-box thumbnails: cover for photos, contain for logo, hero highlighted", () => {
    const html = renderToStaticMarkup(
      <WebsiteImportReview
        preview={preview}
        locale="en"
        selections={selectionsFromAi(preview, understanding, plan)}
        onChange={() => {}}
        onRemove={() => {}}
        engine="ai"
        understanding={understanding}
        plan={plan}
      />,
    );
    // fixed thumbnail box + cover default
    expect(html).toContain("import-asset-thumb");
    // logo asset renders with the contain variant
    const logoIdx = html.indexOf("LOGO");
    const logoSeg = html.slice(Math.max(0, logoIdx - 600), logoIdx);
    expect(logoSeg).toContain("import-asset-thumb-contain");
    // hero card is highlighted and labelled
    expect(html).toContain("import-asset-hero");
    expect(html).toContain("HERO");
    expect(html).toContain("AI recommended");
  });
});
import { WebsiteImportReview } from "./website-import-review";
