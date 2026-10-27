import { describe, expect, it } from "vitest";
import {
  configuredLifecycleDurations,
  lifecycleConfigurationErrors,
  resolveSubscriptionAccess,
  type SubscriptionAccessSnapshot,
} from "../src/index";

const now = new Date("2026-09-01T12:00:00.000Z");
const base: SubscriptionAccessSnapshot = {
  activatedAt: "2026-08-01T12:00:00.000Z",
  demoExpiresAt: "2026-08-15T12:00:00.000Z",
  trialRecoveryEndsAt: "2026-09-14T12:00:00.000Z",
  publicationIntent: "public",
  subscriptionStatus: "active",
  lastActiveAt: "2026-08-01T12:00:00.000Z",
};

describe("canonical subscription access policy", () => {
  it.each(["active", "trialing"] as const)("maps %s to full access", (subscriptionStatus) => {
    expect(resolveSubscriptionAccess({ ...base, subscriptionStatus }, now)).toMatchObject({
      state: "full", canResolvePublicWebsite: true, canEditCoreContent: true,
      canUploadMedia: true, canUseAi: true, canManageDomain: true,
    });
  });

  it("keeps cancel-at-period-end full until the durable effective end", () => {
    const snapshot = { ...base, cancelAtPeriodEnd: true, currentPeriodEnd: "2026-09-02T12:00:00.000Z", readOnlyEndsAt: "2026-10-02T12:00:00.000Z" };
    expect(resolveSubscriptionAccess(snapshot, now)).toMatchObject({ state: "full", reason: "active_until_period_end" });
    expect(resolveSubscriptionAccess(snapshot, new Date("2026-09-02T12:00:00.000Z"))).toMatchObject({ state: "read_only", reason: "cancellation_effective" });
  });

  it("allows only public/core/appointments and billing during payment grace", () => {
    const policy = resolveSubscriptionAccess({
      ...base, subscriptionStatus: "past_due",
      firstPastDueAt: "2026-08-30T12:00:00.000Z",
      paymentGraceEndsAt: "2026-09-06T12:00:00.000Z",
      suspendedAt: "2026-09-06T12:00:00.000Z",
      readOnlyEndsAt: "2026-10-06T12:00:00.000Z",
    }, now);
    expect(policy).toMatchObject({
      state: "payment_grace", canResolvePublicWebsite: true,
      canReceiveAppointmentRequests: true, canEditCoreContent: true,
      canUploadMedia: false, canUseAi: false, canManageDomain: false,
      canOpenBillingRecovery: true,
    });
  });

  it("moves a past-due account from grace to read-only and locked with an injected clock", () => {
    const snapshot: SubscriptionAccessSnapshot = {
      ...base, subscriptionStatus: "past_due",
      firstPastDueAt: "2026-08-25T12:00:00.000Z",
      paymentGraceEndsAt: "2026-09-01T12:00:00.000Z",
      suspendedAt: "2026-09-01T12:00:00.000Z",
      readOnlyEndsAt: "2026-10-01T12:00:00.000Z",
    };
    expect(resolveSubscriptionAccess(snapshot, now).state).toBe("read_only");
    expect(resolveSubscriptionAccess(snapshot, new Date("2026-10-01T12:00:00.000Z"))).toMatchObject({ state: "locked", canReadCustomerContent: false });
  });

  it.each(["unpaid", "paused", "canceled", "incomplete_expired"] as const)("maps %s to a bounded read-only window", (subscriptionStatus) => {
    expect(resolveSubscriptionAccess({
      ...base, subscriptionStatus,
      suspendedAt: "2026-08-31T12:00:00.000Z",
      readOnlyEndsAt: "2026-09-30T12:00:00.000Z",
    }, now)).toMatchObject({
      state: "read_only", canResolvePublicWebsite: false,
      canReceiveAppointmentRequests: false, canEditCoreContent: false,
      canOpenBillingRecovery: true, canReactivate: true,
    });
  });

  it("never makes a manually private site public", () => {
    expect(resolveSubscriptionAccess({ ...base, publicationIntent: "private" }, now)).toMatchObject({ state: "full", canResolvePublicWebsite: false });
  });

  it("gives an unexpired product trial full private-preview access", () => {
    expect(resolveSubscriptionAccess({
      activatedAt: undefined,
      demoExpiresAt: "2026-09-02T12:00:00.000Z",
      trialRecoveryEndsAt: "2026-10-02T12:00:00.000Z",
      publicationIntent: "public",
    }, now)).toMatchObject({ state: "full", reason: "active_trial", canResolvePublicWebsite: false, canReceiveAppointmentRequests: true });
  });

  it("makes an expired trial read-only until cleanup and then cleanup-eligible", () => {
    const snapshot: SubscriptionAccessSnapshot = {
      demoExpiresAt: "2026-08-31T12:00:00.000Z",
      trialRecoveryEndsAt: "2026-09-30T12:00:00.000Z",
      publicationIntent: "public",
    };
    expect(resolveSubscriptionAccess(snapshot, now)).toMatchObject({ state: "expired_trial", canReadCustomerContent: true, canRunCleanup: false });
    expect(resolveSubscriptionAccess(snapshot, new Date("2026-09-30T12:00:00.000Z"))).toMatchObject({ state: "locked", canRunCleanup: true, canReactivate: false });
  });

  it("fails closed for missing, corrupt and unknown lifecycle state", () => {
    expect(resolveSubscriptionAccess({ ...base, subscriptionStatus: undefined }, now)).toMatchObject({ state: "never_activated", canEditCoreContent: false, canReactivate: false });
    expect(resolveSubscriptionAccess({ ...base, subscriptionStatus: "unknown" as never }, now)).toMatchObject({ state: "never_activated", canResolvePublicWebsite: false });
    expect(resolveSubscriptionAccess({ ...base, demoExpiresAt: "not-a-date" }, now)).toMatchObject({ state: "locked", reason: "corrupt_lifecycle_state" });
    expect(resolveSubscriptionAccess({ ...base, subscriptionStatus: "past_due" }, now)).toMatchObject({ state: "locked", reason: "corrupt_payment_grace" });
  });

  it("uses bounded config defaults and reports invalid overrides", () => {
    expect(configuredLifecycleDurations()).toEqual({ paymentGraceDays: 7, paidReadOnlyDays: 30, trialRecoveryDays: 30 });
    expect(configuredLifecycleDurations({ paymentGraceDays: "10", paidReadOnlyDays: "60", trialRecoveryDays: "45" })).toEqual({ paymentGraceDays: 10, paidReadOnlyDays: 60, trialRecoveryDays: 45 });
    expect(configuredLifecycleDurations({ paymentGraceDays: "-1", paidReadOnlyDays: "999", trialRecoveryDays: "0" })).toEqual({ paymentGraceDays: 7, paidReadOnlyDays: 30, trialRecoveryDays: 30 });
    expect(lifecycleConfigurationErrors({ paymentGraceDays: -1, paidReadOnlyDays: 999, trialRecoveryDays: 0 })).toHaveLength(3);
    expect(lifecycleConfigurationErrors({ paymentGraceDays: "1.5", paidReadOnlyDays: "days", trialRecoveryDays: Number.NaN })).toHaveLength(3);
  });
});

