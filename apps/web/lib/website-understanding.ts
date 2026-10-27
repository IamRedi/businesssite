import { createHash } from "node:crypto";
import type { AiProvider, WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";
import {
  nonHeroImageClassifications,
  sourceImageClassifications,
  sourcePageTypes,
  validateWebsiteBuildPlan,
  validateWebsiteUnderstanding,
  websiteBuildPlanSchema,
  websiteUnderstandingSchema,
  type CategoryKeyRegistry,
} from "@platform/ai-assistant";
import {
  SITE_GENERATOR_VERSION,
  archetypeContracts,
  businessCategoryFamilies,
  businessCategorySubcategories,
  layoutArchetypeIds,
  siteThemeIds,
} from "@platform/website-engine";
import type { WebsiteResearch } from "./safe-website-reader";
import type { WebsiteImportPreview } from "./website-import";
import { detectWebsiteLanguage } from "./website-import";

export type SourcePageType = (typeof import("@platform/ai-assistant").sourcePageTypes)[number];

export type SourceWebsiteImage = {
  index: number;
  url: string;
  sourcePage: string;
  alt: string;
  filename: string;
  duplicateOf: string | null;
};

export type SourceWebsiteModel = {
  sourceUrl: string;
  pages: Array<{ url: string; type: SourcePageType; hint: string; title?: string; textLength: number }>;
  images: SourceWebsiteImage[];
  /** Bounded vision candidates after deterministic pre-filtering. */
  visionCandidates: SourceWebsiteImage[];
  textDigest: string;
};

const pageTypeHints: Array<{ type: SourcePageType; pattern: RegExp }> = [
  { type: "homepage", pattern: /\/$|\/(home|index|start)?$/i },
  { type: "contact", pattern: /contact|kontakt|contatto|contacto|contacte|na-kontaktoni/i },
  { type: "about", pattern: /about|about-us|rreth-nesh|ueber|chi-siamo|nosotros|a-propos|empresa/i },
  { type: "services", pattern: /service|sherbime|leistungen|servizi|servicios|prestations/i },
  { type: "projects", pattern: /project|reference|referenca|projekt|proyectos|progetti|realizime/i },
  { type: "products", pattern: /product|produkte|prodotti|productos|produits/i },
  { type: "team", pattern: /team|ekipi|staff|equipe|equipo/i },
  { type: "gallery", pattern: /gallery|galeri|galerie|galeria|photos/i },
  { type: "certifications", pattern: /certificat|iso-|quality|standart|standard/i },
  { type: "legal", pattern: /privacy|imprint|impressum|legal|terms|ushtar|privatesi/i },
];

export function classifySourcePage(url: string, title: string | undefined, text: string): { type: SourcePageType; hint: string } {
  const base = new URL(url, "https://placeholder.invalid");
  const path = base.pathname.toLowerCase();
  for (const { type, pattern } of pageTypeHints) {
    if (type === "homepage" && (path === "/" || path === "")) return { type, hint: "root document" };
    if (type !== "homepage" && pattern.test(path)) return { type, hint: "url pattern" };
  }
  const headingLike = text.slice(0, 400).toLowerCase();
  for (const { type, pattern } of pageTypeHints) {
    if (type === "homepage") continue;
    if (pattern.test(headingLike) || (title ?? "").toLowerCase().match(pattern)) return { type, hint: "content/title match" };
  }
  return { type: "other", hint: "no strong signal" };
}

/** Deterministic inventory: dedupe by URL, flag obvious machinery, bound the vision set. */
export function buildSourceWebsiteModel(research: WebsiteResearch): SourceWebsiteModel {
  const pages = research.pages.map((page) => {
    const { type, hint } = classifySourcePage(page.url, page.title, page.text);
    return { url: page.url, type, hint, title: page.title, textLength: page.text.length };
  });
  const seen = new Set<string>();
  const images: SourceWebsiteImage[] = [];
  for (const image of research.images) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    let duplicateOf: string | null = null;
    for (const candidate of images) {
      if (candidate.duplicateOf) continue;
      if (sameAssetIdentity(candidate.filename, image.url)) { duplicateOf = candidate.url; break; }
    }
    images.push({
      index: images.length,
      url: image.url,
      sourcePage: image.pageUrl,
      alt: image.alt.slice(0, 200),
      filename: decodeURIComponent(new URL(image.url).pathname.split("/").pop() ?? ""),
      duplicateOf,
    });
  }
  const textDigest = createHash("sha256")
    .update(research.pages.map((page) => page.text).join("\n").slice(0, 20_000))
    .digest("hex");
  return { sourceUrl: research.sourceUrl, pages, images, visionCandidates: selectVisionCandidates(images), textDigest };
}

