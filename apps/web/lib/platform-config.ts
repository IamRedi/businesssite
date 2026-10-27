import { supportedLocales } from "@platform/website-engine";
import { configuredLifecycleDurations, planKeys, productPlans, type LaunchStatus, type PlanKey } from "@platform/product-catalog";
import { resolveCustomerUiLocale, type CustomerUiLocale } from "./locale-model";
import { platformBrandProfile } from "./brand-profile";

export type { PlanKey } from "@platform/product-catalog";
export const supportedBillingCurrencies = ["EUR", "USD", "ALL"] as const;
export type BillingCurrency = (typeof supportedBillingCurrencies)[number];
export const supportedPlatformLocales = supportedLocales;
export type PlatformLocale = (typeof supportedPlatformLocales)[number];
export type { CustomerUiLocale } from "./locale-model";

export type PublicPlan = {
  key: PlanKey;
  name: string;
  price: string;
  description: string;
  launchStatus: LaunchStatus;
  purchasable: boolean;
};

const text = (value: string | undefined, fallback: string) =>
  value?.trim() || fallback;

const positiveInteger = (value: string | undefined, fallback: number, maximum = 30) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
};
const locale = (value: string | undefined, fallback: PlatformLocale) =>
  supportedPlatformLocales.includes(value?.trim() as PlatformLocale)
    ? (value!.trim() as PlatformLocale)
    : fallback;
const locales = (value: string | undefined, fallback: PlatformLocale[]) => {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter((item): item is PlatformLocale => supportedPlatformLocales.includes(item as PlatformLocale));
  return values.length ? [...new Set(values)] : fallback;
};
const currency = (value: string | undefined, fallback: BillingCurrency) =>
  supportedBillingCurrencies.includes(value?.trim().toUpperCase() as BillingCurrency)
    ? (value!.trim().toUpperCase() as BillingCurrency)
    : fallback;


const planCopy = {
  starter: {
    name: text(process.env.NEXT_PUBLIC_PLAN_STARTER_NAME, "Starter"),
    description: text(process.env.NEXT_PUBLIC_PLAN_STARTER_DESCRIPTION, "Website, editor, photos, AI assistance, appointment requests, styles and an existing custom domain."),
    prices: {
      EUR: text(process.env.NEXT_PUBLIC_PLAN_STARTER_PRICE_EUR, "€29 / month"),
      USD: text(process.env.NEXT_PUBLIC_PLAN_STARTER_PRICE_USD, "$39 / month"),
      ALL: text(process.env.NEXT_PUBLIC_PLAN_STARTER_PRICE_ALL, "2,000 lekë / muaj"),
    },
  },
  professional: {
    name: text(process.env.NEXT_PUBLIC_PLAN_PROFESSIONAL_NAME, "Professional"),
    description: text(process.env.NEXT_PUBLIC_PLAN_PROFESSIONAL_DESCRIPTION, "A future plan for capabilities beyond the complete Starter website."),
    prices: {
      EUR: text(process.env.NEXT_PUBLIC_PLAN_PROFESSIONAL_PRICE_EUR, "€69 / month"),
      USD: text(process.env.NEXT_PUBLIC_PLAN_PROFESSIONAL_PRICE_USD, "$99 / month"),
      ALL: text(process.env.NEXT_PUBLIC_PLAN_PROFESSIONAL_PRICE_ALL, "4,500 lekë / muaj"),
    },
  },
  premium: {
    name: text(process.env.NEXT_PUBLIC_PLAN_PREMIUM_NAME, "Premium"),
    description: text(process.env.NEXT_PUBLIC_PLAN_PREMIUM_DESCRIPTION, "A future plan whose differentiated capabilities are not yet available."),
    prices: {
      EUR: text(process.env.NEXT_PUBLIC_PLAN_PREMIUM_PRICE_EUR, "€119 / month"),
      USD: text(process.env.NEXT_PUBLIC_PLAN_PREMIUM_PRICE_USD, "$139 / month"),
      ALL: text(process.env.NEXT_PUBLIC_PLAN_PREMIUM_PRICE_ALL, "9,900 lekë / muaj"),
    },
  },
} satisfies Record<PlanKey, { name: string; description: string; prices: Record<BillingCurrency, string> }>;

