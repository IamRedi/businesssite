import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validateWebsiteBuildPlan, type WebsiteBuildPlan, type WebsiteUnderstanding } from "@platform/ai-assistant";
import { layoutArchetypeIds } from "@platform/website-engine";
import { chosenDesignInput, planDesignOptions } from "./website-understanding";
import { initialSelections, selectionsFromAi, submissionFromSelections } from "../components/website-import-review";
import { validateExistingWebsiteSubmission } from "./apply-website-import";
import { DesignMiniPreview } from "../components/design-mini-preview";
import { generateSiteDocument, type PreparedBusinessProfile, type SupportedLocale } from "@platform/website-engine";

/* ── fixtures ──────────────────────────────────────────────────────────── */

const alternative = (overrides: Partial<NonNullable<WebsiteBuildPlan["alternatives"]>[number]> = {}): NonNullable<WebsiteBuildPlan["alternatives"]>[number] => ({
  archetype: "editorial-premium",
  heroVariant: "editorial",
  sectionVariants: { services: "editorial-list", about: "story", contact: "compact" },
  sectionOrder: ["hero", "about", "services", "contact", "footer"],
  themeId: "clarity",
  typographyDirection: "serif-led",
  imageStrategy: "minimal",
  ctaStrategy: "form-first",
  reason: "Calmer typography-led narrative for advisory content.",
  ...overrides,
});

const planFixture = (overrides: {
  alternatives?: WebsiteBuildPlan["alternatives"];
  archetypeConfidence?: number;
  selectionReason?: string;
  language?: SupportedLocale;
  archetype?: string;
}): WebsiteBuildPlan => validateWebsiteBuildPlan({
  language: overrides.language ?? "en",
  themeKey: "forge",
  templateKey: "forge",
  hero: { headline: "Steel structures, end to end", supporting: "Fabrication and assembly.", cta: "Get a quote", imageIndex: 2 },
  about: { title: "About Demo Steel", body: "Family company.", imageIndexes: [3] },
  services: [
    { title: "Fabrication", description: "Steel fabrication.", imageIndex: 4 },
    { title: "Assembly", description: "On-site assembly.", imageIndex: 5 },
  ],
  projects: [{ name: "Logistics hall", summary: "2,400 m2 hall.", imageIndexes: [6, 7] }],
  trust: ["ISO 9001:2015"],
  contact: { phone: "+355 69 000 0000", email: "info@demo-steel.example", address: null, city: "Tirana" },
  needsHeroImage: false,
  notes: [],
  design: {
    layoutArchetype: overrides.archetype ?? "industrial-bold",
    heroVariant: "industrial",
    sectionOrder: ["hero", "projects", "services", "about", "contact", "footer"],
    sectionVariants: { services: "alternating", about: "split", contact: "conversion" },
    density: "regular",
    typographyDirection: "sans-led",
    colorDirection: "dark",
    imageStrategy: "project-led",
    ctaStrategy: "quote-first",
  },
  archetypeConfidence: overrides.archetypeConfidence ?? 0.9,
  selectionReason: overrides.selectionReason ?? "Strong project imagery with inquiry CTA supports a bold project-led composition.",
  alternatives: overrides.alternatives,
}, ["studio", "clarity", "forge", "industrial-bold", "editorial-premium", "local-service-conversion"]);

const understandingFixture = (): WebsiteUnderstanding => ({
  business: {
    summary: "Albanian metal construction company.",
    does: "Fabricates and erects steel structures.",
    customers: "Industrial and public clients.",
    industries: ["Konstruksione metalike"],
    valueProposition: "End-to-end steel construction.",
    differentiators: ["Euro-Code compliance"],
    primaryCta: "Kontaktoni për një ofertë",
  },
  suggestedCategory: { categoryKey: "manufacturing-industrial", subcategoryKey: "steel-fabrication", confidence: 0.99, reason: "Steel fabrication." },
  services: [{ name: "Fabrication", description: "Steel fabrication.", confidence: "high" }],
  projects: [],
  certifications: ["ISO 9001:2015"],
  locations: ["Tirana"],
  contact: { phone: "+355 69 000 0000", email: "info@demo-steel.example", address: null, city: "Tirana" },
  openingHours: [],
  socialLinks: [],
  pageTypes: [],
  images: [2, 4, 5, 6, 7].map((index) => ({
    index,
    url: `https://demo-steel.example/photo-${index}.jpg`,
    classification: index === 2 ? "hero_candidate" : "project",
    description: "Steel work",
    relatedService: null,
    relatedProject: null,
    quality: "good" as const,
    heroSuitability: 8,
    confidence: 0.9,
    reason: "real work",
  })),
  weakMaterials: [],
  sourceLanguage: "shqip",
  notes: [],
});