const sameAssetIdentity = (filenameA: string, urlB: string) => {
  const filenameB = decodeURIComponent(new URL(urlB).pathname.split("/").pop() ?? "");
  if (!filenameA || !filenameB || filenameA === filenameB) return false;
  const stem = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/-\d{2,4}x\d{2,4}$/i, "").toLowerCase();
  return stem(filenameA) === stem(filenameB);
};

const machineryPattern = /(?:^|[-_.])(?:icon|sprite|avatar|badge|pixel|tracking|flag|logo-small|spacer|divider|separator|bullet|arrow|chevron|social-|-icon|_icon)(?:[-_.]|$)/i;
const tinyPattern = /(?:^|[-_.])(?:thumb|thumbnail|mini|small|tiny)(?:[-_.]|$)/i;

export function selectVisionCandidates(images: SourceWebsiteImage[], maximum = 10): SourceWebsiteImage[] {
  return images.filter((image) => {
    if (image.duplicateOf) return false;
    if (machineryPattern.test(image.filename)) return false;
    if (tinyPattern.test(image.filename)) return false;
    return /\.(?:jpe?g|png|webp|avif)$/i.test(image.filename);
  }).slice(0, maximum);
}

/** Bump to invalidate every cached analysis when prompts/schemas change.
 * v9 (BSRC-DESIGN-P4-003): the plan carries the choice block
 * (archetypeConfidence, selectionReason, alternatives[2]); pre-v9 cached
 * plans never reach the review. */
export const WEBSITE_IMPORT_ANALYSIS_VERSION = "v9-2026-10-02";

/** Locale- and model-neutral content hash of the crawled source. */
export function websiteImportContentHash(research: WebsiteResearch): string {
  return createHash("sha256")
    .update([
      research.sourceUrl,
      research.pages.map((page) => `${page.url}:${page.text.length}`).join("|"),
      research.images.map((image) => image.url).join("|"),
    ].join("\n"))
    .digest("hex");
}

/** Understanding is language-neutral: keyed by content hash + model + version. */
export function websiteImportUnderstandingCacheKey(research: WebsiteResearch, model: string): string {
  return createHash("sha256")
    .update(`website-import:understanding:${WEBSITE_IMPORT_ANALYSIS_VERSION}:${model}:${websiteImportContentHash(research)}`)
    .digest("hex");
}

/** The plan/copy IS locale-scoped: SQ, IT and DE analyses never collide.
 * The resolved category (owner approval or AI detection) is part of the key:
 * a plan built under one category is never served for another. */
export function websiteImportPlanCacheKey(
  research: WebsiteResearch,
  model: string,
  siteLocale: string,
  category?: { categoryKey?: string | null; subcategoryKey?: string | null },
): string {
  const categoryPart = category?.categoryKey
    ? `:${category.categoryKey}/${category.subcategoryKey ?? "-"}`
    : "";
  return createHash("sha256")
    .update(`website-import:plan:${WEBSITE_IMPORT_ANALYSIS_VERSION}:${model}:${siteLocale}:${websiteImportContentHash(research)}${categoryPart}`)
    .digest("hex");
}

