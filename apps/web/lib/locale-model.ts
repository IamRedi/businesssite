import { supportedLocales, type SupportedLocale } from "@platform/website-engine";

export const customerUiLocales = ["en", "de"] as const;
export type CustomerUiLocale = (typeof customerUiLocales)[number];
export const legalDocumentLocales = customerUiLocales;
export type LegalDocumentLocale = CustomerUiLocale;
export const transactionalEmailLocales = customerUiLocales;
export type TransactionalEmailLocale = CustomerUiLocale;
export const websiteContentLocales = supportedLocales;
export type WebsiteContentLocale = SupportedLocale;
export const ownerPanelLocale = "en" as const;
export const defaultCustomerUiLocale: CustomerUiLocale = "en";

export function isCustomerUiLocale(value: unknown): value is CustomerUiLocale {
  return typeof value === "string" && customerUiLocales.includes(value as CustomerUiLocale);
}

export function resolveCustomerUiLocale(value: unknown, fallback: CustomerUiLocale = defaultCustomerUiLocale) {
  return isCustomerUiLocale(value) ? value : fallback;
}

export function resolveTransactionalEmailLocale(value: unknown) {
  return resolveCustomerUiLocale(value);
}

export function exactLegalDocumentLocale(value: unknown): LegalDocumentLocale | null {
  return isCustomerUiLocale(value) ? value : null;
}

export function isWebsiteContentLocale(value: unknown): value is WebsiteContentLocale {
  return typeof value === "string" && websiteContentLocales.includes(value as WebsiteContentLocale);
}

export function customerUiLocaleFromCookieHeader(header: string | null, fallback: CustomerUiLocale = defaultCustomerUiLocale) {
  const value = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith("platform_locale="))?.slice("platform_locale=".length);
  return resolveCustomerUiLocale(value ? decodeURIComponent(value) : undefined, fallback);
}
