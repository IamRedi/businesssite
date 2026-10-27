"use client";

import { useState } from "react";
import type { WebsiteImportPreview } from "../lib/website-import";
import type { WebsiteBuildPlan, WebsiteUnderstanding } from "@platform/ai-assistant";
import { nonHeroImageClassifications } from "@platform/ai-assistant";
import { businessCategoryFamily, businessCategorySubcategory, resolveLocale, type CategoryRegistryLocale } from "@platform/website-engine";
import { BusinessCategoryCombobox, type ComboboxSelection } from "./business-category-combobox";
import { chosenDesignInput, planDesignOptions } from "../lib/design-choice";
import { DesignMiniPreview } from "./design-mini-preview";

const copy = {
  en: {
    heading: "Imported from existing website",
    aiHeading: "AI understood your website",
    intro: "Review everything before creating the website. Nothing is copied blindly: facts are kept, copy is rewritten for the selected website language, and assets keep their original source.",
    aiIntro: "The semantic analysis below is a proposal — keep, replace, remove or edit anything before the website is created.",
    source: "Source",
    pages: "pages read",
    logo: "Logo",
    assets: "Website assets (Keep · Set as hero · Remove)",
    assetHero: "HERO",
    assetLogo: "LOGO",
    assetAbout: "ABOUT",
    assetProcess: "PROCESS",
    assetProject: "PROJECT",
    assetCertificate: "CERTIFICATE",
    assetUnused: "UNUSED",
    setHero: "Set as hero",
    isHero: "Selected hero",
    aiRecommended: "AI recommended",
    notHeroSafe: "Not usable as hero",
    keep: "Keep",
    services: "Detected services (high/medium pre-selected; low confidence needs review)",
    needsReview: "Needs review",
    contact: "Contact information found",
    reference: "Reference text from the old website (not copied automatically):",
    ownership: "I own this website or have permission to reuse its content/assets.",
    remove: "Clear to remove",
    planStructure: "Proposed website structure",
    brand: "Brand direction",
    confidence: "confidence",
    quality: "quality",
    deterministicAssets: "Deterministic extraction (no AI semantics available): confirm the assets manually.",
    removeImport: "Remove import",
    analyze: "Analyze existing website",
    analyzing: "Analyzing…",
    failed: "The website could not be analyzed. Check the address or continue without import.",
    aiCached: "AI (cached analysis)",
    aiSummary: "Business summary",
    aiServices: "Detected services",
    aiDifferentiators: "What sets this business apart",
    aiSections: "Proposed website structure",
    aiWithImage: "with image",
    aiNoHero: "No source photo was strong enough for a hero image. The website will be built with a clean text hero — no invented image.",
    detectedCategory: "Detected category",
    categoryWhy: "Why",
    categoryAccept: "Accept",
    categoryChange: "Change",
    categoryApproved: "Approved category",
    categoryHigh: "High confidence",
    categoryMedium: "Medium confidence",
    categoryLow: "Low confidence",
    designDirection: "Design direction — pick one",
    designDirectionNote: "Compositions rendered from your reviewed content with the real site engine. Switching changes only the design: text, services, photos and legal details stay exactly as reviewed.",
    designAlternative: "Alternative",
    designUse: "Use this design",
    designInUse: "Selected design",
    designHero: "Hero",
    designTypography: "Typography",
    errors: {
      invalid_request: "Check the website address and try again.",
      rate_limited: "Too many analyses right now. Please try again in a few minutes.",
      import_blocked: "Website blocked by security policy.",
      import_dns: "Website could not be resolved.",
      import_timeout: "Website timed out.",
      import_not_html: "Website returned non-HTML content.",
      import_oversized: "Website response was too large to analyze.",
      import_redirect: "Website reachable, but redirect validation failed.",
      import_unreachable: "Website could not be reached.",
      import_unreadable: "Website is reachable, but not enough readable content was found.",
      import_unavailable: "The website could not be analyzed. Check the address or continue without import.",
    } as Record<string, string>,
  },
  de: {
    heading: "Aus der bestehenden Website importiert",
    aiHeading: "KI hat Ihre Website verstanden",
    intro: "Prüfen Sie alles, bevor die Website erstellt wird. Nichts wird blind übernommen: Fakten bleiben, Texte werden in der gewählten Website-Sprache neu formuliert, Assets behalten ihre Quelle.",
    aiIntro: "Die semantische Analyse unten ist ein Vorschlag — behalten, ersetzen, entfernen oder bearbeiten Sie alles, bevor die Website erstellt wird.",
    source: "Quelle",
    pages: "Seiten gelesen",
    logo: "Logo",
    assets: "Website-Assets (Behalten · Als Hero setzen · Entfernen)",
    assetHero: "HERO",
    assetLogo: "LOGO",
    assetAbout: "ÜBER UNS",
    assetProcess: "PROZESS",
    assetProject: "PROJEKT",
    assetCertificate: "ZERTIFIKAT",
    assetUnused: "UNGENUTZT",
    setHero: "Als Hero setzen",
    isHero: "Gewählter Hero",
    aiRecommended: "KI-Empfehlung",
    notHeroSafe: "Als Hero nicht geeignet",
    keep: "Behalten",
    services: "Gefundene Leistungen (hoch/mittel vorausgewählt; geringe Konfidenz braucht Prüfung)",
    needsReview: "Braucht Prüfung",
    contact: "Gefundene Kontaktinformationen",
    reference: "Referenztexte der alten Website (werden nicht automatisch übernommen):",
    ownership: "Ich besitze diese Website oder habe die Erlaubnis, ihre Inhalte/Assets zu verwenden.",
    remove: "Leeren zum Entfernen",
    planStructure: "Vorgeschlagene Website-Struktur",
    brand: "Markenrichtung",
    confidence: "Konfidenz",
    quality: "Qualität",
    deterministicAssets: "Deterministische Extraktion (keine KI-Semantik verfügbar): Bestätigen Sie die Assets manuell.",
    removeImport: "Import entfernen",
    analyze: "Bestehende Website analysieren",
    analyzing: "Wird analysiert…",
    failed: "Die Website konnte nicht analysiert werden. Prüfen Sie die Adresse oder fahren Sie ohne Import fort.",
    aiCached: "KI (zwischengespeicherte Analyse)",
    aiSummary: "Unternehmenszusammenfassung",
    aiServices: "Erkannte Leistungen",
    aiDifferentiators: "Was dieses Unternehmen auszeichnet",
    aiSections: "Vorgeschlagene Website-Struktur",
    aiWithImage: "mit Bild",
    aiNoHero: "Kein Quellfoto war stark genug für ein Hero-Bild. Die Website entsteht mit sauberem Text-Hero — ohne erfundenes Bild.",
    detectedCategory: "Erkannte Kategorie",
    categoryWhy: "Warum",
    categoryAccept: "Übernehmen",
    categoryChange: "Ändern",
    categoryApproved: "Bestätigte Kategorie",
    categoryHigh: "Hohe Konfidenz",
    categoryMedium: "Mittlere Konfidenz",
    categoryLow: "Geringe Konfidenz",
    designDirection: "Designrichtung — eine wählen",
    designDirectionNote: "Kompositionen werden mit der echten Site-Engine aus Ihrem geprüften Inhalt gerendert. Ein Wechsel ändert nur das Design: Texte, Leistungen, Fotos und rechtliche Angaben bleiben genau wie geprüft.",
    designAlternative: "Alternative",
    designUse: "Dieses Design übernehmen",
    designInUse: "Gewähltes Design",
    designHero: "Hero",
    designTypography: "Typografie",
    errors: {
      invalid_request: "Überprüfen Sie die Website-Adresse und versuchen Sie es erneut.",
      rate_limited: "Zurzeit zu viele Analysen. Bitte versuchen Sie es in wenigen Minuten erneut.",
      import_blocked: "Website durch Sicherheitsrichtlinie blockiert.",
      import_dns: "Website konnte nicht aufgelöst werden.",
      import_timeout: "Zeitüberschreitung bei der Website.",
      import_not_html: "Website hat keine HTML-Inhalte zurückgegeben.",
      import_oversized: "Die Website-Antwort war zu groß zur Analyse.",
      import_redirect: "Website erreichbar, aber die Weiterleitungsprüfung ist fehlgeschlagen.",
      import_unreachable: "Website war nicht erreichbar.",
      import_unreadable: "Website erreichbar, aber es wurden nicht genug lesbare Inhalte gefunden.",
      import_unavailable: "Die Website konnte nicht analysiert werden. Prüfen Sie die Adresse oder fahren Sie ohne Import fort.",
    } as Record<string, string>,
  },
} as const;

