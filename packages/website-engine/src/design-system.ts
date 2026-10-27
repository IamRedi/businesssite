import type {
  AboutVariantId,
  ColorDirection,
  ContactVariantId,
  DesignSystemVersion,
  HeroVariantId,
  LayoutArchetypeId,
  ProjectsVariantId,
  ServicesVariantId,
  SiteCtaStrategy,
  SiteDensity,
  SiteDesign,
  SiteDesignPlanSource,
  SiteImageStrategy,
  SiteSectionId,
  SiteThemeId,
  TypographyDirection,
} from "./contracts";

/* ── ds/1 design system (BSRC-DESIGN-FOUNDATION-001) ───────────────────────
   Registries and guards for the versioned design pipeline. Everything here
   is neutral and framework-independent: no product, person or brand names.

   Contract rules enforced by this module:
   1. A theme never changes composition (the legacy gold→luxury hijack is
      impossible for documents carrying a design block).
   2. Unknown archetype ids / design-system versions fail safe: the caller
      falls back to the frozen legacy rendering path.
   3. Unknown section or variant ids fail safe: the renderer falls back to
      the archetype default and the fallback is recorded on the document.
   4. Decisions are deterministic: the same inputs produce the same design. */

export const DESIGN_SYSTEM_VERSION: DesignSystemVersion = "ds/1";
export const ARCHETYPE_VERSION = "1";
export const THEME_VERSION = "1";
/** Bumped whenever the deterministic design derivation changes its output. */
export const SITE_PLANNER_VERSION = "design-planner/2";
/** Bumped whenever generateSiteDocument output shape/behavior changes. */
export const SITE_GENERATOR_VERSION = "site-generator/2";

export const layoutArchetypeIds = [
  "studio", "clarity", "forge",
  "industrial-bold", "editorial-premium", "local-service-conversion",
] as const;
export const siteThemeIds = ["studio", "clarity", "forge", "gold-noir"] as const;
export const heroVariantIds = ["split", "fullscreen", "editorial", "centered", "industrial"] as const;
export const servicesVariantIds = ["cards", "alternating", "list", "editorial-list", "icon-grid"] as const;
export const projectsVariantIds = ["grid", "large-feature", "case-study-rows", "masonry"] as const;
export const aboutVariantIds = ["split", "story", "stats-led", "image-led"] as const;
export const contactVariantIds = ["compact", "conversion", "split"] as const;
export const trustVariantIds = ["badge-row"] as const;
export const galleryVariantIds = ["grid-4", "filmstrip"] as const;
export const testimonialsVariantIds = ["single-emphasis", "card-row"] as const;
export const siteSectionIds = [
  "hero", "services", "about", "projects", "gallery", "trust",
  "testimonials", "contact", "appointments", "legal", "footer",
] as const;
export const siteDensityIds = ["compact", "regular", "spacious"] as const;
export const siteImageStrategyIds = ["hero-led", "project-led", "balanced", "minimal"] as const;
export const siteCtaStrategyIds = ["call-first", "form-first", "quote-first", "visit-first"] as const;
export const typographyDirectionIds = ["serif-led", "sans-led", "mixed"] as const;
export const colorDirectionIds = ["dark", "light", "split"] as const;

export type SiteThemeKeyInput = "auto" | "studio" | "clarity" | "forge" | "gold";

export type ArchetypeSectionContract = {
  /** Variant ids the section contract accepts for this archetype. */
  variants: readonly string[];
  /** The variant the archetype renders today; unknown ids fall back here. */
  defaultVariant: string;
  /** True once the renderer actually implements non-default variants. */
  variantsImplemented: boolean;
};