const previewFixture = () => ({
  sourceUrl: "https://demo-steel.example/",
  fetchedAt: "2026-10-02T00:00:00.000Z",
  pagesRead: 4,
  businessName: "Demo Steel Construction",
  services: ["Fabrication", "Assembly"],
  contact: { phone: "+355 69 000 0000", email: "info@demo-steel.example", address: null, city: "Tirana" },
  socialLinks: [],
  colors: [],
  fonts: [],
  photos: [2, 4, 5, 6, 7].map((index) => ({ url: `https://demo-steel.example/photo-${index}.jpg`, alt: "steel" })),
  legalSuggestions: {},
  openingHours: [],
});

const selectionsFor = (plan: WebsiteBuildPlan) => selectionsFromAi(previewFixture() as never, understandingFixture(), plan);

/** Mirrors the creation routes' generate call; the routes take the site
 * locale from the creation form, so the caller supplies it here. */
const documentFor = (submission: Record<string, unknown>, decidedAt: string, locale: SupportedLocale = "en") => {
  const profile: PreparedBusinessProfile = {
    id: "prepared-test-v1",
    version: 1,
    sourceLeadId: "lead-test",
    locale,
    preparedAt: decidedAt,
    approvedSources: [],
    business: { name: "Demo Steel Construction", category: "Steel fabrication" },
    services: [],
  };
  const parsed = validateExistingWebsiteSubmission(submission)!;
  return generateSiteDocument(
    profile,
    parsed.templateKey,
    (parsed.themeKey ?? undefined) as never,
    {
      ...(parsed.design ? { design: parsed.design } : {}),
      ...(parsed.sourceContentHash ? { sourceContentHash: parsed.sourceContentHash } : {}),
      ...(parsed.designSource ? { designSource: parsed.designSource } : {}),
      ...(parsed.selectionReason ? { selectionReason: parsed.selectionReason } : {}),
      ...(parsed.archetypeConfidence !== undefined ? { archetypeConfidence: parsed.archetypeConfidence } : {}),
      decidedAt,
    },
  );
};

const submitWithChoice = (plan: WebsiteBuildPlan, designChoice: { optionIndex: number } | null) =>
  submissionFromSelections("https://demo-steel.example/", { ...selectionsFor(plan), acknowledged: true, designChoice }, plan, "a".repeat(64));

/* ── plan choice block validation ──────────────────────────────────────── */

