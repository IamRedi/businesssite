import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { availableBillingProviders, requestedBillingProviders } from "./billing-providers";

const keys = [
  "BILLING_EXECUTION_ENABLED",
  "BILLING_PROVIDERS",
  "PADDLE_API_KEY",
  "PADDLE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "PADDLE_PRICE_STARTER",
  "PADDLE_PRICE_PROFESSIONAL",
  "PADDLE_PRICE_PREMIUM",
] as const;

afterEach(() => keys.forEach((key) => delete process.env[key]));
beforeEach(() => { process.env.BILLING_EXECUTION_ENABLED = "true"; });

describe("billing provider configuration", () => {
  it("keeps Stripe as the backward-compatible default", () => {
    expect(requestedBillingProviders()).toEqual(["stripe"]);
    expect(availableBillingProviders()).toEqual(["stripe"]);
  });

  it("does not advertise a partially configured Paddle checkout", () => {
    process.env.BILLING_PROVIDERS = "stripe,paddle";
    process.env.PADDLE_API_KEY = "pdl_test";
    expect(availableBillingProviders()).toEqual(["stripe"]);
  });

  it("does not let complete Paddle environment variables activate acquisition", () => {
    process.env.BILLING_PROVIDERS = "stripe,paddle";
    process.env.PADDLE_API_KEY = "pdl_test";
    process.env.PADDLE_WEBHOOK_SECRET = "pdl_ntfset_test";
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = "test_token";
    process.env.PADDLE_PRICE_STARTER = "pri_starter";
    process.env.PADDLE_PRICE_PROFESSIONAL = "pri_professional";
    process.env.PADDLE_PRICE_PREMIUM = "pri_premium";
    expect(availableBillingProviders()).toEqual(["stripe"]);
  });
});