describe("complimentary owner grants", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const expiredTrial = {
    demoExpiresAt: "2026-08-31T12:00:00.000Z",
    trialRecoveryEndsAt: "2026-09-01T12:00:00.000Z",
    publicationIntent: "public" as const,
    activatedAt: "2026-09-30T11:00:00.000Z",
  };

  it("grants permanent full access while the entitlement is active, even after trial expiry", () => {
    const policy = resolveSubscriptionAccess({ ...expiredTrial, complimentaryStatus: "complimentary_active" }, now);
    expect(policy).toMatchObject({ state: "full", reason: "complimentary_active" });
    expect(policy.canResolvePublicWebsite).toBe(true);
    expect(policy.canEditCoreContent).toBe(true);
    expect(policy.canManageDomain).toBe(true);
    expect(policy.canRunCleanup).toBe(false);
  });

  it("does not require billing execution or any subscription object", () => {
    const policy = resolveSubscriptionAccess({ ...expiredTrial, complimentaryStatus: "complimentary_active" }, now);
    expect(policy.state).toBe("full");
    expect("subscriptionStatus" in expiredTrial).toBe(false);
  });

  it("falls back to the normal lifecycle once the entitlement is revoked", () => {
    // A revoked grant behaves like any never-billed site: no access.
    expect(resolveSubscriptionAccess({ ...expiredTrial, complimentaryStatus: "revoked" }, now)).toMatchObject({ state: "never_activated" });
    expect(resolveSubscriptionAccess({ ...expiredTrial }, now)).toMatchObject({ state: "never_activated" });
  });

  it("lets a paid subscription govern after conversion", () => {
    expect(resolveSubscriptionAccess({
      ...expiredTrial,
      complimentaryStatus: "converted",
      activatedAt: "2026-09-30T11:00:00.000Z",
      subscriptionStatus: "active",
      currentPeriodEnd: "2026-10-30T12:00:00.000Z",
    }, now)).toMatchObject({ state: "full", reason: "active_subscription" });
  });
});