/** The canonical key registry parameterizing the import understanding pass. */
export const importCategoryRegistry: CategoryKeyRegistry = {
  familyKeys: businessCategoryFamilies.map((family) => family.key),
  subcategoryKeys: businessCategorySubcategories.map((subcategory) => subcategory.key),
  familyOfSubcategory: (subcategoryKey) =>
    businessCategorySubcategories.find((subcategory) => subcategory.key === subcategoryKey)?.family ?? null,
};

const categoryRegistryList = () => businessCategorySubcategories
  .map((subcategory) => `- ${subcategory.family} / ${subcategory.key}`)
  .join("\n");

const understandingInstructions = (sourceUrl: string, pageLines: string, imageLines: string) => `You are a senior business analyst inspecting a company's existing public website so a professional replacement website can be built.

Source website: ${sourceUrl}
Pages crawled (url | semantic type guess | reason):
${pageLines}

Image candidates (index | url | source page | alt):
${imageLines}

Canonical category registry (family / subcategory):
${categoryRegistryList()}

Analyze ONLY what is present in the provided material. For every image index, classify what the photo actually shows (never judge by filename alone), rate hero suitability (0-10; a hero must show the business's real work/premises with usable space for a headline; logos, favicons, icons, certificates, documents and screenshots are never heroes), and link images to the service or project they belong to. Infer the business type, customers, industries, differentiators, primary call to action, services with a confidence level (never invent services, clients, years, certifications or prices), real projects/references, certifications, locations/service area, and contact facts. Then propose suggestedCategory: the single best-fitting family/subcategory from the canonical registry above, judged from the WHOLE evidence (business summary, industries, services, projects/references, page headings, structured data and contact/business facts) — never from the company name alone. Set confidence 0-1 to reflect how clearly the evidence determines the category, and cite the deciding evidence in reason. If the evidence does not clearly determine any registry entry, set the whole suggestedCategory object to null instead of guessing. List weak/stale/redundant materials worth dropping. Report the language the source website is written in. Keep company, project and service names in their original form.`;

export type WebsiteImportUsageEntry = {
  model: string; inputTokens: number | null; outputTokens: number | null;
  totalTokens: number | null; estimatedCostUsdMicros: number | null;
};

/** Pass 1 — language-neutral business/image understanding (cached per source). */
export async function runUnderstandingPass(
  provider: AiProvider,
  model: string,
  research: WebsiteResearch,
  sourceModel: SourceWebsiteModel,
): Promise<{ understanding: WebsiteUnderstanding; usage: WebsiteImportUsageEntry[] }> {
  const usageTrail: WebsiteImportUsageEntry[] = [];
  const pageLines = sourceModel.pages
    .map((page) => `${page.url} | ${page.type} (${page.hint}) | ${page.title ?? "untitled"} | ${page.textLength} chars`)
    .join("\n");
  const imageLines = sourceModel.visionCandidates
    .map((image) => `${image.index} | ${image.url} | ${image.sourcePage} | alt: ${image.alt || "(none)"}`)
    .join("\n");
  const deterministicFacts = research.pages.flatMap((page) => page.structuredData);
  const home = research.pages[0];
  const understanding = await provider.structured({
    model,
    maxOutputTokens: 6000,
    reasoningEffort: "low",
    instructions: understandingInstructions(research.sourceUrl, pageLines, imageLines),
    input: [
      "Home page text:\n" + (home?.text ?? "").slice(0, 9_000),
      "\nOther page texts (bounded):\n" + research.pages.slice(1).map((page) => `--- ${page.url}\n${page.text.slice(0, 2_500)}`).join("\n"),
      "\nStructured data already extracted (may be empty):\n" + JSON.stringify(deterministicFacts).slice(0, 3_000),
      "\nDeterministic contact hints:\n" + JSON.stringify(research.contactHints).slice(0, 800),
      "\nImage index → url map (use ONLY these indexes in images[]):\n" + sourceModel.images.map((image) => `${image.index}=${image.url}`).join("\n").slice(0, 2_500),
    ].join("\n"),
    imageInputs: sourceModel.visionCandidates.map((image) => ({ url: image.url, detail: "low" as const })),
    schemaName: "website_understanding",
    schema: websiteUnderstandingSchema(importCategoryRegistry),
    validate: (value) => validateWebsiteUnderstanding(value, importCategoryRegistry),
    onUsage: async (usedModel, usage) => {
      usageTrail.push({
        model: usedModel,
        inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null, estimatedCostUsdMicros: usage.estimatedCostUsdMicros ?? null,
      });
    },
  });
  // Attach the resolved source URL to every classified image so the client
  // review can map indexes → assets without guessing.
  for (const image of understanding.value.images) {
    const resolved = sourceModel.images[image.index];
    if (resolved) image.url = resolved.url;
  }
  return { understanding: understanding.value, usage: usageTrail };
}

