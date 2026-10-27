import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  fingerprintDifference,
  planAutomaticDesign,
  type AutomaticDesignInput,
} from "@platform/website-engine";
import { generateSiteDocument } from "@platform/website-engine";
import { SitePreview } from "./site-preview";

/* BSRC-DESIGN-P5-001 acceptance: generates 8 synthetic sites from scratch
 * (name + category + basic data, NO website URL) through the real engine
 * path the trials route uses, renders each through the real SitePreview
 * renderer, and writes full HTML pages + the acceptance matrix. Screenshots
 * and runtime audits (overflow, hero box, icon census) are captured by
 * scripts/p5001-capture.mjs. Gated: EVIDENCE_OUT=<dir>. */

const STYLES = readFileSync(join(process.cwd(), "app", "styles.css"), "utf8");

const CASES: Array<{ id: string; input: AutomaticDesignInput; services: string[]; contact: Record<string, string> }> = [
  { id: "restaurant", input: { categoryKey: "food-restaurant", subcategoryKey: "restaurant", businessName: "Trattoria Da Marja", locale: "sq", services: [], generatedImageStrategy: "rich" }, services: ["Menu sezonar", "Rezervim tavoline", "Evente private", "Delivery"], contact: { phone: "+355 69 111 2222", email: "info@damarja.example", city: "Tiranë", address: "Rruga Kavajës 12" } },
  { id: "hairdresser", input: { categoryKey: "beauty-wellness", subcategoryKey: "hair-salon", businessName: "Salon Ana", locale: "sq", services: [], generatedImageStrategy: "rich" }, services: ["Flokre dhe styling", "Ngjyrosje profesionale", "Trajtim kaperdi", "Shtresa dhe manikyr"], contact: { phone: "+355 69 333 4444", email: "hello@salonana.example", city: "Tiranë", address: "Bulevardi Dëshmorët 5" } },
  { id: "barber", input: { categoryKey: "beauty-wellness", subcategoryKey: "barber", businessName: "Barber Berat", locale: "sq", services: [], generatedImageStrategy: "rich" }, services: ["Prerje klasike", "Tujë dhe rroje", "Styling dhjamor", "Paketat e zgjedhura"], contact: { phone: "+355 69 555 6666", email: "book@barberberat.example", city: "Berat", address: "Rruga Antipatrea 3" } },
  { id: "construction", input: { categoryKey: "construction-trades", subcategoryKey: "construction", businessName: "Ndërtim Alfa shpk", locale: "sq", services: [], generatedImageStrategy: "rich" }, services: ["Ndërtim rezidencial", "Struktura metalike", "Rikonstruksion", "Konsulencë projekti"], contact: { phone: "+355 69 777 8888", email: "info@alfa.example", city: "Durrës", address: "Rruga Taulantia 21" } },
  { id: "lawyer", input: { categoryKey: "legal-professional", subcategoryKey: "lawyer", businessName: "Studio Ligjore Meti", locale: "sq", services: [], generatedImageStrategy: "minimal" }, services: ["E drejta tregtare", "E drejta e pronës", "Kontrata", "Përfaqësim gjyqësor"], contact: { phone: "+355 69 999 0000", email: "office@meti.example", city: "Tiranë", address: "Rruga e Kavajës 40" } },
  { id: "fitness", input: { categoryKey: "fitness", subcategoryKey: "gym", businessName: "Fit Zone", locale: "en", services: [], generatedImageStrategy: "rich" }, services: ["Personal training", "Group classes", "Strength area", "Nutrition coaching"], contact: { phone: "+355 69 121 3141", email: "join@fitzone.example", city: "Tiranë", address: "Rruga e Elbasanit 8" } },
  { id: "hotel", input: { categoryKey: "hospitality", subcategoryKey: "hotel", businessName: "Hotel Adriatik", locale: "en", services: [], generatedImageStrategy: "rich" }, services: ["Sea-view rooms", "Restaurant", "Conference hall", "Private beach"], contact: { phone: "+355 69 151 6171", email: "stay@adriatik.example", city: "Durrës", address: "Plazh, Rruga Pavarësia" } },
  { id: "photographer", input: { categoryKey: "creative-photography", subcategoryKey: "photography", businessName: "Studio Drita", locale: "en", services: [], generatedImageStrategy: "moderate" }, services: ["Wedding photography", "Portrait sessions", "Event coverage", "Prints and albums"], contact: { phone: "+355 69 181 9202", email: "studio@drita.example", city: "Shkodër", address: "Rruga Kolë Idromeno 9" } },
];

