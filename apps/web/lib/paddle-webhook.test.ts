import { afterEach, describe, expect, it } from "vitest";
import { paddleEventToSubscriptionInput, paddleSubscriptionStatus } from "./paddle-webhook";

afterEach(() => delete process.env.PADDLE_PRICE_PROFESSIONAL);

describe("Paddle webhook mapping", () => {
  it("maps a subscription and preserves trusted checkout correlation", () => {
    process.env.PADDLE_PRICE_PROFESSIONAL = "pri_professional";
    expect(
      paddleEventToSubscriptionInput({
        eventId: "evt_1",
        eventType: "subscription.created",
        occurredAt: "2026-09-01T12:00:00Z",
        data: {
          id: "sub_1",
          status: "active",
          customerId: "ctm_1",
          currentBillingPeriod: { endsAt: "2026-09-21T00:00:00Z" },
          items: [{ price: { id: "pri_professional" } }],
          customData: { intakeId: "intake-1", siteId: "site-1", planKey: "professional" },
        },
      }),
    ).toMatchObject({
      provider: "paddle",
      providerSubscriptionId: "sub_1",
      providerCustomerId: "ctm_1",
      planKey: "professional",
      status: "active",
      siteId: "site-1",
      providerEventCreatedAt: "2026-09-01T12:00:00Z",
    });
  });

  it("maps paused, failed and canceled states without treating success redirects as proof", () => {
    expect(paddleSubscriptionStatus("subscription.paused", "active")).toBe("paused");
    expect(paddleSubscriptionStatus("transaction.payment_failed")).toBe("past_due");
    expect(paddleSubscriptionStatus("subscription.canceled", "active")).toBe("canceled");
    expect(paddleEventToSubscriptionInput({ eventId: "evt", eventType: "transaction.completed", data: {} })).toBeNull();
  });

  it("ignores lifecycle events that cannot be correlated to a subscription", () => {
    expect(
      paddleEventToSubscriptionInput({
        eventId: "evt_2",
        eventType: "transaction.payment_failed",
        data: { subscriptionId: null },
      }),
    ).toBeNull();
  });
});
