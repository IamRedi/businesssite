import { afterEach, describe, expect, it } from "vitest";
import { providerUsageWarningBudgets } from "./provider-usage-config";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

describe("provider usage warning budgets", () => {
  it("accepts bounded positive USD thresholds", () => {
    process.env.PROVIDER_COST_DAILY_WARNING_USD = "5.25";
    process.env.PROVIDER_COST_MONTHLY_WARNING_USD = "100";
    expect(providerUsageWarningBudgets()).toEqual({ dailyUsd: 5.25, monthlyUsd: 100 });
  });

  it("does not present invalid thresholds as configured", () => {
    process.env.PROVIDER_COST_DAILY_WARNING_USD = "0";
    process.env.PROVIDER_COST_MONTHLY_WARNING_USD = "secret";
    expect(providerUsageWarningBudgets()).toEqual({ dailyUsd: undefined, monthlyUsd: undefined });
  });
});
