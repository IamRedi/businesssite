import type Stripe from "stripe";

export const promotionPresets = {
  launch_2_months_free: {
    percentOff: 100,
    months: 2,
    names: {
      de: "2 Monate kostenlos zum Start",
      en: "2 launch months free",
      fr: "2 mois gratuits au lancement",
      es: "2 meses gratuitos de lanzamiento",
      it: "2 mesi gratuiti di lancio",
      sq: "2 muaj falas në fillim",
    },
  },
  friends_6_months_free: {
    percentOff: 100,
    months: 6,
    names: {
      de: "6 Monate kostenlos",
      en: "6 months free",
      fr: "6 mois gratuits",
      es: "6 meses gratis",
      it: "6 mesi gratis",
      sq: "6 muaj falas",
    },
  },
  launch_3_months_half: {
    percentOff: 50,
    months: 3,
    names: {
      de: "3 Monate 50 % Rabatt",
      en: "50% off for 3 months",
      fr: "50 % pendant 3 mois",
      es: "50 % durante 3 meses",
      it: "50% per 3 mesi",
      sq: "50% ulje për 3 muaj",
    },
  },
} as const;

export type PromotionPreset = keyof typeof promotionPresets;

export function normalizePromotionCode(value: string) {
  return value.trim().toUpperCase();
}

export function promotionCodeIsValid(value: string) {
  return /^[A-Z0-9][A-Z0-9-]{3,31}$/.test(normalizePromotionCode(value));
}

export function promotionInput(formData: FormData) {
  const preset = String(formData.get("preset") ?? "") as PromotionPreset;
  if (!(preset in promotionPresets)) throw new Error("Invalid promotion preset.");
  const code = normalizePromotionCode(String(formData.get("code") ?? ""));
  if (!promotionCodeIsValid(code)) throw new Error("Use 4-32 letters, numbers or dashes.");
  const maxRedemptions = Number(formData.get("maxRedemptions") ?? 1);
  if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000)
    throw new Error("Redemption limit must be between 1 and 1000.");
  const expiresOn = String(formData.get("expiresOn") ?? "").trim();
  let expiresAt: number | undefined;
  if (expiresOn) {
    const date = new Date(`${expiresOn}T23:59:59.999Z`);
    if (Number.isNaN(date.valueOf()) || date <= new Date()) throw new Error("Expiration must be a future date.");
    expiresAt = Math.floor(date.valueOf() / 1000);
  }
  return { preset, code, maxRedemptions, expiresAt, firstTimeOnly: formData.get("firstTimeOnly") === "on" };
}

export function stripePromotionParams(input: ReturnType<typeof promotionInput>, locale: keyof (typeof promotionPresets)[PromotionPreset]["names"] = "en") {
  const preset = promotionPresets[input.preset];
  const metadata = { platform_promotion_preset: input.preset };
  const coupon: Stripe.CouponCreateParams = {
    duration: "repeating",
    duration_in_months: preset.months,
    percent_off: preset.percentOff,
    name: preset.names[locale],
    metadata,
  };
  const promotion: Omit<Stripe.PromotionCodeCreateParams, "promotion"> = {
    code: input.code,
    max_redemptions: input.maxRedemptions,
    expires_at: input.expiresAt,
    restrictions: { first_time_transaction: input.firstTimeOnly },
    metadata,
  };
  return { coupon, promotion };
}
