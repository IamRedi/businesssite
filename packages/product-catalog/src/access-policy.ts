import rawCatalog from "./catalog.json";

export const lifecycleSubscriptionStatuses = [
  "pending", "trialing", "active", "paused", "past_due", "unpaid",
  "canceled", "incomplete", "incomplete_expired",
] as const;
export type LifecycleSubscriptionStatus = (typeof lifecycleSubscriptionStatuses)[number];
export type SubscriptionAccessState =
  | "full"
  | "payment_grace"
  | "read_only"
  | "locked"
  | "expired_trial"
  | "never_activated";

export type LifecycleDurations = {
  paymentGraceDays: number;
  paidReadOnlyDays: number;
  trialRecoveryDays: number;
};

export type SubscriptionAccessSnapshot = {
  activatedAt?: string;
  demoExpiresAt: string;
  trialRecoveryEndsAt: string;
  publicationIntent: "private" | "public";
  subscriptionStatus?: LifecycleSubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  firstPastDueAt?: string;
  paymentGraceEndsAt?: string;
  suspendedAt?: string;
  readOnlyEndsAt?: string;
  lastActiveAt?: string;
  complimentaryStatus?: string;
};

export type SubscriptionAccessPolicy = {
  state: SubscriptionAccessState;
  reason: string;
  canResolvePublicWebsite: boolean;
  canReceiveAppointmentRequests: boolean;
  canReadCustomerContent: boolean;
  canEditCoreContent: boolean;
  canUploadMedia: boolean;
  canUseAi: boolean;
  canManageDomain: boolean;
  canOpenBillingRecovery: boolean;
  canReactivate: boolean;
  canRunCleanup: boolean;
  effectiveAt?: string;
  graceEndsAt?: string;
  readOnlyEndsAt?: string;
  trialRecoveryEndsAt?: string;
};

const lifecycleCatalog = rawCatalog.subscriptionLifecycle;
export const lifecycleDurationDefaults: LifecycleDurations = Object.freeze({
  paymentGraceDays: lifecycleCatalog.paymentGraceDays,
  paidReadOnlyDays: lifecycleCatalog.paidReadOnlyDays,
  trialRecoveryDays: lifecycleCatalog.trialRecoveryDays,
});

