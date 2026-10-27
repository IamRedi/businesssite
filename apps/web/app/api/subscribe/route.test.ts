import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSiteAdminSession: vi.fn(),
  trustedSiteAdminSessionHash: vi.fn(),
  getAuthenticatedCheckoutContext: vi.fn(),
  getSlugBySiteId: vi.fn(),
  getStoredBySlug: vi.fn(),
  getSubscriptionAccess: vi.fn(),
  getSubscriptionBillingIdentity: vi.fn(),
  createSubscriberIntake: vi.fn(),
  attachCheckoutSession: vi.fn(),
  providerEnabled: vi.fn(),
  stripePrice: vi.fn(),
  stripeSessionsCreate: vi.fn(),
  checkoutIdempotencyKey: vi.fn(),
  checkoutLegalContext: vi.fn(),
  priceTaxPresentation: vi.fn(),
  promotionCode: vi.fn(),
}));

vi.mock("../../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  enforceSubjectRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../../../lib/site-admin-auth", () => ({
  requireSiteAdminSession: mocks.requireSiteAdminSession,
  trustedSiteAdminSessionHash: mocks.trustedSiteAdminSessionHash,
}));
vi.mock("../../../lib/billing-providers", () => ({
  billingProviderEnabled: mocks.providerEnabled,
}));
vi.mock("../../../lib/legal-config", () => ({
  checkoutLegalContext: mocks.checkoutLegalContext,
  priceTaxPresentation: mocks.priceTaxPresentation,
}));
vi.mock("../../../lib/stripe", () => ({
  checkoutIdempotencyKey: mocks.checkoutIdempotencyKey,
  stripeClient: () => ({
    checkout: { sessions: { create: mocks.stripeSessionsCreate } },
  }),
  stripeLaunchPromotionCode: mocks.promotionCode,
  stripePrice: mocks.stripePrice,
}));
vi.mock("@platform/site-data", () => ({
  businessTypes: ["company", "sole_proprietor", "other_business"],
  normalizeVatIdSyntax: (value: unknown) => {
    const normalized = typeof value === "string" ? value.toUpperCase().replace(/[\s.\-]/g, "") : "";
    return { normalized: normalized || undefined, syntacticallyPlausible: !normalized || /^[A-Z]{2}[A-Z0-9]{2,14}$/.test(normalized) };
  },
  PostgresSiteRepository: class {
    getAuthenticatedCheckoutContext = mocks.getAuthenticatedCheckoutContext;
    getSlugBySiteId = mocks.getSlugBySiteId;
    getStoredBySlug = mocks.getStoredBySlug;
    getSubscriptionAccess = mocks.getSubscriptionAccess;
    getSubscriptionBillingIdentity = mocks.getSubscriptionBillingIdentity;
    createSubscriberIntake = mocks.createSubscriberIntake;
    attachCheckoutSession = mocks.attachCheckoutSession;
  },
}));

import { POST } from "./route";

const ownSession = {
  accountId: "11111111-1111-4111-8111-111111111111",
  siteId: "site-a",
  email: "owner-a@example.com",
  preferredLocale: "en" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://platform.example";
  mocks.requireSiteAdminSession.mockResolvedValue(ownSession);
  mocks.trustedSiteAdminSessionHash.mockReturnValue("a".repeat(64));
  mocks.getAuthenticatedCheckoutContext.mockImplementation(
    async (_hash, _siteId, expectedSlug) => expectedSlug === "customer-b-site" ? null : ({
      slug: "site-a-slug",
      site: { locale: "en", content: { name: "Example Studio" } },
      access: { state: "full", reason: "active_trial", canReactivate: false },
    }),
  );
  mocks.getSlugBySiteId.mockResolvedValue("site-a-slug");
  mocks.getStoredBySlug.mockResolvedValue({
    locale: "en", content: { name: "Example Studio" },
    publicLegal: {
      legalBusinessName: "Example Studio", street: "Main Street 1", postalCode: "1001",
      city: "Essen", countryCode: "DE", contactEmail: "legal@example.test",
      privacyNoticeUrl: "https://studio.example/privacy",
    },
  });
  mocks.getSubscriptionAccess.mockResolvedValue({ state: "full", reason: "active_trial", canReactivate: false });
  mocks.getSubscriptionBillingIdentity.mockResolvedValue(null);
  mocks.providerEnabled.mockReturnValue(true);
  mocks.stripePrice.mockReturnValue("price_starter");
  mocks.createSubscriberIntake.mockResolvedValue({
    id: "22222222-2222-4222-8222-222222222222",
    status: "pending_payment",
    checkoutAttempt: 1,
    businessIdentityId: "33333333-3333-4333-8333-333333333333",
    contractAcceptanceId: "44444444-4444-4444-8444-444444444444",
  });
  mocks.stripeSessionsCreate.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.test/session",
  });
  mocks.checkoutIdempotencyKey.mockReturnValue("checkout-key");
  mocks.promotionCode.mockReturnValue(undefined);
  mocks.priceTaxPresentation.mockReturnValue("plus VAT");
  mocks.checkoutLegalContext.mockResolvedValue({
    ok: true,
    config: { version: 7, currency: "EUR", taxDisplayMode: "net_plus_tax", priceTaxLabel: "plus VAT" },
    documents: [
      { documentKey: "terms", locale: "en", version: "terms-v1", contentHash: "a".repeat(64) },
      { documentKey: "privacy", locale: "en", version: "privacy-v1", contentHash: "b".repeat(64) },
    ],
  });
});

