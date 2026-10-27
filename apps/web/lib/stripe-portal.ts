import { planIsPurchasable } from "@platform/product-catalog";

export function verifiedStarterPortalConfiguration() {
  if (!planIsPurchasable("starter", "stripe")) return undefined;
  if (process.env.STRIPE_PORTAL_STARTER_ONLY_VERIFIED !== "true") return undefined;
  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_STARTER?.trim();
  return configuration && /^bpc_[A-Za-z0-9]+$/.test(configuration) ? configuration : undefined;
}

export async function createStarterPortalSession(
  input: {
    billingProvider: "stripe" | "paddle";
    planKey?: "starter" | "professional" | "premium";
    stripeCustomerId?: string;
    returnUrl: string;
  },
  create: (params: { customer: string; configuration: string; return_url: string }) => Promise<{ url: string }>,
) {
  const configuration = verifiedStarterPortalConfiguration();
  if (
    input.billingProvider !== "stripe" ||
    input.planKey !== "starter" ||
    !input.stripeCustomerId ||
    !configuration
  ) throw new Error("Stripe portal is unavailable.");
  return create({
    customer: input.stripeCustomerId,
    configuration,
    return_url: input.returnUrl,
  });
}
