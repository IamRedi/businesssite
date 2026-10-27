import { describe, expect, it } from "vitest";
import type { OwnerCustomerRecord } from "@platform/site-data";
import { customerStateGroup, ownerCustomerState } from "./owner-customer-state";

const base: OwnerCustomerRecord = {
  siteId: "site-1", slug: "example", businessName: "Example", visibility: "private",
  onboardingSource: "self_service", demoExpiresAt: "2026-08-20T00:00:00.000Z",
  createdAt: "2026-08-17T00:00:00.000Z", customDomainStatus: "not_requested", cancelAtPeriodEnd: false,
  accessState: "full", accessReason: "active_trial",
};

describe("owner customer lifecycle state", () => {
  it("distinguishes an active demo from an expired demo", () => {
    expect(ownerCustomerState(base, new Date("2026-08-18T00:00:00.000Z"))).toBe("trial_active");
    expect(ownerCustomerState(base, new Date("2026-08-21T00:00:00.000Z"))).toBe("trial_expired");
  });

  it("uses the durable subscription state before trial dates", () => {
    const paid = { ...base, subscriptionStatus: "past_due" as const, activatedAt: "2026-08-10T00:00:00.000Z" };
    expect(ownerCustomerState(paid)).toBe("past_due");
    expect(customerStateGroup(ownerCustomerState(paid))).toBe("attention");
  });

  it("surfaces a provider-paused subscription as payment attention", () => {
    const paused = { ...base, billingProvider: "paddle" as const, subscriptionStatus: "paused" as const };
    expect(ownerCustomerState(paused)).toBe("paused");
    expect(customerStateGroup(ownerCustomerState(paused))).toBe("attention");
  });

  it("labels legacy activated sites without inventing a Stripe subscription", () => {
    expect(ownerCustomerState({ ...base, activatedAt: "2026-08-10T00:00:00.000Z" })).toBe("active_manual");
  });

  it("surfaces an unfinished checkout as payment attention", () => {
    const pending = { ...base, intakeStatus: "pending_payment" as const };
    expect(ownerCustomerState(pending)).toBe("pending");
    expect(customerStateGroup(ownerCustomerState(pending))).toBe("attention");
  });
});