export type ArchetypeContract = {
  id: LayoutArchetypeId;
  version: string;
  defaultThemeId: SiteThemeId;
  /** Sections the archetype renders, in its canonical order. */
  defaultSectionOrder: readonly SiteSectionId[];
  /** Sections the renderer can render today; others are skipped with a recorded fallback. */
  renderableSections: readonly SiteSectionId[];
  sections: {
    hero: ArchetypeSectionContract;
    services: ArchetypeSectionContract;
    projects: ArchetypeSectionContract;
    about: ArchetypeSectionContract;
    contact: ArchetypeSectionContract;
    trust?: ArchetypeSectionContract;
    gallery?: ArchetypeSectionContract;
    testimonials?: ArchetypeSectionContract;
  };
};

const sharedProjects: ArchetypeSectionContract = Object.freeze({
  variants: projectsVariantIds,
  defaultVariant: "grid",
  variantsImplemented: false,
});

const notDeclared = sharedProjects;

const archetypeContractSource: Record<LayoutArchetypeId, ArchetypeContract> = {
  studio: {
    id: "studio",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "studio",
    defaultSectionOrder: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    renderableSections: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "split", variantsImplemented: false },
      services: { variants: servicesVariantIds, defaultVariant: "cards", variantsImplemented: false },
      projects: notDeclared,
      about: { variants: aboutVariantIds, defaultVariant: "story", variantsImplemented: false },
      contact: { variants: contactVariantIds, defaultVariant: "split", variantsImplemented: false },
    },
  },
  clarity: {
    id: "clarity",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "clarity",
    defaultSectionOrder: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    renderableSections: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "fullscreen", variantsImplemented: false },
      services: { variants: servicesVariantIds, defaultVariant: "cards", variantsImplemented: false },
      projects: notDeclared,
      about: { variants: aboutVariantIds, defaultVariant: "split", variantsImplemented: false },
      contact: { variants: contactVariantIds, defaultVariant: "split", variantsImplemented: false },
      gallery: { variants: galleryVariantIds, defaultVariant: "grid-4", variantsImplemented: false },
    },
  },
  forge: {
    id: "forge",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "forge",
    defaultSectionOrder: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    renderableSections: ["hero", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "split", variantsImplemented: false },
      services: { variants: servicesVariantIds, defaultVariant: "cards", variantsImplemented: false },
      projects: notDeclared,
      about: { variants: aboutVariantIds, defaultVariant: "split", variantsImplemented: false },
      contact: { variants: contactVariantIds, defaultVariant: "split", variantsImplemented: false },
    },
  },
  "industrial-bold": {
    id: "industrial-bold",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "forge",
    defaultSectionOrder: ["hero", "projects", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    renderableSections: ["hero", "projects", "services", "about", "gallery", "contact", "appointments", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "industrial", variantsImplemented: true },
      services: { variants: servicesVariantIds, defaultVariant: "alternating", variantsImplemented: true },
      projects: { variants: projectsVariantIds, defaultVariant: "large-feature", variantsImplemented: true },
      about: { variants: aboutVariantIds, defaultVariant: "split", variantsImplemented: true },
      contact: { variants: contactVariantIds, defaultVariant: "conversion", variantsImplemented: true },
    },
  },
  "editorial-premium": {
    id: "editorial-premium",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "clarity",
    defaultSectionOrder: ["hero", "about", "services", "testimonials", "gallery", "contact", "appointments", "legal", "footer"],
    renderableSections: ["hero", "about", "services", "testimonials", "gallery", "contact", "appointments", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "editorial", variantsImplemented: true },
      services: { variants: servicesVariantIds, defaultVariant: "editorial-list", variantsImplemented: true },
      projects: notDeclared,
      about: { variants: aboutVariantIds, defaultVariant: "story", variantsImplemented: true },
      contact: { variants: contactVariantIds, defaultVariant: "compact", variantsImplemented: true },
      gallery: { variants: galleryVariantIds, defaultVariant: "filmstrip", variantsImplemented: true },
      testimonials: { variants: testimonialsVariantIds, defaultVariant: "single-emphasis", variantsImplemented: true },
    },
  },
  "local-service-conversion": {
    id: "local-service-conversion",
    version: ARCHETYPE_VERSION,
    defaultThemeId: "clarity",
    defaultSectionOrder: ["hero", "trust", "services", "about", "contact", "appointments", "gallery", "legal", "footer"],
    renderableSections: ["hero", "trust", "services", "about", "contact", "appointments", "gallery", "legal", "footer"],
    sections: {
      hero: { variants: heroVariantIds, defaultVariant: "centered", variantsImplemented: true },
      services: { variants: servicesVariantIds, defaultVariant: "cards", variantsImplemented: true },
      projects: notDeclared,
      about: { variants: aboutVariantIds, defaultVariant: "image-led", variantsImplemented: true },
      contact: { variants: contactVariantIds, defaultVariant: "compact", variantsImplemented: true },
      trust: { variants: trustVariantIds, defaultVariant: "badge-row", variantsImplemented: true },
      gallery: { variants: galleryVariantIds, defaultVariant: "grid-4", variantsImplemented: true },
    },
  },
};

