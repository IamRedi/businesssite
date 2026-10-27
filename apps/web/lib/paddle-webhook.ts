import type { BillingSubscriptionEvent, SubscriptionStatus } from "@platform/site-data";
import { planForPaddlePrice } from "./paddle";

type PaddleData = {
  id?: string;
  status?: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  currentBillingPeriod?: { endsAt?: string | null } | null;
  scheduledChange?: { action?: string | null } | null;
  items?: Array<{ price?: { id?: string | null } | null }>;
  customData?: Record<string, unknown> | null;
};

type PaddleEvent = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  data: object;
};

const subscriptionEvents = new Set([
  "subscription.activated",
  "subscription.canceled",
  "subscription.created",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.trialing",
  "subscription.updated",
]);

function stringValue(value: unknown) {
  return typeof value === "string" && value.length <= 256 ? value : undefined;
}

function planKeyValue(value: unknown): BillingSubscriptionEvent["planKey"] {
  return value === "starter" || value === "professional" || value === "premium" ? value : undefined;
}

export function paddleSubscriptionStatus(eventType: string, value?: string): SubscriptionStatus | undefined {
  if (eventType === "subscription.canceled") return "canceled";
  if (eventType === "subscription.paused") return "paused";
  if (eventType === "subscription.past_due" || eventType === "transaction.payment_failed") return "past_due";
  if (eventType === "subscription.trialing") return "trialing";
  if (eventType === "subscription.activated" || eventType === "subscription.resumed") return "active";
  if (["active", "trialing", "paused", "past_due", "canceled"].includes(value ?? ""))
    return value as SubscriptionStatus;
  return undefined;
}

export function paddleEventToSubscriptionInput(event: PaddleEvent): BillingSubscriptionEvent | null {
  const isSubscription = subscriptionEvents.has(event.eventType);
  const isPaymentFailure = event.eventType === "transaction.payment_failed";
  if (!isSubscription && !isPaymentFailure) return null;

  const data = event.data as PaddleData;
  const customData = data.customData ?? {};
  const priceId = data.items?.[0]?.price?.id ?? undefined;
  const providerSubscriptionId = isSubscription ? data.id : data.subscriptionId;
  if (!event.eventId || !providerSubscriptionId) return null;

  return {
    provider: "paddle",
    eventId: event.eventId,
    eventType: event.eventType,
    providerEventCreatedAt: event.occurredAt,
    intakeId: stringValue(customData.intakeId),
    siteId: stringValue(customData.siteId),
    providerCustomerId: data.customerId ?? undefined,
    providerSubscriptionId,
    providerPriceId: priceId,
    planKey: planForPaddlePrice(priceId) ?? planKeyValue(customData.planKey),
    status: paddleSubscriptionStatus(event.eventType, data.status),
    currentPeriodEnd: data.currentBillingPeriod?.endsAt ?? undefined,
    cancelAtPeriodEnd: data.scheduledChange?.action === "cancel",
  };
}
