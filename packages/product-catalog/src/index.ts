import rawCatalog from "./catalog.json";

export * from "./access-policy";

export const launchStatuses = ["active", "coming_soon", "hidden", "internal"] as const;
export type LaunchStatus = (typeof launchStatuses)[number];
export const readinessStatuses = ["locally_verified", "provider_configuration_required", "production_verified"] as const;
export type ReadinessStatus = (typeof readinessStatuses)[number];
export const planKeys = ["starter", "professional", "premium"] as const;
export type PlanKey = (typeof planKeys)[number];
export const capabilityKeys = [
  "website", "editor", "media", "ai_rewrite", "appointment_requests", "booking_calendar",
  "custom_domain_existing", "domain_purchase", "social_media", "information_news", "advertising", "paddle_billing",
] as const;
export type CapabilityKey = (typeof capabilityKeys)[number];
export const billingProviders = ["stripe", "paddle"] as const;
export type CatalogBillingProvider = (typeof billingProviders)[number];
export type QuotaPolicyKey = PlanKey;
export type EntitlementCapability = Extract<CapabilityKey,
  "website" | "editor" | "media" | "ai_rewrite" | "appointment_requests" | "booking_calendar" | "custom_domain_existing" | "social_media"
>;

type TrialPolicy = { enabled: boolean; defaultDays: number; maximumDays: number };
export type ProductPlan = {
  key: PlanKey;
  publicNameConfigReference: string;
  launchStatus: LaunchStatus;
  readiness: ReadinessStatus;
  supportedProviders: readonly CatalogBillingProvider[];
  trialPolicy: TrialPolicy;
  promotionEligible: boolean;
  entitlements: readonly EntitlementCapability[];
  quotaPolicyKey: QuotaPolicyKey;
  purchasable: boolean;
};
export type ProductCapability = {
  key: CapabilityKey;
  launchStatus: LaunchStatus;
  readiness: ReadinessStatus;
  trialEligible: boolean;
};

const isPlanKey = (value: unknown): value is PlanKey =>
  typeof value === "string" && planKeys.includes(value as PlanKey);
const isCapabilityKey = (value: unknown): value is CapabilityKey =>
  typeof value === "string" && capabilityKeys.includes(value as CapabilityKey);

function planRecord(key: PlanKey): ProductPlan {
  const value = rawCatalog.plans[key];
  return Object.freeze({
    ...value,
    key,
    launchStatus: value.launchStatus as LaunchStatus,
    readiness: value.readiness as ReadinessStatus,
    supportedProviders: Object.freeze([...value.supportedProviders] as CatalogBillingProvider[]),
    entitlements: Object.freeze([...value.entitlements] as EntitlementCapability[]),
    quotaPolicyKey: value.quotaPolicyKey as QuotaPolicyKey,
    purchasable: value.launchStatus === "active" && value.supportedProviders.length > 0,
  });
}

function capabilityRecord(key: CapabilityKey): ProductCapability {
  const value = rawCatalog.capabilities[key];
  return Object.freeze({
    ...value,
    key,
    launchStatus: value.launchStatus as LaunchStatus,
    readiness: value.readiness as ReadinessStatus,
  });
}

export const productPlans = Object.freeze(Object.fromEntries(planKeys.map((key) => [key, planRecord(key)])) as Record<PlanKey, ProductPlan>);
export const productCapabilities = Object.freeze(Object.fromEntries(capabilityKeys.map((key) => [key, capabilityRecord(key)])) as Record<CapabilityKey, ProductCapability>);

export function getProductPlan(value: unknown) {
  return isPlanKey(value) ? productPlans[value] : undefined;
}

export function getProductCapability(value: unknown) {
  return isCapabilityKey(value) ? productCapabilities[value] : undefined;
}

export function planIsPurchasable(value: unknown, provider?: CatalogBillingProvider) {
  const plan = getProductPlan(value);
  return Boolean(plan?.purchasable && (!provider || plan.supportedProviders.includes(provider)));
}

export function capabilityIsPubliclyActive(value: unknown) {
  return getProductCapability(value)?.launchStatus === "active";
}

export function capabilityIsInternallyAvailable(value: unknown) {
  return getProductCapability(value)?.launchStatus === "internal";
}

export function planHasEntitlement(planValue: unknown, capabilityValue: unknown) {
  const plan = getProductPlan(planValue);
  const capability = getProductCapability(capabilityValue);
  return Boolean(plan && capability && plan.entitlements.includes(capability.key as EntitlementCapability));
}

export function trialHasEntitlement(capabilityValue: unknown) {
  const capability = getProductCapability(capabilityValue);
  return Boolean(
    capability?.launchStatus === "active" &&
    capability.trialEligible &&
    productPlans.starter.trialPolicy.enabled &&
    productPlans.starter.entitlements.includes(capability.key as EntitlementCapability),
  );
}

export function publicProductCatalog() {
  return {
    version: rawCatalog.version,
    plans: planKeys.map((key) => {
      const plan = productPlans[key];
      return {
        key: plan.key,
        publicNameConfigReference: plan.publicNameConfigReference,
        launchStatus: plan.launchStatus,
        readiness: plan.readiness,
        supportedProviders: plan.supportedProviders,
        trialPolicy: plan.trialPolicy,
        promotionEligible: plan.promotionEligible,
        entitlements: plan.entitlements,
        quotaPolicyKey: plan.quotaPolicyKey,
        purchasable: plan.purchasable,
      };
    }),
    capabilities: capabilityKeys.map((key) => productCapabilities[key]),
  };
}
