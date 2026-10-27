import { describe, expect, it } from "vitest";
import type { AiProvider } from "@platform/ai-assistant";
import type { AiStructuredRequest, AiStructuredResult } from "@platform/ai-assistant";
import { validateWebsiteBuildPlan, validateWebsiteUnderstanding } from "@platform/ai-assistant";
import type { WebsiteResearch } from "./safe-website-reader";
import { buildPlannerInput, buildSourceWebsiteModel, runPlanPass, runUnderstandingPass } from "./website-understanding";
import { resolveCreationCategory } from "./creation-category";

const research: WebsiteResearch = {
  sourceUrl: "https://old-business-site.de/",
  pagesRead: 2,
  pages: [
    { url: "https://old-business-site.de/", title: "Stahlbau Meister", text: "Wir bauen Stahlhallen. Seit 1995. Kontakt.", structuredData: [], images: [] },
    { url: "https://old-business-site.de/referenzen", title: "Referenzen", text: "Lagerhalle Köln. Werkstatt Bonn.", structuredData: [], images: [] },
  ],
  images: [
    { url: "https://old-business-site.de/img/logo.png", alt: "", pageUrl: "https://old-business-site.de/" },
    { url: "https://old-business-site.de/img/halle.jpg", alt: "", pageUrl: "https://old-business-site.de/" },
    { url: "https://old-business-site.de/img/werkstatt.jpg", alt: "", pageUrl: "https://old-business-site.de/" },
    { url: "https://old-business-site.de/img/icon-x.png", alt: "", pageUrl: "https://old-business-site.de/" },
  ],
  contactHints: { emails: ["info@old-business-site.de"], phones: ["+49 221 1"], socialLinks: [] },
};

let calls = 0;

const fakeProvider: AiProvider = {
  async structured<T>(request: AiStructuredRequest<T>) {
    calls += 1;
    if (request.schemaName === "website_understanding") {
      const value = validateWebsiteUnderstanding({
        business: {
          summary: "Steel construction company building halls.",
          does: "Designs and erects steel halls.",
          customers: "Industrial clients.",
          industries: ["construction"],
          valueProposition: "Fast assembly.",
          differentiators: ["Own workshop"],
          primaryCta: "Request a quote",
        },
        services: [{ name: "Steel halls", description: "Turnkey halls.", confidence: "high" }],
        projects: [{ name: "Warehouse Cologne", description: "Turnkey hall." }],
        certifications: [], locations: ["Cologne"], contact: { phone: "+49 221 1", email: "info@old-business-site.de", address: null, city: "Cologne" },
        openingHours: [], socialLinks: [],
        pageTypes: [{ url: "https://old-business-site.de/referenzen", type: "projects", reason: "references" }],
        images: [
          { index: 0, url: "https://old-business-site.de/img/logo.png", classification: "logo", description: "company logo", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 0, confidence: 0.95, reason: "brand mark" },
          { index: 1, url: "https://old-business-site.de/img/halle.jpg", classification: "project", description: "finished steel hall", relatedService: "Steel halls", relatedProject: "Warehouse Cologne", quality: "excellent", heroSuitability: 9, confidence: 0.9, reason: "strong hero" },
          { index: 2, url: "https://old-business-site.de/img/werkstatt.jpg", classification: "work_process", description: "workshop welding", relatedService: "Steel halls", relatedProject: null, quality: "good", heroSuitability: 4, confidence: 0.8, reason: "process" },
        ],
        weakMaterials: [], sourceLanguage: "de",
        notes: [],
      });
      return { value: value as T, responseId: "r1", model: request.model, usage: { totalTokens: 100 } };
    }
    if (request.schemaName === "website_build_plan") {
      const value = validateWebsiteBuildPlan({
        language: "sq", themeKey: "forge", templateKey: "forge",
        hero: { headline: "H", supporting: "S", cta: "C", imageIndex: 1 },
        about: { title: "A", body: "B", imageIndexes: [2] },
        services: [{ title: "Steel halls", description: "d", imageIndex: 1 }],
        projects: [{ name: "Warehouse Cologne", summary: "Turnkey hall.", imageIndexes: [1] }],
        trust: [], contact: { phone: "+49 221 1", email: "info@old-business-site.de", address: null, city: "Cologne" },
        needsHeroImage: false, notes: [],
      }, ["studio", "clarity", "forge"]);
      return { value: value as T, responseId: "r2", model: request.model, usage: { totalTokens: 100 } };
    }
    throw new Error("unexpected schema " + request.schemaName);
  },
};