function boundedDays(value: unknown, fallback: number, maximum: number) {
  const normalized = String(value ?? "").trim();
  const parsed = typeof value === "number" ? value : /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function configuredLifecycleDurations(values: {
  paymentGraceDays?: unknown;
  paidReadOnlyDays?: unknown;
  trialRecoveryDays?: unknown;
} = {}): LifecycleDurations {
  return {
    paymentGraceDays: boundedDays(values.paymentGraceDays, lifecycleDurationDefaults.paymentGraceDays, lifecycleCatalog.maximumPaymentGraceDays),
    paidReadOnlyDays: boundedDays(values.paidReadOnlyDays, lifecycleDurationDefaults.paidReadOnlyDays, lifecycleCatalog.maximumPaidReadOnlyDays),
    trialRecoveryDays: boundedDays(values.trialRecoveryDays, lifecycleDurationDefaults.trialRecoveryDays, lifecycleCatalog.maximumTrialRecoveryDays),
  };
}

export function lifecycleConfigurationErrors(values: {
  paymentGraceDays?: unknown;
  paidReadOnlyDays?: unknown;
  trialRecoveryDays?: unknown;
}) {
  const checks = [
    ["SUBSCRIPTION_PAYMENT_GRACE_DAYS", values.paymentGraceDays, lifecycleCatalog.maximumPaymentGraceDays],
    ["SUBSCRIPTION_READ_ONLY_DAYS", values.paidReadOnlyDays, lifecycleCatalog.maximumPaidReadOnlyDays],
    ["TRIAL_RECOVERY_DAYS", values.trialRecoveryDays, lifecycleCatalog.maximumTrialRecoveryDays],
  ] as const;
  return checks.flatMap(([name, value, maximum]) => {
    if (value === undefined || value === null || value === "") return [];
    const normalized = String(value).trim();
    const parsed = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
      ? []
      : [`${name} must be an integer from 1 to ${maximum}`];
  });
}

function timestamp(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function permissions(
  state: SubscriptionAccessState,
  reason: string,
  snapshot: SubscriptionAccessSnapshot,
  dates: Pick<SubscriptionAccessPolicy, "effectiveAt" | "graceEndsAt" | "readOnlyEndsAt" | "trialRecoveryEndsAt"> = {},
): SubscriptionAccessPolicy {
  const publicIntent = snapshot.publicationIntent === "public";
  if (state === "full") return {
    state, reason,
    canResolvePublicWebsite: Boolean(snapshot.activatedAt && publicIntent),
    canReceiveAppointmentRequests: true,
    canReadCustomerContent: true,
    canEditCoreContent: true,
    canUploadMedia: true,
    canUseAi: true,
    canManageDomain: true,
    canOpenBillingRecovery: true,
    canReactivate: false,
    canRunCleanup: false,
    ...dates,
  };
  if (state === "payment_grace") return {
    state, reason,
    canResolvePublicWebsite: publicIntent,
    canReceiveAppointmentRequests: true,
    canReadCustomerContent: true,
    canEditCoreContent: true,
    canUploadMedia: false,
    canUseAi: false,
    canManageDomain: false,
    canOpenBillingRecovery: true,
    canReactivate: false,
    canRunCleanup: false,
    ...dates,
  };
  if (state === "read_only" || state === "expired_trial") return {
    state, reason,
    canResolvePublicWebsite: false,
    canReceiveAppointmentRequests: false,
    canReadCustomerContent: true,
    canEditCoreContent: false,
    canUploadMedia: false,
    canUseAi: false,
    canManageDomain: false,
    canOpenBillingRecovery: true,
    canReactivate: true,
    canRunCleanup: false,
    ...dates,
  };
  return {
    state, reason,
    canResolvePublicWebsite: false,
    canReceiveAppointmentRequests: false,
    canReadCustomerContent: false,
    canEditCoreContent: false,
    canUploadMedia: false,
    canUseAi: false,
    canManageDomain: false,
    canOpenBillingRecovery: reason !== "trial_recovery_expired",
    canReactivate: state === "locked" && reason === "paid_read_only_expired",
    canRunCleanup: state === "locked" && reason === "trial_recovery_expired",
    ...dates,
  };
}

export function resolveSubscriptionAccess(
  snapshot: SubscriptionAccessSnapshot,
  now: Date = new Date(),
): SubscriptionAccessPolicy {
  const nowTime = now.getTime();
  // Owner-granted complimentary access is permanent and independent of the
  // billing lifecycle; revoked or converted entitlements fall through to it.
  if (snapshot.complimentaryStatus === "complimentary_active")
    return permissions("full", "complimentary_active", snapshot);
  const demoExpiresAt = timestamp(snapshot.demoExpiresAt);
  const trialRecoveryEndsAt = timestamp(snapshot.trialRecoveryEndsAt);
  if (!Number.isFinite(nowTime) || demoExpiresAt === undefined || trialRecoveryEndsAt === undefined)
    return permissions("locked", "corrupt_lifecycle_state", snapshot);

  if (!snapshot.activatedAt && (!snapshot.subscriptionStatus || snapshot.subscriptionStatus === "pending" || snapshot.subscriptionStatus === "incomplete")) {
    if (nowTime < demoExpiresAt)
      return permissions("full", "active_trial", snapshot, { effectiveAt: snapshot.demoExpiresAt, trialRecoveryEndsAt: snapshot.trialRecoveryEndsAt });
    if (nowTime < trialRecoveryEndsAt)
      return permissions("expired_trial", "trial_expired", snapshot, { effectiveAt: snapshot.demoExpiresAt, trialRecoveryEndsAt: snapshot.trialRecoveryEndsAt });
    return permissions("locked", "trial_recovery_expired", snapshot, { effectiveAt: snapshot.trialRecoveryEndsAt, trialRecoveryEndsAt: snapshot.trialRecoveryEndsAt });
  }

  if (snapshot.subscriptionStatus === "active" || snapshot.subscriptionStatus === "trialing") {
    if (snapshot.cancelAtPeriodEnd) {
      const currentPeriodEnd = timestamp(snapshot.currentPeriodEnd);
      if (currentPeriodEnd === undefined)
        return permissions("locked", "missing_cancellation_effective_end", snapshot);
      if (nowTime >= currentPeriodEnd) {
        const readOnlyEndsAt = timestamp(snapshot.readOnlyEndsAt);
        if (readOnlyEndsAt === undefined)
          return permissions("locked", "missing_read_only_end", snapshot, { effectiveAt: snapshot.currentPeriodEnd });
        return permissions(nowTime < readOnlyEndsAt ? "read_only" : "locked", nowTime < readOnlyEndsAt ? "cancellation_effective" : "paid_read_only_expired", snapshot, {
          effectiveAt: snapshot.currentPeriodEnd,
          readOnlyEndsAt: snapshot.readOnlyEndsAt,
        });
      }
    }
    return permissions("full", snapshot.cancelAtPeriodEnd ? "active_until_period_end" : "active_subscription", snapshot, { effectiveAt: snapshot.currentPeriodEnd });
  }

  if (snapshot.subscriptionStatus === "past_due") {
    const firstPastDueAt = timestamp(snapshot.firstPastDueAt);
    const graceEndsAt = timestamp(snapshot.paymentGraceEndsAt);
    const readOnlyEndsAt = timestamp(snapshot.readOnlyEndsAt);
    if (firstPastDueAt === undefined || graceEndsAt === undefined || readOnlyEndsAt === undefined)
      return permissions("locked", "corrupt_payment_grace", snapshot);
    if (nowTime < graceEndsAt)
      return permissions("payment_grace", "payment_past_due", snapshot, { effectiveAt: snapshot.firstPastDueAt, graceEndsAt: snapshot.paymentGraceEndsAt, readOnlyEndsAt: snapshot.readOnlyEndsAt });
    return permissions(nowTime < readOnlyEndsAt ? "read_only" : "locked", nowTime < readOnlyEndsAt ? "payment_grace_expired" : "paid_read_only_expired", snapshot, {
      effectiveAt: snapshot.paymentGraceEndsAt,
      graceEndsAt: snapshot.paymentGraceEndsAt,
      readOnlyEndsAt: snapshot.readOnlyEndsAt,
    });
  }

  if (["unpaid", "paused", "canceled", "incomplete_expired", "incomplete"].includes(snapshot.subscriptionStatus ?? "")) {
    const suspendedAt = timestamp(snapshot.suspendedAt);
    const readOnlyEndsAt = timestamp(snapshot.readOnlyEndsAt);
    if (suspendedAt === undefined || readOnlyEndsAt === undefined)
      return permissions("locked", "corrupt_suspension_state", snapshot);
    return permissions(nowTime < readOnlyEndsAt ? "read_only" : "locked", nowTime < readOnlyEndsAt ? `subscription_${snapshot.subscriptionStatus}` : "paid_read_only_expired", snapshot, {
      effectiveAt: snapshot.suspendedAt,
      readOnlyEndsAt: snapshot.readOnlyEndsAt,
    });
  }

  return permissions("never_activated", "unknown_or_missing_subscription", snapshot);
}
