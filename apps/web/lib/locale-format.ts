import type { BillingCurrency } from "./platform-config";
import type { CustomerUiLocale } from "./locale-model";

export const customerLocaleTags: Record<CustomerUiLocale, string> = { en: "en-GB", de: "de-DE" };

export const formatCustomerDateTime = (locale: CustomerUiLocale, value: Date | string) =>
  new Intl.DateTimeFormat(customerLocaleTags[locale], { dateStyle: "medium", timeStyle: "short" }).format(typeof value === "string" ? new Date(value) : value);

export const formatCustomerNumber = (locale: CustomerUiLocale, value: number) =>
  new Intl.NumberFormat(customerLocaleTags[locale]).format(value);

export const formatCustomerCurrency = (locale: CustomerUiLocale, value: number, currency: BillingCurrency) =>
  new Intl.NumberFormat(customerLocaleTags[locale], { style: "currency", currency }).format(value);
