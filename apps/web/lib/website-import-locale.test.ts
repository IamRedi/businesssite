import { describe, expect, it } from "vitest";
import type { AiProvider } from "@platform/ai-assistant";
import { validateWebsiteBuildPlan, validateWebsiteUnderstanding } from "@platform/ai-assistant";
import type { PreparedBusinessProfile } from "@platform/website-engine";
import type { WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";
import { generateSiteDocument } from "@platform/website-engine";
import type { WebsiteResearch } from "./safe-website-reader";
import { applyExistingWebsiteToSite, validateExistingWebsiteSubmission } from "./apply-website-import";
import { selectionsFromAi, submissionFromSelections } from "../components/website-import-review";

import type { WebsiteImportPreview } from "../lib/website-import";

const preview: WebsiteImportPreview = {
  sourceUrl: "https://old-business-site.de/",
  fetchedAt: "2026-10-01T00:00:00.000Z",
  pagesRead: 2,
  businessName: "Meister Bau",
  suggestedHero: {},
  services: ["Steel halls"],
  contact: { phone: "+49 1", email: "info@old-business-site.de" },
  socialLinks: [],
  logoUrl: "https://old-business-site.de/img/logo.png",
  faviconUrl: undefined,
  colors: [], fonts: [],
  photos: [
    { url: "https://old-business-site.de/img/logo.png", alt: "logo" },
    { url: "https://old-business-site.de/img/halle.jpg", alt: "hall" },
  ],
  legalSuggestions: {},
  sourceLanguage: "de",
  openingHours: [],
};

const research: WebsiteResearch = {
  sourceUrl: "https://old-business-site.de/",
  pagesRead: 2,
  pages: [
    { url: "https://old-business-site.de/", title: "Stahlbau", text: "Wir bauen Stahlhallen.", structuredData: [], images: [] },
    { url: "https://old-business-site.de/referenzen", title: "Referenzen", text: "Hallenneubau.", structuredData: [], images: [] },
  ],
  images: [
    { url: "https://old-business-site.de/img/logo.png", alt: "", pageUrl: "https://old-business-site.de/" },
    { url: "https://old-business-site.de/img/halle.jpg", alt: "", pageUrl: "https://old-business-site.de/" },
  ],
  contactHints: { emails: [], phones: [], socialLinks: [] },
};

const understanding = {
  business: { summary: "s", does: "d", customers: "c", industries: [], valueProposition: "v", differentiators: [], primaryCta: "cta" },
  services: [{ name: "Steel halls", description: "Turnkey steel halls.", confidence: "high" }],
  projects: [], certifications: [], locations: [],
  contact: { phone: "+49 1", email: "info@old-business-site.de", address: null, city: "Cologne" },
  openingHours: [], socialLinks: [], pageTypes: [],
  images: [
    { index: 0, url: "https://old-business-site.de/img/logo.png", classification: "logo", description: "logo", relatedService: null, relatedProject: null, quality: "good", heroSuitability: 0, confidence: 0.95, reason: "brand mark" },
    { index: 1, url: "https://old-business-site.de/img/halle.jpg", classification: "project", description: "hall", relatedService: "Steel halls", relatedProject: null, quality: "excellent", heroSuitability: 9, confidence: 0.95, reason: "strong hero" },
  ],
  weakMaterials: [], sourceLanguage: "de", notes: [],
} as unknown as WebsiteUnderstanding;

const plan = {
  themeKey: "forge", templateKey: "forge",
  hero: { headline: "Konstruksione metalike nga projekti te montimi", supporting: "Demo Steel ofron zgjidhje të plota për çelikun.", cta: "C", imageIndex: 1 },
  about: { title: "Rreth nesh", body: "Demo Steel ndërton kapanone dhe magazina për klientë industrialë.", imageIndexes: [1] },
  services: [{ title: "Konstruksione metalike", description: "Fabrikim dhe montim i strukturave metalike.", imageIndex: 1 }],
  projects: [], trust: ["Punë sipas Euro-Code-ve"],
  contact: { phone: null, email: null, address: null, city: null },
  needsHeroImage: false, notes: [],
} as unknown as WebsiteBuildPlan;

const profile: PreparedBusinessProfile = {
  id: "p", version: 1, sourceLeadId: "l", locale: "sq", preparedAt: "2026-10-01T00:00:00.000Z",
  approvedSources: [], business: { name: "Demo Steel" }, services: [{ title: "Placeholder" }],
};

describe("review SQ → stored document (siteLocale persistence)", () => {
  it("carries the approved SQ plan copy through the submission into the document", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    const submission = validateExistingWebsiteSubmission(
      submissionFromSelections(preview.sourceUrl, { ...selections, acknowledged: true }),
    )!;
    expect(submission.hero).toMatchObject({ headline: "Konstruksione metalike nga projekti te montimi" });
    expect(submission.about).toMatchObject({ title: "Rreth nesh" });
    const site = generateSiteDocument({ ...profile, locale: "sq" });
    applyExistingWebsiteToSite(site, submission);
    expect(site.locale).toBe("sq");
    expect(site.content.heroTitle).toBe("Konstruksione metalike nga projekti te montimi");
    expect(site.content.heroSubtitle).toBe("Demo Steel ofron zgjidhje të plota për çelikun.");
    expect(site.content.aboutTitle).toBe("Rreth nesh");
    expect(site.content.aboutBody).toContain("kapanone dhe magazina");
    expect(site.content.description).toBe("Demo Steel ofron zgjidhje të plota për çelikun.");
    expect(site.services[0].title).toBe("Konstruksione metalike");
    expect(site.importSource).toMatchObject({ url: preview.sourceUrl });
  });

  it("keeps raw English source text out of the final copy when the plan is SQ", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    const submission = validateExistingWebsiteSubmission(
      submissionFromSelections(preview.sourceUrl, { ...selections, acknowledged: true }),
    )!;
    const site = generateSiteDocument({ ...profile, locale: "sq" });
    applyExistingWebsiteToSite(site, submission);
    // raw source service "Steel halls" must not survive as the final title
    expect(site.services.map((service) => service.title)).not.toContain("Steel halls");
    // hero copy must not be the English starter line
    expect(site.content.heroSubtitle).not.toMatch(/dependable local business/i);
  });

  it("preserves provenance and media mapping unchanged", () => {
    const selections = selectionsFromAi(preview, understanding, plan);
    const submission = validateExistingWebsiteSubmission(
      submissionFromSelections(preview.sourceUrl, { ...selections, acknowledged: true }),
    )!;
    const site = generateSiteDocument({ ...profile, locale: "sq" });
    applyExistingWebsiteToSite(site, submission);
    expect(site.media.heroImageUrl).toContain("halle.jpg");
    expect(site.importSource).toMatchObject({ url: "https://old-business-site.de/" });
  });
});