// Frozen against process-wide mutation; consumers receive a readonly view.
for (const contract of Object.values(archetypeContractSource)) {
  Object.freeze(contract.sections);
  Object.freeze(contract);
}
export const archetypeContracts: Readonly<Record<LayoutArchetypeId, ArchetypeContract>> =
  Object.freeze(archetypeContractSource);


/** Deterministic archetype per business-template family (AI-off fallback).
 * Category-driven by design; the AI planner may choose any archetype from
 * content signals instead. Keys are the neutral business-template keys. */
const deterministicArchetypeByTemplate: Record<string, LayoutArchetypeId> = {
  // Industrial / outdoor / logistics / trades
  "auto-repair": "industrial-bold", "courier": "industrial-bold", "moving": "industrial-bold",
  "local-delivery": "industrial-bold", "tree-service": "industrial-bold", "landscaping": "industrial-bold",
  "garden-maintenance": "industrial-bold", "irrigation": "industrial-bold", "crane-service": "industrial-bold",
  "civil-engineering": "industrial-bold", "fiber-network": "industrial-bold", "glass-facade": "industrial-bold",
  "house-construction": "industrial-bold", "construction": "industrial-bold", "electrician": "industrial-bold",
  "plumbing-heating": "industrial-bold", "locksmith": "industrial-bold", "handyman": "industrial-bold",
  "dog-training": "industrial-bold", "car-dealership": "industrial-bold",
  // Editorial / professional / health
  "lawyer": "editorial-premium", "accountant": "editorial-premium", "insurance": "editorial-premium",
  "architect": "editorial-premium", "consultant": "editorial-premium", "consultation": "editorial-premium",
  "medical-practice": "editorial-premium", "dental-practice": "editorial-premium", "psychotherapy": "editorial-premium",
  "home-care": "editorial-premium", "nutrition": "editorial-premium", "osteopathy": "editorial-premium",
  "physiotherapy": "editorial-premium", "gold-luxury": "editorial-premium",
  // Local conversion / booking-led
  "barber": "local-service-conversion", "hair-salon": "local-service-conversion", "nail-studio": "local-service-conversion",
  "lashes-brows": "local-service-conversion", "beauty-studio": "local-service-conversion", "massage": "local-service-conversion",
  "wellness": "local-service-conversion", "pet-grooming": "local-service-conversion", "pet-wellness": "local-service-conversion",
  "veterinary": "local-service-conversion", "window-cleaning": "local-service-conversion", "office-cleaning": "local-service-conversion",
  "facility-cleaning": "local-service-conversion", "home-cleaning": "local-service-conversion", "fast-food": "local-service-conversion",
  "restaurant": "local-service-conversion",
};

/** The AI-off archetype choice for a business template key. */
export const deterministicArchetypeFor = (templateKey: string): LayoutArchetypeId =>
  deterministicArchetypeByTemplate[templateKey] ?? "clarity";

