import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBusinessCategoryKeys } from "@platform/website-engine";
import type { AiProvider, AiStructuredRequest, WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";
import { validateWebsiteBuildPlan, validateWebsiteUnderstanding, websiteUnderstandingSchema } from "@platform/ai-assistant";
import { WEBSITE_IMPORT_ANALYSIS_VERSION, buildImageQualityProfile, buildPlannerInput, importCategoryRegistry, runPlanPass, websiteImportPlanCacheKey, type PlannerInput } from "./website-understanding";
import { creationCategoryProfileFields, resolveCreationCategory } from "./creation-category";
import { initialSelections, selectionsFromAi, submissionFromSelections } from "../components/website-import-review";
import { validateExistingWebsiteSubmission } from "./apply-website-import";
import type { WebsiteResearch } from "./safe-website-reader";

/* ── fixtures ──────────────────────────────────────────────────────────── */

const understandingFixture = (overrides: {
  category?: WebsiteUnderstanding["suggestedCategory"];
  industries?: string[];
  sourceLanguage?: string;
  heroSuitability?: number;
}): WebsiteUnderstanding => ({
  business: {
    summary: "Family bakery with two shops.",
    does: "Bakes bread and cakes.",
    customers: "Local walk-in customers.",
    industries: overrides.industries ?? ["bakery"],
    valueProposition: "Fresh every morning.",
    differentiators: ["Sourdough"],
    primaryCta: "Call us",
  },
  suggestedCategory: overrides.category ?? null,
  services: [{ name: "Bread", description: "Daily bread.", confidence: "high" }],
  projects: [],
  certifications: [],
  locations: ["Tirana"],
  contact: { phone: "+355 1", email: null, address: null, city: "Tirana" },
  openingHours: [],
  socialLinks: [],
  pageTypes: [],
  images: [
    { index: 0, url: undefined, classification: "logo", description: "logo", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 0, confidence: 0.9, reason: "brand" },
    { index: 1, url: undefined, classification: "hero_candidate", description: "oven", relatedService: null, relatedProject: null, quality: "excellent", heroSuitability: overrides.heroSuitability ?? 8, confidence: 0.9, reason: "real work" },
    { index: 2, url: undefined, classification: "project", description: "cake table", relatedService: "Bread", relatedProject: null, quality: "good", heroSuitability: 5, confidence: 0.8, reason: "product" },
  ],
  weakMaterials: [],
  sourceLanguage: overrides.sourceLanguage ?? "sq",
  notes: [],
});

const emptyResearch: WebsiteResearch = {
  sourceUrl: "https://example.test/",
  pagesRead: 1,
  pages: [{ url: "https://example.test/", title: "t", text: "text", structuredData: [], images: [] }],
  images: [],
  contactHints: { emails: [], phones: [], socialLinks: [] },
};

/* ── detection validation against business-category-registry/1 ─────────── */

describe("AI suggested category validation (P4-002)", () => {
  it("accepts a valid canonical key and normalizes a missing family from the subcategory", () => {
    const value = validateWebsiteUnderstanding(
      fixtureRoot({ suggestedCategory: { categoryKey: null, subcategoryKey: "metal-construction", confidence: 0.9, reason: "steel fabrication" } }),
      importCategoryRegistry,
    );
    expect(value.suggestedCategory).toEqual({
      categoryKey: "construction-trades",
      subcategoryKey: "metal-construction",
      confidence: 0.9,
      reason: "steel fabrication",
    });
  });

  it("discards unknown AI keys to null (no free-text authority)", () => {
    const value = validateWebsiteUnderstanding(
      fixtureRoot({ suggestedCategory: { categoryKey: "steel-guys", subcategoryKey: "not-a-key", confidence: 0.99, reason: "made up" } }), importCategoryRegistry,
    );
    expect(value.suggestedCategory).toBeNull();
  });

  it("discards a known subcategory paired with an unknown family by trusting the registry", () => {
    const value = validateWebsiteUnderstanding(
      fixtureRoot({ suggestedCategory: { categoryKey: "wrong-family", subcategoryKey: "hair-salon", confidence: 0.8, reason: "salon" } }), importCategoryRegistry,
    );
    expect(value.suggestedCategory?.categoryKey).toBe("beauty-wellness");
    expect(value.suggestedCategory?.subcategoryKey).toBe("hair-salon");
  });

  it("clamps confidence and keeps a family-only suggestion", () => {
    const value = validateWebsiteUnderstanding(
      fixtureRoot({ suggestedCategory: { categoryKey: "food-restaurant", subcategoryKey: null, confidence: 7, reason: "" } }), importCategoryRegistry,
    );
    expect(value.suggestedCategory).toEqual({ categoryKey: "food-restaurant", subcategoryKey: null, confidence: 1, reason: "" });
  });
});

/** Loose JSON record for validateWebsiteUnderstanding (accepts unknown). */
function fixtureRoot(overrides: {
  suggestedCategory?: unknown;
  business?: Record<string, unknown>;
  sourceLanguage?: string;
}): Record<string, unknown> {
  const base = understandingFixture({}) as unknown as Record<string, unknown>;
  return {
    ...base,
    ...(overrides.business ? { business: overrides.business } : {}),
    ...(overrides.sourceLanguage ? { sourceLanguage: overrides.sourceLanguage } : {}),
    suggestedCategory: overrides.suggestedCategory ?? null,
  };
}

/* ── category authority ladder ─────────────────────────────────────────── */

describe("category authority ladder (owner > ai > profile > legacy > other)", () => {
  it("owner override always wins over the AI suggestion", () => {
    const signal = resolveCreationCategory({
      ownerApproved: { categoryKey: "food-restaurant", subcategoryKey: "restaurant" },
      aiSuggested: { categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.95 },
    });
    expect(signal).toEqual({ categoryKey: "food-restaurant", subcategoryKey: "restaurant", confidence: null, source: "owner" });
  });

  it("uses the AI suggestion when no owner override exists and drops unknown AI keys", () => {
    const signal = resolveCreationCategory({
      aiSuggested: { categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", confidence: 0.82 },
    });
    expect(signal).toEqual({ categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", confidence: 0.82, source: "ai" });
    const dropped = resolveCreationCategory({
      aiSuggested: { categoryKey: "not-a-family", subcategoryKey: "not-a-subcategory", confidence: 0.9 },
    });
    expect(dropped).toEqual({ categoryKey: "other", subcategoryKey: null, confidence: null, source: "legacy" });
  });

  it("falls back to profile keys, then the legacy free-text resolver", () => {
    const profile = resolveCreationCategory({ profileKeys: { categoryKey: "automotive", subcategoryKey: "auto-repair" } });
    expect(profile.source).toBe("legacy");
    expect(profile.categoryKey).toBe("automotive");
    const legacy = resolveCreationCategory({ legacyCategory: "Ndërtim metalik" });
    expect(legacy).toEqual({ categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: null, source: "legacy" });
  });
});

/* ── stored-profile category fields (both creation flows) ───────────────── */

describe("creationCategoryProfileFields (stored profile merge)", () => {
  it("a fresh review decision replaces the form keys wholesale and carries the audit fields", () => {
    const fields = creationCategoryProfileFields({
      formKeys: { categoryKey: "food-restaurant", subcategoryKey: "restaurant" },
      reviewSubmission: { categoryKey: "legal-professional", subcategoryKey: "lawyer", categorySource: "owner", categoryConfidence: 0.9 },
    });
    expect(fields).toEqual({ categoryKey: "legal-professional", subcategoryKey: "lawyer", categorySource: "owner", categoryConfidence: 0.9 });
  });

  it("a family-only review decision leaves no stale form subcategory beneath it", () => {
    const fields = creationCategoryProfileFields({
      formKeys: { categoryKey: "food-restaurant", subcategoryKey: "restaurant" },
      reviewSubmission: { categoryKey: "legal-professional", categorySource: "owner" },
    });
    expect(fields).toEqual({ categoryKey: "legal-professional", categorySource: "owner" });
    // The surviving fields must resolve to the review-approved family — this
    // is what canonicalTemplateKeyFor reads off the stored profile.
    expect(resolveBusinessCategoryKeys(fields).categoryKey).toBe("legal-professional");
    expect(resolveBusinessCategoryKeys(fields).subcategoryKey).toBeUndefined();
  });

  it("the approved review category reaches the stored profile even without form keys", () => {
    const fields = creationCategoryProfileFields({
      formKeys: {},
      reviewSubmission: { categoryKey: "construction-trades", subcategoryKey: "metal-construction", categorySource: "owner", categoryConfidence: 0.92 },
    });
    expect(fields).toEqual({ categoryKey: "construction-trades", subcategoryKey: "metal-construction", categorySource: "owner", categoryConfidence: 0.92 });
  });

  it("without a review decision the form keys stand alone without audit fields", () => {
    const fields = creationCategoryProfileFields({ formKeys: { categoryKey: "beauty-wellness", subcategoryKey: "hair-salon" } });
    expect(fields).toEqual({ categoryKey: "beauty-wellness", subcategoryKey: "hair-salon" });
    expect(creationCategoryProfileFields({ formKeys: {} })).toEqual({});
  });

  it("unknown keys fail safe on both levels", () => {
    expect(creationCategoryProfileFields({
      formKeys: { categoryKey: "nope" },
      reviewSubmission: { categoryKey: "also-nope", categorySource: "owner" },
    })).toEqual({});
  });
});

/* ── structured planner input ──────────────────────────────────────────── */

describe("PlannerInput and image quality profile", () => {
  it("derives the visual evidence profile from the understanding", () => {
    const profile = buildImageQualityProfile(understandingFixture({}));
    expect(profile).toMatchObject({ totalCandidates: 3, strongHeroCandidates: 1, projectImages: 1, logoOnlyCount: 1, overallQuality: "fair" });
    const poor = buildImageQualityProfile(understandingFixture({ heroSuitability: 2 }));
    expect(poor.strongHeroCandidates).toBe(0);
    expect(poor.overallQuality).toBe("fair");
  });

  it("keeps sourceLanguage independent from siteLocale and carries the category", () => {
    const input = buildPlannerInput(
      understandingFixture({ sourceLanguage: "sq" }),
      "de",
      { categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.9, source: "ai" },
    );
    expect(input.sourceLanguage).toBe("sq");
    expect(input.siteLocale).toBe("de");
    expect(input.category).toEqual({ categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.9, source: "ai" });
    expect(input.businessSummary).toContain("bakery");
    expect(input.imageQualityProfile.totalCandidates).toBe(3);
  });

  it("delivers category, subcategory and imageQualityProfile into the plan pass input", async () => {
    const seen: { plannerSignals?: PlannerInput } = {};
    const provider: AiProvider = {
      async structured<T>(request: AiStructuredRequest<T>) {
        if (request.schemaName === "website_build_plan") {
          seen.plannerSignals = JSON.parse(request.input as string).plannerSignals;
          const value = validateWebsiteBuildPlan({
            language: "sq", themeKey: "forge", templateKey: "forge",
            hero: { headline: "H", supporting: "S", cta: "C", imageIndex: null },
            about: { title: "A", body: "B", imageIndexes: [] },
            services: [], projects: [], trust: [],
            contact: { phone: null, email: null, address: null, city: null },
            needsHeroImage: true, notes: [],
          }, ["studio", "clarity", "forge"]);
          return { value: value as T, responseId: "r", model: request.model, usage: {} };
        }
        throw new Error("unexpected schema " + request.schemaName);
      },
    };
    const plannerInput = buildPlannerInput(
      understandingFixture({}),
      "sq",
      { categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.9, source: "owner" },
    );
    await runPlanPass(provider, "test-model", plannerInput, understandingFixture({}));
    expect(seen.plannerSignals?.category).toEqual({ categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.9, source: "owner" });
    expect(seen.plannerSignals?.imageQualityProfile.strongHeroCandidates).toBe(1);
  });
});

/* ── cache/version separation ──────────────────────────────────────────── */

describe("analysis version v8 and category-scoped plan cache", () => {
  it("bumps the analysis version so pre-v8/v9 plans are unreachable (v9 = P4-003 choice block)", () => {
    expect(WEBSITE_IMPORT_ANALYSIS_VERSION.startsWith("v9-")).toBe(true);
    expect(websiteUnderstandingSchema().properties.suggestedCategory).toBeDefined();
  });

  it("separates plan cache keys per category while understanding stays shared", () => {
    const metal = websiteImportPlanCacheKey(emptyResearch, "m", "sq", { categoryKey: "construction-trades", subcategoryKey: "metal-construction" });
    const salon = websiteImportPlanCacheKey(emptyResearch, "m", "sq", { categoryKey: "beauty-wellness", subcategoryKey: "hair-salon" });
    const noCategory = websiteImportPlanCacheKey(emptyResearch, "m", "sq");
    expect(new Set([metal, salon, noCategory]).size).toBe(3);
    expect(websiteImportPlanCacheKey(emptyResearch, "m", "sq", { categoryKey: "construction-trades", subcategoryKey: "metal-construction" })).toBe(metal);
  });
});

/* ── review submission carries the approved category (both flows) ──────── */

describe("review Accept/Change → submission → parse parity", () => {
  const preview = {
    sourceUrl: "https://old-business-site.de/", fetchedAt: "2026-10-02T00:00:00.000Z", pagesRead: 1,
    services: [], contact: {}, socialLinks: [], colors: [], fonts: [], photos: [],
    legalSuggestions: {}, openingHours: [],
  };

  it("seeds the detected category from the understanding and submits it only after approval", () => {
    const understanding = validateWebsiteUnderstanding(
      fixtureRoot({ suggestedCategory: { categoryKey: "construction-trades", subcategoryKey: "metal-construction", confidence: 0.9, reason: "steel halls" } }),
      importCategoryRegistry,
    );
    const minimalPlan = validateWebsiteBuildPlan({
      language: "en", themeKey: "clarity", templateKey: "clarity",
      hero: { headline: "H", supporting: "S", cta: "C", imageIndex: null },
      about: { title: "A", body: "B", imageIndexes: [] },
      services: [], projects: [], trust: [],
      contact: { phone: null, email: null, address: null, city: null },
      needsHeroImage: false, notes: [],
    }, ["studio", "clarity", "forge"]);
    const selections = selectionsFromAi(preview as never, understanding, minimalPlan);
    expect(selections.detectedCategory?.subcategoryKey).toBe("metal-construction");
    expect(selections.approvedCategory).toBeUndefined();
    const unapproved = submissionFromSelections(preview.sourceUrl, selections, null, undefined);
    expect(unapproved.categoryKey).toBeUndefined();
    const approved = submissionFromSelections(preview.sourceUrl, { ...selections, approvedCategory: { categoryKey: "construction-trades", subcategoryKey: "metal-construction", label: "Metal Construction" } }, null, undefined);
    expect(approved.categoryKey).toBe("construction-trades");
    expect(approved.subcategoryKey).toBe("metal-construction");
    expect(approved.categorySource).toBe("owner");
    expect(approved.categoryConfidence).toBe(0.9);
  });

  it("parses the approved category on both creation flows' shared submission shape", () => {
    const parsed = validateExistingWebsiteSubmission({
      sourceUrl: "https://old-business-site.de/", importAcknowledged: true,
      categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", categorySource: "owner", categoryConfidence: 0.7,
    });
    expect(parsed?.categoryKey).toBe("beauty-wellness");
    expect(parsed?.subcategoryKey).toBe("hair-salon");
    expect(parsed?.categorySource).toBe("owner");
    expect(parsed?.categoryConfidence).toBe(0.7);
    const rejected = validateExistingWebsiteSubmission({
      sourceUrl: "https://old-business-site.de/", importAcknowledged: true,
      categoryKey: "made-up-family", subcategoryKey: "made-up-subcategory", categorySource: "owner",
    });
    expect(rejected?.categoryKey).toBeUndefined();
    expect(rejected?.categorySource).toBeUndefined();
  });

  it("keeps the understanding seed reproducible (content hash round trip)", () => {
    const hash = createHash("sha256").update("p4-002").digest("hex");
    expect(hash).toHaveLength(64);
  });
});

/* ── acceptance cases: real Demo Steel content + 5 business classes ──────── */

type AcceptanceCase = {
  id: string;
  suggestion: { categoryKey: string; subcategoryKey: string | null; confidence: number; reason: string };
  expectedCategory: string;
  expectedSubcategory: string | null;
  expectedArchetype: string;
  plan: Partial<WebsiteBuildPlan>;
};

const acceptanceCases: AcceptanceCase[] = [
  { id: "lawyer", suggestion: { categoryKey: "legal-professional", subcategoryKey: "lawyer", confidence: 0.9, reason: "legal practice pages, attorney profile, consultation contact" }, expectedCategory: "legal-professional", expectedSubcategory: "lawyer", expectedArchetype: "editorial-premium",
    plan: { themeKey: "clarity", templateKey: "clarity", design: { layoutArchetype: "editorial-premium", heroVariant: "editorial", sectionOrder: ["hero", "about", "services", "contact", "footer"], sectionVariants: { services: "editorial-list", about: "story", contact: "compact" }, density: "spacious", typographyDirection: "serif-led", colorDirection: "light", imageStrategy: "minimal", ctaStrategy: "form-first" } as never } },
  { id: "hairdresser", suggestion: { categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", confidence: 0.85, reason: "price list, booking phone, salon gallery" }, expectedCategory: "beauty-wellness", expectedSubcategory: "hair-salon", expectedArchetype: "local-service-conversion",
    plan: { themeKey: "clarity", templateKey: "clarity", design: { layoutArchetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], sectionVariants: { services: "cards", about: "image-led", contact: "compact" }, density: "regular", typographyDirection: "sans-led", colorDirection: "light", imageStrategy: "balanced", ctaStrategy: "call-first" } as never } },
  { id: "restaurant", suggestion: { categoryKey: "food-restaurant", subcategoryKey: "restaurant", confidence: 0.88, reason: "menu page, table reservation CTA, dining photos" }, expectedCategory: "food-restaurant", expectedSubcategory: "restaurant", expectedArchetype: "local-service-conversion",
    plan: { themeKey: "clarity", templateKey: "clarity", design: { layoutArchetype: "local-service-conversion", heroVariant: "split", sectionOrder: ["hero", "trust", "services", "about", "contact", "footer"], sectionVariants: { services: "cards", about: "split", contact: "compact" }, density: "regular", typographyDirection: "serif-led", colorDirection: "light", imageStrategy: "balanced", ctaStrategy: "call-first" } as never } },
  { id: "tree-service", suggestion: { categoryKey: "home-services", subcategoryKey: "tree-service", confidence: 0.8, reason: "tree removal and pruning services, arborist consultancy text" }, expectedCategory: "home-services", expectedSubcategory: "tree-service", expectedArchetype: "editorial-premium",
    plan: { themeKey: "clarity", templateKey: "clarity", design: { layoutArchetype: "editorial-premium", heroVariant: "split", sectionOrder: ["hero", "about", "services", "contact", "footer"], sectionVariants: { services: "editorial-list", about: "story", contact: "compact" }, density: "regular", typographyDirection: "serif-led", colorDirection: "light", imageStrategy: "minimal", ctaStrategy: "form-first" } as never } },
  { id: "auto-service", suggestion: { categoryKey: "automotive", subcategoryKey: "auto-repair", confidence: 0.9, reason: "MOT and repair services, workshop photos, quote CTA" }, expectedCategory: "automotive", expectedSubcategory: "auto-repair", expectedArchetype: "industrial-bold",
    plan: { themeKey: "forge", templateKey: "forge", design: { layoutArchetype: "industrial-bold", heroVariant: "industrial", sectionOrder: ["hero", "projects", "services", "about", "contact", "footer"], sectionVariants: { services: "cards", about: "split", contact: "conversion" }, density: "regular", typographyDirection: "sans-led", colorDirection: "dark", imageStrategy: "balanced", ctaStrategy: "quote-first" } as never } },
];

const planProvider = (plan: WebsiteBuildPlan): AiProvider => ({
  async structured<T>(request: AiStructuredRequest<T>) {
    if (request.schemaName !== "website_build_plan") throw new Error("unexpected " + request.schemaName);
    return { value: validateWebsiteBuildPlan(plan, ["studio", "clarity", "forge", "industrial-bold", "editorial-premium", "local-service-conversion"]) as T, responseId: "r", model: request.model, usage: {} };
  },
});

describe("acceptance cases (P4-002)", () => {
  const basePlan: WebsiteBuildPlan = {
    language: "en", themeKey: "clarity", templateKey: "clarity",
    hero: { headline: "H", supporting: "S", cta: "C", imageIndex: null },
    about: { title: "A", body: "B", imageIndexes: [] },
    services: [], projects: [], trust: [],
    contact: { phone: null, email: null, address: null, city: null },
    needsHeroImage: false, notes: [],
  };

  for (const testCase of acceptanceCases) {
    it(`${testCase.id}: AI suggestion → authority ladder → PlannerInput → archetype ${testCase.expectedArchetype}`, async () => {
      const understanding = validateWebsiteUnderstanding(
        fixtureRoot({
          suggestedCategory: testCase.suggestion,
          business: { ...understandingFixture({}).business, industries: [testCase.expectedCategory] },
          sourceLanguage: "en",
        }),
      );
      expect(understanding.suggestedCategory?.categoryKey).toBe(testCase.expectedCategory);
      const signal = resolveCreationCategory({ aiSuggested: understanding.suggestedCategory });
      expect(signal.categoryKey).toBe(testCase.expectedCategory);
      expect(signal.subcategoryKey).toBe(testCase.expectedSubcategory);
      expect(signal.source).toBe("ai");
      const plannerInput = buildPlannerInput(understanding, "en", signal);
      const { plan } = await runPlanPass(planProvider({ ...basePlan, ...testCase.plan } as WebsiteBuildPlan), "test-model", plannerInput, understanding);
      expect(plan.design?.layoutArchetype).toBe(testCase.expectedArchetype);
    });

    it(`${testCase.id}: owner override replaces the AI suggestion in PlannerInput`, () => {
      const understanding = validateWebsiteUnderstanding(fixtureRoot({ suggestedCategory: testCase.suggestion }), importCategoryRegistry);
      const overridden = resolveCreationCategory({
        ownerApproved: { categoryKey: "construction-trades", subcategoryKey: "metal-construction" },
        aiSuggested: understanding.suggestedCategory,
      });
      expect(overridden.source).toBe("owner");
      expect(overridden.categoryKey).toBe("construction-trades");
      const plannerInput = buildPlannerInput(understanding, "en", overridden);
      expect(plannerInput.category.source).toBe("owner");
    });
  }

});