/* ── structured planner input (BSRC-DESIGN-P4-002) ─────────────────────── */

/** Where the plan's category signal came from; auditable on the document. */
export type PlannerCategorySource = "owner" | "ai" | "legacy";

export type PlannerCategorySignal = {
  categoryKey: string;
  subcategoryKey: string | null;
  /** Detection confidence for "ai"; null for owner/legacy decisions. */
  confidence: number | null;
  source: PlannerCategorySource;
};

export type ImageQualityProfile = {
  totalCandidates: number;
  strongHeroCandidates: number;
  projectImages: number;
  serviceImages: number;
  processImages: number;
  logoOnlyCount: number;
  stockOrPoorCount: number;
  overallQuality: "poor" | "fair" | "good" | "excellent";
};

export type PlannerInput = {
  category: PlannerCategorySignal;
  businessSummary: string;
  audience: string;
  industries: string[];
  services: Array<{ name: string; description: string; confidence: string }>;
  projects: Array<{ name: string; description: string }>;
  imageQualityProfile: ImageQualityProfile;
  primaryCta: string;
  sourceLanguage: string;
  siteLocale: string;
};

/** Visual-evidence profile derived from the understanding's image analysis —
 * the planner reads this instead of a bare photo count to weigh a premium,
 * imagery-led composition against a conservative layout. */
export function buildImageQualityProfile(understanding: WebsiteUnderstanding): ImageQualityProfile {
  const images = understanding.images;
  const count = (predicate: (image: WebsiteUnderstanding["images"][number]) => boolean) => images.filter(predicate).length;
  const neverHero = ["logo", "favicon", "icon", "certificate", "document", "screenshot", "irrelevant"];
  const strongHeroCandidates = count((image) =>
    image.heroSuitability >= 6 && !neverHero.includes(image.classification));
  const projectImages = count((image) => image.classification === "project");
  const serviceImages = count((image) => image.classification === "service" || image.classification === "product");
  const processImages = count((image) => image.classification === "work_process");
  const logoOnlyCount = count((image) => image.classification === "logo" || image.classification === "favicon" || image.classification === "icon");
  const stockOrPoorCount = count((image) =>
    image.quality === "poor" || image.classification === "stock" || image.classification === "decorative" || image.classification === "irrelevant");
  const overallQuality: ImageQualityProfile["overallQuality"] =
    strongHeroCandidates >= 2 && images.length >= 8 ? "excellent"
      : strongHeroCandidates >= 1 && images.length >= 5 ? "good"
        : images.length >= 3 ? "fair" : "poor";
  return { totalCandidates: images.length, strongHeroCandidates, projectImages, serviceImages, processImages, logoOnlyCount, stockOrPoorCount, overallQuality };
}

/** Builds the structured plan-pass input from the understanding and the
 * resolved category signal (priority ladder resolved by the caller). */
