import { generateSiteDocument, type InformationSubcategory, type PreparedBusinessProfile, type SiteDocument, type SupportedLocale, type ThemeSelection } from "@platform/website-engine";
import { randomUUID } from "node:crypto";

export function publicationSlug(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 180);
}

export function createOwnerPublicationDocument(input: {
  publicationName: string; slug?: string; tagline?: string; locale: SupportedLocale;
  subcategory: InformationSubcategory; themeKey: ThemeSelection;
}) {
  const name = input.publicationName.trim();
  const slug = publicationSlug(input.slug || name);
  if (!name || !slug) throw new Error("A publication name and a valid URL slug are required.");
  const id = randomUUID();
  const profile: PreparedBusinessProfile = {
    id: `publication-${id}`, version: 1, sourceLeadId: `owner-publication-${id}`, locale: input.locale,
    business: { name, description: input.tagline?.trim() || `${name} publishes clear, useful information for its readers.`, category: "Information and news", subcategory: input.subcategory },
    services: [], approvedSources: [], preparedAt: new Date().toISOString(),
  };
  const generated = generateSiteDocument(profile, undefined, input.themeKey);
  return { ...generated, id, slug, visibility: "public", content: { ...generated.content, name } } satisfies SiteDocument;
}
