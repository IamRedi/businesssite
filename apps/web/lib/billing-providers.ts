import type { BillingProvider } from "@platform/site-data";
import { productCapabilities } from "@platform/product-catalog";
import { billingExecutionEnabled } from "./execution-gates";

const allowed = new Set<BillingProvider>(["stripe", "paddle"]);

export function requestedBillingProviders() {
  const configured = process.env.BILLING_PROVIDERS?.trim() || "stripe";
  const values = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is BillingProvider => allowed.has(value as BillingProvider));
  return [...new Set(values)];
}

export function availableBillingProviders() {
  if (!billingExecutionEnabled()) return [];
  return requestedBillingProviders().filter(
    (provider) => provider === "stripe" || productCapabilities.paddle_billing.launchStatus === "active",
  );
}

export function billingProviderEnabled(provider: BillingProvider) {
  return availableBillingProviders().includes(provider);
}