function checkoutRequest(
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  return new Request("https://platform.example/api/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://platform.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify({
      demoSlug: "site-a-slug",
      planKey: "starter",
      legalBusinessName: "Example Studio LLC",
      countryCode: "DE",
      businessType: "company",
      b2bAttested: true,
      authorityAttested: true,
      termsAccepted: true,
      renewalAcknowledged: true,
      privacyAcknowledged: true,
      currency: "EUR",
      ...body,
    }),
  });
}

describe("authenticated subscription checkout", () => {
  it.each(["b2bAttested", "authorityAttested", "termsAccepted", "renewalAcknowledged", "privacyAcknowledged"])(
    "rejects checkout without required %s evidence",
    async (field) => {
      const response = await POST(checkoutRequest({ [field]: false }));
      expect(response.status).toBe(400);
      expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
      expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
    },
  );

  it("accepts a sole proprietor without a VAT ID and records self-attested identity", async () => {
    const response = await POST(checkoutRequest({ businessType: "sole_proprietor", vatId: "" }));
    expect(response.status).toBe(201);
    expect(mocks.createSubscriberIntake).toHaveBeenCalledWith(expect.objectContaining({
      b2bEvidence: expect.objectContaining({ businessType: "sole_proprietor", vatIdNormalized: undefined, vatSyntaxPlausible: true }),
    }));
  });

  it("fails closed before intake or Stripe when reviewed legal sources are unavailable", async () => {
    mocks.checkoutLegalContext.mockResolvedValue({
      ok: false,
      reason: "legal_commercial_configuration_unavailable",
    });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(503);
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("requires promotion acknowledgement only when a configured promotion is active", async () => {
    mocks.promotionCode.mockReturnValue("promo_launch");
    expect((await POST(checkoutRequest())).status).toBe(400);
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
    expect((await POST(checkoutRequest({ promotionAcknowledged: true }))).status).toBe(201);
    expect(mocks.createSubscriberIntake).toHaveBeenCalledWith(expect.objectContaining({
      b2bEvidence: expect.objectContaining({ promotionTermsVersion: "launch-promotion-normal-price-v1" }),
    }));
  });
  it("rejects a request without a site-admin session before Stripe is called", async () => {
    mocks.requireSiteAdminSession.mockResolvedValue(null);
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(403);
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
  });

  it("rejects an expired or revoked session before creating checkout", async () => {
    mocks.requireSiteAdminSession.mockResolvedValue(null);
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(403);
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a cross-site slug with the same non-enumerating response", async () => {
    const noSessionRequest = checkoutRequest();
    mocks.requireSiteAdminSession.mockResolvedValue(null);
    const noSession = await POST(noSessionRequest);

    mocks.requireSiteAdminSession.mockResolvedValue(ownSession);
    const crossSite = await POST(
      checkoutRequest({ demoSlug: "customer-b-site" }),
    );
    expect(crossSite.status).toBe(403);
    expect(await crossSite.json()).toEqual(await noSession.json());
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("ignores arbitrary browser identity fields and uses the authenticated account", async () => {
    const response = await POST(
      checkoutRequest({
        email: "attacker@example.com",
        siteId: "site-b",
        businessName: "Attacker",
        termsVersion: "browser-spoofed",
        termsHash: "0".repeat(64),
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.createSubscriberIntake).toHaveBeenCalledWith(expect.objectContaining({
      email: ownSession.email,
      businessName: "Example Studio LLC",
      demoSiteId: ownSession.siteId,
      siteAdminAccountId: ownSession.accountId,
      planKey: "starter",
      billingProvider: "stripe",
      checkoutPriceId: "price_starter",
      b2bEvidence: expect.objectContaining({
        legalBusinessName: "Example Studio LLC",
        countryCode: "DE",
        commercialConfigVersion: 7,
        currency: "EUR",
        taxDisplayMode: "net_plus_tax",
        priceTaxLabelSnapshot: "plus VAT",
        normalPriceDisplaySnapshot: "€29 / month",
        trialDurationDays: 14,
        billingInterval: "month",
        terms: expect.objectContaining({ version: "terms-v1" }),
        privacy: expect.objectContaining({ version: "privacy-v1" }),
      }),
    }));
    expect(mocks.stripeSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        customer_email: ownSession.email,
        metadata: expect.objectContaining({
          siteId: ownSession.siteId,
          planKey: "starter",
        }),
      }),
      { idempotencyKey: "checkout-key" },
    );
  });

  it("does not grant checkout authority to a preview token", async () => {
    mocks.requireSiteAdminSession.mockResolvedValue(null);
    const response = await POST(
      checkoutRequest({}, { cookie: "site_preview_token=preview-only" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a Starter checkout for the session site and attaches its session", async () => {
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      provider: "stripe",
      checkoutUrl: "https://checkout.stripe.test/session",
    });
    expect(mocks.attachCheckoutSession).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "cs_test_1",
      "a".repeat(64),
    );
    expect(mocks.stripeSessionsCreate.mock.calls[0][0]).not.toHaveProperty("allow_promotion_codes");
  });

  it("reactivates a canceled site through the same authenticated ownership binding", async () => {
    mocks.getAuthenticatedCheckoutContext.mockResolvedValue({ slug: "site-a-slug", site: {}, access: { state: "read_only", reason: "subscription_canceled", canReactivate: true } });
    mocks.getSubscriptionBillingIdentity.mockResolvedValue({ status: "canceled", billingProvider: "stripe", providerCustomerId: "cus_existing", planKey: "starter" });
    mocks.createSubscriberIntake.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      status: "pending_payment",
      checkoutAttempt: 2,
      businessIdentityId: "33333333-3333-4333-8333-333333333333",
      contractAcceptanceId: "44444444-4444-4444-8444-444444444444",
    });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(201);
    expect(mocks.createSubscriberIntake).toHaveBeenCalledWith(expect.objectContaining({
      email: ownSession.email,
      demoSiteId: ownSession.siteId,
      siteAdminAccountId: ownSession.accountId,
    }));
    expect(mocks.checkoutIdempotencyKey).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222", "starter", "EUR", 2,
    );
    expect(mocks.stripeSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" }),
      { idempotencyKey: "checkout-key" },
    );
    expect(mocks.stripeSessionsCreate.mock.calls[0][0]).not.toHaveProperty("customer_email");
  });

  it("routes past-due recovery to the existing billing relationship", async () => {
    mocks.getAuthenticatedCheckoutContext.mockResolvedValue({ slug: "site-a-slug", site: {}, access: { state: "payment_grace", reason: "payment_past_due", canReactivate: false } });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ errorCode: "checkout_unavailable" });
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
  });

  it("uses the durable account locale for exact legal evidence instead of the website locale", async () => {
    mocks.requireSiteAdminSession.mockResolvedValue({ ...ownSession, preferredLocale: "de" });
    mocks.getStoredBySlug.mockResolvedValue({
      locale: "fr", content: { name: "Atelier Exemple" },
      publicLegal: {
        legalBusinessName: "Atelier Exemple", street: "Rue Exemple 2", postalCode: "75001",
        city: "Paris", countryCode: "FR", contactEmail: "legal@atelier.example",
        privacyNoticeUrl: "https://atelier.example/privacy",
      },
    });
    mocks.checkoutLegalContext.mockResolvedValue({
      ok: true,
      config: { version: 7, currency: "EUR", taxDisplayMode: "net_plus_tax", priceTaxLabel: "zzgl. MwSt." },
      documents: [
        { documentKey: "terms", locale: "de", version: "terms-de-v1", contentHash: "c".repeat(64) },
        { documentKey: "privacy", locale: "de", version: "privacy-de-v1", contentHash: "d".repeat(64) },
      ],
    });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(201);
    expect(mocks.checkoutLegalContext).toHaveBeenCalledWith("de", "EUR", "a".repeat(64));
    expect(mocks.createSubscriberIntake).toHaveBeenCalledWith(expect.objectContaining({
      b2bEvidence: expect.objectContaining({ locale: "de", terms: expect.objectContaining({ locale: "de" }), privacy: expect.objectContaining({ locale: "de" }) }),
    }));
  });

  it.each(["professional", "premium"])(
    "rejects the %s plan server-side",
    async (planKey) => {
      const response = await POST(checkoutRequest({ planKey }));
      expect(response.status).toBe(400);
      expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
    },
  );

  it("rejects an unknown plan and Paddle fail-closed", async () => {
    const unknown = await POST(checkoutRequest({ planKey: "enterprise" }));
    const paddle = await POST(checkoutRequest({ billingProvider: "paddle" }));
    expect(unknown.status).toBe(400);
    expect(paddle.status).toBe(400);
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin authenticated POST", async () => {
    const response = await POST(
      checkoutRequest({}, { origin: "https://attacker.example" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("blocks checkout with legal_identity_incomplete when the stored legal identity is incomplete", async () => {
    mocks.getStoredBySlug.mockResolvedValue({ locale: "en", content: { name: "Example Studio" }, publicLegal: {} });
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ errorCode: "legal_identity_incomplete" });
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
    expect(mocks.stripeSessionsCreate).not.toHaveBeenCalled();
  });

  it("blocks checkout when the stored site document cannot be read", async () => {
    mocks.getStoredBySlug.mockResolvedValue(null);
    const response = await POST(checkoutRequest());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ errorCode: "legal_identity_incomplete" });
    expect(mocks.createSubscriberIntake).not.toHaveBeenCalled();
  });
});
