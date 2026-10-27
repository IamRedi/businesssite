import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  processStripeSubscriptionEvent: vi.fn(),
  processStripeAddonEvent: vi.fn(),
  isAddonSubscription: vi.fn(),
  invalidatePublicSiteById: vi.fn(),
}));

vi.mock("@platform/site-data", () => ({
  PostgresSiteRepository: class {
    processStripeSubscriptionEvent = mocks.processStripeSubscriptionEvent;
    processStripeAddonEvent = mocks.processStripeAddonEvent;
    isAddonSubscription = mocks.isAddonSubscription;
  },
}));
vi.mock("../../../../lib/stripe", () => ({
  stripeClient: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
  planForStripePrice: (priceId: string | undefined) =>
    priceId === "price_starter"
      ? "starter"
      : priceId === "price_professional"
        ? "professional"
        : undefined,
  isSocialMediaAddonPrice: () => false,
}));
vi.mock("../../../../lib/public-site-cache", () => ({
  invalidatePublicSiteById: mocks.invalidatePublicSiteById,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  mocks.processStripeSubscriptionEvent.mockResolvedValue({
    processed: true,
    siteId: "site-1",
  });
  mocks.invalidatePublicSiteById.mockResolvedValue(undefined);
  mocks.isAddonSubscription.mockResolvedValue(false);
});

function webhookRequest() {
  return new Request("https://platform.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "valid-signature" },
    body: "signed-body",
  });
}

