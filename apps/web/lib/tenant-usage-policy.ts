import type { PostgresSiteRepository } from "@platform/site-data";
import { productPlans, type PlanKey } from "@platform/product-catalog";

export type TenantPlan = PlanKey;
export type TenantUsageMetric =
  | "appointment_submission"
  | "client_ai_rewrite"
  | "media_upload"
  | "media_upload_bytes";
export type TenantUsageWindow = "minute" | "hour" | "day" | "month";

export type TenantQuota = {
  window: TenantUsageWindow;
  limit: number;
};

const basePolicies: Record<
  TenantPlan,
  Record<TenantUsageMetric, TenantQuota[]>
> = {
  starter: {
    appointment_submission: [
      { window: "minute", limit: 3 },
      { window: "day", limit: 30 },
      { window: "month", limit: 300 },
    ],
    client_ai_rewrite: [
      { window: "minute", limit: 2 },
      { window: "day", limit: 10 },
      { window: "month", limit: 100 },
    ],
    media_upload: [
      { window: "minute", limit: 3 },
      { window: "day", limit: 15 },
      { window: "month", limit: 200 },
    ],
    media_upload_bytes: [{ window: "month", limit: 100 * 1024 * 1024 }],
  },
  professional: {
    appointment_submission: [
      { window: "minute", limit: 10 },
      { window: "day", limit: 150 },
      { window: "month", limit: 2_500 },
    ],
    client_ai_rewrite: [
      { window: "minute", limit: 4 },
      { window: "day", limit: 50 },
      { window: "month", limit: 1_000 },
    ],
    media_upload: [
      { window: "minute", limit: 8 },
      { window: "day", limit: 75 },
      { window: "month", limit: 1_000 },
    ],
    media_upload_bytes: [{ window: "month", limit: 500 * 1024 * 1024 }],
  },
  premium: {
    appointment_submission: [
      { window: "minute", limit: 20 },
      { window: "day", limit: 400 },
      { window: "month", limit: 10_000 },
    ],
    client_ai_rewrite: [
      { window: "minute", limit: 8 },
      { window: "day", limit: 150 },
      { window: "month", limit: 5_000 },
    ],
    media_upload: [
      { window: "minute", limit: 15 },
      { window: "day", limit: 200 },
      { window: "month", limit: 5_000 },
    ],
    media_upload_bytes: [{ window: "month", limit: 2 * 1024 * 1024 * 1024 }],
  },
};

type Environment = Record<string, string | undefined>;

function multiplier(plan: TenantPlan, env: Environment) {
  const key = `TENANT_QUOTA_MULTIPLIER_${plan.toUpperCase()}`;
  const parsed = Number(env[key]);
  return Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 100 ? parsed : 1;
}

export function tenantQuotas(
  plan: TenantPlan,
  metric: TenantUsageMetric,
  env: Environment = process.env,
) {
  const policyPlan = productPlans[plan].quotaPolicyKey;
  const factor = multiplier(plan, env);
  return basePolicies[policyPlan][metric].map((quota) => ({
    ...quota,
    limit: Math.max(
      1,
      Math.floor(
        metric === "client_ai_rewrite" &&
          plan === "starter" &&
          quota.window === "day" &&
          Number.isSafeInteger(Number(env.AI_CLIENT_DAILY_LIMIT)) &&
          Number(env.AI_CLIENT_DAILY_LIMIT) >= 1
          ? Number(env.AI_CLIENT_DAILY_LIMIT) * factor
          : quota.limit * factor,
      ),
    ),
  }));
}

export function tenantQuotaWarningRatio(env: Environment = process.env) {
  const value = Number(env.TENANT_QUOTA_WARNING_PERCENT);
  return Number.isFinite(value) && value >= 50 && value <= 95
    ? value / 100
    : 0.8;
}

export function tenantConcurrencyLimit(
  plan: TenantPlan,
  operation: "client_ai_rewrite" | "media_upload",
) {
  const limits = {
    starter: { client_ai_rewrite: 1, media_upload: 2 },
    professional: { client_ai_rewrite: 2, media_upload: 4 },
    premium: { client_ai_rewrite: 4, media_upload: 8 },
  } as const;
  return limits[plan][operation];
}

export async function acquireTenantConcurrency(
  sites: PostgresSiteRepository,
  input: {
    siteId: string;
    operation: "client_ai_rewrite" | "media_upload";
    ttlSeconds: number;
  },
) {
  const plan = await sites.getSitePlan(input.siteId);
  return sites.acquireTenantConcurrency({
    ...input,
    limit: tenantConcurrencyLimit(plan, input.operation),
  });
}

export async function enforceTenantQuota(
  sites: PostgresSiteRepository,
  input: { siteId: string; metric: TenantUsageMetric; amount?: number },
) {
  const plan = await sites.getSitePlan(input.siteId);
  return sites.consumeTenantUsage({
    siteId: input.siteId,
    metric: input.metric,
    amount: input.amount ?? 1,
    quotas: tenantQuotas(plan, input.metric),
    warningRatio: tenantQuotaWarningRatio(),
  });
}
