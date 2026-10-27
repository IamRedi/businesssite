import { customerUiLocales, resolveCustomerUiLocale, type CustomerUiLocale } from "./locale-model";

export type BrandAsset = { src: string; type: "image/png" | "image/svg+xml" | "image/x-icon"; sizes: string };
export type BrandProfile = {
  key: string;
  assetVersion: string;
  displayName: string;
  shortName: string;
  tagline: string;
  description: string;
  logo: BrandAsset;
  logoMark: BrandAsset;
  favicon: BrandAsset;
  pwa: { standard: BrandAsset; maskable: BrandAsset; appleTouch: BrandAsset };
  socialImage: BrandAsset;
  mark: string;
  theme: { primary: string; accent: string; background: string; text: string };
  publicAppUrl: string;
  support: { displayName: string; email: string; url: string };
  defaultLocale: CustomerUiLocale;
  customerLocales: CustomerUiLocale[];
  informationProductName: string;
  stylesheetUrl: string;
};

const firstPartyProfile = {
  key: "businesssite-rc",
  assetVersion: "2026-08-24",
  displayName: "BusinessSite RC",
  shortName: "BusinessSite",
  tagline: "Website RemoteControl",
  description: "Professional websites for local businesses.",
  logo: { src: "/images/brand/businesssite-logo-horizontal-v3.png", type: "image/png", sizes: "2072x310" },
  logoMark: { src: "/images/brand/businesssite-logo.png", type: "image/png", sizes: "1254x1254" },
  favicon: { src: "/images/brand/businesssite-logo.png", type: "image/png", sizes: "1254x1254" },
  pwa: {
    standard: { src: "/images/brand/businesssite-logo.png", type: "image/png", sizes: "1254x1254" },
    maskable: { src: "/images/brand/businesssite-logo.png", type: "image/png", sizes: "1254x1254" },
    appleTouch: { src: "/images/brand/businesssite-logo.png", type: "image/png", sizes: "1254x1254" },
  },
  socialImage: { src: "/images/brand/businesssite-logo-horizontal-v3.png", type: "image/png", sizes: "2072x310" },
  mark: "BR",
  theme: { primary: "#ff453a", accent: "#ff9f0a", background: "#070708", text: "#f5f5f7" },
  publicAppUrl: "http://localhost:3000",
  support: { displayName: "BusinessSite RC Support", email: "support@example.com", url: "mailto:support@example.com" },
  defaultLocale: "de" as CustomerUiLocale,
  customerLocales: ["de", "en"] as CustomerUiLocale[],
  informationProductName: "InfoEsencë",
  stylesheetUrl: "",
} as const satisfies BrandProfile;

