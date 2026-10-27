import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generateSiteDocument, resolveSiteDesignInput, usesDesignPipeline, type PreparedBusinessProfile, type SiteDocument } from "@platform/website-engine";
import { applyExistingWebsiteToSite, validateExistingWebsiteSubmission } from "./apply-website-import";
import type { WebsiteImportPreview } from "./website-import";
import { submissionFromSelections, selectionsFromAi, type ImportSelections } from "../components/website-import-review";
import { SitePreview } from "../components/site-preview";
import type { WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";

/** Planner v2 example for Demo Steel (industrial B2B, project photo rich, quote CTA). */
const demoSteelPlan: WebsiteBuildPlan = {
  language: "sq",
  themeKey: "forge",
  templateKey: "forge",
  hero: { headline: "Konstruksione metalike, nga projekti në montim", supporting: "Fabricim dhe montim i strukturave metalike për projekte industriale dhe civile.", cta: "Kërko ofertë", imageIndex: 9 },
  about: { title: "Rreth Demo Steel", body: "Ekipe me përvojë në fabricim dhe montim, nga vizati teknik deri te dorëzimi.", imageIndexes: [11, 12] },
  services: [
    { title: "Fabricim metalik", description: "Prodhim i strukturave metalike sipas projektit.", imageIndex: 3 },
    { title: "Montim në kantier", description: "Montim i ekipeve tona në vendin e projektit.", imageIndex: 5 },
  ],
  projects: [{ name: "Magazina industriale", summary: "Strukturë mbajtëse për magazinë, dorëzuar brenda afatit.", imageIndexes: [7, 8] }],
  trust: ["Referenca nga projekte të përfunduara"],
  contact: { phone: "+355 69 000 0000", email: "info@demo-steel.example", address: null, city: null },
  needsHeroImage: false,
  notes: [],
  design: {
    layoutArchetype: "forge",
    heroVariant: "split",
    sectionOrder: ["hero", "services", "about", "projects", "gallery", "contact", "appointments", "legal", "footer"],
    sectionVariants: { services: "cards", projects: "grid", about: "split", contact: "split" },
    density: "regular",
    visualStyle: "industrial",
    typographyDirection: "sans-led",
    colorDirection: "light",
    imageStrategy: "project-led",
    ctaStrategy: "quote-first",
  },
  plannerVersion: "website-import/v5-2026-10-01",
  generatorVersion: "site-generator/2",
};

const demoSteelUnderstanding = {
  images: [
    { index: 3, url: "https://demo-steel.example/fabrication.jpg", classification: "service", description: "workshop", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 6, confidence: 0.8, reason: "clear" },
    { index: 5, url: "https://demo-steel.example/erection.jpg", classification: "service", description: "site", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 7, confidence: 0.8, reason: "clear" },
    { index: 7, url: "https://demo-steel.example/warehouse-1.jpg", classification: "project", description: "project", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 8, confidence: 0.9, reason: "clear" },
    { index: 9, url: "https://demo-steel.example/structure-hero.jpg", classification: "hero_candidate", description: "structure", relatedService: null, relatedProject: null, quality: "excellent", heroSuitability: 9, confidence: 0.9, reason: "clear" },
  ],
  services: [],
} as unknown as WebsiteUnderstanding;
const demoSteelPreview = {
  sourceUrl: "https://demo-steel.example",
  contact: {},
  logoUrl: "https://demo-steel.example/logo.png",
} as unknown as WebsiteImportPreview;

function selectionsForPlan(): ImportSelections {
  return {
    ...selectionsFromAi(demoSteelPreview, demoSteelUnderstanding, demoSteelPlan),
    acknowledged: true,
  } as ImportSelections;
}

const profile: PreparedBusinessProfile = {
  id: "prepared-design-1",
  version: 1,
  sourceLeadId: "lead-design-1",
  locale: "sq",
  preparedAt: "2026-10-01T00:00:00Z",
  approvedSources: ["https://demo-steel.example"],
  business: { name: "Demo Steel Construction", category: "construction", email: "info@demo-steel.example" },
  services: [{ title: "Fabricim metalik" }, { title: "Montim në kantier" }],
};

describe("design plan v2 survives Analyze → Review → Create → document → renderer", () => {
  const SOURCE_HASH = "a".repeat(64);

  it("carries the plan's design decisions and the source content hash through the review submission", () => {
    const submission = submissionFromSelections("https://demo-steel.example", selectionsForPlan(), demoSteelPlan, SOURCE_HASH);
    expect(submission.templateKey).toBe("forge");
    expect(submission.themeKey).toBe("forge");
    expect(submission.design).toMatchObject({ layoutArchetype: "forge", imageStrategy: "project-led" });
    expect(submission.sourceContentHash).toBe(SOURCE_HASH);
    const validated = validateExistingWebsiteSubmission(submission);
    expect(validated).not.toBeNull();
    expect(validated!.templateKey).toBe("forge");
    expect(validated!.sourceContentHash).toBe(SOURCE_HASH);
    // The plan shape (layoutArchetype) is normalized to the engine input here.
    expect(validated!.design).toMatchObject({ archetype: "forge", ctaStrategy: "quote-first" });
    // A corrupt hash is dropped, not stored.
    const corrupt = validateExistingWebsiteSubmission({ ...submission, sourceContentHash: "not-a-hash" });
    expect(corrupt!.sourceContentHash).toBeUndefined();
  });

  it("persists the source content hash into the stored document's design planner block", () => {
    const submission = validateExistingWebsiteSubmission(
      submissionFromSelections("https://demo-steel.example", selectionsForPlan(), demoSteelPlan, SOURCE_HASH),
    )!;
    const site = generateSiteDocument(profile, submission.templateKey, submission.themeKey as never, {
      design: submission.design,
      sourceContentHash: submission.sourceContentHash,
    });
    expect(site.design).not.toBeNull();
    expect(site.design!.archetype).toBe("forge");
    expect(site.design!.imageStrategy).toBe("project-led");
    expect(site.design!.ctaStrategy).toBe("quote-first");
    expect(site.design!.planner.planSource).toBe("ai");
    expect(site.design!.planner.sourceContentHash).toBe(SOURCE_HASH);
    // Same input hash survives a document round-trip through JSON (the DB shape).
    const stored = JSON.parse(JSON.stringify(site)) as SiteDocument;
    expect(stored.design!.planner.sourceContentHash).toBe(SOURCE_HASH);
  });

  it("renders the stored document through the ds/1 pipeline with the planned composition", () => {
    const submission = validateExistingWebsiteSubmission(
      submissionFromSelections("https://demo-steel.example", selectionsForPlan(), demoSteelPlan),
    )!;
    const site = generateSiteDocument(profile, submission.templateKey, submission.themeKey as never, { design: submission.design });
    applyExistingWebsiteToSite(site, submission);
    const html = renderToStaticMarkup(<SitePreview site={site} privacyHref="/privacy" />);
    expect(html).toContain('data-design-pipeline="ds/1"');
    expect(html).toContain("generated-site-forge");
    expect(html).toContain("Konstruksione metalike");
    // The plan's projects section is accepted by the contract but deferred;
    // the recorded fallback travels with the document, not silently.
    expect(html).toContain("data-design-fallbacks");
    expect(html).toContain("projects");
  });

  it("honors a reordered section order (about before services)", () => {
    const resolved = resolveSiteDesignInput(
      { archetype: "clarity", sectionOrder: ["hero", "about", "services", "gallery", "contact", "appointments", "legal", "footer"] },
      { plannerVersion: "test", generatorVersion: "test", planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    const site = generateSiteDocument(profile, undefined, undefined, { design: resolved.design ?? undefined });
    const html = renderToStaticMarkup(<SitePreview site={site} privacyHref="/privacy" />);
    expect(html.indexOf("clarity-about")).toBeLessThan(html.indexOf("clarity-services"));
  });
});

describe("ds/1 legacy compatibility", () => {
  const legacyDocument: SiteDocument = {
    ...generateSiteDocument(profile),
    design: undefined,
  };

  it("renders documents without a design block through the frozen legacy path", () => {
    const html = renderToStaticMarkup(<SitePreview site={legacyDocument} privacyHref="/privacy" />);
    expect(html).not.toContain("data-design-pipeline");
    expect(html).toContain("generated-site-forge");
  });

  it("still renders the legacy luxury markup for gold documents without a design block", () => {
    const goldDocument: SiteDocument = { ...legacyDocument, themeKey: "gold" };
    const html = renderToStaticMarkup(<SitePreview site={goldDocument} privacyHref="/privacy" />);
    expect(html).toContain("generated-site-luxury");
    expect(html).not.toContain("data-design-pipeline");
  });

  it("renders a theme-gold document WITH a design block as its archetype (de-conflated)", () => {
    const site = generateSiteDocument(profile, undefined, "gold", { design: { archetype: "forge" } });
    expect(site.themeKey).toBe("gold");
    const html = renderToStaticMarkup(<SitePreview site={site} privacyHref="/privacy" />);
    expect(html).toContain("generated-site-forge");
    expect(html).toContain('data-design-theme="gold-noir"');
    expect(html).not.toContain("generated-site-luxury");
  });

  it("fails safe when a stored design block names an unknown archetype", () => {
    const brokenDesign = { ...legacyDocument.design!, archetype: "holographic" } as unknown as SiteDocument["design"];
    const broken = { ...legacyDocument, design: brokenDesign } as SiteDocument;
    const html = renderToStaticMarkup(<SitePreview site={broken} privacyHref="/privacy" />);
    // Unknown archetypes fall back to the frozen legacy path instead of a broken page.
    expect(html).not.toContain("data-design-pipeline");
    expect(html).toContain("generated-site-");
  });

  it("generates valid documents in all six site languages", () => {
    for (const locale of ["en", "de", "fr", "es", "it", "sq"] as const) {
      const site = generateSiteDocument({ ...profile, locale });
      expect(usesDesignPipeline(site.design)).toBe(true);
      const html = renderToStaticMarkup(<SitePreview site={site} privacyHref="/privacy" />);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain('data-design-pipeline="ds/1"');
    }
  });
});
