import { describe, expect, it } from "vitest";
import {
  BUSINESS_CATEGORY_REGISTRY_VERSION,
  businessCategoryFamilies,
  businessCategoryFamilyIds,
  businessCategorySubcategories,
  businessCategorySubcategory,
  businessTemplates,
  canonicalTemplateKeyFor,
  categoryRegistryLocales,
  familyForTemplateKey,
  getBusinessTemplate,
  normalizeCategoryText,
  resolveBusinessCategoryKeys,
  resolveLegacyBusinessCategory,
  searchBusinessCategories,
  subcategoryDefaultTemplateKey,
  subcategoryForTemplateKey,
  subcategoriesForFamily,
} from "../src/index";

const keysOf = (results: ReturnType<typeof searchBusinessCategories>) => results.map((result) => result.subcategoryKey);

describe("business category registry (business-category-registry/1)", () => {
  it("declares exactly the 16 audited family keys", () => {
    expect(businessCategoryFamilyIds).toEqual([
      "construction-trades", "automotive", "beauty-wellness", "food-restaurant",
      "legal-professional", "healthcare", "hospitality", "retail",
      "creative-photography", "home-services", "technology", "education",
      "fitness", "real-estate", "manufacturing-industrial", "other",
    ]);
    expect(businessCategoryFamilies).toHaveLength(businessCategoryFamilyIds.length);
  });

  it("is versioned", () => {
    expect(BUSINESS_CATEGORY_REGISTRY_VERSION).toBe("business-category-registry/1");
  });

  it("defines at least 50 subcategories with unique keys", () => {
    expect(businessCategorySubcategories.length).toBeGreaterThanOrEqual(50);
    const keys = businessCategorySubcategories.map((subcategory) => subcategory.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("carries all six locale labels for every family and subcategory", () => {
    for (const family of businessCategoryFamilies) {
      for (const locale of categoryRegistryLocales) {
        expect(family.labels[locale]?.trim(), `${family.key} missing ${locale}`).toBeTruthy();
      }
    }
    for (const subcategory of businessCategorySubcategories) {
      for (const locale of categoryRegistryLocales) {
        expect(subcategory.labels[locale]?.trim(), `${subcategory.key} missing ${locale}`).toBeTruthy();
      }
    }
  });

  it("only references valid families and catalog template keys", () => {
    for (const subcategory of businessCategorySubcategories) {
      expect(businessCategoryFamilyIds).toContain(subcategory.family);
      const resolved = subcategoryDefaultTemplateKey(subcategory);
      if (resolved) expect(getBusinessTemplate(resolved), `${subcategory.key} → unknown template ${resolved}`).toBeDefined();
    }
    for (const family of businessCategoryFamilies) {
      if (family.defaultTemplateKey) expect(getBusinessTemplate(family.defaultTemplateKey)).toBeDefined();
    }
  });

  it("covers every business template key through a canonical subcategory", () => {
    for (const template of businessTemplates) {
      expect(subcategoryForTemplateKey(template.key), `template ${template.key} unreachable`).toBeDefined();
    }
  });

  it("groups at least one subcategory under every family", () => {
    for (const familyKey of businessCategoryFamilyIds) {
      expect(subcategoriesForFamily(familyKey).length).toBeGreaterThan(0);
    }
  });

  it("gives every subcategory multilingual aliases", () => {
    for (const subcategory of businessCategorySubcategories) {
      expect(subcategory.aliases.length, `${subcategory.key} has no aliases`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("category normalization", () => {
  it("is diacritics-, case- and punctuation-insensitive", () => {
    expect(normalizeCategoryText("Ndërtim")).toBe(normalizeCategoryText("ndertim"));
    expect(normalizeCategoryText("Ndërtim")).toBe("ndertim");
    expect(normalizeCategoryText("Metallbau")).toBe("metallbau");
    expect(normalizeCategoryText("  Costruzioni-Metalliche! ")).toBe("costruzioni metalliche");
  });
});

describe("multilingual search acceptance", () => {
  it("metal → Metal Construction, Steel Fabrication, Industrial Construction, Manufacturing", () => {
    const keys = keysOf(searchBusinessCategories("metal", "en"));
    expect(keys).toContain("metal-construction");
    expect(keys).toContain("steel-fabrication");
    expect(keys).toContain("industrial-construction");
    expect(keys).toContain("manufacturing");
  });

  it("metallbau → relevant construction/steel categories", () => {
    const keys = keysOf(searchBusinessCategories("metallbau", "de"));
    expect(keys).toContain("metal-construction");
    expect(keys).toContain("steel-fabrication");
  });

  it.each(["ndërtim", "ndertim"])("%s → Construction / Metal Construction", (query) => {
    const keys = keysOf(searchBusinessCategories(query, "sq"));
    expect(keys).toContain("construction");
    expect(keys).toContain("metal-construction");
  });

  it("ndërtim and ndertim return identical results", () => {
    expect(keysOf(searchBusinessCategories("ndërtim", "sq"))).toEqual(keysOf(searchBusinessCategories("ndertim", "sq")));
  });

  it("baum → Tree Service, Arboriculture, Landscaping", () => {
    const keys = keysOf(searchBusinessCategories("baum", "de"));
    expect(keys).toContain("tree-service");
    expect(keys).toContain("arboriculture");
    expect(keys).toContain("landscaping");
  });

  it("restorant → Restaurant as the top suggestion", () => {
    const results = searchBusinessCategories("restorant", "sq");
    expect(results[0]?.subcategoryKey).toBe("restaurant");
    expect(results[0]?.label).toBe("Restorant");
  });

  it("fotograf → Photography", () => {
    expect(keysOf(searchBusinessCategories("fotograf", "sq"))).toContain("photography");
  });

  it("autoservis → Auto Repair", () => {
    const results = searchBusinessCategories("autoservis", "sq");
    expect(results[0]?.subcategoryKey).toBe("auto-repair");
    expect(keysOf(results)).toContain("auto-repair");
  });

  it("car service (alias) → Auto Repair", () => {
    expect(keysOf(searchBusinessCategories("car service", "en"))).toContain("auto-repair");
  });

  it("searches localized labels in every registry locale", () => {
    expect(keysOf(searchBusinessCategories("friseur", "de"))).toContain("hair-salon");
    expect(keysOf(searchBusinessCategories("avokat", "sq"))).toContain("lawyer");
    expect(keysOf(searchBusinessCategories("idraulica", "it"))).toContain("plumbing-heating");
    expect(keysOf(searchBusinessCategories("fontanero", "es"))).toContain("plumbing-heating");
  });

  it("localizes suggestion labels to the requested locale", () => {
    const [suggestion] = searchBusinessCategories("friseur", "de");
    expect(suggestion?.label).toBe("Friseursalon");
    expect(suggestion?.familyLabel).toBe("Schönheit & Wellness");
  });

  it("is deterministic and bounded", () => {
    const first = searchBusinessCategories("bau", "en", 5);
    const second = searchBusinessCategories("bau", "en", 5);
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(searchBusinessCategories("x", "en")).toEqual([]);
  });
});

describe("canonical key resolution", () => {
  it("validates canonical keys and drops unknown ones", () => {
    expect(resolveBusinessCategoryKeys({ categoryKey: "automotive", subcategoryKey: "auto-repair" })).toEqual({
      categoryKey: "automotive", subcategoryKey: "auto-repair",
    });
    expect(resolveBusinessCategoryKeys({ categoryKey: "not-a-family", subcategoryKey: "not-a-subcategory" })).toEqual({
      categoryKey: undefined, subcategoryKey: undefined,
    });
    expect(resolveBusinessCategoryKeys({ categoryKey: "not-a-family", subcategoryKey: "auto-repair" })).toEqual({
      categoryKey: "automotive", subcategoryKey: "auto-repair",
    });
  });

  it("canonical template keys follow subcategory, then family default", () => {
    expect(canonicalTemplateKeyFor({ subcategoryKey: "metal-construction" })).toBe("construction");
    expect(canonicalTemplateKeyFor({ subcategoryKey: "hotel" })).toBeUndefined();
    expect(canonicalTemplateKeyFor({ categoryKey: "construction-trades" })).toBe("construction");
    expect(canonicalTemplateKeyFor({ categoryKey: "hospitality" })).toBeUndefined();
    expect(canonicalTemplateKeyFor({})).toBeUndefined();
  });
});

describe("legacy category compatibility", () => {
  it("resolves legacy free-text categories to canonical entries", () => {
    expect(resolveLegacyBusinessCategory("Metal Construction").subcategoryKey).toBe("metal-construction");
    expect(resolveLegacyBusinessCategory("Ndërtim metalik").subcategoryKey).toBe("metal-construction");
    expect(resolveLegacyBusinessCategory("Metallbau").subcategoryKey).toBe("metal-construction");
    expect(resolveLegacyBusinessCategory("Hair salon").subcategoryKey).toBe("hair-salon");
  });

  it("bridges historical wizard labels through the template catalog", () => {
    expect(resolveLegacyBusinessCategory("Car repair service").subcategoryKey).toBe("auto-repair");
    expect(resolveLegacyBusinessCategory("Professional services").subcategoryKey).toBe("consultation");
    expect(resolveLegacyBusinessCategory("Garden and tree care").subcategoryKey).toBe("tree-service");
  });

  it("falls back to the other family for unknown input", () => {
    expect(resolveLegacyBusinessCategory(" completely unknown business xyz ")).toEqual({
      categoryKey: "other", subcategoryKey: undefined,
    });
    expect(resolveLegacyBusinessCategory(undefined).categoryKey).toBe("other");
    expect(resolveLegacyBusinessCategory("").categoryKey).toBe("other");
  });

  it("accepts exact subcategory keys as legacy strings", () => {
    expect(resolveLegacyBusinessCategory("auto-repair")).toEqual({ categoryKey: "automotive", subcategoryKey: "auto-repair" });
  });
});

describe("template key mapping", () => {
  it("maps every catalog template to a family deterministically", () => {
    expect(familyForTemplateKey("construction")?.key).toBe("construction-trades");
    expect(familyForTemplateKey("auto-repair")?.key).toBe("automotive");
    expect(familyForTemplateKey("gold-luxury")?.key).toBe("other");
    expect(familyForTemplateKey("not-a-template")).toBeUndefined();
  });
});