export type ImportSelections = {
  /** Review-approved hero copy from the AI plan (siteLocale). */
  heroCopy?: { headline: string; supporting: string };
  /** Review-approved about copy from the AI plan (siteLocale). */
  aboutCopy?: { title: string; body: string };
  /** All kept (used) asset URLs — the provenance set. */
  kept: string[];
  /** Explicit hero asset; null → text-only hero. Never logo/certificate/icon. */
  heroUrl: string | null;
  /** Brand logo asset, kept separately from content photos. */
  logoUrl: string | null;
  aboutImages: string[];
  projectImages: string[];
  /** Image per selected service, parallel to services. */
  serviceImages: Array<string | null>;
  services: Array<{ title: string; description: string; selected: boolean; confidence?: "high" | "medium" | "low" }>;
  /** Review-approved project references from the plan (verified evidence only). */
  projects: Array<{ name: string; summary: string; images: string[] }>;
  /** Review-approved trust lines from the plan (certifications/guarantees). */
  trust: string[];
  contact: { phone: string; email: string; address: string; city: string };
  /** AI-detected canonical category (P4-002), shown for Accept/Change. */
  detectedCategory?: { categoryKey: string; subcategoryKey: string | null; confidence: number; reason: string } | null;
  /** Review-approved canonical category; set by Accept or Change (authority level 1). */
  approvedCategory?: { categoryKey: string; subcategoryKey: string | null; label: string } | null;
  /** The design option the user explicitly chose (P4-003). Null/absent =
   * untouched — the AI recommendation applies as designSource "ai"; any
   * explicit pick, including the recommendation itself, is an owner decision. */
  designChoice?: { optionIndex: number } | null;
  acknowledged: boolean;
};

