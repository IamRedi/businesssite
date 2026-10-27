import type { SupportedLocale } from "@platform/website-engine";
import { businessCategorySubcategory, resolveBusinessCategoryKeys, resolveLocale } from "@platform/website-engine";
import { safePrivacyNoticeUrl } from "./site-editor-update";
import { existingWebsiteSubmissionFromForm, type ExistingWebsiteSubmission } from "./apply-website-import";

export const ownerComplimentaryAdminLocales = ["en", "de"] as const;
export type OwnerComplimentaryAdminLocale = (typeof ownerComplimentaryAdminLocales)[number];

export const ownerComplimentaryPlans = ["starter", "professional", "premium"] as const;
export type OwnerComplimentaryPlan = (typeof ownerComplimentaryPlans)[number];

export type OwnerComplimentaryFormInput = {
  businessName: string;
  category: string;
  categoryKey?: string;
  subcategoryKey?: string;
  email: string;
  siteLocale: SupportedLocale;
  adminLocale: OwnerComplimentaryAdminLocale;
  planKey: OwnerComplimentaryPlan;
  reason: string;
  publicLegal: {
    legalBusinessName: string;
    street: string;
    postalCode: string;
    city: string;
    countryCode: string;
    contactEmail: string;
    /** Canonical platform privacy page unless the owner supplies an explicit external override. */
    privacyNoticePath?: "/privacy";
    privacyNoticeUrl?: string;
  };
  existingWebsite?: ExistingWebsiteSubmission;
};

const text = (data: FormData, key: string, limit: number) =>
  String(data.get(key) ?? "").trim().slice(0, limit);

export type OwnerComplimentaryParseResult =
  | { ok: true; value: OwnerComplimentaryFormInput }
  | { ok: false; error: "invalid" };

/**
 * Canonical parse/validate for owner complimentary creation. The website
 * content locale (six site languages) and the site-admin UI locale (en/de)
 * are deliberately separate fields. The platform privacy page is automatic;
 * an external privacy URL is only used as an explicit override.
 */
export function parseOwnerComplimentaryFormInput(
  data: FormData,
  supportedSiteLocales: readonly string[],
): OwnerComplimentaryParseResult {
  const businessName = text(data, "businessName", 120);
  // Canonical registry keys from the category combobox; unknown values are
  // dropped (fail-safe) and the free-text category remains the fallback.
  const canonicalCategoryKeys = resolveBusinessCategoryKeys({
    categoryKey: text(data, "categoryKey", 60),
    subcategoryKey: text(data, "subcategoryKey", 60),
  });
  // Display label: the owner's entry, else the canonical registry label;
  // the legacy "consultation" default only applies without any category.
  const subcategory = canonicalCategoryKeys.subcategoryKey
    ? businessCategorySubcategory(canonicalCategoryKeys.subcategoryKey)
    : undefined;
  const category = text(data, "category", 120)
    || (subcategory ? subcategory.labels.en : "")
    || (canonicalCategoryKeys.categoryKey ? canonicalCategoryKeys.categoryKey : "")
    || "consultation";
  const email = text(data, "email", 320).toLowerCase();
  const requestedSiteLocale = text(data, "siteLocale", 8);
  const adminLocaleRaw = text(data, "adminLocale", 8);
  const planKey = text(data, "planKey", 20);
  const reason = text(data, "reason", 500);
  const legalBusinessName = text(data, "legalBusinessName", 160);
  const street = text(data, "legalStreet", 160);
  const postalCode = text(data, "legalPostalCode", 20);
  const city = text(data, "legalCity", 80);
  const countryCode = text(data, "legalCountryCode", 2).toUpperCase();
  const contactEmail = text(data, "legalContactEmail", 320).toLowerCase();
  const privacyMode = text(data, "privacyMode", 12) || "internal";
  const externalPrivacyUrl = safePrivacyNoticeUrl(text(data, "legalPrivacyNoticeUrl", 500));

  if (!businessName || !email.includes("@")) return { ok: false, error: "invalid" };
  if (!ownerComplimentaryAdminLocales.includes(adminLocaleRaw as OwnerComplimentaryAdminLocale))
    return { ok: false, error: "invalid" };
  if (!ownerComplimentaryPlans.includes(planKey as OwnerComplimentaryPlan))
    return { ok: false, error: "invalid" };
  if (!supportedSiteLocales.includes(requestedSiteLocale)) return { ok: false, error: "invalid" };
  if (!legalBusinessName || !street || !postalCode || !city) return { ok: false, error: "invalid" };
  if (!/^[A-Z]{2}$/.test(countryCode)) return { ok: false, error: "invalid" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: "invalid" };
  if (privacyMode === "external" && !externalPrivacyUrl) return { ok: false, error: "invalid" };
  const existingWebsite = existingWebsiteSubmissionFromForm(data) ?? undefined;
  if (existingWebsite === null && String(data.get("importSourceUrl") ?? "").trim())
    return { ok: false, error: "invalid" };

  return {
    ok: true,
    value: {
      businessName,
      category,
      ...(canonicalCategoryKeys.categoryKey ? { categoryKey: canonicalCategoryKeys.categoryKey } : {}),
      ...(canonicalCategoryKeys.subcategoryKey ? { subcategoryKey: canonicalCategoryKeys.subcategoryKey } : {}),
      email,
      siteLocale: resolveLocale(requestedSiteLocale),
      adminLocale: adminLocaleRaw as OwnerComplimentaryAdminLocale,
      planKey: planKey as OwnerComplimentaryPlan,
      reason,
      publicLegal: {
        legalBusinessName,
        street,
        postalCode,
        city,
        countryCode,
        contactEmail,
        ...(privacyMode === "external" && externalPrivacyUrl
          ? { privacyNoticeUrl: externalPrivacyUrl }
          : { privacyNoticePath: "/privacy" as const }),
      },
      existingWebsite,
    },
  };
}