describe("Stripe webhook", () => {
  it("activates a paid checkout only through complete Starter metadata", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_checkout_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          customer_details: { email: "different-billing@example.com" },
          subscription: "sub_1",
          payment_status: "paid",
          metadata: {
            intakeId: "intake-1",
            siteId: "site-1",
            planKey: "starter",
            priceId: "price_starter",
          },
        },
      },
    });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "evt_checkout_paid",
      eventType: "checkout.session.completed",
      intakeId: "intake-1",
      siteId: "site-1",
      checkoutSessionId: "cs_1",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_starter",
      planKey: "starter",
      status: "active",
    }));
    expect(
      mocks.processStripeSubscriptionEvent.mock.calls[0]?.[0],
    ).not.toHaveProperty("email");
    expect(mocks.invalidatePublicSiteById).toHaveBeenCalledWith(
      expect.anything(),
      "site-1",
    );
  });

  it.each([
    {},
    { intakeId: "intake-1", siteId: "site-1" },
    {
      intakeId: "intake-1",
      siteId: "site-1",
      planKey: "professional",
      priceId: "price_professional",
    },
    {
      intakeId: "intake-1",
      siteId: "site-1",
      planKey: "starter",
      priceId: "price_unknown",
    },
  ])("rejects incomplete or non-Starter checkout metadata", async (metadata) => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_bad_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_bad",
          payment_status: "paid",
          metadata,
        },
      },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(400);
    expect(mocks.processStripeSubscriptionEvent).not.toHaveBeenCalled();
  });

  it("associates a new subscription event using matching server metadata", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_subscription_created",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "trialing",
          cancel_at_period_end: false,
          metadata: {
            intakeId: "intake-1",
            siteId: "site-1",
            planKey: "starter",
          },
          items: {
            data: [
              {
                price: { id: "price_starter" },
                current_period_end: 1_800_000_000,
              },
            ],
          },
        },
      },
    });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_subscription_created",
        intakeId: "intake-1",
        siteId: "site-1",
        stripeSubscriptionId: "sub_1",
        status: "trialing",
        planKey: "starter",
      }),
    );
  });

  it("ignores Social checkout metadata instead of provisioning a new add-on", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_social_checkout",
      type: "checkout.session.completed",
      data: { object: { id: "cs_social", payment_status: "paid", subscription: "sub_social", metadata: { addonKey: "social_media", siteId: "site-1", priceId: "price_social" } } },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: true });
    expect(mocks.processStripeAddonEvent).not.toHaveBeenCalled();
    expect(mocks.processStripeSubscriptionEvent).not.toHaveBeenCalled();
  });

  it("does not activate a Social add-on from subscription metadata without an existing binding", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_social_subscription",
      type: "customer.subscription.created",
      data: { object: { id: "sub_social", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { addonKey: "social_media", siteId: "site-1" }, items: { data: [{ price: { id: "price_social" } }] } } },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeAddonEvent).not.toHaveBeenCalled();
    expect(mocks.processStripeSubscriptionEvent).not.toHaveBeenCalled();
  });

  it("updates only an already-bound historical Social subscription", async () => {
    mocks.isAddonSubscription.mockResolvedValue(true);
    mocks.processStripeAddonEvent.mockResolvedValue({ processed: true, siteId: "site-1" });
    mocks.constructEvent.mockReturnValue({
      id: "evt_social_known",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_social_known", customer: "cus_1", status: "past_due", cancel_at_period_end: false, metadata: { addonKey: "social_media", siteId: "attacker-site" }, items: { data: [{ price: { id: "price_social" } }] } } },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeAddonEvent).toHaveBeenCalledWith(expect.objectContaining({
      stripeSubscriptionId: "sub_social_known",
      siteId: undefined,
      status: "past_due",
    }));
  });

  it("does not accept a provider-side change to a Coming soon plan", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_plan_change",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, metadata: { planKey: "professional", siteId: "site-1" }, items: { data: [{ price: { id: "price_professional" } }] } } },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({
      stripeSubscriptionId: "sub_1",
      planKey: undefined,
    }));
  });

  it("rejects metadata that the durable checkout record reports as mismatched", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_mismatch",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_mismatch",
          customer: "cus_1",
          status: "active",
          cancel_at_period_end: false,
          metadata: {
            intakeId: "intake-1",
            siteId: "site-b",
            planKey: "starter",
          },
          items: { data: [{ price: { id: "price_starter" } }] },
        },
      },
    });
    mocks.processStripeSubscriptionEvent.mockRejectedValue(
      new Error("Subscription activation target does not match."),
    );

    const response = await POST(webhookRequest());
    expect(response.status).toBe(400);
    expect(mocks.invalidatePublicSiteById).not.toHaveBeenCalled();
  });

  it("does not invalidate twice when the repository identifies a duplicate event", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_duplicate",
      type: "invoice.paid",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_1" } },
        },
      },
    });
    mocks.processStripeSubscriptionEvent.mockResolvedValue({ processed: false });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: "evt_duplicate",
      eventType: "invoice.paid",
      stripeSubscriptionId: "sub_1",
      status: "active",
    }));
    expect(mocks.invalidatePublicSiteById).not.toHaveBeenCalled();
  });

  it.each([
    ["invoice.payment_failed", "past_due"],
    ["invoice.paid", "active"],
  ])("preserves known subscription lifecycle handling for %s", async (eventType, status) => {
    mocks.constructEvent.mockReturnValue({
      id: `evt_${eventType}`,
      type: eventType,
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_known" } },
        },
      },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: `evt_${eventType}`,
      eventType,
      stripeSubscriptionId: "sub_known",
      status,
    }));
  });

  it("lets the repository resolve a known cancellation when an old Price is no longer configured", async () => {
    mocks.constructEvent.mockReturnValue({
      id: "evt_legacy_cancel",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_legacy",
          customer: "cus_legacy",
          status: "canceled",
          cancel_at_period_end: false,
          metadata: {
            intakeId: "legacy-intake",
            siteId: "site-legacy",
            planKey: "professional",
          },
          items: { data: [{ price: { id: "price_retired" } }] },
        },
      },
    });
    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.processStripeSubscriptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: "sub_legacy",
        planKey: undefined,
        status: "canceled",
      }),
    );
  });
});