describe("understanding + plan passes (mocked provider)", () => {
  it("runs two bounded calls, links images semantically, and guards the hero", async () => {
    calls = 0;
    const sourceModel = buildSourceWebsiteModel(research);
    const understandingPass = await runUnderstandingPass(fakeProvider as unknown as AiProvider, "test-model", research, sourceModel);
    const plannerInput = buildPlannerInput(understandingPass.understanding, "sq", resolveCreationCategory({ aiSuggested: understandingPass.understanding.suggestedCategory }));
    const planPass = await runPlanPass(fakeProvider as unknown as AiProvider, "test-model", plannerInput, understandingPass.understanding);
    const understanding = understandingPass.understanding;
    const plan = planPass.plan;
    expect(calls).toBe(2);
    expect(understanding.business.does).toContain("steel halls");
    expect(understanding.images.find((image) => image.index === 0)?.classification).toBe("logo");
    expect(understanding.images.find((image) => image.index === 1)?.url).toContain("halle.jpg");
    expect(plan.hero.imageIndex).toBe(1);
    expect(plan.about.body.length).toBeGreaterThan(0);
  });

  it("filters icon images out of the vision candidate set", () => {
    const sourceModel = buildSourceWebsiteModel(research);
    expect(sourceModel.visionCandidates.map((image) => image.filename)).toEqual(["logo.png", "halle.jpg", "werkstatt.jpg"]);
  });

  it("sends only bounded low-detail image inputs", async () => {
    const holder: { images?: Array<{ url: string; detail?: string }> } = {};
    const probingProvider: AiProvider = {
      async structured<T>(request: AiStructuredRequest<T>) {
        if (request.schemaName === "website_understanding") holder.images = request.imageInputs ?? [];
        if (request.schemaName === "website_understanding") {
          const value = validateWebsiteUnderstanding({
            business: { summary: "s", does: "d", customers: "c", industries: [], valueProposition: "v", differentiators: [], primaryCta: "cta" },
            services: [], projects: [], certifications: [], locations: [],
            contact: { phone: null, email: null, address: null, city: null },
            openingHours: [], socialLinks: [], pageTypes: [], images: [],
            weakMaterials: [], sourceLanguage: "de", notes: [],
          });
          return { value: value as T, responseId: "r", model: request.model, usage: {} };
        }
        const value = validateWebsiteBuildPlan({
          language: "sq", themeKey: "auto", templateKey: "forge",
          hero: { headline: "H", supporting: "S", cta: "C", imageIndex: null },
          about: { title: "A", body: "B", imageIndexes: [] },
          services: [], projects: [], trust: [],
          contact: { phone: null, email: null, address: null, city: null },
          needsHeroImage: true, notes: [],
        }, ["studio", "clarity", "forge"]);
        return { value: value as T, responseId: "r", model: request.model, usage: {} };
      },
    };
    const sourceModel = buildSourceWebsiteModel(research);
    const understandingPass = await runUnderstandingPass(probingProvider as unknown as AiProvider, "test-model", research, sourceModel);
    const plannerInput = buildPlannerInput(understandingPass.understanding, "sq", resolveCreationCategory({ aiSuggested: understandingPass.understanding.suggestedCategory }));
    const planPass = await runPlanPass(probingProvider as unknown as AiProvider, "test-model", plannerInput, understandingPass.understanding);
    expect((holder.images ?? []).every((image) => image.detail === "low")).toBe(true);
    expect((holder.images ?? []).length).toBeLessThanOrEqual(10);
    expect(planPass.plan.needsHeroImage).toBe(true);
  });

  it("retries once and then refuses a plan written in the wrong language", async () => {
    calls = 0;
    const wrongLanguagePlan = {
      themeKey: "forge", templateKey: "forge",
      hero: { headline: "Stahlhallen für Industrie", supporting: "Wir bauen für Sie.", cta: "Angebot anfordern", imageIndex: null },
      about: { title: "Über uns", body: "Wir liefern Stahlhallen für Kunden mit Anspruch und Qualität.", imageIndexes: [] },
      services: [{ title: "Stahlhallen", description: "Wir bauen Stahlhallen für Sie.", imageIndex: null }],
      projects: [], trust: [],
      contact: { phone: null, email: null, address: null, city: null },
      needsHeroImage: true, notes: [],
    };
    const wrongLanguageProvider: AiProvider = {
      async structured<T>(request: AiStructuredRequest<T>) {
        calls += 1;
        if (request.schemaName === "website_understanding") {
          const value = validateWebsiteUnderstanding({
            business: { summary: "s", does: "d", customers: "c", industries: [], valueProposition: "v", differentiators: [], primaryCta: "cta" },
            services: [], projects: [], certifications: [], locations: [],
            contact: { phone: null, email: null, address: null, city: null },
            openingHours: [], socialLinks: [], pageTypes: [], images: [],
            weakMaterials: [], sourceLanguage: "de", notes: [],
          });
          return { value: value as T, responseId: "r", model: request.model, usage: {} };
        }
        const value = validateWebsiteBuildPlan({ ...wrongLanguagePlan, language: "de" }, ["studio", "clarity", "forge"]);
        return { value: value as T, responseId: "r", model: request.model, usage: {} };
      },
    };
    const sourceModel = buildSourceWebsiteModel(research);
    const understandingPass = await runUnderstandingPass(wrongLanguageProvider as unknown as AiProvider, "test-model", research, sourceModel);
    const wrongLocaleInput = buildPlannerInput(understandingPass.understanding, "sq", resolveCreationCategory({ aiSuggested: understandingPass.understanding.suggestedCategory }));
    await expect(runPlanPass(wrongLanguageProvider as unknown as AiProvider, "test-model", wrongLocaleInput, understandingPass.understanding))
      .rejects.toThrow(/instead of sq/);
    expect(calls).toBe(3);
  });
});
