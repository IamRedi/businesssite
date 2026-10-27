import { describe, expect, it } from "vitest";
import { isProductionHostingTarget, isStagingHostingTarget } from "./hosting-environment";
import { productionHeartbeatConfiguration, stagingSchedulerConfiguration } from "./operational-monitoring";

describe("explicit hosting target", () => {
  it("preserves Vercel production and preview boundaries", () => {
    expect(isProductionHostingTarget({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionHostingTarget({ RELEASE_TARGET: "production", VERCEL_ENV: "preview" })).toBe(false);
    expect(isStagingHostingTarget({ RELEASE_TARGET: "staging", VERCEL_ENV: "production" })).toBe(false);
  });
  it("requires an explicit VPS target and rejects contradictory provider identity", () => {
    expect(isProductionHostingTarget({ HOSTING_PROVIDER: "clouvider", RELEASE_TARGET: "production", NODE_ENV: "production" })).toBe(true);
    expect(isProductionHostingTarget({ HOSTING_PROVIDER: "clouvider", NODE_ENV: "production" })).toBe(false);
    expect(isProductionHostingTarget({ HOSTING_PROVIDER: "unknown", VERCEL_ENV: "production" })).toBe(false);
    expect(isProductionHostingTarget({ HOSTING_PROVIDER: "clouvider", RELEASE_TARGET: "production", VERCEL_ENV: "production" })).toBe(false);
  });
  it("keeps optional monitoring off and validates secrets when explicitly enabled", () => {
    const production = { HOSTING_PROVIDER: "clouvider", RELEASE_TARGET: "production" };
    expect(productionHeartbeatConfiguration(production).enabled).toBe(false);
    expect(() => productionHeartbeatConfiguration({ ...production, MONITORING_PRODUCTION_HEARTBEAT_ENABLED: "true" })).toThrow("secret");
    expect(productionHeartbeatConfiguration({ ...production, MONITORING_PRODUCTION_HEARTBEAT_ENABLED: "true", CRON_SECRET: "s".repeat(32) }).enabled).toBe(true);
    const staging = { HOSTING_PROVIDER: "clouvider", RELEASE_TARGET: "staging", NODE_ENV: "production" };
    expect(isStagingHostingTarget(staging)).toBe(true);
    expect(stagingSchedulerConfiguration({ ...staging, MONITORING_STAGING_SCHEDULER_ENABLED: "true", MONITORING_STAGING_SCHEDULER_SECRET: "s".repeat(32) }).enabled).toBe(true);
    expect(stagingSchedulerConfiguration({ ...staging, VERCEL_ENV: "production", MONITORING_STAGING_SCHEDULER_ENABLED: "true" }).enabled).toBe(false);
  });
});