/** The frozen legacy layout a document's compatibility mirror carries. New
 * archetypes have no legacy layout of their own; the mirror keeps the
 * keyword-resolved legacy layout while design.archetype is the composition
 * truth for ds/1 documents. */
export const legacyLayoutOf = (archetype: LayoutArchetypeId): "studio" | "clarity" | "forge" =>
  archetype === "studio" || archetype === "clarity" || archetype === "forge" ? archetype : "clarity";

export const isLayoutArchetypeId = (value: unknown): value is LayoutArchetypeId =>
  typeof value === "string" && (layoutArchetypeIds as readonly string[]).includes(value);

export const isSiteThemeId = (value: unknown): value is SiteThemeId =>
  typeof value === "string" && (siteThemeIds as readonly string[]).includes(value);

/** The legacy theme selection may not activate another composition: "gold" maps to the gold-noir theme only. */
export const themeIdFromThemeKey = (themeKey: SiteThemeKeyInput | string, archetype: LayoutArchetypeId): SiteThemeId => {
  if (themeKey === "gold") return "gold-noir";
  if (themeKey === "studio" || themeKey === "clarity" || themeKey === "forge") return themeKey;
  return archetypeContracts[archetype].defaultThemeId;
};

export type SiteDesignInput = {
  archetype?: unknown;
  themeId?: unknown;
  heroVariant?: unknown;
  /** P5-001 hero dominance policy (validated, additive). */
  heroProminence?: unknown;
  /** P5-001 icon treatment (validated, additive). */
  iconStyle?: unknown;
  sectionOrder?: unknown;
  sectionVariants?: unknown;
  density?: unknown;
  visualStyle?: unknown;
  typographyDirection?: unknown;
  colorDirection?: unknown;
  imageStrategy?: unknown;
  ctaStrategy?: unknown;
};

export type ResolvedSiteDesign = {
  /** Null when the input must fall back to the frozen legacy rendering path. */
  design: SiteDesign | null;
  fallbacks: string[];
};

const enumOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string, fallbacks: string[]): T => {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  if (value !== undefined && value !== null && value !== "") {
    fallbacks.push(`${label} "${String(value).slice(0, 40)}" is not recognized; used ${fallback}`);
  }
  return fallback;
};

const boundedText = (value: unknown, max: number, fallback: string): string =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

/**
 * Validates raw design decisions into a renderer-safe SiteDesign. Unknown
 * archetype values return design=null (the caller renders the frozen legacy
 * path); unknown variants fall back to the archetype default with a recorded
 * fallback line.
 */
