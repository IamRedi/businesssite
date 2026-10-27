import { describe, expect, it } from "vitest";
import {
  capabilityIsInternallyAvailable,
  capabilityIsPubliclyActive,
  getProductCapability,
  getProductPlan,
  planHasEntitlement,
  planIsPurchasable,
  productCapabilities,
  productPlans,
  publicProductCatalog,
  trialHasEntitlement,
} from "../src/index";

describe("product availability catalog", () => {
  it("keeps Starter as the only purchasable Stripe plan", () => {
    expect(Object.values(productPlans).filter((plan) => plan.purchasable).map((plan) => plan.key)).toEqual(["starter"]);
    expect(planIsPurchasable("starter", "stripe")).toBe(true);
    expect(planIsPurchasable("professional", "stripe")).toBe(false);
    expect(planIsPurchasable("premium", "stripe")).toBe(false);
    expect(planIsPurchasable("starter", "paddle")).toBe(false);
  });

  it("fails closed for unknown plans and capabilities", () => {
    expect(getProductPlan("enterprise")).toBeUndefined();
    expect(getProductCapability("anything")).toBeUndefined();
    expect(planIsPurchasable("enterprise")).toBe(false);
    expect(capabilityIsPubliclyActive("anything")).toBe(false);
    expect(planHasEntitlement("starter", "anything")).toBe(false);
  });

  it("models launch-only and internal boundaries explicitly", () => {
    expect(productPlans.professional.launchStatus).toBe("coming_soon");
    expect(productPlans.premium.launchStatus).toBe("coming_soon");
    expect(productCapabilities.social_media.launchStatus).toBe("coming_soon");
    expect(productCapabilities.paddle_billing.launchStatus).toBe("hidden");
    expect(capabilityIsInternallyAvailable("information_news")).toBe(true);
    expect(capabilityIsInternallyAvailable("advertising")).toBe(true);
  });

  it("includes request-only appointments in Starter without a booking calendar", () => {
    expect(planHasEntitlement("starter", "appointment_requests")).toBe(true);
    expect(trialHasEntitlement("appointment_requests")).toBe(true);
    expect(planHasEntitlement("starter", "booking_calendar")).toBe(false);
    expect(capabilityIsPubliclyActive("booking_calendar")).toBe(false);
  });

  it("returns a client-safe projection without provider identifiers", () => {
    const projection = JSON.stringify(publicProductCatalog());
    expect(projection).not.toMatch(/price_|secret|apiKey|promotionCode/i);
  });
});
