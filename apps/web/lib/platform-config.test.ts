import { describe, expect, it } from "vitest";
import { billingCurrencyForLocale, plansForCurrency } from "./platform-config";

describe("localized pricing", () => {
  it("always uses Albanian lek pricing on Albanian pages", () => {
    expect(billingCurrencyForLocale("sq", "EUR")).toBe("ALL");
    expect(billingCurrencyForLocale("sq", "USD")).toBe("ALL");
    expect(plansForCurrency("ALL").map((plan) => plan.price)).toEqual([
      "2,000 lekë / muaj",
      "4,500 lekë / muaj",
      "9,900 lekë / muaj",
    ]);
  });

  it("keeps the selected currency for other languages", () => {
    expect(billingCurrencyForLocale("de", "EUR")).toBe("EUR");
    expect(billingCurrencyForLocale("en", "USD")).toBe("USD");
  });

  it("projects catalog availability instead of deriving it from UI order", () => {
    expect(plansForCurrency("EUR").map(({ key, launchStatus, purchasable }) => ({ key, launchStatus, purchasable }))).toEqual([
      { key: "starter", launchStatus: "active", purchasable: true },
      { key: "professional", launchStatus: "coming_soon", purchasable: false },
      { key: "premium", launchStatus: "coming_soon", purchasable: false },
    ]);
  });
});
