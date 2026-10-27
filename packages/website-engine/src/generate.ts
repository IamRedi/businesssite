import type { PreparedBusinessProfile, SiteDocument, SiteDesign, ThemeSelection } from "./contracts";
import { SITE_GENERATOR_VERSION, deriveDeterministicDesign, deterministicArchetypeFor, resolveSiteDesignInput, themeIdFromThemeKey, type SiteDesignInput } from "./design-system";
import { automaticPlanToDesignInput, planAutomaticDesign, type AutomaticDesignInput } from "./automatic-design";
import { canonicalTemplateKeyFor } from "./category-registry";
import { demoMediaFor, demoContentFor, getBusinessTemplate, resolveSiteDesign, selectBusinessTemplate } from "./template-catalog";
import { resolveLocale, siteCopy } from "./i18n";
import { aboutTitleForBusiness, professionalAboutCopy, professionalServiceDescription } from "./about-copy";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "new-site";
}

function hasOnlyFinderPlaceholders(services: PreparedBusinessProfile["services"]) {
  const values = services.map((service) => service.title.trim().toLocaleLowerCase());
  return values.length === 3 && values.join("|") === "consultation|tailored service|customer support";
}

export type GenerateSiteDocumentOptions = {
  /** Planner design decisions (AI or rule-based). Absent = deterministic derivation. */
  design?: SiteDesignInput;
  /** Original content hash of imported source material, when applicable. */
  sourceContentHash?: string;
  ai?: { provider?: string; model?: string };
  decidedAt?: string;
  /** P4-003 choice authority + evidence, stored on design.planner. */
  designSource?: "owner" | "ai";
  selectionReason?: string;
  archetypeConfidence?: number;
  /** P5-001: category-driven automatic design plan for from-scratch creation.
   * Ignored when an explicit design input exists (the reviewed import plan
   * always wins); replaces the bare deterministic derivation otherwise. */
  automatic?: AutomaticDesignInput;
};