export function buildPlannerInput(
  understanding: WebsiteUnderstanding,
  siteLocale: string,
  category: PlannerCategorySignal,
): PlannerInput {
  return {
    category,
    businessSummary: understanding.business.summary,
    audience: understanding.business.customers,
    industries: understanding.business.industries,
    services: understanding.services.map((service) => ({ name: service.name, description: service.description, confidence: service.confidence })),
    projects: understanding.projects.map((project) => ({ name: project.name, description: project.description })),
    imageQualityProfile: buildImageQualityProfile(understanding),
    primaryCta: understanding.business.primaryCta,
    sourceLanguage: understanding.sourceLanguage,
    siteLocale,
  };
}

/** Pass 2 — locale-scoped site plan; retries once, then fails loudly on mixing.
 * Receives the structured PlannerInput signals (P4-002) alongside the full
 * understanding; the plan is cached under a key that includes the category. */
export async function runPlanPass(
  provider: AiProvider,
  model: string,
  plannerInput: PlannerInput,
  understanding: WebsiteUnderstanding,
): Promise<{ plan: WebsiteBuildPlan; usage: WebsiteImportUsageEntry[] }> {
  const siteLocale = plannerInput.siteLocale;
  const templateKeys = ["studio", "clarity", "forge"];
  // The live archetype registries are the single source of the planner's
  // choice space, so the model can only pick combinations the renderer ships.
  const designContract = {
    layoutArchetypes: layoutArchetypeIds.map((id) => ({
      id,
      heroVariants: [...archetypeContracts[id].sections.hero.variants],
      servicesVariants: [...archetypeContracts[id].sections.services.variants],
      projectsVariants: archetypeContracts[id].sections.projects.variants.length && archetypeContracts[id].renderableSections.includes("projects")
        ? [...archetypeContracts[id].sections.projects.variants] : [],
      aboutVariants: [...archetypeContracts[id].sections.about.variants],
      contactVariants: [...archetypeContracts[id].sections.contact.variants],
      trustVariants: archetypeContracts[id].sections.trust ? [...archetypeContracts[id].sections.trust.variants] : [],
      galleryVariants: archetypeContracts[id].sections.gallery ? [...archetypeContracts[id].sections.gallery.variants] : [],
      testimonialsVariants: archetypeContracts[id].sections.testimonials ? [...archetypeContracts[id].sections.testimonials.variants] : [],
      defaultSectionOrder: [...archetypeContracts[id].defaultSectionOrder],
    })),
    themeIdPool: [...siteThemeIds],
    sectionOrderPool: ["hero", "services", "about", "projects", "gallery", "trust", "testimonials", "contact", "appointments", "legal", "footer"],
    density: ["compact", "regular", "spacious"],
    typographyDirection: ["serif-led", "sans-led", "mixed"],
    colorDirection: ["dark", "light", "split"],
    imageStrategy: ["hero-led", "project-led", "balanced", "minimal"],
    ctaStrategy: ["call-first", "form-first", "quote-first", "visit-first"],
  };
  const localeNames: Record<string, string> = {
    sq: "Albanian (shqip)", de: "German (Deutsch)", en: "English",
    fr: "French (français)", es: "Spanish (español)", it: "Italian (italiano)",
  };
  const planInstructions = (strict: boolean) => `You are a senior website planner and copywriter. Using the business understanding JSON, design the BEST possible structure for the replacement website and write fresh, professional copy. Rules: never invent facts (years, certifications, clients, prices, capacities) — reuse only facts present in the understanding; drop anything with low confidence; never copy long passages verbatim; write ALL user-visible copy (headline, supporting, about body, service titles and descriptions, CTA, project names and summaries, trust lines) in ${localeNames[siteLocale] ?? siteLocale} only — ${strict ? "YOUR PREVIOUS ANSWER WAS IN THE WRONG LANGUAGE; writing in " + (localeNames[siteLocale] ?? siteLocale) + " is a strict requirement, even if the source website is in another language" : "the source website language must never leak into the copy"}; set the language field to "${siteLocale}"; do not translate company or brand proper nouns; choose themeKey/templateKey that best fit the business character. Hero image rules: choose imageIndex only from hero-suitable candidates (never a logo/favicon/icon/certificate/screenshot); if no image qualifies set imageIndex=null and needsHeroImage=true. Services may reference their own imageIndex; projects group their reference images only when the understanding provides real evidence. Contact must only use verified contact facts from the understanding. Structured planner signals (plannerSignals) are authoritative context, not decoration: plannerSignals.category is the resolved canonical business category (source "owner" = explicitly approved by the user in this flow, "ai" = detected from the analyzed content, "legacy" = inherited or resolved without a fresh decision); plannerSignals.imageQualityProfile summarizes the verifiable visual evidence (strong hero candidates, project/service/process imagery, logo-only and stock/poor counts, overall quality); plannerSignals.primaryCta, audience, industries and sourceLanguage are analyzed facts. Weigh them together with the understanding: a trades/industrial category with strong project imagery supports bold project-led compositions; professional/advisory categories with sparse imagery support typography-led narratives; booking-led local categories with call/booking CTAs support conversion-first compositions. These are strong signals — the final choice still follows the full content, and a category alone never hardcodes an archetype.
Design decisions — this is the core planning act, choose deliberately and explain nothing here (reasons go in notes): pick layoutArchetype from the business character: industrial-bold for construction/manufacturing/trades/logistics with real project photos and inquiry CTAs; editorial-premium for professional/premium services (law, consulting, architecture, premium studios) where typography and narrative lead; local-service-conversion for neighborhood/booking-led services (beauty, cleaning, repair, tree service) where phone/booking dominate; prefer the legacy studio/clarity/forge archetypes only when they genuinely fit better. Then choose heroVariant, sectionVariants, density (content volume), typographyDirection and colorDirection (brand character), imageStrategy (photo count/quality), ctaStrategy (the business's primary call to action), and sectionOrder — an ordering of allowed sections that fits how this business sells (project-led trades put projects before contact; conversion-led local services put trust right after the hero; editorial narratives put about before services). Use ONLY ids from designContract for the chosen archetype; unknown ids are rejected. Projects and trust: reuse only names/summaries/lines present in the understanding — never invent.
Choice record — the user will see your recommendation next to up to two alternatives and picks one: set archetypeConfidence to 0-1, how certain you are that the recommended composition is the best possible fit for THIS business; write selectionReason — 2-3 sentences naming the deciding evidence (category/subcategory, the imageQualityProfile numbers, services and projects depth, audience, primaryCta, brand character). Then alternatives: up to TWO other compositions from designContract that would also genuinely serve this business well. Each alternative must be a different composition — change the archetype, or change heroVariant together with sectionOrder AND imageStrategy or ctaStrategy; never the same layout with only another hero variant. Fill every alternative field completely (themeId from themeIdPool) and give each one an honest reason naming what it optimizes (stronger visual proof, calmer reading, faster booking path). A weak or near-identical alternative is worse than none: return fewer if only one is genuine, and none rather than padding.`;
  const planInput = JSON.stringify({
    siteLocale,
    availableTemplateKeys: templateKeys,
    designContract,
    plannerSignals: plannerInput,
    understanding,
  }).slice(0, 30_000);
  const usageTrail: WebsiteImportUsageEntry[] = [];
  const call = (instructions: string) => provider.structured({
    model,
    maxOutputTokens: 6000,
    reasoningEffort: "low",
    instructions,
    input: planInput,
    schemaName: "website_build_plan",
    schema: websiteBuildPlanSchema(siteLocale, templateKeys),
    validate: (value) => validateWebsiteBuildPlan(value, templateKeys),
    onUsage: async (usedModel, usage) => {
      usageTrail.push({
        model: usedModel,
        inputTokens: usage.inputTokens ?? null, outputTokens: usage.outputTokens ?? null,
        totalTokens: usage.totalTokens ?? null, estimatedCostUsdMicros: usage.estimatedCostUsdMicros ?? null,
      });
    },
  });
  const first = await call(planInstructions(false));
  usageTrail.push({
    model: first.model,
    inputTokens: first.usage.inputTokens ?? null, outputTokens: first.usage.outputTokens ?? null,
    totalTokens: first.usage.totalTokens ?? null, estimatedCostUsdMicros: first.usage.estimatedCostUsdMicros ?? null,
  });
  let plan = first.value;
  // No-language-mixing guard, two independent checks:
  // 1. the model's declared language must equal the requested siteLocale;
  // 2. heuristic detection on the copy must not clearly contradict it.
  const mismatch = (candidate: WebsiteBuildPlan) => {
    if (candidate.language !== siteLocale) return `declared ${candidate.language}`;
    const copySample = [candidate.hero.headline, candidate.hero.supporting, candidate.about.body, ...candidate.services.map((service) => service.description)].join("\n");
    const detected = detectWebsiteLanguage(copySample);
    return detected && detected !== siteLocale ? `copy reads as ${detected}` : null;
  };
  let reason = mismatch(plan);
  if (reason) {
    const retry = await call(planInstructions(true));
    usageTrail.push({
      model: retry.model,
      inputTokens: retry.usage.inputTokens ?? null, outputTokens: retry.usage.outputTokens ?? null,
      totalTokens: retry.usage.totalTokens ?? null, estimatedCostUsdMicros: retry.usage.estimatedCostUsdMicros ?? null,
    });
    plan = retry.value;
    reason = mismatch(plan);
    if (reason) throw new PlanLocaleMismatchError(reason, siteLocale);
  }
  // Stamp pipeline versions so the decisions are traceable end to end. These
  // are never model output; the schema does not accept them.
  plan.plannerVersion = `website-import/${WEBSITE_IMPORT_ANALYSIS_VERSION}`;
  plan.generatorVersion = SITE_GENERATOR_VERSION;
  return { plan, usage: usageTrail };
}

