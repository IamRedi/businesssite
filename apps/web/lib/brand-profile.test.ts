import { describe, expect, it } from "vitest";
import { brandProfileErrors, createBrandProfile, neutralBuyerBrandProfile, platformBrandProfile } from "./brand-profile";

describe("white-label brand profile", () => {
  it("keeps the first-party profile valid and exposes no legal/provider fields", () => {
    expect(brandProfileErrors(platformBrandProfile)).toEqual([]);
    expect(JSON.stringify(platformBrandProfile)).not.toMatch(/secret|stripe|legalOperator/i);
  });

  it("accepts the neutral buyer fixture without first-party identity leakage", () => {
    expect(brandProfileErrors(neutralBuyerBrandProfile)).toEqual([]);
    expect(JSON.stringify(neutralBuyerBrandProfile)).not.toMatch(/BusinessSite|Website RemoteControl|InfoEsencë|businesssite\.control/i);
  });

  it("falls back safely from malformed browser-visible values", () => {
    const profile = createBrandProfile({
      NEXT_PUBLIC_BRAND_PROFILE_KEY: "../../bad", NEXT_PUBLIC_PLATFORM_NAME: "\nunsafe", NEXT_PUBLIC_PLATFORM_LOGO_URL: "https://untrusted.example/logo.png",
      NEXT_PUBLIC_BRAND_PRIMARY: "red", NEXT_PUBLIC_SUPPORTED_LOCALES: "fr", PUBLIC_APP_URL: "javascript:alert(1)", NEXT_PUBLIC_SUPPORT_URL: "javascript:alert(1)",
    });
    expect(profile.key).toBe("businesssite-rc");
    expect(profile.logo.src).toBe("/images/brand/businesssite-logo-horizontal-v3.png");
    expect(profile.theme.primary).toBe("#ff453a");
    expect(profile.support.url).toBe("mailto:support@example.com");
    expect(brandProfileErrors(profile)).toEqual([]);
  });
});
