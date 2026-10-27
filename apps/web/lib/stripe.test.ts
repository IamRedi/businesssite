import { describe, expect, it } from "vitest";
import { addonCheckoutIdempotencyKey, checkoutIdempotencyKey, isSocialMediaAddonPrice, stripeLaunchPromotionCode, stripePrice } from "./stripe";

describe("Stripe checkout idempotency", () => {
  it("is stable for one intake and plan and separated across plans", () => {
    const intakeId = "11111111-1111-4111-8111-111111111111";
    expect(checkoutIdempotencyKey(intakeId, "professional", "EUR", 2)).toBe(
      "checkout-v3:11111111-1111-4111-8111-111111111111:professional:EUR:2",
    );
    expect(checkoutIdempotencyKey(intakeId, "premium")).not.toBe(
      checkoutIdempotencyKey(intakeId, "professional"),
    );
  });

  it("requires a currency-specific Price ID and keeps currencies separate", () => {
    process.env.STRIPE_PRICE_STARTER = "price_eur";
    process.env.STRIPE_PRICE_STARTER_USD = "price_usd";
    expect(stripePrice("starter", "EUR")).toBe("price_eur");
    expect(stripePrice("starter", "USD")).toBe("price_usd");
    expect(() => stripePrice("starter", "ALL")).toThrow("ALL");
    delete process.env.STRIPE_PRICE_STARTER;
    delete process.env.STRIPE_PRICE_STARTER_USD;
  });

  it("accepts only a Stripe promotion-code ID for automatic launch discounts", () => {
    process.env.BILLING_EXECUTION_ENABLED = "true";
    process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED = "true";
    process.env.STRIPE_LAUNCH_PROMOTION_CODE = "promo_launch123";
    process.env.STRIPE_SECRET_KEY = "sk_test_local";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_local";
    process.env.STRIPE_PRICE_STARTER = "price_starter";
    process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED = "true";
    expect(stripeLaunchPromotionCode()).toBe("promo_launch123");
    process.env.STRIPE_LAUNCH_PROMOTION_CODE = "LAUNCH-FREE";
    expect(stripeLaunchPromotionCode()).toBeUndefined();
    delete process.env.STRIPE_LAUNCH_PROMOTION_CODE;
    delete process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_STARTER;
    delete process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED;
    delete process.env.BILLING_EXECUTION_ENABLED;
  });

  it("rejects an untrusted intake identifier", () => {
    expect(() => checkoutIdempotencyKey("../../unsafe", "starter")).toThrow(
      "valid subscription intake ID",
    );
    expect(() => checkoutIdempotencyKey("11111111-1111-4111-8111-111111111111", "starter", "EUR", 0)).toThrow("valid checkout attempt");
  });

  it("isolates Social Media add-on checkout attempts by site and hour", () => {
    const now = new Date("2026-08-19T12:34:00.000Z");
    expect(addonCheckoutIdempotencyKey("site-123", "social_media", now)).toBe(
      "addon-checkout-v1:site-123:social_media:2026-08-19T12",
    );
    expect(() => addonCheckoutIdempotencyKey("../unsafe", "social_media", now)).toThrow("valid site ID");
  });

  it("recognizes only the configured Social Media add-on price", () => {
    process.env.STRIPE_PRICE_SOCIAL_MEDIA_ADDON = "price_social";
    expect(isSocialMediaAddonPrice("price_social")).toBe(true);
    expect(isSocialMediaAddonPrice("price_professional")).toBe(false);
    delete process.env.STRIPE_PRICE_SOCIAL_MEDIA_ADDON;
  });
});