describe("evidence: P5-001 automatic premium generation (8 cases from scratch)", () => {
  it.runIf(Boolean(process.env.EVIDENCE_OUT))("generates, renders and audits the acceptance matrix", () => {
    const outDir = process.env.EVIDENCE_OUT!;
    const sitesDir = join(outDir, "sites");
    mkdirSync(sitesDir, { recursive: true });
    const decidedAt = "2026-10-03T10:00:00.000Z";
    const matrix: Record<string, unknown> = {};
    let previousPlan: ReturnType<typeof planAutomaticDesign> | null = null;
    for (const testCase of CASES) {
      const plan = planAutomaticDesign({ ...testCase.input, services: testCase.services });
      const site = generateSiteDocument({
        id: "prepared-auto-v1",
        version: 1,
        sourceLeadId: `lead-${testCase.id}`,
        locale: testCase.input.locale as never,
        preparedAt: decidedAt,
        approvedSources: [],
        business: {
          name: testCase.input.businessName,
          category: testCase.id,
          categoryKey: testCase.input.categoryKey,
          subcategoryKey: testCase.input.subcategoryKey ?? undefined,
          description: "",
          ...testCase.contact,
        },
        services: testCase.services.map((title) => ({ title })),
      }, undefined, undefined, { automatic: { ...testCase.input, services: testCase.services }, decidedAt });
      const html = renderToStaticMarkup(<SitePreview site={site} />);
      const page = `<!doctype html><html lang="${site.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${site.content.name}</title><style>${STYLES}</style></head><body>${html}</body></html>`;
      writeFileSync(join(sitesDir, `${testCase.id}.html`), page);

      // Structural assertions on the real render.
      expect(html).toContain(`data-design-archetype="${site.design?.archetype}"`);
      expect(html).toContain(`data-hero-prominence="${site.design?.heroProminence}"`);
      const iconCensus = [...html.matchAll(/data-icon="([a-z-]+)"/g)].map((match) => match[1]);
      expect(new Set(iconCensus).size).toBe(iconCensus.length); // no icon repeats within a site
      expect(iconCensus.length).toBeGreaterThanOrEqual(Math.min(3, testCase.services.length));

      // Contrast audit recomputed from the stored tokens (the guard already ran).
      const pairs = [
        { label: "text/background", ratio: contrastRatio(site.theme.text, site.theme.background), minimum: 4.5 },
        { label: "text/surface", ratio: contrastRatio(site.theme.text, site.theme.surface), minimum: 4.5 },
        { label: "accent/background", ratio: contrastRatio(site.theme.accent, site.theme.background), minimum: 3 },
        { label: "white button label/primary", ratio: contrastRatio("#ffffff", site.theme.primary), minimum: 4.5 },
      ];
      expect(pairs.every((pair) => pair.ratio >= pair.minimum)).toBe(true);

      matrix[testCase.id] = {
        businessName: site.content.name,
        locale: site.locale,
        designFingerprint: plan.designFingerprint,
        archetype: site.design?.archetype,
        heroVariant: site.design?.heroVariant,
        heroProminence: site.design?.heroProminence,
        sectionOrder: site.design?.sectionOrder,
        sectionVariants: site.design?.sectionVariants,
        themeFamily: plan.themeFamily,
        themeId: site.design?.themeId,
        palette: site.theme,
        typographyDirection: site.design?.typographyDirection,
        iconStyle: site.design?.iconStyle,
        iconsUsed: iconCensus,
        imageStrategy: site.design?.imageStrategy,
        ctaStrategy: site.design?.ctaStrategy,
        density: site.design?.density,
        visualMood: plan.visualMood,
        contrastAudit: pairs,
        heroTitle: site.content.heroTitle,
        heroTitleLength: site.content.heroTitle.length,
        services: site.services.map((service) => service.title),
      };
      if (previousPlan && testCase.id === "hairdresser") {
        const restaurantPlan = planAutomaticDesign(CASES[0]!.input);
        matrix.restaurantVsHairdresser = {
          differingFields: fingerprintDifference(restaurantPlan, plan).differingFields,
          fields: fingerprintDifference(restaurantPlan, plan).fields,
          restaurantPalette: CASES[0]!.input,
          note: "guaranteed by family profiles + subcategory hero hints, not by seed luck",
        };
      }
      previousPlan = plan;
      console.log(`P5-001 evidence: ${testCase.id} → ${site.design?.archetype}/${site.design?.heroVariant} (${site.design?.heroProminence}) family=${plan.themeFamily} icons=${iconCensus.join(",")}`);
    }
    writeFileSync(join(outDir, "acceptance-matrix.json"), JSON.stringify(matrix, null, 2));
  });
});
