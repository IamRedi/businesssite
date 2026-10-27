import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const productCatalog = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../packages/product-catalog/src/catalog.json"), "utf8"),
);

export const purchasablePlans = Object.entries(productCatalog.plans)
  .filter(([, plan]) => plan.launchStatus === "active" && plan.supportedProviders.length > 0)
  .map(([key]) => key);

export const acquisitionProviders = [...new Set(
  purchasablePlans.flatMap((key) => productCatalog.plans[key].supportedProviders),
)];

export function lifecycleConfigurationErrors(environment = process.env) {
  const policy = productCatalog.subscriptionLifecycle;
  return [
    ["SUBSCRIPTION_PAYMENT_GRACE_DAYS", environment.SUBSCRIPTION_PAYMENT_GRACE_DAYS, policy.maximumPaymentGraceDays],
    ["SUBSCRIPTION_READ_ONLY_DAYS", environment.SUBSCRIPTION_READ_ONLY_DAYS, policy.maximumPaidReadOnlyDays],
    ["TRIAL_RECOVERY_DAYS", environment.TRIAL_RECOVERY_DAYS, policy.maximumTrialRecoveryDays],
  ].flatMap(([name, value, maximum]) => {
    if (value === undefined || value === "") return [];
    const normalized = String(value).trim();
    const parsed = /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
      ? []
      : [`${name} must be an integer from 1 to ${maximum}`];
  });
}