export function generateSiteDocument(
  profile: PreparedBusinessProfile,
  templateKey?: string,
  themeKey: ThemeSelection = "auto",
  options: GenerateSiteDocumentOptions = {},
): SiteDocument {
  // Canonical registry keys win over free-text keyword matching; both fall
  // back safely. The canonical template key is validated against the live
  // catalog so a registry/catalog drift can never select an unknown template.
  const canonicalTemplateKey = canonicalTemplateKeyFor(profile.business);
  const selectedTemplate =
    getBusinessTemplate(templateKey)
    ?? (canonicalTemplateKey ? getBusinessTemplate(canonicalTemplateKey) : undefined)
    ?? selectBusinessTemplate(profile.business.category, profile.business.name, profile.business.subcategory, profile.business.description);
  // The compatibility mirror (template/themeKey/theme) always reflects the
  // legacy resolution so documents without a design block keep rendering
  // exactly as before.
  const legacyMirror = resolveSiteDesign(selectedTemplate.key, themeKey);
  const designInput = options.design;
  // P5-001: the automatic plan replaces the bare deterministic derivation on
  // the from-scratch path. An explicit (reviewed) design always wins, so the
  // import flow is untouched.
  const automaticPlan = !designInput && options.automatic ? planAutomaticDesign(options.automatic) : null;
  let resolvedTheme = legacyMirror.theme;
  // With explicit design decisions the archetype owns composition; without
  // them the legacy resolution (including the theme/layout pairing that the
  // frozen legacy path still renders) applies unchanged.
  const resolvedDesign: SiteDesign | null = (() => {
    const meta = {
      plannerVersion: SITE_GENERATOR_VERSION,
      generatorVersion: SITE_GENERATOR_VERSION,
      planSource: (designInput ? "ai" : "deterministic") as "ai" | "deterministic",
      decidedAt: options.decidedAt ?? new Date().toISOString(),
      ...(options.ai?.provider ? { aiProvider: options.ai.provider } : {}),
      ...(options.ai?.model ? { aiModel: options.ai.model } : {}),
      ...(options.sourceContentHash ? { sourceContentHash: options.sourceContentHash } : {}),
      ...(options.designSource ? { designSource: options.designSource } : {}),
      ...(options.selectionReason ? { selectionReason: options.selectionReason } : {}),
      ...(options.archetypeConfidence !== undefined ? { archetypeConfidence: options.archetypeConfidence } : {}),
    };
    if (designInput) {
      // Review hardening (BSRC-DESIGN-FOUNDATION-002): a plan design object
      // without an explicit archetype composes with the keyword-matched
      // legacy layout (never a hardcoded default), and the theme decision
      // follows the resolved themeKey so AI and deterministic metadata agree.
      const normalizedDesign: SiteDesignInput = {
        ...designInput,
        ...(designInput.archetype === undefined || designInput.archetype === null || designInput.archetype === ""
          ? { archetype: legacyMirror.template }
          : {}),
        ...(designInput.themeId === undefined || designInput.themeId === null || designInput.themeId === ""
          ? { themeId: themeIdFromThemeKey(legacyMirror.themeKey, legacyMirror.template) }
          : {}),
      };
      return resolveSiteDesignInput(normalizedDesign, meta).design;
    }
    if (automaticPlan) {
      resolvedTheme = {
        primary: automaticPlan.palette[0],
        accent: automaticPlan.palette[1],
        background: automaticPlan.palette[2],
        surface: automaticPlan.palette[3],
        text: automaticPlan.palette[4],
      };
      return resolveSiteDesignInput(automaticPlanToDesignInput(automaticPlan), {
        ...meta,
        selectionReason: `Automatic category-driven plan (${automaticPlan.themeFamily}): ${automaticPlan.visualMood}.`,
      }).design;
    }
    // Deterministic derivation keeps the legacy composition and records versions.
    return deriveDeterministicDesign({
      archetype: deterministicArchetypeFor(selectedTemplate.key),
      themeKey: legacyMirror.themeKey,
      sourceContentHash: options.sourceContentHash,
      decidedAt: meta.decidedAt,
    }).design;
  })();
  const name = profile.business.name.trim();
  if (!name) throw new Error("PreparedBusinessProfile requires a business name.");
  const locale = resolveLocale(profile.locale);
  const copy = siteCopy[locale];
  const sourceServices: Array<{ title: string; description?: string }> = profile.services.length && !hasOnlyFinderPlaceholders(profile.services)
    ? profile.services
    : demoContentFor(selectedTemplate).services.map((title) => ({ title }));
  const services = sourceServices.slice(0, 6).map((service, index) => ({ title: service.title, description: service.description || professionalServiceDescription(service.title, locale, index) || copy.serviceDescription }));
  const aboutBody = professionalAboutCopy({ name, description: profile.business.description, services, locale, templateKey: selectedTemplate.key });
  // Locale-aware description fallback: the template starter copy is English,
  // so a missing business description must fall back to the first sentence of
  // the canonical locale-aware about copy instead (BSRC-AI-IMPORT-005).
  const description = profile.business.description?.trim()
    || aboutBody.split(". ")[0]?.trim().replace(/\.$/, "").concat(".")
    || demoContentFor(selectedTemplate).description;
  const demoMedia = demoMediaFor(selectedTemplate);
  return {
    id: `site-${profile.id}-v${profile.version}`,
    profileId: profile.id,
    slug: slugify(name),
    locale,
    visibility: "private",
    template: legacyMirror.template,
    templateKey: selectedTemplate.key,
    themeKey: legacyMirror.themeKey,
    // P5-001: automatic plans carry their own contrast-guarded palette; the
    // legacy mirror theme applies everywhere else (unchanged).
    theme: resolvedTheme,
    design: resolvedDesign ?? undefined,
    content: { name, description, heroTitle: name, heroSubtitle: description, aboutTitle: aboutTitleForBusiness(name, locale), aboutBody, servicesTitle: copy.servicesTitle, contactTitle: copy.contactTitle },
    contact: {
      ...profile.business,
      openingHours: profile.business.openingHours ?? [],
    },
    // The platform generates the customer's privacy page automatically; the
    // origin-relative path keeps working across domain and www/apex changes.
    // A customer may still override it with an external privacy URL.
    publicLegal: { privacyNoticePath: "/privacy" },
    services,
    media: {
      logoUrl: profile.media?.logoUrl || "",
      logoShape: "rounded",
      heroImageUrl: profile.media?.heroImageUrl || selectedTemplate.heroImageUrl,
      galleryImageUrls: profile.media?.galleryImageUrls?.length ? profile.media.galleryImageUrls : demoMedia.galleryImageUrls,
      serviceImageUrls: profile.media?.serviceImageUrls?.length ? profile.media.serviceImageUrls.slice(0, 6) : demoMedia.serviceImageUrls,
    },
    generatedAt: new Date().toISOString(),
  };
}
