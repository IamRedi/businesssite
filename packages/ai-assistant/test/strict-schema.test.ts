import { describe, expect, it } from "vitest";
import { validateWebsiteBuildPlan, websiteBuildPlanSchema, websiteUnderstandingSchema } from "../src/website-understanding";
import { textRewriteSchema } from "../src/index";

/**
 * OpenAI strict structured output (strict: true) rejects any schema where an
 * object with `properties` does not declare `required` containing EVERY key
 * of `properties` (optional fields are expressed as nullable types instead).
 * The 2026-10-02 production outage (import engine=deterministic for every
 * URL) was exactly this violation. This walker pins every schema we send to
 * the provider so the failure class cannot return silently.
 */
function assertStrictCompliant(schema: unknown, path: string) {
  if (!schema || typeof schema !== "object") return;
  const node = schema as Record<string, unknown>;
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertStrictCompliant(item, `${path}[${index}]`));
    return;
  }
  if (node.properties && typeof node.properties === "object") {
    const keys = Object.keys(node.properties as Record<string, unknown>);
    expect(node.additionalProperties, `${path}.additionalProperties`).toBe(false);
    const required = node.required as unknown;
    expect(Array.isArray(required), `${path}.required must be an array`).toBe(true);
    for (const key of keys) {
      expect(required as string[], `${path}.required must include "${key}"`).toContain(key);
      assertStrictCompliant((node.properties as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
  if (node.items) assertStrictCompliant(node.items, `${path}.items`);
  for (const [key, value] of Object.entries(node)) {
    if (["properties", "items"].includes(key)) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      assertStrictCompliant(value, `${path}.${key}`);
    }
  }
}

describe("provider strict-schema compliance", () => {
  it("keeps the website understanding schema strict-valid at every object level", () => {
    assertStrictCompliant(websiteUnderstandingSchema(), "website_understanding");
  });

  it("keeps the registry-parameterized understanding schema strict-valid (P4-002)", () => {
    const registry = {
      familyKeys: ["construction-trades", "automotive"],
      subcategoryKeys: ["metal-construction", "auto-repair"],
      familyOfSubcategory: (key: string) => (key === "metal-construction" ? "construction-trades" : "automotive"),
    };
    const schema = websiteUnderstandingSchema(registry) as { properties: Record<string, unknown> };
    assertStrictCompliant(schema, "website_understanding");
    const suggested = schema.properties.suggestedCategory as {
      properties: { categoryKey: { enum?: string[] }; subcategoryKey: { enum?: string[] } };
    };
    expect(suggested.properties.categoryKey.enum).toEqual([null, "construction-trades", "automotive"]);
    expect(suggested.properties.subcategoryKey.enum).toEqual([null, "metal-construction", "auto-repair"]);
  });

  it("rejects the P3 regression class: any object property missing from required", () => {
    const broken = websiteUnderstandingSchema() as { properties: Record<string, unknown> };
    // Simulate the exact foundation-deployment mistake on the new block and
    // assert the walker catches it.
    const suggested = { ...(broken.properties.suggestedCategory as Record<string, unknown>) };
    suggested.required = ["categoryKey"];
    const violation = { ...broken, properties: { ...broken.properties, suggestedCategory: suggested } };
    expect(() => assertStrictCompliant(violation, "website_understanding")).toThrow();
  });

  it("pins the P4-003 plan choice block as strict (P4-003)", () => {
    const schema = websiteBuildPlanSchema("en", ["studio", "clarity", "forge"]) as unknown as { properties: Record<string, unknown>; required: string[] };
    expect(schema.required).toContain("archetypeConfidence");
    expect(schema.required).toContain("selectionReason");
    expect(schema.required).toContain("alternatives");
    expect(schema.properties.archetypeConfidence).toMatchObject({ type: ["number", "null"] });
    const alternatives = schema.properties.alternatives as { type: string[]; items: Record<string, unknown> };
    expect(alternatives.type).toEqual(["array", "null"]);
    const item = alternatives.items as { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean };
    expect(item.additionalProperties).toBe(false);
    for (const key of ["archetype", "heroVariant", "sectionVariants", "sectionOrder", "themeId", "typographyDirection", "imageStrategy", "ctaStrategy", "reason"]) {
      expect(item.required).toContain(key);
      expect(item.properties[key]).toBeDefined();
    }
    const variants = item.properties.sectionVariants as { required: string[] };
    expect(variants.required).toEqual(["services", "projects", "about", "contact"]);
  });

  it("rejects the regression class on the alternatives block (P4-003)", () => {
    const broken = websiteBuildPlanSchema("en", ["studio"]) as { properties: Record<string, unknown> };
    const alternatives = { ...(broken.properties.alternatives as Record<string, unknown>) };
    // The regression class lives on the item object level: an alternative
    // whose `required` does not list every property key must be caught.
    const items = { ...(alternatives.items as Record<string, unknown>) };
    items.required = ["archetype"];
    alternatives.items = items;
    const violation = { ...broken, properties: { ...broken.properties, alternatives } };
    expect(() => assertStrictCompliant(violation, "website_build_plan")).toThrow();
  });

  it("keeps the website build plan schema (incl. design) strict-valid at every object level", () => {
    assertStrictCompliant(websiteBuildPlanSchema("sq", ["studio", "clarity", "forge", "industrial-bold", "editorial-premium", "local-service-conversion"]), "website_build_plan");
  });

  it("keeps the text rewrite schema strict-valid", () => {
    assertStrictCompliant(textRewriteSchema, "text_rewrite");
  });

  it("lets a plan omit design decisions via nulls and still validate", () => {
    const plan = validateWebsiteBuildPlan({
      language: "sq", themeKey: "forge", templateKey: "forge",
      hero: { headline: "H", supporting: "S", cta: "C", imageIndex: null },
      about: { title: "A", body: "B", imageIndexes: [] },
      services: [], projects: [], trust: [],
      contact: { phone: null, email: null, address: null, city: null },
      needsHeroImage: true, notes: [],
      design: {
        layoutArchetype: "industrial-bold", heroVariant: null, sectionOrder: null,
        sectionVariants: null, density: null, visualStyle: null,
        typographyDirection: null, colorDirection: null, imageStrategy: null, ctaStrategy: null,
      },
    }, ["forge", "industrial-bold"]);
    expect(plan.design?.layoutArchetype).toBe("industrial-bold");
    expect(plan.design?.heroVariant).toBeUndefined();
    expect(plan.design?.sectionVariants).toBeUndefined();
  });
});