const planDefinitions = planKeys.map((key) => ({
  key,
  ...planCopy[key],
  launchStatus: productPlans[key].launchStatus,
  purchasable: productPlans[key].purchasable,
}));

export function plansForCurrency(selectedCurrency: BillingCurrency): PublicPlan[] {
  return planDefinitions.map(({ key, name, description, prices, launchStatus, purchasable }) => ({
    key, name, description, price: prices[selectedCurrency], launchStatus, purchasable,
  }));
}

export const platformConfig = {
  brand: {
    name: platformBrandProfile.displayName,
    shortName: platformBrandProfile.shortName,
    tagline: platformBrandProfile.tagline,
    description: platformBrandProfile.description,
    logoUrl: platformBrandProfile.logo.src,
    logoMarkUrl: platformBrandProfile.logoMark.src,
    faviconUrl: platformBrandProfile.favicon.src,
    socialImageUrl: platformBrandProfile.socialImage.src,
    mark: platformBrandProfile.mark,
    supportEmail: platformBrandProfile.support.email,
    supportUrl: platformBrandProfile.support.url,
    locale: platformBrandProfile.defaultLocale,
    supportedLocales: platformBrandProfile.customerLocales,
  },
  website: {
    supportedLocales: locales(process.env.NEXT_PUBLIC_WEBSITE_LOCALES, [...supportedLocales]),
  },
  theme: {
    primary: platformBrandProfile.theme.primary,
    accent: platformBrandProfile.theme.accent,
    background: platformBrandProfile.theme.background,
    text: platformBrandProfile.theme.text,
    stylesheetUrl: platformBrandProfile.stylesheetUrl,
  },
  marketing: {
    eyebrow: text(
      process.env.NEXT_PUBLIC_LANDING_EYEBROW,
      "Professional websites for local businesses",
    ),
    heroTitle: text(
      process.env.NEXT_PUBLIC_LANDING_HERO_TITLE,
      "Your business, presented at its best.",
    ),
    heroBody: text(
      process.env.NEXT_PUBLIC_LANDING_HERO_BODY,
      "From two basic details to a polished, responsive website. Test it, edit everything yourself and subscribe only when it feels right.",
    ),
    overrides: {
      eyebrow: Boolean(process.env.NEXT_PUBLIC_LANDING_EYEBROW?.trim()),
      heroTitle: Boolean(process.env.NEXT_PUBLIC_LANDING_HERO_TITLE?.trim()),
      heroBody: Boolean(process.env.NEXT_PUBLIC_LANDING_HERO_BODY?.trim()),
    },
  },
  products: {
    information: {
      name: platformBrandProfile.informationProductName,
      slugExample: text(process.env.INFORMATION_PRODUCT_SLUG_EXAMPLE, "infoesence"),
    },
  },
  trialDays: positiveInteger(
    process.env.TRIAL_DURATION_DAYS,
    productPlans.starter.trialPolicy.defaultDays,
    productPlans.starter.trialPolicy.maximumDays,
  ),
  subscriptionLifecycle: configuredLifecycleDurations({
    paymentGraceDays: process.env.SUBSCRIPTION_PAYMENT_GRACE_DAYS,
    paidReadOnlyDays: process.env.SUBSCRIPTION_READ_ONLY_DAYS,
    trialRecoveryDays: process.env.TRIAL_RECOVERY_DAYS,
  }),
  pricing: {
    defaultCurrency: currency(process.env.NEXT_PUBLIC_DEFAULT_BILLING_CURRENCY, "EUR"),
    plans: planDefinitions,
    launchOfferRequested: process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED === "true",
  },
  plans: plansForCurrency(currency(process.env.NEXT_PUBLIC_DEFAULT_BILLING_CURRENCY, "EUR")),
};

export const platformMark = platformConfig.brand.mark || platformConfig.brand.name.slice(0, 1).toUpperCase();

export function configuredPlatformLocale(value: string | undefined) {
  return resolveCustomerUiLocale(value, platformConfig.brand.locale);
}

export function configuredBillingCurrency(value: string | undefined) {
  return currency(value, platformConfig.pricing.defaultCurrency);
}

export function billingCurrencyForLocale(selectedLocale: PlatformLocale, requestedCurrency?: string) {
  return selectedLocale === "sq" ? "ALL" : configuredBillingCurrency(requestedCurrency);
}
