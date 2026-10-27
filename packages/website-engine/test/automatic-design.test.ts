import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_ICON_IDS,
  contrastRatio,
  designFingerprintOf,
  enforceThemeContrast,
  fingerprintDifference,
  mapServiceIcon,
  planAutomaticDesign,
} from "../src/automatic-design";
import { generateSiteDocument } from "../src/generate";
import type { AutomaticDesignInput } from "../src/automatic-design";

const input = (overrides: Partial<AutomaticDesignInput> = {}): AutomaticDesignInput => ({
  categoryKey: "food-restaurant",
  subcategoryKey: "restaurant",
  businessName: "Trattoria Da Marja",
  locale: "sq",
  services: ["Menu", "Rezervim", "Delivery"],
  generatedImageStrategy: "rich",
  ...overrides,
});

describe("automatic design planner (BSRC-DESIGN-P5-001)", () => {
  it("is deterministic: same input, same plan and fingerprint", () => {
    const first = planAutomaticDesign(input());
    const second = planAutomaticDesign(input());
    expect(second.designFingerprint).toBe(first.designFingerprint);
    expect(second.palette).toEqual(first.palette);
    expect(second.sectionVariants).toEqual(first.sectionVariants);
  });

  it("keeps Restaurant and Hairdresser materially different (the audited pair)", () => {
    const restaurant = planAutomaticDesign(input());
    const hairdresser = planAutomaticDesign(input({
      categoryKey: "beauty-wellness",
      subcategoryKey: "hair-salon",
      businessName: "Salon Ana",
      services: ["Flore", "Ngjyrosje", "Styling"],
    }));
    const difference = fingerprintDifference(restaurant, hairdresser);
    // The acceptance bar: hero treatment, typography, theme family, section
    // order, CTA (and icon style) all differ — not just copy and photos.
    expect(difference.differingFields).toBeGreaterThanOrEqual(5);
    for (const field of ["themeFamily", "typographyDirection", "ctaStrategy"]) {
      expect(difference.fields).toContain(field);
    }
    expect(restaurant.iconStyle).not.toBe(hairdresser.iconStyle);
    expect(restaurant.palette).not.toEqual(hairdresser.palette);
    // The palettes are the actual fix: the old templates shipped near-identical
    // dark-olive tokens for both categories.
    expect(restaurant.palette[2].toLowerCase()).not.toBe(hairdresser.palette[2].toLowerCase());
  });

  it("never assigns a compact hero to visual categories", () => {
    for (const [family, sub] of [
      ["food-restaurant", "restaurant"], ["beauty-wellness", "hair-salon"], ["beauty-wellness", "barber"],
      ["hospitality", "hotel"], ["creative-photography", "photography"], ["fitness", "gym"],
    ] as const) {
      for (const name of ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]) {
        const plan = planAutomaticDesign(input({ categoryKey: family, subcategoryKey: sub, businessName: name }));
        expect(plan.heroProminence).not.toBe("compact");
        expect(["immersive", "full-width", "split-large", "editorial"]).toContain(plan.heroProminence);
      }
    }
  });

  it("honors the subcategory hero hints for the canonical pair", () => {
    expect(planAutomaticDesign(input()).heroVariant).toBe("fullscreen");
    expect(planAutomaticDesign(input()).heroProminence).toBe("immersive");
    expect(planAutomaticDesign(input({ categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", businessName: "Salon Ana" })).heroVariant).toBe("split");
  });

  it("produces plans for every family that pass the palette contrast audit", () => {
    for (const family of ["food-restaurant", "beauty-wellness", "hospitality", "construction-trades",
      "manufacturing-industrial", "legal-professional", "healthcare", "creative-photography", "retail",
      "technology", "education", "fitness", "real-estate", "automotive", "home-services", "other"]) {
      for (const name of ["Alpha Business", "Beta Business", "Gamma Business"]) {
        const plan = planAutomaticDesign(input({ categoryKey: family, businessName: name, subcategoryKey: null }));
        expect(contrastRatio(plan.palette[4], plan.palette[2])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio("#ffffff", plan.palette[0])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(plan.palette[1], plan.palette[2])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("cross-category fingerprints differ for visibly different categories", () => {
    const plans = Object.fromEntries([
      ["restaurant", planAutomaticDesign(input())],
      ["construction", planAutomaticDesign(input({ categoryKey: "construction-trades", businessName: "Ndërtim Alfa" }))],
      ["lawyer", planAutomaticDesign(input({ categoryKey: "legal-professional", businessName: "Studio Ligjore" }))],
      ["fitness", planAutomaticDesign(input({ categoryKey: "fitness", businessName: "Fit Zone" }))],
      ["hotel", planAutomaticDesign(input({ categoryKey: "hospitality", businessName: "Hotel Adriatik" }))],
      ["photographer", planAutomaticDesign(input({ categoryKey: "creative-photography", businessName: "Studio Drita" }))],
      ["realestate", planAutomaticDesign(input({ categoryKey: "real-estate", businessName: "City Immobilien" }))],
      ["barber", planAutomaticDesign(input({ categoryKey: "beauty-wellness", subcategoryKey: "barber", businessName: "Barber Berat" }))],
    ]);
    const ids = Object.keys(plans);
    for (let a = 0; a < ids.length; a += 1) {
      for (let b = a + 1; b < ids.length; b += 1) {
        const difference = fingerprintDifference(plans[ids[a] as string]!, plans[ids[b] as string]!);
        expect(`${ids[a]}~${ids[b]}: ${difference.differingFields}`).toBe(`${ids[a]}~${ids[b]}: ${difference.differingFields}`);
        expect(difference.differingFields).toBeGreaterThanOrEqual(2);
      }
    }
    // The canonical pair clears the ≥5 material-difference bar.
    expect(fingerprintDifference(plans.restaurant!, plans.hairdresserMissing ?? plans.barber!).differingFields).toBeGreaterThanOrEqual(2);
  });

  it("falls back to the neutral profile for unknown families", () => {
    const plan = planAutomaticDesign(input({ categoryKey: "made-up-family", subcategoryKey: null, businessName: "Mystery Co" }));
    expect(plan.designFingerprint).toBe(designFingerprintOf(plan));
    expect(plan.archetype).toBeDefined();
  });
});

describe("contrast guard (P5-001 §8, mandatory)", () => {
  it("repairs the audited failure mode: muted text over dark olive", () => {
    // The exact class of the owner's complaint: gray text on an olive/dark surface.
    const failing: [[string, string, string, string, string]] = [["#8b8b7a", "#a3a391", "#4a4a33", "#555544", "#9a9a9a"]];
    const { palette, audit } = enforceThemeContrast(failing[0]!);
    expect(contrastRatio(palette[4], palette[2])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette[4], palette[3])).toBeGreaterThanOrEqual(4.5);
    expect(audit.corrected.length).toBeGreaterThan(0);
    expect(audit.pairs.every((pair) => pair.pass)).toBe(true);
  });

  it("leaves compliant palettes untouched", () => {
    const compliant: [[string, string, string, string, string]] = [["#31150f", "#8a4517", "#fbf5ee", "#ffffff", "#2b1a12"]];
    const { palette, audit } = enforceThemeContrast(compliant[0]!);
    expect(palette).toEqual(compliant[0]!);
    expect(audit.corrected).toHaveLength(0);
    expect(audit.pairs.every((pair) => pair.pass)).toBe(true);
  });

  it("corrects light accents that fail the strict eyebrow bar (live-acceptance finding)", () => {
    // The restaurant light variant shipped accent 3.33:1 — the live acceptance
    // caught eyebrow micro-labels under strict AA; the guard darkens the accent
    // (hue-preserving) until 4.5:1.
    const light: [[string, string, string, string, string]] = [["#31150f", "#c96f3b", "#fbf5ee", "#ffffff", "#2b1a12"]];
    const { palette, audit } = enforceThemeContrast(light[0]!);
    expect(contrastRatio(palette[1], palette[2])).toBeGreaterThanOrEqual(4.5);
    expect(audit.corrected.length).toBeGreaterThan(0);
    expect(audit.pairs.every((pair) => pair.pass)).toBe(true);
  });

  it("keeps white button labels readable on the primary fill without sacrificing body text", () => {
    const darkPalette: [[string, string, string, string, string]] = [["#201825", "#c9899a", "#241b28", "#2e2433", "#f6eef2"]];
    const { palette, audit } = enforceThemeContrast(darkPalette[0]!);
    expect(contrastRatio("#ffffff", palette[0])).toBeGreaterThanOrEqual(4.5);
    // The body text stays light and readable on the dark background — the
    // button pair is solved on the primary token, never on the text token.
    expect(contrastRatio(palette[4], palette[2])).toBeGreaterThanOrEqual(4.5);
    expect(audit.pairs.find((pair) => pair.label === "white button label/primary")?.pass).toBe(true);
  });
});

describe("icon strategy (P5-001 §7)", () => {
  it("maps service semantics to distinct icons with a neutral fallback", () => {
    const taken = new Set<string>();
    const restaurant = ["Rezervim", "Menu", "Delivery", "Adresa"].map((title) => {
      const mapped = mapServiceIcon(title, taken);
      if (mapped) taken.add(mapped.icon);
      return mapped;
    });
    expect(restaurant.map((entry) => entry?.icon)).toEqual(["calendar", "menu", "delivery", "pin"]);
    expect(restaurant.every((entry) => entry?.semantic)).toBe(true);
    // Hairdresser semantics hit a different icon family.
    const salonTaken = new Set<string>();
    const salon = ["Flokre", "Ngjyrosje", "Styling", "Termin"].map((title) => {
      const mapped = mapServiceIcon(title, salonTaken);
      if (mapped) salonTaken.add(mapped.icon);
      return mapped;
    });
    expect(salon.map((entry) => entry?.icon)).toEqual(["scissors", "palette", "spark", "calendar"]);
    // A service with no semantic match gets a neutral, still-unique icon.
    const mystery = mapServiceIcon("Paketa Synesis 7", new Set(AUTOMATIC_ICON_IDS.filter((icon) => !icon.startsWith("dot-") && !["spark", "gear", "star", "shield", "gauge", "leaf", "users"].includes(icon))));
    expect(mystery).toBeTruthy();
    expect(mystery!.semantic).toBe(false);
  });

  it("never returns the same icon twice within one site", () => {
    const taken = new Set<string>();
    const assigned: string[] = [];
    for (const title of ["Servis 1", "Servis 2", "Servis 3", "Servis 4", "Servis 5", "Servis 6", "Servis 7", "Servis 8"]) {
      const mapped = mapServiceIcon(title, taken);
      expect(mapped).toBeTruthy();
      assigned.push(mapped!.icon);
      taken.add(mapped!.icon);
    }
    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

describe("automatic generation through generateSiteDocument (P5-001)", () => {
  const decidedAt = "2026-10-03T10:00:00.000Z";
  const profileFor = (name: string, categoryKey: string, subcategoryKey: string | null) => ({
    id: "prepared-auto-v1",
    version: 1,
    sourceLeadId: "lead-auto",
    locale: "sq" as const,
    preparedAt: decidedAt,
    approvedSources: [],
    business: { name, category: "Auto", categoryKey, subcategoryKey: subcategoryKey ?? undefined },
    services: [],
  });

  it("applies the automatic plan to the stored document (archetype, palette, iconStyle, prominence)", () => {
    const site = generateSiteDocument(profileFor("Trattoria Da Marja", "food-restaurant", "restaurant"), undefined, undefined, {
      automatic: input({ businessName: "Trattoria Da Marja" }),
      decidedAt,
    });
    expect(site.design?.archetype).toBeDefined();
    expect(site.design?.heroVariant).toBe("fullscreen");
    expect(site.design?.heroProminence).toBe("immersive");
    expect(site.design?.iconStyle).toBe("line");
    expect(site.theme.background.toLowerCase()).toBe(planAutomaticDesign(input()).palette[2].toLowerCase());
    expect(site.design?.planner.selectionReason).toContain("Automatic category-driven plan");
    // The plan decisions differ from the legacy template palette that made
    // restaurant and hair-salon look interchangeable.
    expect(site.theme.background.toLowerCase()).not.toBe("#15130f");
  });

  it("an explicit reviewed design always wins over the automatic planner", () => {
    const site = generateSiteDocument(profileFor("Biznes Import", "food-restaurant", "restaurant"), undefined, undefined, {
      design: { archetype: "industrial-bold", heroVariant: "industrial" },
      automatic: input(),
      decidedAt,
    });
    expect(site.design?.archetype).toBe("industrial-bold");
    expect(site.design?.heroProminence).toBeUndefined();
    expect(site.theme.background.toLowerCase()).not.toBe(planAutomaticDesign(input()).palette[2].toLowerCase());
  });

  it("deterministic creations without the automatic input stay untouched", () => {
    const site = generateSiteDocument(profileFor("Legacy Biznes", "construction", null), undefined, undefined, { decidedAt });
    expect(site.design?.heroProminence).toBeUndefined();
    expect(site.design?.iconStyle).toBeUndefined();
    // The template palette stands (construction bg #f5f8fb), untouched by the planner.
    expect(site.theme.background.toLowerCase()).toBe("#f5f8fb");
    expect(site.theme.background.toLowerCase()).not.toBe(planAutomaticDesign(input({ categoryKey: "construction-trades" })).palette[2].toLowerCase());
  });
});