const urlOfIndex = (understanding: WebsiteUnderstanding | null | undefined, index: number | null | undefined): string => {
  if (index === null || index === undefined || !understanding) return "";
  const entry = understanding.images.find((candidate) => candidate.index === index) as unknown as { url?: string } | undefined;
  return entry?.url ?? "";
};
const urlOfIndexNullable = (understanding: WebsiteUnderstanding | null | undefined, index: number | null | undefined): string | null => {
  const url = urlOfIndex(understanding, index);
  return url || null;
};

export function initialSelections(preview: WebsiteImportPreview): ImportSelections {
  const logoUrl = preview.logoUrl ?? null;
  const contentPhotos = preview.photos.map((photo) => photo.url).filter((url) => url !== logoUrl);
  return {
    projects: [],
    trust: [],
    kept: preview.photos.map((photo) => photo.url),
    heroUrl: contentPhotos[0] ?? null,
    logoUrl,
    aboutImages: [],
    projectImages: [],
    serviceImages: [],
    services: preview.services.slice(0, 6).map((title) => ({ title, description: "", selected: true })),
    contact: {
      phone: preview.contact.phone ?? "",
      email: preview.contact.email ?? "",
      address: preview.contact.address ?? "",
      city: preview.contact.city ?? "",
    },
    acknowledged: false,
  };
}

export function selectionsFromAi(
  preview: WebsiteImportPreview,
  understanding: WebsiteUnderstanding,
  plan: WebsiteBuildPlan,
): ImportSelections {
  const heroUrl = urlOfIndexNullable(understanding, plan.hero.imageIndex);
  const logoEntry = understanding.images.find((entry) => (entry as unknown as { classification: string }).classification === "logo") as unknown as { index: number } | undefined;
  const logoUrl = urlOfIndexNullable(understanding, logoEntry?.index ?? null) ?? preview.logoUrl ?? null;
  const aboutImages = plan.about.imageIndexes.map((index) => urlOfIndex(understanding, index)).filter((url): url is string => Boolean(url) && url !== heroUrl);
  const projectImages = plan.projects.flatMap((project) => (project.imageIndexes ?? []).map((index) => urlOfIndex(understanding, index)))
    .filter((url): url is string => Boolean(url) && url !== heroUrl && !aboutImages.includes(url));
  const confidenceOf = new Map(understanding.services.map((service) => [service.name, service.confidence]));
  const services = plan.services.slice(0, 6).map((service) => ({
    title: service.title,
    description: service.description,
    selected: (confidenceOf.get(service.title) ?? "high") !== "low",
    confidence: confidenceOf.get(service.title),
  }));
  return {
    projects: plan.projects.map((project) => ({
      name: project.name,
      summary: project.summary,
      images: (project.imageIndexes ?? []).map((index) => urlOfIndex(understanding, index)).filter((url): url is string => Boolean(url) && url !== heroUrl),
    })),
    trust: [...plan.trust],
    heroCopy: { headline: plan.hero.headline, supporting: plan.hero.supporting },
    aboutCopy: { title: plan.about.title, body: plan.about.body },
    kept: [...new Set([heroUrl, logoUrl, ...aboutImages, ...projectImages, ...plan.services.map((service) => urlOfIndex(understanding, service.imageIndex))].filter((url): url is string => Boolean(url)))],
    heroUrl,
    logoUrl,
    aboutImages,
    projectImages,
    serviceImages: services.map((service) => urlOfIndex(understanding, plan.services.find((candidate) => candidate.title === service.title)?.imageIndex)),
    services,
    contact: {
      phone: plan.contact.phone ?? preview.contact.phone ?? "",
      email: plan.contact.email ?? preview.contact.email ?? "",
      address: plan.contact.address ?? preview.contact.address ?? "",
      city: plan.contact.city ?? preview.contact.city ?? "",
    },
    acknowledged: false,
    detectedCategory: understanding.suggestedCategory
      ? {
        categoryKey: understanding.suggestedCategory.categoryKey,
        subcategoryKey: understanding.suggestedCategory.subcategoryKey,
        confidence: understanding.suggestedCategory.confidence,
        reason: understanding.suggestedCategory.reason,
      }
      : null,
    designChoice: null,
  };
}