export function resolveSiteDesignInput(input: SiteDesignInput, meta: {
  plannerVersion: string;
  generatorVersion: string;
  planSource: SiteDesignPlanSource;
  decidedAt: string;
  aiProvider?: string;
  aiModel?: string;
  sourceContentHash?: string;
  /** P4-003 choice authority + evidence; bounded by this function. */
  designSource?: "owner" | "ai";
  selectionReason?: string;
  archetypeConfidence?: number;
}): ResolvedSiteDesign {
  const fallbacks: string[] = [];
  const archetype = enumOf(input.archetype, layoutArchetypeIds, "clarity", "layoutArchetype", fallbacks);
  if (!isLayoutArchetypeId(input.archetype) && input.archetype !== undefined && input.archetype !== null && input.archetype !== "") {
    // Unknown archetypes cannot render safely: legacy path, design dropped.
    return { design: null, fallbacks: [`layoutArchetype "${String(input.archetype).slice(0, 40)}" is not recognized; rendered with the legacy path`] };
  }
  const contract = archetypeContracts[archetype];
  const themeId = enumOf(input.themeId, siteThemeIds, contract.defaultThemeId, "themeId", fallbacks);
  const hero = contract.sections.hero;
  const services = contract.sections.services;
  const about = contract.sections.about;
  const contact = contract.sections.contact;
  const projects = contract.sections.projects;

  const rawVariants = (input.sectionVariants && typeof input.sectionVariants === "object" ? input.sectionVariants : {}) as Record<string, unknown>;
  const sectionVariants = {
    services: enumOf(rawVariants.services, services.variants, services.defaultVariant as never, "services.variant", fallbacks) as ServicesVariantId,
    projects: rawVariants.projects === undefined || rawVariants.projects === null || rawVariants.projects === ""
      ? undefined
      : enumOf(rawVariants.projects, projects.variants, projects.defaultVariant as never, "projects.variant", fallbacks) as ProjectsVariantId,
    about: enumOf(rawVariants.about, about.variants, about.defaultVariant as never, "about.variant", fallbacks) as AboutVariantId,
    contact: enumOf(rawVariants.contact, contact.variants, contact.defaultVariant as never, "contact.variant", fallbacks) as ContactVariantId,
  };
  // Contract honesty: a valid but not-yet-implemented variant is recorded as
  // a fallback instead of being silently ignored — the renderer renders the
  // archetype default until the variant ships (BSRC-DESIGN-FOUNDATION-002 review).
  const heroVariant = enumOf(input.heroVariant, hero.variants, hero.defaultVariant as never, "heroVariant", fallbacks) as HeroVariantId;
  for (const [label, sectionContract, chosen] of [
    ["heroVariant", hero, heroVariant],
    ["services.variant", services, sectionVariants.services],
    ["about.variant", about, sectionVariants.about],
    ["contact.variant", contact, sectionVariants.contact],
  ] as Array<[string, ArchetypeSectionContract, string]>) {
    if (!sectionContract.variantsImplemented && chosen !== sectionContract.defaultVariant) {
      fallbacks.push(`${label} "${chosen}" is accepted but not implemented in archetype ${archetype}@${contract.version}; rendered "${sectionContract.defaultVariant}"`);
    }
  }

  // Section order: dedupe, keep known ids, require hero first; renderable
  // sections unknown to this archetype version are skipped by the renderer.
  const rawOrder = Array.isArray(input.sectionOrder) ? input.sectionOrder : [];
  const order: SiteSectionId[] = [];
  for (const candidate of rawOrder) {
    if (typeof candidate !== "string" || !(siteSectionIds as readonly string[]).includes(candidate)) {
      if (candidate !== undefined && candidate !== null && candidate !== "") {
        fallbacks.push(`section "${String(candidate).slice(0, 40)}" is not recognized; skipped`);
      }
      continue;
    }
    if (!order.includes(candidate as SiteSectionId)) order.push(candidate as SiteSectionId);
  }
  for (const section of contract.defaultSectionOrder) {
    if (!order.includes(section)) {
      order.push(section);
      if (rawOrder.length) fallbacks.push(`section "${section}" was missing from sectionOrder; appended`);
    }
  }
  if (order[0] !== "hero") {
    const heroIndex = order.indexOf("hero");
    if (heroIndex > 0) order.splice(heroIndex, 1);
    order.unshift("hero");
    fallbacks.push("sectionOrder must start with hero; reordered");
  }
  for (const section of order) {
    if (!contract.renderableSections.includes(section)) {
      fallbacks.push(`section "${section}" is accepted by the contract but not renderable in archetype ${archetype}@${contract.version}; skipped`);
    }
  }

  const design: SiteDesign = {
    archetype,
    archetypeVersion: contract.version,
    themeId,
    themeVersion: THEME_VERSION,
    designSystemVersion: DESIGN_SYSTEM_VERSION,
    heroVariant,
    // P5-001: validated additive fields; absent inputs leave them undefined
    // so every pre-existing document keeps rendering exactly as before.
    ...(typeof input.heroProminence === "string" && input.heroProminence.trim()
      ? { heroProminence: enumOf(input.heroProminence, ["immersive", "full-width", "split-large", "editorial", "compact"] as const, "immersive", "heroProminence", fallbacks) as import("./contracts").SiteDesign["heroProminence"] }
      : {}),
    ...(typeof input.iconStyle === "string" && input.iconStyle.trim()
      ? { iconStyle: enumOf(input.iconStyle, ["line", "solid"] as const, "line", "iconStyle", fallbacks) as "line" | "solid" }
      : {}),
    sectionOrder: order,
    sectionVariants,
    density: enumOf(input.density, siteDensityIds, "regular", "density", fallbacks) as SiteDensity,
    visualStyle: boundedText(input.visualStyle, 40, "balanced"),
    typographyDirection: enumOf(input.typographyDirection, typographyDirectionIds, "sans-led", "typographyDirection", fallbacks) as TypographyDirection,
    colorDirection: enumOf(input.colorDirection, colorDirectionIds, "light", "colorDirection", fallbacks) as ColorDirection,
    imageStrategy: enumOf(input.imageStrategy, siteImageStrategyIds, "balanced", "imageStrategy", fallbacks) as SiteImageStrategy,
    ctaStrategy: enumOf(input.ctaStrategy, siteCtaStrategyIds, "call-first", "ctaStrategy", fallbacks) as SiteCtaStrategy,
    planner: {
      plannerVersion: meta.plannerVersion,
      generatorVersion: meta.generatorVersion,
      planSource: meta.planSource,
      decidedAt: meta.decidedAt,
      ...(meta.aiProvider ? { aiProvider: meta.aiProvider } : {}),
      ...(meta.aiModel ? { aiModel: meta.aiModel } : {}),
      ...(meta.sourceContentHash ? { sourceContentHash: meta.sourceContentHash } : {}),
      ...(meta.designSource === "owner" || meta.designSource === "ai" ? { designSource: meta.designSource } : {}),
      ...(meta.selectionReason ? { selectionReason: meta.selectionReason.slice(0, 500) } : {}),
      ...(typeof meta.archetypeConfidence === "number" && Number.isFinite(meta.archetypeConfidence)
        ? { archetypeConfidence: Math.min(1, Math.max(0, meta.archetypeConfidence)) }
        : {}),
      fallbacks: [...new Set(fallbacks)].slice(0, 12),
    },
  };
  return { design, fallbacks: design.planner.fallbacks };
}

