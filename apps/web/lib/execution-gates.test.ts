import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConfig, configuredAiProvider } from "./ai-config";
import { availableBillingProviders } from "./billing-providers";
import { aiExecutionEnabled, billingExecutionEnabled, demoCleanupExecutionEnabled } from "./execution-gates";
import { paddleClient, paddleLegacyLifecycleEnabled } from "./paddle";
import { stripeClient } from "./stripe";

afterEach(() => vi.unstubAllEnvs());

describe("master execution gates", () => {
  it.each([undefined, "", "false", "TRUE", " true "])("fails closed for missing/malformed master value %s", (value) => {
    vi.stubEnv("BILLING_EXECUTION_ENABLED", value);
    vi.stubEnv("AI_EXECUTION_ENABLED", value);
    vi.stubEnv("DEMO_CLEANUP_EXECUTION_ENABLED", value);
    expect(billingExecutionEnabled()).toBe(false);
    expect(aiExecutionEnabled()).toBe(false);
    expect(demoCleanupExecutionEnabled()).toBe(false);
  });

  it("blocks Stripe, Paddle and customer billing despite subordinate secrets and flags ON", () => {
    vi.stubEnv("BILLING_EXECUTION_ENABLED", "false");
    vi.stubEnv("BILLING_PROVIDERS", "stripe,paddle");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local");
    vi.stubEnv("PADDLE_API_KEY", "pdl_test_local");
    vi.stubEnv("PADDLE_LEGACY_LIFECYCLE_ENABLED", "true");
    expect(availableBillingProviders()).toEqual([]);
    expect(paddleLegacyLifecycleEnabled()).toBe(false);
    expect(() => stripeClient()).toThrow("Billing execution is disabled.");
    expect(() => paddleClient()).toThrow("Billing execution is disabled.");
  });

  it("blocks owner, client and website AI despite subordinate flags ON", () => {
    vi.stubEnv("AI_EXECUTION_ENABLED", "false");
    vi.stubEnv("AI_OWNER_ENABLED", "true");
    vi.stubEnv("AI_CLIENT_ENABLED", "true");
    vi.stubEnv("AI_WEBSITE_FETCH_ENABLED", "true");
    expect(aiConfig.ownerEnabled).toBe(false);
    expect(aiConfig.clientEnabled).toBe(false);
    expect(aiConfig.websiteFetchEnabled).toBe(false);
    expect(() => configuredAiProvider()).toThrow("AI execution is disabled.");
  });

  it("requires exact explicit true for each master", () => {
    vi.stubEnv("BILLING_EXECUTION_ENABLED", "true");
    vi.stubEnv("AI_EXECUTION_ENABLED", "true");
    vi.stubEnv("DEMO_CLEANUP_EXECUTION_ENABLED", "true");
    expect(billingExecutionEnabled()).toBe(true);
    expect(aiExecutionEnabled()).toBe(true);
    expect(demoCleanupExecutionEnabled()).toBe(true);
  });
});
