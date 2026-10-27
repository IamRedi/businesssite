import { describe, expect, it } from "vitest";
import { normalizePromotionCode, promotionCodeIsValid, promotionInput, stripePromotionParams } from "./stripe-promotions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("Stripe promotion configuration", () => {
  it("normalizes safe customer-facing codes", () => {
    expect(normalizePromotionCode(" friend-2026 ")).toBe("FRIEND-2026");
    expect(promotionCodeIsValid("friend-2026")).toBe(true);
    expect(promotionCodeIsValid("bad code")).toBe(false);
  });

  it("builds a unique six-month free promotion", () => {
    const input = promotionInput(form({ preset: "friends_6_months_free", code: "friend-redi", maxRedemptions: "1", firstTimeOnly: "on" }));
    const params = stripePromotionParams(input, "sq");
    expect(params.coupon).toMatchObject({ percent_off: 100, duration: "repeating", duration_in_months: 6, name: "6 muaj falas" });
    expect(params.promotion).toMatchObject({ code: "FRIEND-REDI", max_redemptions: 1, restrictions: { first_time_transaction: true } });
  });

  it("builds the two-month launch offer", () => {
    const input = promotionInput(form({ preset: "launch_2_months_free", code: "launch-free", maxRedemptions: "100" }));
    const params = stripePromotionParams(input, "sq");
    expect(params.coupon).toMatchObject({ percent_off: 100, duration: "repeating", duration_in_months: 2, name: "2 muaj falas në fillim" });
    expect(params.promotion).toMatchObject({ code: "LAUNCH-FREE", max_redemptions: 100 });
  });

  it("builds a three-month half-price campaign", () => {
    const input = promotionInput(form({ preset: "launch_3_months_half", code: "launch50", maxRedemptions: "100" }));
    const params = stripePromotionParams(input);
    expect(params.coupon).toMatchObject({ percent_off: 50, duration_in_months: 3 });
    expect(params.promotion.max_redemptions).toBe(100);
  });

  it("rejects unsafe limits", () => {
    expect(() => promotionInput(form({ preset: "friends_6_months_free", code: "FRIEND", maxRedemptions: "0" }))).toThrow();
  });
});