/** Deterministic derivation for creations without an AI plan. Same inputs → same design. */
export function deriveDeterministicDesign(input: {
  archetype: LayoutArchetypeId;
  themeKey: string;
  sourceContentHash?: string;
  decidedAt: string;
}): ResolvedSiteDesign {
  return resolveSiteDesignInput(
    {
      archetype: input.archetype,
      themeId: themeIdFromThemeKey(input.themeKey, input.archetype),
    },
    {
      plannerVersion: SITE_PLANNER_VERSION,
      generatorVersion: SITE_GENERATOR_VERSION,
      planSource: "deterministic",
      decidedAt: input.decidedAt,
      ...(input.sourceContentHash ? { sourceContentHash: input.sourceContentHash } : {}),
    },
  );
}

/** True when a stored document renders through the ds/1 pipeline. Deliberately
 * structural: a partial or hand-mangled design block must fail safe to the
 * frozen legacy path instead of crashing the renderer. */
export function usesDesignPipeline(design: unknown): design is SiteDesign {
  if (!design || typeof design !== "object") return false;
  const candidate = design as Partial<SiteDesign>;
  if (candidate.designSystemVersion !== DESIGN_SYSTEM_VERSION) return false;
  if (!isLayoutArchetypeId(candidate.archetype)) return false;
  if (!Array.isArray(candidate.sectionOrder) || !candidate.sectionOrder.length) return false;
  if (!candidate.sectionVariants || typeof candidate.sectionVariants !== "object") return false;
  const planner = candidate.planner as Partial<SiteDesign["planner"]> | undefined;
  if (!planner || typeof planner !== "object" || !Array.isArray(planner.fallbacks)) return false;
  return true;
}
