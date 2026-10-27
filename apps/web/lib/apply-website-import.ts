import type { SiteDocument } from "@platform/website-engine";
import {
  professionalServiceDescription,
  resolveBusinessCategoryKeys,
  resolveLocale,
  siteCopy,
} from "@platform/website-engine";

/**
 * The reviewed import payload both creation flows submit. Assets are carried
 * by their original source URL (that URL is the provenance) and must share
 * the declared website's origin. Nothing is applied without the explicit
 * ownership acknowledgement.
 */
export type ExistingWebsiteSubmission = {
  sourceUrl: string;
  importAcknowledged: true;
  logoUrl?: string;
  heroImageUrl?: string;
  galleryImageUrls?: string[];
  /** Review-approved image per service, parallel to services. */
  serviceImageUrls?: string[];
  services?: Array<{ title: string; description?: string }>;
  /** Review-approved siteLocale copy from the AI plan (wins over starter/raw text). */
  hero?: { headline: string; supporting: string };
  about?: { title: string; body: string };
  contact?: { phone?: string; email?: string; address?: string; city?: string };
  /** The reviewed plan's theme/composition choices (BSRC-DESIGN-FOUNDATION-001). */
  templateKey?: string;
  themeKey?: string;
  /** Raw plan v2 design decisions; re-validated by the engine at generation time. */
  design?: Record<string, unknown>;
  /** Who decided the applied design (P4-003): the AI recommendation ("ai")
   * or an explicit user pick in the review ("owner"). Evidence only beside
   * the design; the engine stores it on design.planner. */
  designSource?: "owner" | "ai";
  /** Selection evidence: why the applied composition was chosen. */
  selectionReason?: string;
  /** The planner's stated confidence (0..1) in its recommended archetype. */
  archetypeConfidence?: number;
  /** Content hash of the analyzed source material (reproducibility/provenance). */
  sourceContentHash?: string;
  /** Review-approved project references (verified evidence only). */
  projects?: Array<{ name: string; summary?: string; imageUrls: string[] }>;
  /** Review-approved trust lines (certifications/guarantees). */
  trust?: string[];
  /** Review-approved canonical category (P4-002, authority level 1). */
  categoryKey?: string;
  subcategoryKey?: string;
  categoryConfidence?: number;
  categorySource?: "owner";
};

const text = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