export function copyOf(locale: "en" | "de") {
  return copy[locale];
}

export type AssetCard = {
  url: string;
  sourcePage: string;
  alt: string;
  label: string;
  section: "hero" | "about" | "service" | "project" | "unused";
  description?: string;
  confidence?: number;
  quality?: string;
  reason?: string;
  heroEligible: boolean;
  aiRecommendedHero: boolean;
};

/** Semantically labeled, ordered asset cards from the AI understanding + plan. */
export function buildAssetCards(
  preview: WebsiteImportPreview,
  understanding?: WebsiteUnderstanding | null,
  plan?: WebsiteBuildPlan | null,
): AssetCard[] {
  const urlFor = (index: number | null | undefined) => urlOfIndex(understanding, index);
  const heroUrl = plan?.hero.imageIndex != null ? urlFor(plan.hero.imageIndex) : null;
  const aboutSet = new Set((plan?.about.imageIndexes ?? []).map((index) => urlFor(index)).filter((url): url is string => Boolean(url)));
  const serviceFor = (url: string) => {
    if (!plan) return null;
    const service = plan.services.find((candidate) => urlFor(candidate.imageIndex) === url);
    return service ? service.title : null;
  };
  const classified = (url: string) =>
    understanding?.images.find((entry) => urlOfIndex(understanding, entry.index) === url) as unknown as
      | { classification: string; description: string; quality: string; confidence: number; reason: string }
      | undefined;

  const cards: AssetCard[] = [];
  for (const photo of preview.photos) {
    const meta = classified(photo.url);
    const classification = meta?.classification ?? "stock";
    const isLogo = photo.url === preview.logoUrl || classification === "logo" || classification === "favicon";
    const heroEligible = !nonHeroImageClassifications.includes(classification as never);
    const serviceName = serviceFor(photo.url);
    let label: string;
    let section: AssetCard["section"];
    if (photo.url === heroUrl) { label = copy.en.assetHero; section = "hero"; }
    else if (isLogo) { label = copy.en.assetLogo; section = "unused"; }
    else if (aboutSet.has(photo.url)) { label = copy.en.assetAbout; section = "about"; }
    else if (serviceName) { label = `SERVICE: ${serviceName}`; section = "service"; }
    else if (classification === "project" || classification === "product") { label = copy.en.assetProject; section = "project"; }
    else if (classification === "work_process") { label = copy.en.assetProcess; section = "about"; }
    else if (classification === "certificate" || classification === "document") { label = copy.en.assetCertificate; section = "unused"; }
    else { label = copy.en.assetUnused; section = "unused"; }
    cards.push({
      url: photo.url,
      sourcePage: "declared source website",
      alt: photo.alt,
      label,
      section,
      description: meta?.description,
      confidence: meta?.confidence,
      quality: meta?.quality,
      reason: meta?.reason,
      heroEligible: heroEligible && !isLogo,
      aiRecommendedHero: photo.url === heroUrl,
    });
  }
  const rank = (card: AssetCard) =>
    card.section === "hero" ? 0 : card.label === copy.en.assetLogo ? 1 : card.section === "about" ? 2 : card.section === "service" ? 3 : card.section === "project" ? 4 : 5;
  return cards.sort((left, right) => rank(left) - rank(right));
}

export type WebsiteImportAnalyzeResult =
  | {
    ok: true; preview: WebsiteImportPreview;
    engine: "ai" | "ai-cached" | "deterministic";
    understanding?: WebsiteUnderstanding; plan?: WebsiteBuildPlan;
    /** Content hash of the analyzed source material; the reprovenance key for design decisions. */
    sourceContentHash?: string;
    aiUsage?: {
      calls: number; visionInputs: number;
      usage: Array<{ model: string; inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; estimatedCostUsdMicros: number | null }>;
    };
  }
  | { ok: false; errorCode: string };