describe("generateSiteDocument locale fallback", () => {
  it("falls back to locale-aware canonical copy instead of English starter text", () => {
    const sqProfile: PreparedBusinessProfile = {
      ...profile, locale: "sq", business: { name: "Biznes Test" },
    };
    const site = generateSiteDocument(sqProfile);
    expect(site.locale).toBe("sq");
    expect(site.content.description).not.toMatch(/dependable local business|dependable/i);
    expect(site.content.heroSubtitle).not.toMatch(/dependable local business|dependable/i);
    expect(site.content.description.length).toBeGreaterThan(20);
    const deProfile: PreparedBusinessProfile = { ...profile, locale: "de", business: { name: "Testbetrieb" } };
    const deSite = generateSiteDocument(deProfile);
    expect(deSite.content.description).not.toMatch(/dependable local business/i);
  });

  it("keeps proper nouns and a real business description verbatim when provided", () => {
    const named: PreparedBusinessProfile = {
      ...profile, locale: "sq",
      business: { name: "Demo Steel Construction", description: "ISO 9001:2015 certified steel construction company." },
    };
    const site = generateSiteDocument(named);
    expect(site.content.description).toBe("ISO 9001:2015 certified steel construction company.");
    expect(site.content.heroSubtitle).toBe("ISO 9001:2015 certified steel construction company.");
  });
});
