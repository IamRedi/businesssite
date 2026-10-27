import { describe, expect, it } from "vitest";
import {
  DESIGN_SYSTEM_VERSION,
  SITE_GENERATOR_VERSION,
  SITE_PLANNER_VERSION,
  archetypeContracts,
  deriveDeterministicDesign,
  generateSiteDocument,
  resolveSiteDesignInput,
  themeIdFromThemeKey,
  usesDesignPipeline,
  type PreparedBusinessProfile,
} from "../src/index";

const profile: PreparedBusinessProfile = {
  id: "profile-design-1",
  version: 1,
  sourceLeadId: "lead-design-1",
  locale: "sq",
  preparedAt: "2026-10-01T00:00:00Z",
  approvedSources: ["https://nordfeld-stahlbau.example"],
  business: {
    name: "Nordfeld Stahlbau GmbH",
    category: "construction",
    email: "info@nordfeld-stahlbau.example",
  },
  services: [{ title: "Metal structures" }],
};

describe("ds/1 design system", () => {
  it("keeps the frozen v1 archetypes in the registry with their canonical order", () => {
    for (const archetype of ["studio", "clarity", "forge"] as const) {
      const contract = archetypeContracts[archetype];
      expect(contract.defaultSectionOrder[0]).toBe("hero");
      expect(contract.renderableSections).toContain("contact");
      expect(contract.renderableSections).not.toContain("projects");
    }
  });

  it("never lets a theme select a composition (gold de-conflation)", () => {
    expect(themeIdFromThemeKey("gold", "forge")).toBe("gold-noir");
    expect(themeIdFromThemeKey("studio", "forge")).toBe("studio");
    expect(themeIdFromThemeKey("auto", "forge")).toBe("forge");
  });

  it("resolves valid planner decisions verbatim", () => {
    const { design, fallbacks } = resolveSiteDesignInput(
      {
        archetype: "forge",
        themeId: "gold-noir",
        heroVariant: "split",
        sectionOrder: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
        sectionVariants: { services: "cards", about: "split", contact: "split" },
        density: "spacious",
        visualStyle: "industrial",
        typographyDirection: "sans-led",
        colorDirection: "dark",
        imageStrategy: "project-led",
        ctaStrategy: "quote-first",
      },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(design).not.toBeNull();
    expect(design!.archetype).toBe("forge");
    expect(design!.themeId).toBe("gold-noir");
    expect(design!.density).toBe("spacious");
    expect(design!.designSystemVersion).toBe(DESIGN_SYSTEM_VERSION);
    expect(fallbacks).toEqual([]);
  });

  it("fails safe on an unknown archetype: legacy path, design dropped", () => {
    const { design, fallbacks } = resolveSiteDesignInput(
      { archetype: "holographic-neon" },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(design).toBeNull();
    expect(fallbacks[0]).toContain("holographic-neon");
    expect(fallbacks[0]).toContain("legacy path");
  });

  it("falls back to the archetype default for unknown variant ids and records it", () => {
    const { design } = resolveSiteDesignInput(
      { archetype: "forge", heroVariant: "cinematic-panorama", sectionVariants: { services: "hologrid" } },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(design!.heroVariant).toBe("split");
    expect(design!.sectionVariants.services).toBe("cards");
    expect(design!.planner.fallbacks.some((line) => line.includes("heroVariant"))).toBe(true);
    expect(design!.planner.fallbacks.some((line) => line.includes("services.variant"))).toBe(true);
  });

  it("records accepted-but-unimplemented variant choices as fallbacks", () => {
    const { design } = resolveSiteDesignInput(
      { archetype: "forge", heroVariant: "editorial", sectionVariants: { services: "list", about: "split", contact: "split" } },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(design!.heroVariant).toBe("editorial");
    expect(design!.sectionVariants.services).toBe("list");
    expect(design!.planner.fallbacks.some((line) => line.includes("heroVariant") && line.includes("not implemented") && line.includes('rendered "split"'))).toBe(true);
    expect(design!.planner.fallbacks.some((line) => line.includes("services.variant") && line.includes('rendered "cards"'))).toBe(true);
    // Implemented defaults produce no noise.
    const quiet = resolveSiteDesignInput(
      { archetype: "forge", sectionVariants: { services: "cards", about: "split", contact: "split" } },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(quiet.fallbacks).toEqual([]);
  });

  it("normalizes section order: dedupe, unknown skip, missing append, hero first", () => {
    const { design } = resolveSiteDesignInput(
      {
        archetype: "clarity",
        sectionOrder: ["projects", "contact", "hero", "contact", "mystery-band", "services"],
      },
      { plannerVersion: SITE_PLANNER_VERSION, generatorVersion: SITE_GENERATOR_VERSION, planSource: "ai", decidedAt: "2026-10-01T00:00:00Z" },
    );
    expect(design!.sectionOrder[0]).toBe("hero");
    expect(design!.sectionOrder).toContain("about");
    expect(design!.sectionOrder.filter((section) => section === "contact")).toHaveLength(1);
    expect(design!.sectionOrder).not.toContain("mystery-band");
    expect(design!.planner.fallbacks.some((line) => line.includes("mystery-band"))).toBe(true);
    expect(design!.planner.fallbacks.some((line) => line.includes("projects") && line.includes("not renderable"))).toBe(true);
  });

  it("derives the same deterministic design for the same inputs", () => {
    const first = deriveDeterministicDesign({ archetype: "forge", themeKey: "auto", decidedAt: "2026-10-01T00:00:00Z" });
    const second = deriveDeterministicDesign({ archetype: "forge", themeKey: "auto", decidedAt: "2026-10-01T00:00:00Z" });
    expect(first).toEqual(second);
    expect(first.design!.planner.planSource).toBe("deterministic");
  });

  it("stamps a design block on every generated document and keeps the mirror consistent", () => {
    const site = generateSiteDocument(profile);
    expect(usesDesignPipeline(site.design)).toBe(true);
    expect(site.design!.designSystemVersion).toBe("ds/1");
    expect(site.design!.planner.planSource).toBe("deterministic");
    expect(site.design!.planner.generatorVersion).toBe(SITE_GENERATOR_VERSION);
    // Mirror keeps the legacy layout; the design block names the composition.
    expect(site.design!.archetype).toBe("industrial-bold");
    expect(site.template).toBe("forge");
    expect(site.design!.themeId).toBe("forge");
  });

  it("applies explicit plan design decisions and de-conflates gold from composition", () => {
    const site = generateSiteDocument(profile, undefined, "gold", {
      design: { archetype: "forge", heroVariant: "split", imageStrategy: "project-led", ctaStrategy: "quote-first" },
    });
    expect(site.design).not.toBeNull();
    expect(site.design!.archetype).toBe("forge");
    // Theme metadata follows the resolved themeKey consistently on the AI
    // path too (BSRC-DESIGN-FOUNDATION-002 review finding 4).
    expect(site.design!.themeId).toBe("gold-noir");
    expect(site.design!.planner.planSource).toBe("ai");
    expect(site.template).toBe("forge");
    // The mirror keeps the requested theme key, but the document renders
    // through the design pipeline: gold can never summon the legacy luxury
    // markup for a document that carries a design block.
    expect(site.themeKey).toBe("gold");
    expect(usesDesignPipeline(site.design)).toBe(true);
  });

  it("keeps explicit theme/composition pairing for documents without plan design", () => {
    const site = generateSiteDocument(profile, undefined, "studio");
    // P3: the deterministic archetype follows the business family while the
    // mirror keeps the legacy theme/composition pairing.
    expect(site.design!.archetype).toBe("industrial-bold");
    expect(site.template).toBe("studio");
    expect(site.themeKey).toBe("studio");
  });
});