/** Fails the AI stage (→ deterministic fallback) when plan copy is mixed-language. */
export class PlanLocaleMismatchError extends Error {
  constructor(readonly detected: string, readonly requested: string) {
    super(`Website build plan was written in ${detected} instead of ${requested}.`);
    this.name = "PlanLocaleMismatchError";
  }
}

/* Design-option selection (BSRC-DESIGN-P4-003) lives in ./design-choice — a
 * client-safe module (no node builtins, no site-data boundary) because the
 * browser review component imports it directly. Re-exported here for
 * server-side and test consumers. */
export { planDesignOptions, chosenDesignInput, type WebsiteDesignOption } from "./design-choice";


export type WebsiteImportAnalysisCacheRow = {
  cacheKey: string; sourceUrl: string; model: string;
  understanding: WebsiteUnderstanding | null; plan: WebsiteBuildPlan | null; createdAt: string;
};

/** Repository-backed cache access (procedure-only table, runtime boundary). */
export async function readAnalysisCache(cacheKey: string): Promise<WebsiteImportAnalysisCacheRow | null> {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) return null;
  const repository = new (await import("@platform/site-data")).PostgresSiteRepository({ boundary: "runtime" });
  const row = await repository.readWebsiteImportAnalysisCache(cacheKey);
  if (!row) return null;
  return {
    cacheKey: row.cacheKey, sourceUrl: row.sourceUrl, model: row.model,
    understanding: (row.payload?.understanding as WebsiteUnderstanding | undefined) ?? null,
    plan: (row.payload?.plan as WebsiteBuildPlan | undefined) ?? null,
    createdAt: row.createdAt,
  };
}

