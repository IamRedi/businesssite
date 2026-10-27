import { afterEach, describe, expect, it, vi } from "vitest";
import { createStarterPortalSession, verifiedStarterPortalConfiguration } from "./stripe-portal";

afterEach(() => {
  delete process.env.STRIPE_PORTAL_CONFIGURATION_STARTER;
  delete process.env.STRIPE_PORTAL_STARTER_ONLY_VERIFIED;
});

describe("Starter-only Stripe portal", () => {
  it("fails closed without an explicitly verified configuration", async () => {
    const create = vi.fn();
    expect(verifiedStarterPortalConfiguration()).toBeUndefined();
    await expect(createStarterPortalSession({
      billingProvider: "stripe", planKey: "starter", stripeCustomerId: "cus_1", returnUrl: "https://platform.example/site-admin/site",
    }, create)).rejects.toThrow("unavailable");
    expect(create).not.toHaveBeenCalled();
  });

  it("uses only the verified Starter configuration", async () => {
    process.env.STRIPE_PORTAL_CONFIGURATION_STARTER = "bpc_starter123";
    process.env.STRIPE_PORTAL_STARTER_ONLY_VERIFIED = "true";
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.test/session" });
    await expect(createStarterPortalSession({
      billingProvider: "stripe", planKey: "starter", stripeCustomerId: "cus_1", returnUrl: "https://platform.example/site-admin/site",
    }, create)).resolves.toMatchObject({ url: "https://billing.stripe.test/session" });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_1", configuration: "bpc_starter123", return_url: "https://platform.example/site-admin/site",
    });
  });

  it.each([
    { billingProvider: "paddle" as const, planKey: "starter" as const },
    { billingProvider: "stripe" as const, planKey: "professional" as const },
    { billingProvider: "stripe" as const, planKey: "premium" as const },
  ])("rejects Paddle and non-launch plan portals", async ({ billingProvider, planKey }) => {
    process.env.STRIPE_PORTAL_CONFIGURATION_STARTER = "bpc_starter123";
    process.env.STRIPE_PORTAL_STARTER_ONLY_VERIFIED = "true";
    const create = vi.fn();
    await expect(createStarterPortalSession({
      billingProvider, planKey, stripeCustomerId: "cus_1", returnUrl: "https://platform.example",
    }, create)).rejects.toThrow("unavailable");
    expect(create).not.toHaveBeenCalled();
  });
});
