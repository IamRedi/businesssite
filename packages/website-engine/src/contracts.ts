export type SupportedLocale = "en" | "de" | "fr" | "es" | "it" | "sq";
import type { CustomSiteDesign, CustomSiteMedia } from "./custom-design";
import type { PriceList } from "./price-list";
export type SiteKind = "business" | "information";
export const DEFAULT_SITE_KIND: SiteKind = "business";
export type SiteTemplate = "studio" | "clarity" | "forge";
export type ThemeSelection = "auto" | "studio" | "clarity" | "forge" | "gold";
export type LogoShape = "rounded" | "circle";

/* ── ds/1 design pipeline (BSRC-DESIGN-FOUNDATION-001) ─────────────────────
   Template ≠ theme ≠ section variant. The design block is additive and
   optional: documents without it render through the frozen legacy path. */
export type DesignSystemVersion = "ds/1";
export type LayoutArchetypeId =
  | "studio" | "clarity" | "forge"
  | "industrial-bold" | "editorial-premium" | "local-service-conversion";
export type SiteThemeId = "studio" | "clarity" | "forge" | "gold-noir";
export type HeroVariantId = "split" | "fullscreen" | "editorial" | "centered" | "industrial";
export type ServicesVariantId = "cards" | "alternating" | "list" | "editorial-list" | "icon-grid";
export type ProjectsVariantId = "grid" | "large-feature" | "case-study-rows" | "masonry";
export type AboutVariantId = "split" | "story" | "stats-led" | "image-led";
export type ContactVariantId = "compact" | "conversion" | "split";
export type TrustVariantId = "badge-row";
export type GalleryVariantId = "grid-4" | "filmstrip";
export type TestimonialsVariantId = "single-emphasis" | "card-row";
export type SiteSectionId =
  | "hero" | "services" | "about" | "projects" | "gallery" | "trust"
  | "testimonials" | "contact" | "appointments" | "legal" | "footer";
export type SiteDensity = "compact" | "regular" | "spacious";
export type SiteImageStrategy = "hero-led" | "project-led" | "balanced" | "minimal";
export type SiteCtaStrategy = "call-first" | "form-first" | "quote-first" | "visit-first";
export type TypographyDirection = "serif-led" | "sans-led" | "mixed";
export type ColorDirection = "dark" | "light" | "split";
export type SiteDesignPlanSource = "ai" | "deterministic";

export type SiteDesignSectionVariants = {
  services: ServicesVariantId;
  projects?: ProjectsVariantId;
  about: AboutVariantId;
  contact: ContactVariantId;
  trust?: TrustVariantId;
  gallery?: GalleryVariantId;
  testimonials?: TestimonialsVariantId;
};

export type SiteDesign = {
  archetype: LayoutArchetypeId;
  archetypeVersion: string;
  themeId: SiteThemeId;
  themeVersion: string;
  designSystemVersion: DesignSystemVersion;
  heroVariant: HeroVariantId;
  /** P5-001 (automatic generation): the hero's visual dominance policy.
   * Absent on documents planned before the field existed; drives hero
   * min-height styling via the renderer's data attribute. */
  heroProminence?: "immersive" | "full-width" | "split-large" | "editorial" | "compact";
  /** P5-001: service/feature icon treatment. Absent = no icons rendered
   * (every pre-existing document keeps its exact pixels). */
  iconStyle?: "line" | "solid";
  sectionOrder: SiteSectionId[];
  sectionVariants: SiteDesignSectionVariants;
  density: SiteDensity;
  visualStyle: string;
  typographyDirection: TypographyDirection;
  colorDirection: ColorDirection;
  imageStrategy: SiteImageStrategy;
  ctaStrategy: SiteCtaStrategy;
  planner: {
    plannerVersion: string;
    generatorVersion: string;
    planSource: SiteDesignPlanSource;
    decidedAt: string;
    aiProvider?: string;
    aiModel?: string;
    sourceContentHash?: string;
    /** Who decided the applied composition (BSRC-DESIGN-P4-003). Absent on
     * documents created before the choice existed; "owner" survives
     * Review → Create and must never be overwritten by the AI recommendation. */
    designSource?: "owner" | "ai";
    /** Selection evidence: why the applied composition was chosen (the AI
     * selection reason, or the chosen alternative's own reason). */
    selectionReason?: string;
    /** The planner's stated confidence (0..1) in its recommended archetype. */
    archetypeConfidence?: number;
    /** Every validation fallback applied to the planner's raw decisions. */
    fallbacks: string[];
  };
};
export type OpeningHour = {
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open?: string;
  close?: string;
  closed?: boolean;
  /** Optional additional verified intervals; the custom renderer supports split days. */
  intervals?: Array<{ open: string; close: string }>;
};