const sameOrigin = (candidate: string, sourceUrl: string) => {
  try {
    const asset = new URL(candidate);
    const source = new URL(sourceUrl);
    // Https-only assets avoid mixed-content blocking on the public site.
    return asset.protocol === "https:" &&
      asset.hostname === source.hostname &&
      !asset.username && !asset.password
      ? asset.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

/** Strict shape validation for the wizard's JSON submission. Null means "no import". */
export function validateExistingWebsiteSubmission(value: unknown): ExistingWebsiteSubmission | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const sourceUrl = text(input.sourceUrl, 200);
  if (!sourceUrl || input.importAcknowledged !== true) return null;
  let source: URL;
  try { source = new URL(sourceUrl); } catch { return null; }
  if (!["http:", "https:"].includes(source.protocol) || !source.hostname.includes(".")) return null;
  const asset = (candidate: unknown) => {
    const raw = text(candidate, 500);
    return raw ? sameOrigin(raw, sourceUrl) : undefined;
  };
  const gallery = Array.isArray(input.galleryImageUrls)
    ? input.galleryImageUrls.slice(0, 6).map(asset).filter((item): item is string => Boolean(item))
    : undefined;
  const services = Array.isArray(input.services)
    ? input.services.slice(0, 6)
        .map((service) => ({
          title: text((service as Record<string, unknown>)?.title, 80),
          description: text((service as Record<string, unknown>)?.description, 300) || undefined,
        }))
        .filter((service) => service.title)
    : undefined;
  const serviceImageUrls = Array.isArray(input.serviceImageUrls)
    ? input.serviceImageUrls.slice(0, 6).map(asset).filter((item): item is string => Boolean(item))
    : undefined;
  const contactInput = (input.contact ?? {}) as Record<string, unknown>;
  const contact = {
    phone: text(contactInput.phone, 40) || undefined,
    email: text(contactInput.email, 160).toLowerCase() || undefined,
    address: text(contactInput.address, 200) || undefined,
    city: text(contactInput.city, 100) || undefined,
  };
  const heroInput = (input.hero ?? {}) as Record<string, unknown>;
  const hero = {
    headline: text(heroInput.headline, 160),
    supporting: text(heroInput.supporting, 300),
  };
  const aboutInput = (input.about ?? {}) as Record<string, unknown>;
  const about = {
    title: text(aboutInput.title, 160),
    body: text(aboutInput.body, 1600),
  };
  // Plan design decisions survive review; the raw plan shape
  // (layoutArchetype/…) is normalized to the engine's design input here so
  // both creation flows pass one canonical shape to generation. The engine's
  // registries re-validate every value and fall back safely.
  const templateKey = text(input.templateKey, 80) || undefined;
  const themeKeyRaw = text(input.themeKey, 20);
  const themeKey = ["auto", "studio", "clarity", "forge", "gold"].includes(themeKeyRaw) ? themeKeyRaw : undefined;
  let design: Record<string, unknown> | undefined;
  if (input.design && typeof input.design === "object" && !Array.isArray(input.design)) {
    const raw = input.design as Record<string, unknown>;
    const { layoutArchetype, ...rest } = raw;
    design = { ...rest, ...(layoutArchetype !== undefined ? { archetype: layoutArchetype } : {}) };
  }
  // P4-003 choice authority + evidence: carried only beside a design block;
  // the engine bounds the reason and clamps the confidence onto design.planner.
  const designSource = design && (input.designSource === "owner" || input.designSource === "ai") ? input.designSource : undefined;
  const selectionReason = design && designSource ? text(input.selectionReason, 500) || undefined : undefined;
  const archetypeConfidence = design && designSource && typeof input.archetypeConfidence === "number" && Number.isFinite(input.archetypeConfidence)
    ? Math.min(1, Math.max(0, input.archetypeConfidence))
    : undefined;
  const sourceContentHashCandidate = text(input.sourceContentHash, 64);
  const sourceContentHash = /^[a-f0-9]{64}$/.test(sourceContentHashCandidate) ? sourceContentHashCandidate : undefined;
  const projects = Array.isArray(input.projects)
    ? input.projects.slice(0, 8)
        .map((project) => ({
          name: text((project as Record<string, unknown>)?.name, 120),
          summary: text((project as Record<string, unknown>)?.summary, 300) || undefined,
          imageUrls: Array.isArray((project as Record<string, unknown>)?.imageUrls)
            ? ((project as Record<string, unknown>).imageUrls as unknown[]).slice(0, 4).map((candidate) => asset(candidate)).filter((item): item is string => Boolean(item))
            : [],
        }))
        .filter((project) => project.name)
    : undefined;
  const trust = Array.isArray(input.trust)
    ? input.trust.slice(0, 6).map((line) => text(line, 160)).filter(Boolean)
    : undefined;
  // Review-approved canonical category: keys validated against the registry
  // (unknown keys dropped); only a fresh owner decision may travel here.
  const approvedCategory = resolveBusinessCategoryKeys({
    categoryKey: text(input.categoryKey, 60),
    subcategoryKey: text(input.subcategoryKey, 60),
  });
  const categoryConfidenceRaw = typeof input.categoryConfidence === "number" && Number.isFinite(input.categoryConfidence)
    ? Math.min(1, Math.max(0, input.categoryConfidence))
    : undefined;
  const categorySource = input.categorySource === "owner" && approvedCategory.categoryKey ? "owner" as const : undefined;
  return {
    sourceUrl,
    importAcknowledged: true,
    logoUrl: asset(input.logoUrl),
    heroImageUrl: asset(input.heroImageUrl),
    galleryImageUrls: gallery?.length ? gallery : undefined,
    serviceImageUrls: serviceImageUrls?.length ? serviceImageUrls : undefined,
    services: services?.length ? services : undefined,
    hero: hero.headline && hero.supporting ? { headline: hero.headline, supporting: hero.supporting } : undefined,
    about: about.title && about.body ? { title: about.title, body: about.body } : undefined,
    contact: Object.values(contact).some(Boolean) ? contact : undefined,
    ...(templateKey ? { templateKey } : {}),
    ...(themeKey ? { themeKey } : {}),
    ...(design ? { design } : {}),
    ...(designSource ? { designSource } : {}),
    ...(selectionReason ? { selectionReason } : {}),
    ...(archetypeConfidence !== undefined ? { archetypeConfidence } : {}),
    ...(sourceContentHash ? { sourceContentHash } : {}),
    ...(projects?.length ? { projects } : {}),
    ...(trust?.length ? { trust } : {}),
    ...(approvedCategory.categoryKey
      ? {
        categoryKey: approvedCategory.categoryKey,
        ...(approvedCategory.subcategoryKey ? { subcategoryKey: approvedCategory.subcategoryKey } : {}),
        ...(categorySource ? { categorySource } : {}),
        ...(categorySource && categoryConfidenceRaw !== undefined ? { categoryConfidence: categoryConfidenceRaw } : {}),
      }
      : {}),
  };
}

/** Reads the owner review form's import fields. Null means "no import". */
export function existingWebsiteSubmissionFromForm(formData: FormData): ExistingWebsiteSubmission | null {
  const payload = String(formData.get("importPayload") ?? "").trim();
  if (payload) {
    try {
      return validateExistingWebsiteSubmission(JSON.parse(payload.slice(0, 8_000)));
    } catch {
      return null;
    }
  }
  const sourceUrl = String(formData.get("importSourceUrl") ?? "").trim().slice(0, 200);
  if (!sourceUrl) return null;
  const heroUrl = String(formData.get("importHeroUrl") ?? "").trim() || undefined;
  const keptPhotos = formData
    .getAll("importPhoto")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .filter((photo) => photo !== heroUrl);
  const serviceImages: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const url = String(formData.get(`importServiceImage${index}`) ?? "").trim();
    serviceImages.push(url);
  }
  const services: Array<{ title: string; description?: string }> = [];
  for (let index = 0; index < 12; index += 1) {
    const title = String(formData.get(`importService${index}Title`) ?? "").trim().slice(0, 80);
    if (!title) continue;
    services.push({ title, description: String(formData.get(`importService${index}Description`) ?? "").trim().slice(0, 300) || undefined });
  }
  return validateExistingWebsiteSubmission({
    sourceUrl,
    importAcknowledged: formData.get("importAcknowledged") === "true",
    logoUrl: formData.get("importKeepLogo") === "true" ? String(formData.get("importLogoUrl") ?? "") : undefined,
    heroImageUrl: heroUrl ?? keptPhotos[0],
    galleryImageUrls: keptPhotos.slice(0, 6),
    serviceImageUrls: serviceImages.some(Boolean) ? serviceImages : undefined,
    services,
    contact: {
      phone: String(formData.get("importContactPhone") ?? ""),
      email: String(formData.get("importContactEmail") ?? ""),
      address: String(formData.get("importContactAddress") ?? ""),
      city: String(formData.get("importContactCity") ?? ""),
    },
  });
}

