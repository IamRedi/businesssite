import { themeKeys, type AiThemeKey } from "./index";

/** Semantic page classification for an imported source website. */
export const sourcePageTypes = [
  "homepage", "about", "services", "projects", "products", "team",
  "contact", "gallery", "certifications", "legal", "other",
] as const;
export type SourcePageType = (typeof sourcePageTypes)[number];

/** Vision classification for a source image candidate. */
export const sourceImageClassifications = [
  "logo", "favicon", "hero_candidate", "service", "project", "product",
  "team", "work_process", "building", "equipment", "vehicle",
  "certificate", "document", "decorative", "icon", "screenshot",
  "stock", "irrelevant",
] as const;
export type SourceImageClassification = (typeof sourceImageClassifications)[number];

/** Classifications that must never be selected as the hero image. */
export const nonHeroImageClassifications: readonly SourceImageClassification[] = [
  "logo", "favicon", "icon", "certificate", "document", "screenshot", "irrelevant",
];

/** AI-proposed canonical business category (P4-002). Validated against the
 * business-category-registry by the caller; unknown keys are discarded to
 * null so free-text or stale category strings can never become authority. */
export type WebsiteSuggestedCategory = {
  /** Registry family key (e.g. construction-trades). */
  categoryKey: string;
  /** Registry subcategory key when the evidence supports one, else null. */
  subcategoryKey: string | null;
  /** 0..1 detection confidence. */
  confidence: number;
  /** Evidence citation from the analyzed content. */
  reason: string;
};

/** The canonical key registry the schema/validation are parameterized with. */
export type CategoryKeyRegistry = {
  familyKeys: readonly string[];
  subcategoryKeys: readonly string[];
  familyOfSubcategory: (subcategoryKey: string) => string | null;
};

export type WebsiteUnderstanding = {
  business: {
    summary: string;
    does: string;
    customers: string;
    industries: string[];
    valueProposition: string;
    differentiators: string[];
    primaryCta: string;
  };
  suggestedCategory: WebsiteSuggestedCategory | null;
  services: Array<{ name: string; description: string; confidence: "high" | "medium" | "low" }>;
  projects: Array<{ name: string; description: string }>;
  certifications: string[];
  locations: string[];
  contact: { phone: string | null; email: string | null; address: string | null; city: string | null };
  openingHours: string[];
  socialLinks: string[];
  pageTypes: Array<{ url: string; type: SourcePageType; reason: string }>;
  images: Array<{
    index: number;
    /** Resolved source URL, attached from the SourceWebsiteModel after analysis. */
    url?: string;
    classification: SourceImageClassification;
    description: string;
    relatedService: string | null;
    relatedProject: string | null;
    quality: "poor" | "fair" | "good" | "excellent";
    heroSuitability: number;
    confidence: number;
    reason: string;
  }>;
  weakMaterials: string[];
  sourceLanguage: string;
  notes: string[];
};

export type WebsiteBuildPlanDesign = {
  /** Composition archetype; the pipeline validates against the live catalog. */
  layoutArchetype?: string;
  heroVariant?: string;
  sectionOrder?: string[];
  sectionVariants?: {
    services?: string;
    projects?: string;
    about?: string;
    contact?: string;
  };
  density?: string;
  visualStyle?: string;
  typographyDirection?: string;
  colorDirection?: string;
  imageStrategy?: string;
  ctaStrategy?: string;
};

/** A genuinely different composition the planner offers alongside its
 * recommendation (BSRC-DESIGN-P4-003). Bounded passthrough: the pipeline
 * re-validates every id against the live engine registries before the
 * option reaches the review. */
export type WebsitePlanDesignAlternative = {
  archetype: string;
  heroVariant: string;
  sectionVariants: {
    services?: string;
    projects?: string;
    about?: string;
    contact?: string;
  };
  sectionOrder: string[];
  themeId: string;
  typographyDirection: string;
  imageStrategy: string;
  ctaStrategy: string;
  reason: string;
};