export function importErrorMessage(locale: "en" | "de", errorCode: string) {
  const errors = copyOf(locale).errors;
  return errors[errorCode] ?? errors.import_unavailable;
}

export async function analyzeExistingWebsite(
  url: string,
  siteLocale?: string,
  category?: { categoryKey?: string; subcategoryKey?: string },
): Promise<WebsiteImportAnalyzeResult> {
  try {
    const response = await fetch("/api/public/website-import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        siteLocale,
        // The creation form's canonical keys ride along so the plan pass is
        // built under the owner's category (authority level 1).
        categoryKey: category?.categoryKey || undefined,
        subcategoryKey: category?.subcategoryKey || undefined,
      }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.preview)
      return {
        ok: true as const,
        preview: body.preview as WebsiteImportPreview,
        engine: (body.engine ?? "deterministic") as "ai" | "ai-cached" | "deterministic",
        understanding: (body.understanding ?? undefined) as WebsiteUnderstanding | undefined,
        plan: (body.plan ?? undefined) as WebsiteBuildPlan | undefined,
        sourceContentHash: typeof body.contentHash === "string" && /^[a-f0-9]{64}$/.test(body.contentHash) ? body.contentHash : undefined,
        aiUsage: body.aiUsage as WebsiteImportAnalyzeResult extends never ? never : Extract<WebsiteImportAnalyzeResult, { ok: true }>["aiUsage"],
      };
    return { ok: false as const, errorCode: String(body?.errorCode ?? "import_unavailable") };
  } catch {
    return { ok: false as const, errorCode: "import_unavailable" };
  }
}

/** Builds the wire submission from the reviewed selections (explicit hero, no array order). */
export function submissionFromSelections(
  sourceUrl: string,
  selections: ImportSelections,
  plan?: WebsiteBuildPlan | null,
  sourceContentHash?: string,
): Record<string, unknown> {
  return {
    sourceUrl,
    importAcknowledged: true,
    logoUrl: selections.logoUrl ?? undefined,
    // Review-approved siteLocale copy wins over any starter/raw source text.
    hero: selections.heroCopy
      ? { headline: selections.heroCopy.headline, supporting: selections.heroCopy.supporting }
      : undefined,
    about: selections.aboutCopy
      ? { title: selections.aboutCopy.title, body: selections.aboutCopy.body }
      : undefined,
    heroImageUrl: selections.heroUrl ?? undefined,
    galleryImageUrls: [...selections.projectImages, ...selections.aboutImages].filter((url) => url !== selections.heroUrl).slice(0, 6),
    services: selections.services.filter((service) => service.selected && service.title).map((service) => ({ title: service.title, description: service.description || undefined })),
    serviceImageUrls: selections.serviceImages,
    contact: Object.values(selections.contact).some(Boolean) ? selections.contact : undefined,
    // The reviewed plan's composition/theme decisions travel with the
    // submission so they reach generation instead of staying display-only
    // (BSRC-DESIGN-FOUNDATION-001 decision-loss fix). The user's design
    // choice (P4-003) replaces the recommended design when present; an
    // untouched choice keeps the AI recommendation as evidence (designSource
    // "ai"), an explicit pick — even of the recommendation — travels as
    // designSource "owner".
    templateKey: plan?.templateKey,
    themeKey: plan?.themeKey,
    ...(() => {
      if (!plan?.design) return {};
      const chosen = chosenDesignInput(plan, selections.designChoice);
      return {
        design: chosen.design,
        designSource: chosen.designSource,
        ...(chosen.selectionReason ? { selectionReason: chosen.selectionReason } : {}),
        ...(plan.archetypeConfidence !== undefined ? { archetypeConfidence: plan.archetypeConfidence } : {}),
      };
    })(),
    // Review-approved canonical category (P4-002): an explicit owner decision
    // (Accept/Change) is authority level 1; confidence is carried only when
    // the owner approved the AI-detected entry unchanged.
    ...(selections.approvedCategory
      ? {
        categoryKey: selections.approvedCategory.categoryKey,
        subcategoryKey: selections.approvedCategory.subcategoryKey ?? undefined,
        categorySource: "owner" as const,
        ...(selections.detectedCategory
          && selections.detectedCategory.categoryKey === selections.approvedCategory.categoryKey
          && (selections.detectedCategory.subcategoryKey ?? null) === (selections.approvedCategory.subcategoryKey ?? null)
          ? { categoryConfidence: selections.detectedCategory.confidence }
          : {}),
      }
      : {}),
    sourceContentHash,
    projects: selections.projects
      ? selections.projects
          .filter((project) => project.name)
          .slice(0, 8)
          .map((project) => ({ name: project.name, summary: project.summary || undefined, imageUrls: project.images.slice(0, 4) }))
      : undefined,
    trust: selections.trust?.length ? selections.trust.slice(0, 6) : undefined,
  };
}