export async function writeAnalysisCache(row: WebsiteImportAnalysisCacheRow): Promise<void> {
  const repository = new (await import("@platform/site-data")).PostgresSiteRepository({ boundary: "runtime" });
  await repository.writeWebsiteImportAnalysisCache({
    cacheKey: row.cacheKey, sourceUrl: row.sourceUrl, model: row.model,
    understanding: row.understanding, plan: row.plan,
  });
}

/** Deterministic guards applied after the model output, before anything reaches the review. */
export function enforcePlanGuards(
  plan: WebsiteBuildPlan,
  understanding: WebsiteUnderstanding,
  images: SourceWebsiteImage[],
): { plan: WebsiteBuildPlan; heroDroppedReason: string | null } {
  const byIndex = new Map(images.map((image) => [image.index, image]));
  const classificationOf = new Map(understanding.images.map((image) => [image.index, image]));
  let heroDroppedReason: string | null = null;
  const safePlan: WebsiteBuildPlan = { ...plan, hero: { ...plan.hero } };
  if (safePlan.hero.imageIndex !== null) {
    const candidate = byIndex.get(safePlan.hero.imageIndex);
    const classified = classificationOf.get(safePlan.hero.imageIndex);
    if (!candidate) {
      safePlan.hero.imageIndex = null;
      heroDroppedReason = "hero index not part of the source inventory";
    } else if (classified && nonHeroImageClassifications.includes(classified.classification)) {
      safePlan.hero.imageIndex = null;
      heroDroppedReason = `${classified.classification} images are never heroes`;
    } else if (classified && (classified.heroSuitability < 5 || classified.confidence < 0.4)) {
      safePlan.hero.imageIndex = null;
      heroDroppedReason = `hero suitability too low (${classified.heroSuitability}/10, confidence ${classified.confidence})`;
    } else if (!/\.(?:jpe?g|png|webp|avif)$/i.test(new URL(candidate.url).pathname)) {
      safePlan.hero.imageIndex = null;
      heroDroppedReason = "hero candidate is not a raster image file";
    }
  }
  if (safePlan.hero.imageIndex === null) safePlan.needsHeroImage = true;
  return { plan: safePlan, heroDroppedReason };
}