describe("plan choice block validation (P4-003)", () => {
  it("keeps two distinct alternatives with clamped confidence and bounded reasons", () => {
    const plan = planFixture({
      archetypeConfidence: 7,
      alternatives: [
        alternative(),
        alternative({
          archetype: "local-service-conversion",
          heroVariant: "centered",
          sectionOrder: ["hero", "trust", "services", "contact", "footer"],
          imageStrategy: "balanced",
          ctaStrategy: "call-first",
          reason: "Faster contact path for trade clients.",
        }),
      ],
    });
    expect(plan.archetypeConfidence).toBe(1);
    expect(plan.selectionReason).toContain("project-led");
    expect(plan.alternatives).toHaveLength(2);
    expect(plan.alternatives![0].archetype).toBe("editorial-premium");
    expect(plan.alternatives![1].archetype).toBe("local-service-conversion");
  });

  it("drops near-identical fillers and entries without an archetype", () => {
    const plan = planFixture({
      alternatives: [
        // Near-identical to the recommended design (same archetype/hero/order/image/cta).
        alternative({ archetype: "industrial-bold", heroVariant: "industrial", sectionOrder: ["hero", "projects", "services", "about", "contact", "footer"], imageStrategy: "project-led", ctaStrategy: "quote-first" }),
        alternative(), // distinct
        alternative(), // exact duplicate of the previous — dropped
        { ...alternative({ archetype: "", reason: "no archetype" }) }, // dropped
      ],
    });
    expect(plan.alternatives).toHaveLength(1);
    expect(plan.alternatives![0].archetype).toBe("editorial-premium");
    // Distinct entries within the input bound all survive.
    const withRoom = planFixture({
      alternatives: [
        alternative(),
        { ...alternative({ archetype: "", reason: "no archetype" }) },
        alternative({ archetype: "clarity", heroVariant: "centered", sectionOrder: ["hero", "services", "about", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "form-first", reason: "Legacy clarity." }),
      ],
    });
    expect(withRoom.alternatives!.map((entry) => entry.archetype)).toEqual(["editorial-premium", "clarity"]);
  });

  it("accepts plans without a choice block (pre-P4-003 payloads stay valid)", () => {
    const raw = JSON.parse(JSON.stringify(planFixture({})));
    delete raw.archetypeConfidence;
    delete raw.selectionReason;
    delete raw.alternatives;
    const plan = validateWebsiteBuildPlan(raw, ["studio", "clarity", "forge", "industrial-bold", "editorial-premium", "local-service-conversion"]);
    expect(plan.alternatives).toBeUndefined();
    expect(plan.archetypeConfidence).toBeUndefined();
    expect(plan.selectionReason).toBeUndefined();
  });
});

/* ── design options + authority ────────────────────────────────────────── */

describe("planDesignOptions and chosenDesignInput (P4-003)", () => {
  const plan = planFixture({ alternatives: [alternative(), alternative({ archetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "call-first", reason: "Booking path." })] });

  it("offers the recommendation first with its selection reason", () => {
    const options = planDesignOptions(plan);
    expect(options[0]).toMatchObject({ index: 0, kind: "recommended" });
    expect(options[0].design.archetype).toBe("industrial-bold");
    expect(options[0].reason).toContain("project imagery");
  });

  it("drops alternatives whose archetype is not a live renderer id", () => {
    const hostile = planFixture({
      alternatives: [
        alternative({ archetype: "steel-guys-9000" }),
        alternative({ archetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "call-first", reason: "Booking path." }),
      ],
    });
    const options = planDesignOptions(hostile);
    expect(options.map((option) => option.design.archetype)).toEqual(["industrial-bold", "local-service-conversion"]);
    // Unknown theme ids never travel: the engine falls back to the archetype default.
    const unknownTheme = planFixture({ alternatives: [alternative({ themeId: "gold-plated" })] });
    expect(planDesignOptions(unknownTheme)[1].design.themeId).toBeUndefined();
  });

  it("an untouched choice keeps the AI recommendation as authority level ai", () => {
    const chosen = chosenDesignInput(plan, null);
    expect(chosen.designSource).toBe("ai");
    expect(chosen.design?.layoutArchetype).toBe("industrial-bold");
    expect(chosen.selectionReason).toContain("project imagery");
  });

  it("an explicit pick — even of the recommendation — is an owner decision", () => {
    const keepRecommended = chosenDesignInput(plan, { optionIndex: 0 });
    expect(keepRecommended.designSource).toBe("owner");
    expect(keepRecommended.design?.layoutArchetype).toBe("industrial-bold");
    const switchAlternative = chosenDesignInput(plan, { optionIndex: 1 });
    expect(switchAlternative.designSource).toBe("owner");
    expect(switchAlternative.design?.archetype).toBe("editorial-premium");
    expect(switchAlternative.selectionReason).toContain("Calmer typography-led");
  });
});

/* ── end-to-end: choice survives review → submission → document ────────── */

describe("design choice persistence (P4-003)", () => {
  const plan = planFixture({ alternatives: [alternative(), alternative({ archetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "call-first", reason: "Booking path." })] });
  const decidedAt = "2026-10-02T12:00:00.000Z";

  it("an untouched choice stores designSource ai with the recommendation", () => {
    const document = documentFor(submitWithChoice(plan, null), decidedAt);
    expect(document.design?.archetype).toBe("industrial-bold");
    expect(document.design?.planner.designSource).toBe("ai");
    expect(document.design?.planner.selectionReason).toContain("project imagery");
    expect(document.design?.planner.archetypeConfidence).toBe(0.9);
  });

  it("the owner's alternative survives Create with the evidence trail", () => {
    const document = documentFor(submitWithChoice(plan, { optionIndex: 1 }), decidedAt);
    expect(document.design?.archetype).toBe("editorial-premium");
    expect(document.design?.heroVariant).toBe("editorial");
    expect(document.design?.typographyDirection).toBe("serif-led");
    expect(document.design?.planner.designSource).toBe("owner");
    expect(document.design?.planner.selectionReason).toContain("Calmer typography-led");
    expect(document.design?.planner.archetypeConfidence).toBe(0.9);
  });

  it("switching designs changes only the design — content, facts and locale are identical", () => {
    const documents = [null, { optionIndex: 0 }, { optionIndex: 1 }, { optionIndex: 2 }].map((choice) => {
      const document = documentFor(submitWithChoice(plan, choice), decidedAt);
      const { design: _design, generatedAt: _generatedAt, ...rest } = document;
      void _design;
      void _generatedAt;
      return rest;
    });
    for (const document of documents.slice(1)) {
      expect(JSON.stringify(document)).toBe(JSON.stringify(documents[0]));
    }
    expect(documents[0].content.heroTitle).toBe(documents[2].content.heroTitle);
    expect(documents[0].services).toEqual(documents[2].services);
    expect(documents[0].projects).toEqual(documents[2].projects);
    expect(documents[0].trust).toEqual(documents[2].trust);
  });

  it("an unsupported archetype never enters the document (fail-safe legacy path)", () => {
    const submission = submitWithChoice(plan, null);
    // The review wire format carries both keys (plan.design.layoutArchetype +
    // normalized archetype); a bogus id must be rejected through either path.
    submission.design = { ...submission.design as Record<string, unknown>, layoutArchetype: "made-up-steel", archetype: "made-up-steel" };
    const document = documentFor(submission, decidedAt);
    // resolveSiteDesignInput drops unknown archetypes to null → the document
    // carries NO design block and renders the frozen legacy path.
    expect(document.design).toBeUndefined();
    expect(layoutArchetypeIds).toContain("industrial-bold"); // sanity: the valid choice space is intact
  });

  it("keeps the choice across all six site locales without touching the copy", () => {
    for (const locale of ["en", "de", "fr", "es", "it", "sq"] as SupportedLocale[]) {
      const localizedPlan = planFixture({
        language: locale,
        alternatives: [
          alternative(),
          alternative({ archetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "call-first", reason: "Booking path." }),
        ],
      });
      const baseline = documentFor(submitWithChoice(localizedPlan, null), decidedAt, locale);
      const switched = documentFor(submitWithChoice(localizedPlan, { optionIndex: 1 }), decidedAt, locale);
      expect(switched.locale).toBe(locale);
      expect(baseline.locale).toBe(locale);
      expect(baseline.content.heroTitle).toBe(switched.content.heroTitle);
      expect(baseline.services).toEqual(switched.services);
      expect(switched.design?.archetype).toBe("editorial-premium");
      expect(switched.design?.planner.designSource).toBe("owner");
    }
  });

  it("both creation flows parse the choice identically (Owner + homepage parity)", () => {
    const submission = submitWithChoice(plan, { optionIndex: 1 });
    const throughJson = validateExistingWebsiteSubmission(JSON.parse(JSON.stringify(submission)));
    expect(throughJson?.designSource).toBe("owner");
    expect(throughJson?.selectionReason).toContain("Calmer typography-led");
    expect(throughJson?.archetypeConfidence).toBe(0.9);
    expect(throughJson?.design).toMatchObject({ archetype: "editorial-premium" });
    // Without a design block the authority fields never travel alone.
    const bare = validateExistingWebsiteSubmission({ sourceUrl: "https://demo-steel.example/", importAcknowledged: true, designSource: "owner" });
    expect(bare?.designSource).toBeUndefined();
  });

  it("deterministic creations carry no designSource (legacy behaviour unchanged)", () => {
    const document = generateSiteDocument(
      { id: "p", version: 1, sourceLeadId: "l", locale: "en", preparedAt: decidedAt, approvedSources: [], business: { name: "Legacy Business", category: "Other" }, services: [] },
      undefined,
      undefined,
      { decidedAt },
    );
    expect(document.design?.planner.designSource).toBeUndefined();
  });
});

/* ── mini preview renders through the real renderer ────────────────────── */

describe("DesignMiniPreview uses the real post-Create renderer (P4-003)", () => {
  it("renders the ds/1 pipeline markup for each option design", () => {
    const plan = planFixture({ alternatives: [alternative(), alternative({ archetype: "local-service-conversion", heroVariant: "centered", sectionOrder: ["hero", "trust", "services", "contact", "footer"], imageStrategy: "balanced", ctaStrategy: "call-first", reason: "Booking path." })] });
    const selections = { ...selectionsFor(plan), acknowledged: true, designChoice: null };
    const submission = submissionFromSelections("https://demo-steel.example/", selections, plan) as never;
    for (const option of planDesignOptions(plan)) {
      const html = renderToStaticMarkup(
        <DesignMiniPreview businessName="Demo Steel Construction" locale="en" submission={submission} design={option.design as Record<string, unknown>} />,
      );
      expect(html).toContain('data-design-pipeline="ds/1"');
      expect(html).toContain(`generated-site-${option.design.archetype}`);
      expect(html).toContain("Steel structures, end to end"); // the reviewed plan copy, unmodified
    }
  });

  it("starts from the deterministic selections when no plan exists", () => {
    const html = renderToStaticMarkup(
      <DesignMiniPreview
        businessName="Preview"
        locale="en"
        submission={{ sourceUrl: "https://demo-steel.example/", importAcknowledged: true, services: [{ title: "Fabrication" }] } as never}
        design={{ archetype: "industrial-bold" }}
      />,
    );
    expect(html).toContain("generated-site-industrial-bold");
  });
});

/* ── review state machine ──────────────────────────────────────────────── */

describe("review selections carry the design choice (P4-003)", () => {
  it("selectionsFromAi starts untouched; a pick records the option index", () => {
    const plan = planFixture({ alternatives: [alternative()] });
    expect(selectionsFor(plan).designChoice).toBeNull();
    expect(initialSelections(previewFixture() as never).designChoice).toBeUndefined();
  });
});
