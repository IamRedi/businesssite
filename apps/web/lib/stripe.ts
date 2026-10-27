import Stripe from "stripe";
import type { BillingCurrency } from "./platform-config";
import { configuredLaunchPromotionCode } from "./launch-promotion";
import { billingExecutionEnabled } from "./execution-gates";

export const stripeClient = () => {
  if (!billingExecutionEnabled()) throw new Error("Billing execution is disabled.");
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe Checkout is not configured.");
  return new Stripe(key);
};

type StripePlan = "starter" | "professional" | "premium";

function stripePriceEnvironmentKey(plan: StripePlan, currency: BillingCurrency) {
  return currency === "EUR" ? `STRIPE_PRICE_${plan.toUpperCase()}` : `STRIPE_PRICE_${plan.toUpperCase()}_${currency}`;
}

export function stripePrice(plan: StripePlan, currency: BillingCurrency = "EUR") {
  const prices: Record<StripePlan, string | undefined> = {
    starter: process.env[stripePriceEnvironmentKey("starter", currency)],
    professional: process.env[stripePriceEnvironmentKey("professional", currency)],
    premium: process.env[stripePriceEnvironmentKey("premium", currency)],
  };
  const price = prices[plan]?.trim();
  if (!price) throw new Error(`Stripe Price is missing for ${plan} in ${currency}.`);
  return price;
}

export function planForStripePrice(priceId: string | null | undefined) {
  if (!priceId) return undefined;
  for (const currency of ["EUR", "USD", "ALL"] as const) {
    const match = (["starter", "professional", "premium"] as StripePlan[]).find(
      (plan) => process.env[stripePriceEnvironmentKey(plan, currency)]?.trim() === priceId,
    );
    if (match) return match;
  }
  return undefined;
}

export function stripeLaunchPromotionCode() {
  return configuredLaunchPromotionCode();
}

export function socialMediaAddonPrice() {
  const price = process.env.STRIPE_PRICE_SOCIAL_MEDIA_ADDON?.trim();
  if (!price) throw new Error("Stripe Price is missing for the Social Media add-on.");
  return price;
}

export function isSocialMediaAddonPrice(priceId: string | null | undefined) {
  const configured = process.env.STRIPE_PRICE_SOCIAL_MEDIA_ADDON?.trim();
  return Boolean(configured && priceId === configured);
}

export function checkoutIdempotencyKey(
  intakeId: string,
  plan: "starter" | "professional" | "premium",
  currency: BillingCurrency = "EUR",
  attempt = 1,
) {
  if (!/^[0-9a-f-]{36}$/i.test(intakeId))
    throw new Error("A valid subscription intake ID is required.");
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error("A valid checkout attempt is required.");
  return `checkout-v3:${intakeId}:${plan}:${currency}:${attempt}`;
}

export function addonCheckoutIdempotencyKey(siteId: string, addon: "social_media", now = new Date()) {
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/i.test(siteId))
    throw new Error("A valid site ID is required.");
  const bucket = now.toISOString().slice(0, 13);
  return `addon-checkout-v1:${siteId}:${addon}:${bucket}`;
}