export type WebsiteBuildPlan = {
  /** ISO-639-1 code the model declares for its copy; validated against siteLocale. */
  language: string;
  themeKey: AiThemeKey;
  templateKey: string;
  hero: { headline: string; supporting: string; cta: string; imageIndex: number | null };
  about: { title: string; body: string; imageIndexes: number[] };
  services: Array<{ title: string; description: string; imageIndex: number | null }>;
  projects: Array<{ name: string; summary: string; imageIndexes: number[] }>;
  trust: string[];
  contact: { phone: string | null; email: string | null; address: string | null; city: string | null };
  needsHeroImage: boolean;
  notes: string[];
  /** v2 design decisions (BSRC-DESIGN-FOUNDATION-001). Absent on cached v1 plans. */
  design?: WebsiteBuildPlanDesign;
  /** P4-003 choice block: how confident the planner is in design.layoutArchetype,
   * why it fits this business, and up to two genuinely different alternatives. */
  archetypeConfidence?: number;
  selectionReason?: string;
  alternatives?: WebsitePlanDesignAlternative[];
  /** Stamped by the pipeline after validation; never model output. */
  plannerVersion?: string;
  generatorVersion?: string;
};

const string = (value: unknown, key: string, max: number) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI output is missing ${key}.`);
  return value.trim().slice(0, max);
};
const optionalString = (value: unknown, max: number) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, max);
};
const stringArray = (value: unknown, key: string, maxItems: number, maxLen: number) => {
  if (!Array.isArray(value)) throw new Error(`AI output is missing ${key}.`);
  return value
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxLen));
};
const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const boundedInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === "number" ? Math.round(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const bounded = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

export const websiteUnderstandingSchema = (registry?: CategoryKeyRegistry) => ({
  type: "object",
  properties: {
    business: {
      type: "object",
      properties: {
        summary: { type: "string" }, does: { type: "string" }, customers: { type: "string" },
        industries: { type: "array", items: { type: "string" } },
        valueProposition: { type: "string" }, differentiators: { type: "array", items: { type: "string" } },
        primaryCta: { type: "string" },
      },
      required: ["summary", "does", "customers", "industries", "valueProposition", "differentiators", "primaryCta"],
      additionalProperties: false,
    },
    services: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] } },
        required: ["name", "description", "confidence"], additionalProperties: false,
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, description: { type: "string" } },
        required: ["name", "description"], additionalProperties: false,
      },
    },
    certifications: { type: "array", items: { type: "string" } },
    locations: { type: "array", items: { type: "string" } },
    contact: {
      type: "object",
      properties: {
        phone: { type: ["string", "null"] }, email: { type: ["string", "null"] },
        address: { type: ["string", "null"] }, city: { type: ["string", "null"] },
      },
      required: ["phone", "email", "address", "city"], additionalProperties: false,
    },
    openingHours: { type: "array", items: { type: "string" } },
    socialLinks: { type: "array", items: { type: "string" } },
    pageTypes: {
      type: "array",
      items: {
        type: "object",
        properties: { url: { type: "string" }, type: { type: "string", enum: [...sourcePageTypes] }, reason: { type: "string" } },
        required: ["url", "type", "reason"], additionalProperties: false,
      },
    },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" }, url: { type: ["string", "null"] },
          classification: { type: "string", enum: [...sourceImageClassifications] },
          description: { type: "string" }, relatedService: { type: ["string", "null"] },
          relatedProject: { type: ["string", "null"] },
          quality: { type: "string", enum: ["poor", "fair", "good", "excellent"] },
          heroSuitability: { type: "integer" }, confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["index", "url", "classification", "description", "relatedService", "relatedProject", "quality", "heroSuitability", "confidence", "reason"],
        additionalProperties: false,
      },
    },
    weakMaterials: { type: "array", items: { type: "string" } },
    sourceLanguage: { type: "string" },
    notes: { type: "array", items: { type: "string" } },
    suggestedCategory: {
      type: ["object", "null"],
      properties: {
        // With the registry, the model can only emit canonical keys or null;
        // the keys are part of the enum so unknown values are impossible.
        categoryKey: registry
          ? { type: ["string", "null"], enum: [null, ...registry.familyKeys] }
          : { type: ["string", "null"] },
        subcategoryKey: registry
          ? { type: ["string", "null"], enum: [null, ...registry.subcategoryKeys] }
          : { type: ["string", "null"] },
        confidence: { type: ["number", "null"] },
        reason: { type: ["string", "null"] },
      },
      required: ["categoryKey", "subcategoryKey", "confidence", "reason"],
      additionalProperties: false,
    },
  },
  required: ["business", "suggestedCategory", "services", "projects", "certifications", "locations", "contact", "openingHours", "socialLinks", "pageTypes", "images", "weakMaterials", "sourceLanguage", "notes"],
  additionalProperties: false,
}) as const;

const knownCategoryKeys = (
  registry: CategoryKeyRegistry | undefined,
  categoryKey: unknown,
  subcategoryKey: unknown,
): { categoryKey: string | null; subcategoryKey: string | null } | null => {
  const family = optionalString(categoryKey, 60);
  const subcategory = optionalString(subcategoryKey, 60);
  if (!registry) return { categoryKey: family, subcategoryKey: subcategory };
  const validSubcategory = subcategory && registry.subcategoryKeys.includes(subcategory) ? subcategory : null;
  const validFamily = family && registry.familyKeys.includes(family) ? family : null;
  // Unknown keys are discarded; a known subcategory normalizes its family.
  if (validSubcategory) {
    return { categoryKey: validFamily ?? registry.familyOfSubcategory(validSubcategory), subcategoryKey: validSubcategory };
  }
  if (validFamily) return { categoryKey: validFamily, subcategoryKey: null };
  return null;
};

export function validateWebsiteUnderstanding(value: unknown, registry?: CategoryKeyRegistry): WebsiteUnderstanding {
  if (!value || typeof value !== "object") throw new Error("AI understanding output is malformed.");
  const input = value as Record<string, unknown>;
  const business = input.business as Record<string, unknown> | undefined;
  if (!business) throw new Error("AI understanding output is missing business.");
  const contact = (input.contact ?? {}) as Record<string, unknown>;
  return {
    business: {
      summary: string(business.summary, "business.summary", 700),
      does: string(business.does, "business.does", 500),
      customers: string(business.customers, "business.customers", 400),
      industries: stringArray(business.industries, "business.industries", 8, 80),
      valueProposition: string(business.valueProposition, "business.valueProposition", 500),
      differentiators: stringArray(business.differentiators, "business.differentiators", 8, 200),
      primaryCta: string(business.primaryCta, "business.primaryCta", 120),
    },
    services: (Array.isArray(input.services) ? input.services : []).slice(0, 12).map((service) => {
      const item = (service ?? {}) as Record<string, unknown>;
      return {
        name: string(item.name, "service.name", 120),
        description: string(item.description, "service.description", 400),
        confidence: enumValue(item.confidence, ["high", "medium", "low"] as const, "medium"),
      };
    }),
    projects: (Array.isArray(input.projects) ? input.projects : []).slice(0, 12).map((project) => {
      const item = (project ?? {}) as Record<string, unknown>;
      return { name: string(item.name, "project.name", 120), description: string(item.description, "project.description", 400) };
    }),
    certifications: stringArray(input.certifications, "certifications", 10, 160),
    locations: stringArray(input.locations, "locations", 10, 160),
    contact: {
      phone: optionalString(contact.phone, 40),
      email: optionalString(contact.email, 160),
      address: optionalString(contact.address, 200),
      city: optionalString(contact.city, 100),
    },
    openingHours: stringArray(input.openingHours, "openingHours", 10, 80),
    socialLinks: stringArray(input.socialLinks, "socialLinks", 8, 300),
    pageTypes: (Array.isArray(input.pageTypes) ? input.pageTypes : []).slice(0, 20).map((page) => {
      const item = (page ?? {}) as Record<string, unknown>;
      return {
        url: string(item.url, "pageType.url", 300),
        type: enumValue(item.type, sourcePageTypes, "other"),
        reason: string(item.reason, "pageType.reason", 200),
      };
    }),
    images: (Array.isArray(input.images) ? input.images : []).slice(0, 24).map((image) => {
      const item = (image ?? {}) as Record<string, unknown>;
      return {
        index: boundedInt(item.index, 0, 99, 0),
        url: optionalString(item.url, 500) ?? undefined,
        classification: enumValue(item.classification, sourceImageClassifications, "stock"),
        description: string(item.description, "image.description", 300),
        relatedService: optionalString(item.relatedService, 120),
        relatedProject: optionalString(item.relatedProject, 120),
        quality: enumValue(item.quality, ["poor", "fair", "good", "excellent"] as const, "fair"),
        heroSuitability: boundedInt(item.heroSuitability, 0, 10, 0),
        confidence: Math.min(1, Math.max(0, typeof item.confidence === "number" ? item.confidence : 0)),
        reason: string(item.reason, "image.reason", 240),
      };
    }),
    weakMaterials: stringArray(input.weakMaterials, "weakMaterials", 10, 200),
    sourceLanguage: string(input.sourceLanguage, "sourceLanguage", 12).toLowerCase(),
    notes: stringArray(input.notes, "notes", 8, 300),
    suggestedCategory: (() => {
      const raw = input.suggestedCategory;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const candidate = raw as Record<string, unknown>;
      const keys = knownCategoryKeys(registry, candidate.categoryKey, candidate.subcategoryKey);
      if (!keys?.categoryKey) return null;
      const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
        ? Math.min(1, Math.max(0, candidate.confidence))
        : 0;
      return {
        categoryKey: keys.categoryKey,
        subcategoryKey: keys.subcategoryKey,
        confidence,
        reason: optionalString(candidate.reason, 300) ?? "",
      };
    })(),
  };
}

export const websiteBuildPlanSchema = (siteLocale: string, templateKeys: readonly string[]) => ({
  type: "object",
  properties: {
    /** ISO-639-1 code of the language the copy was written in — must equal the requested siteLocale. */
    language: { type: "string", enum: [siteLocale] },
    themeKey: { type: "string", enum: [...themeKeys] },
    templateKey: { type: "string", enum: [...templateKeys] },
    hero: {
      type: "object",
      properties: {
        headline: { type: "string" }, supporting: { type: "string" }, cta: { type: "string" },
        imageIndex: { type: ["integer", "null"] },
      },
      required: ["headline", "supporting", "cta", "imageIndex"], additionalProperties: false,
    },
    about: {
      type: "object",
      properties: {
        title: { type: "string" }, body: { type: "string" },
        imageIndexes: { type: "array", items: { type: "integer" } },
      },
      required: ["title", "body", "imageIndexes"], additionalProperties: false,
    },
    services: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" }, description: { type: "string" },
          imageIndex: { type: ["integer", "null"] },
        },
        required: ["title", "description", "imageIndex"], additionalProperties: false,
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, summary: { type: "string" },
          imageIndexes: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "summary", "imageIndexes"], additionalProperties: false,
      },
    },
    trust: { type: "array", items: { type: "string" } },
    contact: {
      type: "object",
      properties: {
        phone: { type: ["string", "null"] }, email: { type: ["string", "null"] },
        address: { type: ["string", "null"] }, city: { type: ["string", "null"] },
      },
      required: ["phone", "email", "address", "city"], additionalProperties: false,
    },
    needsHeroImage: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
    // OpenAI strict structured output requires every object level to list
    // `required` with ALL property keys; optional fields are nullable instead.
    // The 2026-10-02 production outage (engine=deterministic for every import)
    // was exactly this violation on design.sectionVariants (BSRC-DESIGN-P3-002).
    design: {
      type: ["object", "null"],
      properties: {
        layoutArchetype: { type: ["string", "null"] },
        heroVariant: { type: ["string", "null"] },
        sectionOrder: { type: ["array", "null"], items: { type: "string" } },
        sectionVariants: {
          type: ["object", "null"],
          properties: {
            services: { type: ["string", "null"] },
            projects: { type: ["string", "null"] },
            about: { type: ["string", "null"] },
            contact: { type: ["string", "null"] },
          },
          required: ["services", "projects", "about", "contact"],
          additionalProperties: false,
        },
        density: { type: ["string", "null"] },
        visualStyle: { type: ["string", "null"] },
        typographyDirection: { type: ["string", "null"] },
        colorDirection: { type: ["string", "null"] },
        imageStrategy: { type: ["string", "null"] },
        ctaStrategy: { type: ["string", "null"] },
      },
      required: ["layoutArchetype", "heroVariant", "sectionOrder", "sectionVariants", "density", "visualStyle", "typographyDirection", "colorDirection", "imageStrategy", "ctaStrategy"],
      additionalProperties: false,
    },
    // P4-003 choice block (BSRC-DESIGN-P4-003). Same strict rule as design:
    // every object level lists ALL property keys as required; optional values
    // are nullable instead (the 2026-10-02 production outage class).
    archetypeConfidence: { type: ["number", "null"] },
    selectionReason: { type: ["string", "null"] },
    alternatives: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          archetype: { type: ["string", "null"] },
          heroVariant: { type: ["string", "null"] },
          sectionVariants: {
            type: ["object", "null"],
            properties: {
              services: { type: ["string", "null"] },
              projects: { type: ["string", "null"] },
              about: { type: ["string", "null"] },
              contact: { type: ["string", "null"] },
            },
            required: ["services", "projects", "about", "contact"],
            additionalProperties: false,
          },
          sectionOrder: { type: ["array", "null"], items: { type: "string" } },
          themeId: { type: ["string", "null"] },
          typographyDirection: { type: ["string", "null"] },
          imageStrategy: { type: ["string", "null"] },
          ctaStrategy: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
        },
        required: ["archetype", "heroVariant", "sectionVariants", "sectionOrder", "themeId", "typographyDirection", "imageStrategy", "ctaStrategy", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["language", "themeKey", "templateKey", "hero", "about", "services", "projects", "trust", "contact", "needsHeroImage", "notes", "design", "archetypeConfidence", "selectionReason", "alternatives"],
  additionalProperties: false,
}) as const;

export function validateWebsiteBuildPlan(value: unknown, templateKeys: readonly string[]): WebsiteBuildPlan {
  if (!value || typeof value !== "object") throw new Error("AI build plan output is malformed.");
  const input = value as Record<string, unknown>;
  const themeKey = enumValue(input.themeKey, themeKeys, "auto");
  const templateKey = typeof input.templateKey === "string" && templateKeys.includes(input.templateKey)
    ? input.templateKey
    : templateKeys[0];
  if (!templateKey) throw new Error("AI build plan output is missing templateKey.");
  const hero = (input.hero ?? {}) as Record<string, unknown>;
  const about = (input.about ?? {}) as Record<string, unknown>;
  const contact = (input.contact ?? {}) as Record<string, unknown>;
  const imageIndexes = (value: unknown, max: number) =>
    (Array.isArray(value) ? value : [])
      .filter((index): index is number => Number.isInteger(index) && (index as number) >= 0)
      .slice(0, max);
  return {
    language: string(input.language, "plan.language", 8).toLowerCase(),
    themeKey,
    templateKey,
    hero: {
      headline: string(hero.headline, "hero.headline", 160),
      supporting: string(hero.supporting, "hero.supporting", 300),
      cta: string(hero.cta, "hero.cta", 80),
      imageIndex: typeof hero.imageIndex === "number" && Number.isInteger(hero.imageIndex) && hero.imageIndex >= 0 ? hero.imageIndex : null,
    },
    about: {
      title: string(about.title, "about.title", 160),
      body: string(about.body, "about.body", 1600),
      imageIndexes: imageIndexes(about.imageIndexes, 6),
    },
    services: (Array.isArray(input.services) ? input.services : []).slice(0, 6).map((service) => {
      const item = (service ?? {}) as Record<string, unknown>;
      return {
        title: string(item.title, "service.title", 120),
        description: string(item.description, "service.description", 400),
        imageIndex: typeof item.imageIndex === "number" && Number.isInteger(item.imageIndex) && item.imageIndex >= 0 ? item.imageIndex : null,
      };
    }),
    projects: (Array.isArray(input.projects) ? input.projects : []).slice(0, 8).map((project) => {
      const item = (project ?? {}) as Record<string, unknown>;
      return {
        name: string(item.name, "project.name", 120),
        summary: string(item.summary, "project.summary", 300),
        imageIndexes: imageIndexes(item.imageIndexes, 4),
      };
    }),
    trust: stringArray(input.trust, "trust", 6, 160),
    contact: {
      phone: optionalString(contact.phone, 40),
      email: optionalString(contact.email, 160),
      address: optionalString(contact.address, 200),
      city: optionalString(contact.city, 100),
    },
    needsHeroImage: input.needsHeroImage === true,
    notes: stringArray(input.notes, "notes", 8, 300),
    ...validatePlanChoice(input, (() => {
      const rawDesign = (input.design && typeof input.design === "object" && !Array.isArray(input.design) ? input.design : {}) as Record<string, unknown>;
      return {
        archetype: bounded(rawDesign.layoutArchetype, 40) ?? "",
        heroVariant: bounded(rawDesign.heroVariant, 40) ?? "",
        sectionOrder: Array.isArray(rawDesign.sectionOrder) ? rawDesign.sectionOrder.filter((item): item is string => typeof item === "string") : [],
        imageStrategy: bounded(rawDesign.imageStrategy, 20) ?? "",
        ctaStrategy: bounded(rawDesign.ctaStrategy, 20) ?? "",
      };
    })()),
    ...(input.design && typeof input.design === "object"
      ? { design: validatePlanDesign(input.design as Record<string, unknown>) }
      : {}),
  };
}

/** Parses the P4-003 choice block: confidence clamped to 0..1, the selection
 * reason bounded, and at most two alternatives — near-identical fillers
 * (same archetype, hero, section order, image and CTA strategy as the
 * recommendation or as another alternative) are dropped rather than offered. */
function validatePlanChoice(
  input: Record<string, unknown>,
  recommended: { archetype: string; heroVariant: string; sectionOrder: string[]; imageStrategy: string; ctaStrategy: string },
): Pick<WebsiteBuildPlan, "archetypeConfidence" | "selectionReason" | "alternatives"> {
  const archetypeConfidence = typeof input.archetypeConfidence === "number" && Number.isFinite(input.archetypeConfidence)
    ? Math.min(1, Math.max(0, input.archetypeConfidence))
    : undefined;
  const selectionReason = bounded(input.selectionReason, 500);
  const alternatives = (() => {
    if (!Array.isArray(input.alternatives)) return undefined;
    const fingerprint = (candidate: { archetype: string; heroVariant: string; sectionOrder: string[]; imageStrategy: string; ctaStrategy: string }) =>
      [candidate.archetype.toLowerCase(), candidate.heroVariant.toLowerCase(), candidate.sectionOrder.join(">"), candidate.imageStrategy.toLowerCase(), candidate.ctaStrategy.toLowerCase()].join("|");
    const recommendedFingerprint = fingerprint(recommended);
    const seen = new Set<string>([recommendedFingerprint]);
    const parsed: WebsitePlanDesignAlternative[] = [];
    for (const entry of input.alternatives.slice(0, 4)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const raw = entry as Record<string, unknown>;
      const archetype = bounded(raw.archetype, 40);
      if (!archetype) continue;
      const candidate = {
        archetype,
        heroVariant: bounded(raw.heroVariant, 40) ?? "",
        sectionVariants: (() => {
          const variants = (raw.sectionVariants && typeof raw.sectionVariants === "object" ? raw.sectionVariants : {}) as Record<string, unknown>;
          const cleaned: WebsitePlanDesignAlternative["sectionVariants"] = {};
          for (const key of ["services", "projects", "about", "contact"] as const) {
            const value = bounded(variants[key], 40);
            if (value) cleaned[key] = value;
          }
          return cleaned;
        })(),
        sectionOrder: Array.isArray(raw.sectionOrder)
          ? raw.sectionOrder.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item) => item.trim().slice(0, 40))
          : [],
        themeId: bounded(raw.themeId, 40) ?? "",
        typographyDirection: bounded(raw.typographyDirection, 20) ?? "",
        imageStrategy: bounded(raw.imageStrategy, 20) ?? "",
        ctaStrategy: bounded(raw.ctaStrategy, 20) ?? "",
        reason: bounded(raw.reason, 300) ?? "",
      };
      const candidateFingerprint = fingerprint(candidate);
      if (seen.has(candidateFingerprint)) continue;
      seen.add(candidateFingerprint);
      parsed.push(candidate);
      if (parsed.length === 2) break;
    }
    return parsed.length ? parsed : undefined;
  })();
  return {
    ...(archetypeConfidence !== undefined ? { archetypeConfidence } : {}),
    ...(selectionReason ? { selectionReason } : {}),
    ...(alternatives ? { alternatives } : {}),
  };
}

/** Bounded passthrough for the v2 design decisions; the engine re-validates against its live registries. */
function validatePlanDesign(design: Record<string, unknown>): WebsiteBuildPlanDesign {
  const bounded = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
  const variants = (design.sectionVariants && typeof design.sectionVariants === "object" ? design.sectionVariants : {}) as Record<string, unknown>;
  return {
    ...(bounded(design.layoutArchetype, 40) ? { layoutArchetype: bounded(design.layoutArchetype, 40) } : {}),
    ...(bounded(design.heroVariant, 40) ? { heroVariant: bounded(design.heroVariant, 40) } : {}),
    ...(Array.isArray(design.sectionOrder)
      ? { sectionOrder: design.sectionOrder.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12).map((item) => item.trim().slice(0, 40)) }
      : {}),
    ...(Object.values(variants).some(Boolean)
      ? {
        sectionVariants: {
          ...(bounded(variants.services, 40) ? { services: bounded(variants.services, 40) } : {}),
          ...(bounded(variants.projects, 40) ? { projects: bounded(variants.projects, 40) } : {}),
          ...(bounded(variants.about, 40) ? { about: bounded(variants.about, 40) } : {}),
          ...(bounded(variants.contact, 40) ? { contact: bounded(variants.contact, 40) } : {}),
        },
      }
      : {}),
    ...(bounded(design.density, 20) ? { density: bounded(design.density, 20) } : {}),
    ...(bounded(design.visualStyle, 40) ? { visualStyle: bounded(design.visualStyle, 40) } : {}),
    ...(bounded(design.typographyDirection, 20) ? { typographyDirection: bounded(design.typographyDirection, 20) } : {}),
    ...(bounded(design.colorDirection, 20) ? { colorDirection: bounded(design.colorDirection, 20) } : {}),
    ...(bounded(design.imageStrategy, 20) ? { imageStrategy: bounded(design.imageStrategy, 20) } : {}),
    ...(bounded(design.ctaStrategy, 20) ? { ctaStrategy: bounded(design.ctaStrategy, 20) } : {}),
  };
}
