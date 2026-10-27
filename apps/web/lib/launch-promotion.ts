import { planIsPurchasable, productPlans } from "@platform/product-catalog";
import { billingProviderEnabled } from "./billing-providers";

const promotionCodePattern = /^promo_[A-Za-z0-9]+$/;

function stripeStarterAcquisitionIsConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
    process.env.STRIPE_WEBHOOK_SECRET?.trim() &&
    process.env.STRIPE_PRICE_STARTER?.trim() &&
    process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED === "true"
  );
}

export function configuredLaunchPromotionCode() {
  if (process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED !== "true") return undefined;
  if (!productPlans.starter.promotionEligible || !planIsPurchasable("starter", "stripe")) return undefined;
  if (!billingProviderEnabled("stripe") || !stripeStarterAcquisitionIsConfigured()) return undefined;
  const promotionCode = process.env.STRIPE_LAUNCH_PROMOTION_CODE?.trim();
  return promotionCode && promotionCodePattern.test(promotionCode) ? promotionCode : undefined;
}

export function launchPromotionIsActive() {
  return Boolean(configuredLaunchPromotionCode());
}