const hex = /^#[0-9a-f]{6}$/i;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const key = /^[a-z0-9][a-z0-9-]{1,62}$/;
const safeText = (value: string | undefined, fallback: string, maximum = 180) => {
  const result = value?.trim() || fallback;
  return result.length <= maximum && !/[\r\n]/.test(result) ? result : fallback;
};
const safeColor = (value: string | undefined, fallback: string) => hex.test(value?.trim() ?? "") ? value!.trim() : fallback;
const localAsset = (value: string | undefined, fallback: BrandAsset): BrandAsset => {
  const src = value?.trim() || fallback.src;
  // Runtime never fetches a buyer-controlled asset server-side. Public assets
  // are local, root-relative paths only; remote asset onboarding is a release task.
  return src.startsWith("/") && !src.includes("..") && !/[?#\\]/.test(src) ? { ...fallback, src } : fallback;
};
const locales = (value: string | undefined, fallback: CustomerUiLocale[]) => {
  const selected = (value ?? "").split(",").map((item) => item.trim()).filter((item): item is CustomerUiLocale => customerUiLocales.includes(item as CustomerUiLocale));
  return selected.length ? [...new Set(selected)] : fallback;
};
const publicUrl = (value: string | undefined, fallback: string) => {
  try {
    const url = new URL(value?.trim() || fallback);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) return fallback;
    url.pathname = "/";
    return url.toString().replace(/\/$/, "");
  } catch { return fallback; }
};
const stylesheet = (value: string | undefined) => {
  const candidate = value?.trim() ?? "";
  // An external stylesheet is intentionally disabled until a deployment-level
  // host allowlist and CSP are accepted. Local, versioned buyer CSS is safe.
  return candidate.startsWith("/") && !candidate.includes("..") && !/[?#\\]/.test(candidate) ? candidate : "";
};
const contrast = (foreground: string, background: string) => {
  const channel = (color: string) => [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = (color: string) => { const [r, g, b] = channel(color); return .2126 * r + .7152 * g + .0722 * b; };
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + .05) / (b + .05) >= 3;
};

export function createBrandProfile(environment: Readonly<Record<string, string | undefined>> = process.env): BrandProfile {
  const profileKey = safeText(environment.NEXT_PUBLIC_BRAND_PROFILE_KEY, firstPartyProfile.key, 63).toLowerCase();
  const profile: BrandProfile = {
    key: key.test(profileKey) ? profileKey : firstPartyProfile.key,
    assetVersion: safeText(environment.NEXT_PUBLIC_BRAND_ASSET_VERSION, firstPartyProfile.assetVersion, 64),
    displayName: safeText(environment.NEXT_PUBLIC_PLATFORM_NAME, firstPartyProfile.displayName),
    shortName: safeText(environment.NEXT_PUBLIC_PLATFORM_SHORT_NAME, firstPartyProfile.shortName, 24),
    tagline: safeText(environment.NEXT_PUBLIC_PLATFORM_TAGLINE, firstPartyProfile.tagline),
    description: safeText(environment.NEXT_PUBLIC_PLATFORM_DESCRIPTION, firstPartyProfile.description, 320),
    logo: localAsset(environment.NEXT_PUBLIC_PLATFORM_LOGO_URL, firstPartyProfile.logo),
    logoMark: localAsset(environment.NEXT_PUBLIC_PLATFORM_LOGO_MARK_URL, firstPartyProfile.logoMark),
    favicon: localAsset(environment.NEXT_PUBLIC_PLATFORM_FAVICON_URL, firstPartyProfile.favicon),
    pwa: {
      standard: localAsset(environment.NEXT_PUBLIC_PWA_ICON_URL, firstPartyProfile.pwa.standard),
      maskable: localAsset(environment.NEXT_PUBLIC_PWA_MASKABLE_ICON_URL, firstPartyProfile.pwa.maskable),
      appleTouch: localAsset(environment.NEXT_PUBLIC_APPLE_TOUCH_ICON_URL, firstPartyProfile.pwa.appleTouch),
    },
    socialImage: localAsset(environment.NEXT_PUBLIC_PLATFORM_SOCIAL_IMAGE_URL, firstPartyProfile.socialImage),
    mark: safeText(environment.NEXT_PUBLIC_PLATFORM_MARK, firstPartyProfile.mark, 2),
    theme: {
      primary: safeColor(environment.NEXT_PUBLIC_BRAND_PRIMARY, firstPartyProfile.theme.primary), accent: safeColor(environment.NEXT_PUBLIC_BRAND_ACCENT, firstPartyProfile.theme.accent),
      background: safeColor(environment.NEXT_PUBLIC_BRAND_BACKGROUND, firstPartyProfile.theme.background), text: safeColor(environment.NEXT_PUBLIC_BRAND_TEXT, firstPartyProfile.theme.text),
    },
    publicAppUrl: publicUrl(environment.PUBLIC_APP_URL, firstPartyProfile.publicAppUrl),
    support: {
      displayName: safeText(environment.NEXT_PUBLIC_SUPPORT_DISPLAY_NAME, environment.NEXT_PUBLIC_PLATFORM_NAME?.trim() ? `${environment.NEXT_PUBLIC_PLATFORM_NAME.trim()} Support` : firstPartyProfile.support.displayName),
      email: email.test(environment.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "") ? environment.NEXT_PUBLIC_SUPPORT_EMAIL!.trim() : firstPartyProfile.support.email,
      url: "",
    },
    defaultLocale: resolveCustomerUiLocale(environment.NEXT_PUBLIC_PLATFORM_LOCALE, firstPartyProfile.defaultLocale),
    customerLocales: locales(environment.NEXT_PUBLIC_SUPPORTED_LOCALES, [...firstPartyProfile.customerLocales]),
    informationProductName: safeText(environment.INFORMATION_PRODUCT_NAME, firstPartyProfile.informationProductName),
    stylesheetUrl: stylesheet(environment.NEXT_PUBLIC_BRAND_STYLESHEET_URL),
  };
  profile.support.url = environment.NEXT_PUBLIC_SUPPORT_URL?.trim() || `mailto:${profile.support.email}`;
  try { const url = new URL(profile.support.url, profile.publicAppUrl); if (!/^https?:$/.test(url.protocol) && url.protocol !== "mailto:") profile.support.url = `mailto:${profile.support.email}`; } catch { profile.support.url = `mailto:${profile.support.email}`; }
  return Object.freeze(profile);
}

export function brandProfileErrors(profile: BrandProfile, production = process.env.NODE_ENV === "production") {
  const errors: string[] = [];
  if (!key.test(profile.key)) errors.push("brand profile key");
  if (!profile.assetVersion || /\s/.test(profile.assetVersion)) errors.push("brand asset version");
  if (!profile.customerLocales.includes(profile.defaultLocale)) errors.push("default customer locale");
  if (![profile.logo, profile.logoMark, profile.favicon, profile.pwa.standard, profile.pwa.maskable, profile.pwa.appleTouch, profile.socialImage].every((asset) => asset.src.startsWith("/") && !asset.src.includes("..") && /^\d+x\d+$/.test(asset.sizes))) errors.push("brand assets");
  if (!Object.values(profile.theme).every((color) => hex.test(color))) errors.push("brand colors");
  if (!contrast(profile.theme.text, profile.theme.background)) errors.push("brand text/background contrast");
  if (production && (profile.key === "test" || /placeholder|example|test/i.test(profile.logo.src))) errors.push("production placeholder asset/profile");
  return errors;
}

export const platformBrandProfile = createBrandProfile();
export const neutralBuyerBrandProfile = Object.freeze(createBrandProfile({
  NEXT_PUBLIC_BRAND_PROFILE_KEY: "northstar-sites", NEXT_PUBLIC_BRAND_ASSET_VERSION: "test-v1", NEXT_PUBLIC_PLATFORM_NAME: "Northstar Sites", NEXT_PUBLIC_PLATFORM_SHORT_NAME: "Northstar", NEXT_PUBLIC_PLATFORM_TAGLINE: "Sites for independent businesses.", NEXT_PUBLIC_PLATFORM_DESCRIPTION: "A neutral buyer fixture.", NEXT_PUBLIC_PLATFORM_MARK: "NS", NEXT_PUBLIC_PLATFORM_LOGO_URL: "/fixtures/northstar-logo.png", NEXT_PUBLIC_PLATFORM_LOGO_MARK_URL: "/fixtures/northstar-mark.png", NEXT_PUBLIC_PLATFORM_FAVICON_URL: "/fixtures/northstar-mark.png", NEXT_PUBLIC_PWA_ICON_URL: "/fixtures/northstar-mark.png", NEXT_PUBLIC_PWA_MASKABLE_ICON_URL: "/fixtures/northstar-mark.png", NEXT_PUBLIC_APPLE_TOUCH_ICON_URL: "/fixtures/northstar-mark.png", NEXT_PUBLIC_PLATFORM_SOCIAL_IMAGE_URL: "/fixtures/northstar-logo.png", NEXT_PUBLIC_SUPPORT_EMAIL: "support@northstar.example", NEXT_PUBLIC_SUPPORT_DISPLAY_NAME: "Northstar Support", INFORMATION_PRODUCT_NAME: "Northstar News", PUBLIC_APP_URL: "https://northstar.example", NEXT_PUBLIC_PLATFORM_LOCALE: "en", NEXT_PUBLIC_SUPPORTED_LOCALES: "en,de",
}));
