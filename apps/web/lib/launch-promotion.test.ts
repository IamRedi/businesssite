import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configuredLaunchPromotionCode, launchPromotionIsActive } from "./launch-promotion";

afterEach(() => {
  delete process.env.BILLING_EXECUTION_ENABLED;
  delete process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED;
  delete process.env.STRIPE_LAUNCH_PROMOTION_CODE;
  delete process.env.BILLING_PROVIDERS;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_STARTER;
  delete process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED;
});
beforeEach(() => { process.env.BILLING_EXECUTION_ENABLED = "true"; });

describe("launch promotion truth", () => {
  it("is visible only with flag, valid server ID, eligible Starter and Stripe", () => {
    process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED = "true";
    process.env.STRIPE_LAUNCH_PROMOTION_CODE = "promo_launch123";
    process.env.BILLING_PROVIDERS = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_local";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_local";
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED = "true";
    expect(configuredLaunchPromotionCode()).toBe("promo_launch123");
    expect(launchPromotionIsActive()).toBe(true);
  });

  it("hides the offer and leaves checkout unpromoted when ID is absent or invalid", () => {
    process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED = "true";
    expect(configuredLaunchPromotionCode()).toBeUndefined();
    process.env.STRIPE_LAUNCH_PROMOTION_CODE = "LAUNCH-FREE";
    expect(configuredLaunchPromotionCode()).toBeUndefined();
    expect(launchPromotionIsActive()).toBe(false);
  });

  it("hides the offer when Stripe acquisition or price verification is incomplete", () => {
    process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED = "true";
    process.env.STRIPE_LAUNCH_PROMOTION_CODE = "promo_launch123";
    process.env.BILLING_PROVIDERS = "stripe";
    expect(configuredLaunchPromotionCode()).toBeUndefined();
    process.env.STRIPE_SECRET_KEY = "sk_test_local";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_local";
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    expect(configuredLaunchPromotionCode()).toBeUndefined();
  });
});