/** Human-readable role label for a source image, from the understanding pass. */
export function imageRoleLabel(
  image: SourceWebsiteImage,
  understanding: WebsiteUnderstanding | null,
  plan: WebsiteBuildPlan | null,
): { label: string; reason?: string } {
  if (!understanding) return { label: "Unclassified" };
  const classified = understanding.images.find((entry) => entry.index === image.index);
  if (!classified) return { label: "Unused", reason: "not analyzed as a valuable candidate" };
  const role = (() => {
    if (plan && plan.hero.imageIndex === image.index) return `Hero`;
    if (plan && plan.about.imageIndexes.includes(image.index)) return `About`;
    if (plan) {
      const service = plan.services.find((service) => service.imageIndex === image.index);
      if (service) return `Service: ${service.title}`;
      const project = plan.projects.find((project) => project.imageIndexes.includes(image.index));
      if (project) return `Project: ${project.name}`;
    }
    switch (classified.classification) {
      case "logo": return "Logo";
      case "favicon": return "Favicon";
      case "hero_candidate": return "Hero candidate";
      case "service": case "product": return `Service: ${classified.relatedService ?? classified.description.slice(0, 40)}`;
      case "project": return `Project: ${classified.relatedProject ?? classified.description.slice(0, 40)}`;
      case "team": return "Team";
      case "work_process": return "Process";
      case "building": case "equipment": case "vehicle": return "Business photo";
      case "certificate": case "document": return "Certificate/document";
      case "icon": case "decorative": case "screenshot": case "stock": case "irrelevant": return "Unused";
      default: return classified.classification;
    }
  })();
  return { label: role, reason: classified.reason };
}