/**
 * Applies the reviewed import to a freshly generated site document. Facts are
 * merged (existing values win), assets keep their source URLs as provenance,
 * and the import itself is recorded on the document.
 */
export function applyExistingWebsiteToSite(site: SiteDocument, submission: ExistingWebsiteSubmission) {
  if (!submission.importAcknowledged)
    throw new Error("Imported content requires the ownership acknowledgement.");
  const locale = resolveLocale(site.locale);
  const copy = siteCopy[locale];
  if (submission.services?.length) {
    site.services = submission.services.slice(0, 6).map((service, index) => ({
      title: service.title,
      description: service.description?.trim() ||
        professionalServiceDescription(service.title, locale, index) ||
        copy.serviceDescription,
    }));
  }
  // Review-approved siteLocale copy wins over starter/raw source text.
  if (submission.hero?.headline) site.content.heroTitle = submission.hero.headline;
  if (submission.hero?.supporting) {
    site.content.heroSubtitle = submission.hero.supporting;
    site.content.description = submission.hero.supporting;
  }
  if (submission.about?.title) site.content.aboutTitle = submission.about.title;
  if (submission.about?.body) site.content.aboutBody = submission.about.body;
  if (submission.contact?.phone && !site.contact.phone) site.contact.phone = submission.contact.phone;
  if (submission.contact?.email && !site.contact.email) site.contact.email = submission.contact.email;
  if (submission.contact?.address && !site.contact.address) site.contact.address = submission.contact.address;
  if (submission.contact?.city && !site.contact.city) site.contact.city = submission.contact.city;
  if (submission.logoUrl) site.media.logoUrl = submission.logoUrl;
  if (submission.heroImageUrl) site.media.heroImageUrl = submission.heroImageUrl;
  // Service↔image mapping approved in review: the first N service images back
  // the first N services; the remainder become the project/about gallery.
  if (submission.serviceImageUrls?.length) {
    site.media.serviceImageUrls = submission.serviceImageUrls.slice(0, 6);
    const gallery = submission.galleryImageUrls?.length
      ? submission.galleryImageUrls
      : submission.serviceImageUrls.slice(submission.services?.length ?? 0);
    if (gallery.length) site.media.galleryImageUrls = gallery.slice(0, 3);
  } else if (submission.galleryImageUrls?.length) {
    site.media.galleryImageUrls = submission.galleryImageUrls.slice(0, 3);
  }
  if (submission.galleryImageUrls?.length) {
    site.media.galleryImageUrls = submission.galleryImageUrls.slice(0, 3);
  }
  // Review-approved projects/trust render in the P3 archetypes; same-origin
  // provenance applies to every project image.
  if (submission.projects?.length) {
    site.projects = submission.projects.map((project) => ({ name: project.name, summary: project.summary ?? "", imageUrls: project.imageUrls }));
  }
  if (submission.trust?.length) {
    site.trust = [...submission.trust];
  }
  site.importSource = { url: submission.sourceUrl, importedAt: new Date().toISOString() };
}
