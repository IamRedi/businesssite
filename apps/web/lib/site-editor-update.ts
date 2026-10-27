import {
  customerPublicLegalIdentityMissingFields,
  designPresets,
  legacyLayoutOf,
  resolveSiteDesign,
  themeIdFromThemeKey,
  type OpeningHour,
  type LogoShape,
  type SiteDocument,
  type ThemeSelection,
} from "@platform/website-engine";
import type { SiteEditorSection } from "../components/site-editor-tabs";

const value = (data: FormData, key: string) =>
  String(data.get(key) ?? "").trim();

export const safePrivacyNoticeUrl = (candidate: string) => {
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try { return new URL(candidate).protocol === "https:" ? candidate : undefined; }
  catch { return undefined; }
};

const editorSection = (candidate: string): SiteEditorSection =>
  (["identity", "content", "services", "media", "design", "contact"] as const).includes(
    candidate as SiteEditorSection,
  )
    ? (candidate as SiteEditorSection)
    : "identity";

const themeSelection = (candidate: string): ThemeSelection =>
  designPresets.some((option) => option.key === candidate)
    ? (candidate as ThemeSelection)
    : "auto";

const logoShape = (candidate: string): LogoShape =>
  candidate === "circle" ? "circle" : "rounded";

export function applySiteEditorUpdate(current: SiteDocument, formData: FormData) {
  const section = editorSection(value(formData, "activeSection"));
  let document: SiteDocument = { ...current };
  if (section === "identity") {
    document = {
      ...document,
      content: {
        ...current.content,
        name: value(formData, "name") || current.content.name,
      },
    };
  }
  if (section === "content") {
    document = {
      ...document,
      content: {
        ...current.content,
        heroTitle: value(formData, "heroTitle"),
        heroSubtitle: value(formData, "heroSubtitle"),
        aboutTitle: value(formData, "aboutTitle"),
        aboutBody: value(formData, "aboutBody"),
        servicesTitle: value(formData, "servicesTitle"),
        contactTitle: value(formData, "contactTitle"),
      },
    };
  }
  if (section === "services") {
    document = {
      ...document,
      services: current.services.map((service, index) => ({
        title: value(formData, `service${index}Title`) || service.title,
        description:
          value(formData, `service${index}Description`) || service.description,
      })),
    };
  }
  if (section === "media") {
    document = {
      ...document,
      media: {
        logoUrl: value(formData, "logoUrl"),
        logoShape: logoShape(value(formData, "logoShape")),
        heroImageUrl: value(formData, "heroImageUrl"),
        serviceImageUrls: current.services.map(
          (_, index) =>
            value(formData, `serviceImage${index}`) ||
            current.media.serviceImageUrls[index] ||
            "",
        ),
        galleryImageUrls: [
          value(formData, "gallery0"),
          value(formData, "gallery1"),
          value(formData, "gallery2"),
        ].filter(Boolean),
      },
    };
  }
  if (section === "design") {
    const selectedTheme = themeSelection(value(formData, "themeKey"));
    const design = resolveSiteDesign(current.templateKey, selectedTheme);
    // ds/1 documents: the customer's theme choice updates the theme only —
    // composition (archetype) is never changed by a theme, and the design
    // block keeps recording versions (BSRC-DESIGN-FOUNDATION-001).
    // Review hardening: on ds/1 documents the mirror must stay aligned with
    // the design block — composition stays the archetype and the theme
    // metadata follows the resolved selection.
    const designBlock = current.design
      ? {
        ...current.design,
        themeId: selectedTheme === "auto"
          ? themeIdFromThemeKey(design.themeKey, current.design.archetype)
          : selectedTheme === "gold"
            ? "gold-noir"
            : selectedTheme,
      }
      : current.design;
    document = {
      ...document,
      template: current.design ? legacyLayoutOf(current.design.archetype) : design.template,
      themeKey: design.themeKey,
      theme: design.theme,
      ...(designBlock ? { design: designBlock } : {}),
    };
  }
  if (section === "contact") {
    document = {
      ...document,
      contact: {
        ...current.contact,
        phone: value(formData, "phone") || undefined,
        email: value(formData, "email") || undefined,
        address: value(formData, "address") || undefined,
        city: value(formData, "city") || undefined,
        openingHours: [
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ].map((day) => {
          const open = value(formData, `${day}Open`);
          const close = value(formData, `${day}Close`);
          const closed = formData.has(`${day}Closed`) || !open || !close;
          return {
            day,
            open: closed ? undefined : open,
            close: closed ? undefined : close,
            closed,
            intervals: closed ? undefined : current.contact.openingHours?.find(item => item.day === day)?.intervals?.map((interval, index) => ({
              open: formData.has(`${day}Interval${index}Open`) ? value(formData, `${day}Interval${index}Open`) : interval.open,
              close: formData.has(`${day}Interval${index}Close`) ? value(formData, `${day}Interval${index}Close`) : interval.close,
            })).filter(interval => interval.open && interval.close),
          } as OpeningHour;
        }),
      },
      publicLegal: {
        legalBusinessName: value(formData, "legalBusinessName") || undefined,
        legalForm: value(formData, "legalForm") || undefined,
        authorizedRepresentative: value(formData, "legalRepresentative") || undefined,
        street: value(formData, "legalStreet") || undefined,
        postalCode: value(formData, "legalPostalCode") || undefined,
        city: value(formData, "legalCity") || undefined,
        countryCode: value(formData, "legalCountryCode").toUpperCase().slice(0, 2) || undefined,
        contactEmail: value(formData, "legalContactEmail") || undefined,
        registerName: value(formData, "legalRegisterName") || undefined,
        registerNumber: value(formData, "legalRegisterNumber") || undefined,
        vatId: value(formData, "legalVatId") || undefined,
        // The platform-generated privacy page is the default; an external URL
        // is always an explicit customer override.
        privacyNoticeUrl: value(formData, "legalPrivacyMode") === "external"
          ? safePrivacyNoticeUrl(value(formData, "legalPrivacyNoticeUrl"))
          : undefined,
        privacyNoticePath: value(formData, "legalPrivacyMode") === "external" ? undefined : "/privacy",
      },
    };
  }
  return { section, document };
}

/**
 * A publicly activated website must never lose its complete legal identity:
 * the public read gate would otherwise turn it into a silent 404.
 */
export function legalIdentityPublicationBlocked(
  before: SiteDocument,
  after: SiteDocument,
  activatedAt: string | null | undefined,
) {
  return Boolean(activatedAt) &&
    customerPublicLegalIdentityMissingFields(before).length === 0 &&
    customerPublicLegalIdentityMissingFields(after).length > 0;
}