export function WebsiteImportReview({
  preview,
  locale,
  selections,
  onChange,
  onRemove,
  engine,
  understanding,
  plan,
}: {
  preview: WebsiteImportPreview;
  locale: "en" | "de";
  selections: ImportSelections;
  onChange: (next: ImportSelections) => void;
  onRemove: () => void;
  engine?: "ai" | "ai-cached" | "deterministic";
  understanding?: WebsiteUnderstanding | null;
  plan?: WebsiteBuildPlan | null;
}) {
  const copy = copyOf(locale);
  const update = (patch: Partial<ImportSelections>) => onChange({ ...selections, ...patch });
  const [categoryEditing, setCategoryEditing] = useState(false);
  const cards = buildAssetCards(preview, understanding, plan);
  const registryLocale: CategoryRegistryLocale = locale === "de" ? "de" : "en";
  const categoryLabelOf = (categoryKey: string, subcategoryKey: string | null) => {
    const family = businessCategoryFamily(categoryKey);
    const subcategory = subcategoryKey ? businessCategorySubcategory(subcategoryKey) : undefined;
    if (subcategory) return `${subcategory.labels[registryLocale] ?? subcategory.labels.en}`;
    return family?.labels[registryLocale] ?? family?.labels.en ?? categoryKey;
  };
  const confidenceWordOf = (confidence: number) =>
    confidence >= 0.75 ? copy.categoryHigh : confidence >= 0.5 ? copy.categoryMedium : copy.categoryLow;
  const approveCategory = (categoryKey: string, subcategoryKey: string | null) =>
    update({ approvedCategory: { categoryKey, subcategoryKey, label: categoryLabelOf(categoryKey, subcategoryKey) } });
  const toggleKept = (card: AssetCard) => {
    const kept = selections.kept.includes(card.url)
      ? selections.kept.filter((url) => url !== card.url)
      : [...selections.kept, card.url];
    const next: ImportSelections = { ...selections, kept };
    if (!kept.includes(card.url)) {
      if (selections.heroUrl === card.url) next.heroUrl = null;
      next.aboutImages = selections.aboutImages.filter((url) => url !== card.url);
      next.projectImages = selections.projectImages.filter((url) => url !== card.url);
      next.serviceImages = selections.serviceImages.map((url) => (url === card.url ? null : url));
      if (selections.logoUrl === card.url) next.logoUrl = null;
    }
    onChange(next);
  };
  const setHero = (card: AssetCard) => {
    if (!card.heroEligible) return;
    if (selections.kept.includes(card.url)) update({ heroUrl: card.url });
    else update({ kept: [...selections.kept, card.url], heroUrl: card.url });
  };
  return (
    <div className="import-review">
      <div className="trial-summary wide">
        <span>{engine && engine !== "deterministic" ? copy.aiHeading : copy.heading}</span>
        <strong>{engine && engine !== "deterministic" ? copy.aiIntro : copy.intro}</strong>
        <small>{copy.source}: {preview.sourceUrl} · {preview.pagesRead} {copy.pages}{engine && engine !== "deterministic" ? ` · ${engine === "ai-cached" ? copy.aiCached : "AI"}` : ""}</small>
      </div>
      {understanding ? (
        <div className="import-ai-summary wide">
          <p><strong>{copy.aiSummary}:</strong> {understanding.business.summary}</p>
          <p><strong>{copy.aiServices}:</strong> {understanding.services.map((service) => service.name).join(", ") || "—"}</p>
          {understanding.business.differentiators.length ? <p><strong>{copy.aiDifferentiators}:</strong> {understanding.business.differentiators.join(", ")}</p> : null}
          {plan ? (
            <p><strong>{copy.planStructure}:</strong> Hero{plan.hero.imageIndex !== null ? ` (${copy.aiWithImage})` : ` (${copy.assetUnused})`} → About → Services{plan.services.length ? ` (${plan.services.length})` : ""} → Projects → Trust → Contact → Privacy</p>
          ) : null}
          {plan && plan.hero.imageIndex === null && plan.needsHeroImage ? <p className="error">{copy.aiNoHero}</p> : null}
        </div>
      ) : null}
      {plan ? (
        <div className="import-brand wide">
          <p><strong>{copy.brand}:</strong> theme <strong>{plan.themeKey}</strong> / template <strong>{plan.templateKey}</strong></p>
          {preview.colors.length ? <p>{preview.colors.map((color) => <span key={color} className="import-color-swatch" style={{ background: color }} title={color} />)}</p> : null}
          {preview.fonts.length ? <p>{preview.fonts.join(", ")}</p> : null}
        </div>
      ) : null}
      {(() => {
        const designOptions = plan ? planDesignOptions(plan) : [];
        if (!designOptions.length || !plan) return null;
        const chosenIndex = selections.designChoice && typeof selections.designChoice.optionIndex === "number"
          && designOptions.some((option) => option.index === selections.designChoice!.optionIndex)
          ? selections.designChoice.optionIndex
          : 0;
        let previewBusinessName = "Preview";
        try { previewBusinessName = preview.businessName || new URL(preview.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep fallback */ }
        // The preview submission carries the CURRENT reviewed content with the
        // AI design neutralized — each card's option design overrides only the
        // design input, so switching cards can never change copy or facts.
        const previewSubmission = submissionFromSelections(
          preview.sourceUrl,
          { ...selections, designChoice: null },
          plan,
        );
        return (
          <fieldset className="wide design-options">
            <legend>{copy.designDirection}</legend>
            <p className="trial-template-note">{copy.designDirectionNote}</p>
            <div className="design-option-grid">
              {designOptions.map((option) => {
                const selected = chosenIndex === option.index;
                return (
                  <div key={option.index} className={`design-option-card${selected ? " design-option-selected" : ""}`}>
                    <p className="design-option-label">
                      <strong>{option.kind === "recommended" ? copy.aiRecommended : `${copy.designAlternative} ${option.index}`}</strong>
                      {selected ? <span className="design-option-badge">{copy.designInUse}</span> : null}
                    </p>
                    <DesignMiniPreview
                      businessName={previewBusinessName}
                      locale={resolveLocale(plan.language)}
                      submission={previewSubmission}
                      design={option.design}
                    />
                    <p className="design-option-facts">
                      <span>{option.design.archetype}</span>
                      {option.design.heroVariant ? <span> · {copy.designHero}: {option.design.heroVariant}</span> : null}
                      {option.design.typographyDirection ? <span> · {copy.designTypography}: {option.design.typographyDirection}</span> : null}
                    </p>
                    {option.reason ? <p className="design-option-reason">{option.reason}</p> : null}
                    {!selected ? (
                      <button type="button" className="button" onClick={() => update({ designChoice: { optionIndex: option.index } })}>{copy.designUse}</button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })()}
      {!understanding ? <p className="trial-template-note wide">{copy.deterministicAssets}</p> : null}
      {understanding && (selections.detectedCategory || selections.approvedCategory) ? (
        <div className="import-category wide">
          {selections.approvedCategory ? (
            <>
              <p><strong>{copy.categoryApproved}:</strong> <strong>{selections.approvedCategory.label}</strong>
                {selections.detectedCategory
                  && selections.detectedCategory.categoryKey === selections.approvedCategory.categoryKey
                  && (selections.detectedCategory.subcategoryKey ?? null) === (selections.approvedCategory.subcategoryKey ?? null)
                  ? <span> · {confidenceWordOf(selections.detectedCategory.confidence)}</span>
                  : null}
              </p>
              {categoryEditing ? (
                <BusinessCategoryCombobox
                  locale={registryLocale}
                  name="reviewCategory"
                  placeholder={copy.detectedCategory}
                  onSelect={(selection: ComboboxSelection) => {
                    approveCategory(selection.categoryKey, selection.subcategoryKey || null);
                    setCategoryEditing(false);
                  }}
                />
              ) : (
                <button type="button" className="button secondary" onClick={() => setCategoryEditing(true)}>{copy.categoryChange}</button>
              )}
            </>
          ) : selections.detectedCategory ? (
            <>
              <p>
                <strong>{copy.detectedCategory}:</strong> <strong>{categoryLabelOf(selections.detectedCategory.categoryKey, selections.detectedCategory.subcategoryKey)}</strong>
                {" "}· {confidenceWordOf(selections.detectedCategory.confidence)}
              </p>
              {selections.detectedCategory.reason ? <p><strong>{copy.categoryWhy}:</strong> {selections.detectedCategory.reason}</p> : null}
              <div className="import-category-actions">
                <button type="button" className="button" onClick={() => approveCategory(selections.detectedCategory!.categoryKey, selections.detectedCategory!.subcategoryKey)}>{copy.categoryAccept}</button>
                <button type="button" className="button secondary" onClick={() => setCategoryEditing(true)}>{copy.categoryChange}</button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <fieldset className="wide">
        <legend>{copy.assets}</legend>
        {cards.map((card) => {
          const isHero = selections.heroUrl === card.url;
          const isLogo = card.label === copy.assetLogo;
          const kept = selections.kept.includes(card.url);
          return (
            <div key={card.url} className={`import-asset-card${isHero ? " import-asset-hero" : ""}${kept ? "" : " import-asset-removed"}`}>
              {/* Same-origin, provenance-approved asset from the customer-declared website.
                  Fixed thumbnail box: photos crop (cover), logos keep shape (contain). */}
              <img
                src={card.url}
                alt={card.alt || ""}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className={`import-asset-thumb${isLogo ? " import-asset-thumb-contain" : ""}`}
              />
              <div className="import-asset-meta">
                <p className="import-asset-label">{card.label}{card.aiRecommendedHero ? ` · ${copy.aiRecommended}` : ""}{isHero && !card.aiRecommendedHero ? ` · ${copy.isHero}` : ""}</p>
                {card.description ? <p>{card.description}</p> : <p>{card.alt || card.url.split("/").pop()}</p>}
                <p className="import-asset-facts">
                  {card.confidence !== undefined ? <span>{copy.confidence}: {Math.round(card.confidence * 100)}%</span> : null}
                  {card.quality ? <span> · {copy.quality}: {card.quality}</span> : null}
                  {!card.heroEligible ? <span> · {copy.notHeroSafe}</span> : null}
                </p>
                <label className="legal-consent">
                  <input type="checkbox" checked={kept} onChange={() => toggleKept(card)} />
                  <span>{copy.keep}</span>
                </label>
                {card.heroEligible && kept ? (
                  <label className="legal-consent">
                    <input type="radio" name="import-hero-choice" checked={isHero} onChange={() => setHero(card)} />
                    <span>{copy.setHero}</span>
                  </label>
                ) : null}
              </div>
            </div>
          );
        })}
      </fieldset>
      {selections.services.length ? (
        <fieldset className="wide">
          <legend>{copy.services}</legend>
          {selections.services.map((service, index) => (
            <div key={index} className="import-service-row">
              <label className="legal-consent">
                <input
                  type="checkbox"
                  checked={service.selected}
                  onChange={(event) => {
                    const next = [...selections.services];
                    next[index] = { ...next[index], selected: event.target.checked };
                    update({ services: next });
                  }}
                />
                <span>{service.title}{service.confidence === "low" ? ` — ${copy.needsReview}` : ""}</span>
              </label>
              <textarea
                value={service.description}
                maxLength={400}
                onChange={(event) => {
                  const next = [...selections.services];
                  next[index] = { ...next[index], description: event.target.value };
                  update({ services: next });
                }}
              />
            </div>
          ))}
        </fieldset>
      ) : null}
      {Object.values(selections.contact).some(Boolean) ? (
        <fieldset className="trial-fields wide">
          <legend>{copy.contact}</legend>
          <label><input value={selections.contact.phone} maxLength={40} placeholder={copy.remove} onChange={(event) => update({ contact: { ...selections.contact, phone: event.target.value } })} /></label>
          <label><input value={selections.contact.email} maxLength={160} placeholder={copy.remove} onChange={(event) => update({ contact: { ...selections.contact, email: event.target.value } })} /></label>
          <label><input value={selections.contact.address} maxLength={200} placeholder={copy.remove} onChange={(event) => update({ contact: { ...selections.contact, address: event.target.value } })} /></label>
          <label><input value={selections.contact.city} maxLength={100} placeholder={copy.remove} onChange={(event) => update({ contact: { ...selections.contact, city: event.target.value } })} /></label>
        </fieldset>
      ) : null}
      {preview.aboutExcerpt ? <p className="trial-template-note wide">{copy.reference} — {preview.aboutExcerpt}</p> : null}
      <label className="legal-consent wide">
        <input
          type="checkbox"
          required
          checked={selections.acknowledged}
          onChange={(event) => update({ acknowledged: event.target.checked })}
        />
        <span>{copy.ownership}</span>
      </label>
      <button type="button" className="trial-back" onClick={onRemove}>{copy.removeImport}</button>
    </div>
  );
}
