import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planHasEntitlement, productCapabilities, productPlans } from "@platform/product-catalog";
import { designPresets } from "@platform/website-engine";
import { plansForCurrency } from "./platform-config";

describe("cross-layer product availability", () => {
  it("projects the same plan status into public UI data", () => {
    for (const plan of plansForCurrency("EUR")) {
      expect(plan.launchStatus).toBe(productPlans[plan.key].launchStatus);
      expect(plan.purchasable).toBe(productPlans[plan.key].purchasable);
    }
    expect(plansForCurrency("EUR").filter((plan) => plan.purchasable).map((plan) => plan.key)).toEqual(["starter"]);
  });

  it("does not let dormant provider environment variables change launch status", () => {
    process.env.STRIPE_PRICE_PROFESSIONAL = "price_professional";
    process.env.STRIPE_PRICE_PREMIUM = "price_premium";
    process.env.PADDLE_PRICE_STARTER = "pri_starter";
    expect(productPlans.professional.purchasable).toBe(false);
    expect(productPlans.premium.purchasable).toBe(false);
    expect(productCapabilities.paddle_billing.launchStatus).toBe("hidden");
    delete process.env.STRIPE_PRICE_PROFESSIONAL;
    delete process.env.STRIPE_PRICE_PREMIUM;
    delete process.env.PADDLE_PRICE_STARTER;
  });

  it("keeps Social checkout absent and Gold accessible through the Starter editor", () => {
    const socialPage = readFileSync(join(process.cwd(), "app/site-admin/[slug]/social/page.tsx"), "utf8");
    const socialCheckout = readFileSync(join(process.cwd(), "app/api/site-admin/[slug]/addons/social-media/checkout/route.ts"), "utf8");
    expect(socialPage).not.toContain("/addons/social-media/checkout");
    expect(socialCheckout).not.toContain("stripeClient");
    expect(productCapabilities.social_media.launchStatus).toBe("coming_soon");
    expect(planHasEntitlement("starter", "editor")).toBe(true);
    expect(designPresets.some((preset) => preset.key === "gold")).toBe(true);
  });

  it("contains no position-based plan availability logic", () => {
    const landing = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    expect(landing).not.toMatch(/const\s+available\s*=\s*index\s*===\s*0/);
    expect(landing).toContain("plan.purchasable");
  });

  it("keeps cost and domain mutations behind the shared server authorization helper", () => {
    const media = readFileSync(join(process.cwd(), "app/api/site-admin/media/route.ts"), "utf8");
    const ai = readFileSync(join(process.cwd(), "app/api/site-admin/[slug]/ai/rewrite/route.ts"), "utf8");
    const customerPage = readFileSync(join(process.cwd(), "app/site-admin/[slug]/page.tsx"), "utf8");
    expect(media).toContain("authorizedSiteCapability(sites, session, slug, \"media\")");
    expect(ai).toContain("authorizedSiteCapability(sites, session, slug, \"ai_rewrite\")");
    expect(customerPage).toContain("repository.prepareCustomDomainChange(slug)");
    expect(customerPage).toContain("prepareHostingDomain(domain, currentSiteId)");
    expect(customerPage.indexOf("repository.prepareCustomDomainChange(slug)"))
      .toBeLessThan(customerPage.indexOf("prepareHostingDomain(domain, currentSiteId)"));
  });

  it("resolves a business dashboard before entering the rejecting editorial boundary", () => {
    const customerPage = readFileSync(join(process.cwd(), "app/site-admin/[slug]/page.tsx"), "utf8");
    expect(customerPage.indexOf("getBusinessAdminDashboard(sessionHash, slug)"))
      .toBeLessThan(customerPage.indexOf("editorialRepository.getSettings(siteId)"));
    expect(customerPage).toContain("const editorialSettings = dashboard");
  });
});