export type PreparedBusinessProfile = {
  id: string;
  version: number;
  sourceLeadId: string;
  business: {
    name: string;
    description?: string;
    category?: string;
    subcategory?: string;
    /** Canonical registry keys (business-category-registry/1). Optional; legacy profiles carry only the free-text category. */
    categoryKey?: string;
    subcategoryKey?: string;
    /** Category authority provenance (P4-002): owner | ai | legacy — auditable. */
    categorySource?: string;
    /** Detection confidence when the category came from the AI suggestion. */
    categoryConfidence?: number;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    country?: string;
    website?: string;
    socialLinks?: { instagram?: string; facebook?: string; tiktok?: string };
    openingHours?: OpeningHour[];
  };
  locale: SupportedLocale;
  services: Array<{ title: string; description?: string }>;
  media?: {
    logoUrl?: string;
    heroImageUrl?: string;
    serviceImageUrls?: string[];
    galleryImageUrls?: string[];
  };
  approvedSources: string[];
  preparedAt: string;
};

export type SiteDocument = {
  id: string;
  profileId: string;
  slug: string;
  locale: SupportedLocale;
  visibility: "private" | "public";
  template: SiteTemplate;
  templateKey: string;
  themeKey: ThemeSelection;
  /**
   * ds/1 design pipeline state. Absent on every document created before
   * BSRC-DESIGN-FOUNDATION-001; those documents keep rendering through the
   * frozen legacy path. `template`/`templateKey`/`themeKey`/`theme` remain
   * the compatibility mirror for as long as documents exist without the
   * design block.
   */
  design?: SiteDesign;
  /** Explicit owner composition only; automatic and imported designs never set this. */
  customDesign?: CustomSiteDesign;
  priceList?: PriceList;
  customMedia?: CustomSiteMedia;
  theme: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
  content: {
    name: string;
    description: string;
    heroTitle: string;
    heroSubtitle: string;
    aboutTitle: string;
    aboutBody: string;
    servicesTitle: string;
    contactTitle: string;
  };
  contact: PreparedBusinessProfile["business"];
  /** Customer-owned public legal identity. Never populate this from platform operator config. */
  publicLegal?: {
    legalBusinessName?: string;
    legalForm?: string;
    authorizedRepresentative?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    countryCode?: string;
    contactEmail?: string;
    registerName?: string;
    registerNumber?: string;
    vatId?: string;
    /** Customer-owned privacy notice used where the generated site collects visitor data. */
    privacyNoticeUrl?: string;
    /**
     * Canonical platform-generated privacy page served at this path on the
     * site's current public origin. Origin-relative by design: custom domains,
     * www/apex changes and platform renames keep working without a rewrite.
     */
    privacyNoticePath?: string;
    /** Provenance for media imported from the customer's declared previous website. */
  };
  /** Provenance for content/assets imported from the customer's declared previous website. */
  importSource?: {
    url: string;
    importedAt: string;
  };
  services: Array<{ title: string; description: string }>;
  /** Verified project references planned for the site (P3 archetypes render them). */
  projects?: Array<{ name: string; summary: string; imageUrls: string[] }>;
  /** Verified trust lines (certifications, guarantees) — never invented. */
  trust?: string[];
  media: Required<NonNullable<PreparedBusinessProfile["media"]>> & {
    serviceImageUrls: string[];
    /** Optional for backward compatibility with documents created before logo-shape selection. */
    logoShape?: LogoShape;
  };
  generatedAt: string;
};

export type PublicLegalIdentityField =
  | "legalBusinessName"
  | "street"
  | "postalCode"
  | "city"
  | "countryCode"
  | "contactEmail"
  | "privacyNoticeUrl";

/** The single canonical publication validator: exactly which required customer legal fields are missing. */
export function customerPublicLegalIdentityMissingFields(site: SiteDocument): PublicLegalIdentityField[] {
  const legal = site.publicLegal;
  const privacyUrl = legal?.privacyNoticeUrl?.trim() ?? "";
  const validPrivacyUrl = (privacyUrl.startsWith("/") && !privacyUrl.startsWith("//")) || (() => {
    try { return new URL(privacyUrl).protocol === "https:"; } catch { return false; }
  })();
  // The platform-generated privacy page (origin-relative "/privacy") satisfies
  // the privacy requirement; an explicit external URL remains an override.
  const validPrivacyNotice = legal?.privacyNoticePath?.trim() === "/privacy" || validPrivacyUrl;
  const missing: PublicLegalIdentityField[] = [];
  if (!legal?.legalBusinessName?.trim()) missing.push("legalBusinessName");
  if (!legal?.street?.trim()) missing.push("street");
  if (!legal?.postalCode?.trim()) missing.push("postalCode");
  if (!legal?.city?.trim()) missing.push("city");
  if (!/^[A-Z]{2}$/.test(legal?.countryCode?.trim() ?? "")) missing.push("countryCode");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legal?.contactEmail?.trim() ?? "")) missing.push("contactEmail");
  if (!validPrivacyNotice) missing.push("privacyNoticeUrl");
  return missing;
}

export function customerPublicLegalIdentityComplete(site: SiteDocument) {
  return customerPublicLegalIdentityMissingFields(site).length === 0;
}
