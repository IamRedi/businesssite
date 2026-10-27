import type { OwnerCustomerRecord } from "@platform/site-data";

export type OwnerCustomerState = NonNullable<OwnerCustomerRecord["subscriptionStatus"]> | "trial_active" | "trial_expired" | "active_manual" | "complimentary_active";

export function ownerCustomerState(record: OwnerCustomerRecord, now = new Date()): OwnerCustomerState {
  if (record.complimentaryStatus === "complimentary_active") return "complimentary_active";
  if (record.subscriptionStatus) return record.subscriptionStatus;
  if (record.activatedAt) return "active_manual";
  if (record.intakeStatus === "pending_payment") return "pending";
  if (record.intakeStatus === "cancelled") return "canceled";
  return Date.parse(record.demoExpiresAt) > now.getTime() ? "trial_active" : "trial_expired";
}

export const activeCustomerStates: OwnerCustomerState[] = ["active", "trialing", "active_manual", "complimentary_active"];
export const attentionCustomerStates: OwnerCustomerState[] = ["paused", "past_due", "unpaid", "pending", "incomplete", "incomplete_expired"];

export function customerStateGroup(state: OwnerCustomerState) {
  if (activeCustomerStates.includes(state)) return "active";
  if (state === "trial_active") return "trial";
  if (attentionCustomerStates.includes(state) || state === "trial_expired") return "attention";
  return "canceled";
}
