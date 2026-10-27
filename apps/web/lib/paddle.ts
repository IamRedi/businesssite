import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { billingExecutionEnabled } from "./execution-gates";

export type PlanKey = "starter" | "professional" | "premium";

export function paddleLegacyLifecycleEnabled() {
  return billingExecutionEnabled() && process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED === "true";
}

export function paddleEnvironment() {
  const value = process.env.PADDLE_ENVIRONMENT?.trim() || "sandbox";
  if (value !== "sandbox" && value !== "production")
    throw new Error("PADDLE_ENVIRONMENT must be sandbox or production.");
  return value;
}

export function paddleClient() {
  if (!billingExecutionEnabled()) throw new Error("Billing execution is disabled.");
  const key = process.env.PADDLE_API_KEY?.trim();
  if (!key) throw new Error("Paddle Billing is not configured.");
  return new Paddle(key, {
    environment:
      paddleEnvironment() === "sandbox"
        ? Environment.sandbox
        : Environment.production,
  });
}

export function paddlePrice(plan: PlanKey) {
  const value = process.env[`PADDLE_PRICE_${plan.toUpperCase()}`]?.trim();
  if (!value) throw new Error(`Paddle Price is missing for ${plan}.`);
  return value;
}

export function planForPaddlePrice(priceId: string | null | undefined) {
  if (!priceId) return undefined;
  return (["starter", "professional", "premium"] as const).find(
    (plan) => paddlePriceIfConfigured(plan) === priceId,
  );
}

function paddlePriceIfConfigured(plan: PlanKey) {
  return process.env[`PADDLE_PRICE_${plan.toUpperCase()}`]?.trim();
}

export function paddleCheckoutConfiguration(plan: PlanKey) {
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  if (!clientToken) throw new Error("Paddle client token is not configured.");
  return {
    clientToken,
    environment: paddleEnvironment(),
    priceId: paddlePrice(plan),
  } as const;
}

export function isPaddleFullyConfigured() {
  return Boolean(
    process.env.PADDLE_API_KEY?.trim() &&
      process.env.PADDLE_WEBHOOK_SECRET?.trim() &&
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() &&
      paddlePriceIfConfigured("starter") &&
      paddlePriceIfConfigured("professional") &&
      paddlePriceIfConfigured("premium"),
  );
}
