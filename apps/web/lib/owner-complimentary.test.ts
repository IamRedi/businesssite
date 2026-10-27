import { describe, expect, it } from "vitest";
import { parseOwnerComplimentaryFormInput } from "./owner-complimentary";

const supportedSiteLocales = ["de", "en", "fr", "es", "it", "sq"];

const validFormData = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  const base = {
    businessName: "Barberi i Qytetit",
    category: "barber",
    email: "Owner@Example.com",
    siteLocale: "sq",
    adminLocale: "en",
    planKey: "starter",
    reason: "launch partner",
    legalBusinessName: "Barberi i Qytetit sh.p.k.",
    legalContactEmail: "legal@barberi.example",
    legalStreet: "Rruga e Kavajes 12",
    legalPostalCode: "1001",
    legalCity: "Tirana",
    legalCountryCode: "al",
    privacyMode: "internal",
    legalPrivacyNoticeUrl: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(base)) data.set(key, value);
  return data;
};

describe("parseOwnerComplimentaryFormInput", () => {
  it("accepts a complete submission and separates site locale from admin UI locale", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData(), supportedSiteLocales);
    expect(parsed).toMatchObject({
      ok: true,
      value: {
        businessName: "Barberi i Qytetit",
        email: "owner@example.com",
        siteLocale: "sq",
        adminLocale: "en",
        planKey: "starter",
        publicLegal: {
          legalBusinessName: "Barberi i Qytetit sh.p.k.",
          countryCode: "AL",
          contactEmail: "legal@barberi.example",
          privacyNoticePath: "/privacy",
        },
      },
    });
  });

  it("accepts every supported website locale", () => {
    for (const locale of supportedSiteLocales) {
      const parsed = parseOwnerComplimentaryFormInput(validFormData({ siteLocale: locale }), supportedSiteLocales);
      expect(parsed).toMatchObject({ ok: true, value: { siteLocale: locale } });
    }
  });

  it("rejects a website locale outside the supported site languages", () => {
    expect(parseOwnerComplimentaryFormInput(validFormData({ siteLocale: "tr" }), supportedSiteLocales))
      .toMatchObject({ ok: false, error: "invalid" });
  });

  it("rejects an admin UI locale outside the en/de customer boundary", () => {
    expect(parseOwnerComplimentaryFormInput(validFormData({ adminLocale: "fr" }), supportedSiteLocales))
      .toMatchObject({ ok: false, error: "invalid" });
    expect(parseOwnerComplimentaryFormInput(validFormData({ adminLocale: "de" }), supportedSiteLocales))
      .toMatchObject({ ok: true, value: { adminLocale: "de" } });
  });

  it("rejects submissions missing any required legal identity field", () => {
    for (const key of ["legalBusinessName", "legalStreet", "legalPostalCode", "legalCity", "legalCountryCode", "legalContactEmail"]) {
      const data = validFormData();
      data.set(key, "");
      expect(parseOwnerComplimentaryFormInput(data, supportedSiteLocales)).toMatchObject({ ok: false, error: "invalid" });
    }
  });

  it("defaults to the automatic BusinessSite privacy page without fabricating URLs", () => {
    const internal = parseOwnerComplimentaryFormInput(validFormData({ legalPrivacyNoticeUrl: "" }), supportedSiteLocales);
    expect(internal).toMatchObject({ ok: true, value: { publicLegal: { privacyNoticePath: "/privacy" } } });
    expect(internal.ok ? internal.value.publicLegal.privacyNoticeUrl : undefined).toBeUndefined();
  });

  it("uses an external privacy URL only as an explicit override", () => {
    const external = parseOwnerComplimentaryFormInput(validFormData({
      privacyMode: "external",
      legalPrivacyNoticeUrl: "https://barberi.example/privacy",
    }), supportedSiteLocales);
    expect(external).toMatchObject({ ok: true, value: { publicLegal: { privacyNoticeUrl: "https://barberi.example/privacy" } } });
    expect(external.ok ? external.value.publicLegal.privacyNoticePath : undefined).toBeUndefined();
    expect(parseOwnerComplimentaryFormInput(validFormData({ privacyMode: "external", legalPrivacyNoticeUrl: "" }), supportedSiteLocales))
      .toMatchObject({ ok: false, error: "invalid" });
    expect(parseOwnerComplimentaryFormInput(validFormData({ legalPrivacyNoticeUrl: "http://barberi.example/privacy" }), supportedSiteLocales))
      .toMatchObject({ ok: true, value: { publicLegal: { privacyNoticePath: "/privacy" } } });
  });

  it("normalizes and truncates the country code like the site editor", () => {
    expect(parseOwnerComplimentaryFormInput(validFormData({ legalCountryCode: "alb" }), supportedSiteLocales))
      .toMatchObject({ ok: true, value: { publicLegal: { countryCode: "AL" } } });
    expect(parseOwnerComplimentaryFormInput(validFormData({ legalCountryCode: "A" }), supportedSiteLocales))
      .toMatchObject({ ok: false, error: "invalid" });
  });

  it("defaults an empty category to the canonical starter category", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData({ category: "" }), supportedSiteLocales);
    expect(parsed).toMatchObject({ ok: true, value: { category: "consultation" } });
  });

  it("stores canonical registry keys from the category combobox (BSRC-DESIGN-P4-001)", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData({
      category: "Ndërtim metalik",
      categoryKey: "construction-trades",
      subcategoryKey: "metal-construction",
    }), supportedSiteLocales);
    expect(parsed).toMatchObject({
      ok: true,
      value: { category: "Ndërtim metalik", categoryKey: "construction-trades", subcategoryKey: "metal-construction" },
    });
  });

  it("falls back to the registry label when only keys are submitted", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData({
      category: "",
      categoryKey: "automotive",
      subcategoryKey: "auto-repair",
    }), supportedSiteLocales);
    expect(parsed).toMatchObject({ ok: true, value: { category: "Auto Repair", categoryKey: "automotive", subcategoryKey: "auto-repair" } });
  });

  it("keeps Other/Custom as the other family without a subcategory", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData({
      category: "Specialized restoration services",
      categoryKey: "other",
      subcategoryKey: "",
    }), supportedSiteLocales);
    expect(parsed.ok && parsed.value.categoryKey).toBe("other");
    expect(parsed.ok && parsed.value.subcategoryKey).toBeUndefined();
  });

  it("drops unknown canonical keys and keeps the legacy path working", () => {
    const parsed = parseOwnerComplimentaryFormInput(validFormData({
      category: "barber",
      categoryKey: "not-a-family",
      subcategoryKey: "not-a-subcategory",
    }), supportedSiteLocales);
    expect(parsed.ok && parsed.value.categoryKey).toBeUndefined();
    expect(parsed.ok && parsed.value.subcategoryKey).toBeUndefined();
    expect(parsed).toMatchObject({ ok: true, value: { category: "barber" } });
  });
});
