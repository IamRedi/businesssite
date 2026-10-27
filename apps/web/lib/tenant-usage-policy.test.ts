import { describe, expect, it } from "vitest";
import {
  tenantConcurrencyLimit,
  tenantQuotas,
  tenantQuotaWarningRatio,
} from "./tenant-usage-policy";

describe("tenant usage policy", () => {
  it("keeps plans independent and increases paid-plan capacity", () => {
    const starter = tenantQuotas("starter", "appointment_submission", {});
    const premium = tenantQuotas("premium", "appointment_submission", {});
    expect(premium.at(-1)?.limit).toBeGreaterThan(starter.at(-1)?.limit ?? 0);
    expect(starter.map((quota) => quota.window)).toEqual([
      "minute",
      "day",
      "month",
    ]);
  });

  it("supports bounded buyer multipliers and warning threshold", () => {
    expect(
      tenantQuotas("starter", "client_ai_rewrite", {
        TENANT_QUOTA_MULTIPLIER_STARTER: "2",
      }).at(-1)?.limit,
    ).toBe(200);
    expect(
      tenantQuotas("starter", "client_ai_rewrite", {
        TENANT_QUOTA_MULTIPLIER_STARTER: "1000",
      }).at(-1)?.limit,
    ).toBe(100);
    expect(
      tenantQuotaWarningRatio({ TENANT_QUOTA_WARNING_PERCENT: "75" }),
    ).toBe(0.75);
  });

  it("keeps expensive-operation concurrency plan-aware", () => {
    expect(tenantConcurrencyLimit("starter", "client_ai_rewrite")).toBe(1);
    expect(tenantConcurrencyLimit("premium", "client_ai_rewrite")).toBe(4);
    expect(tenantConcurrencyLimit("professional", "media_upload")).toBe(4);
  });
});
