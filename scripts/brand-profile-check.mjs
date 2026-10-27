import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const assetNames = ["NEXT_PUBLIC_PLATFORM_LOGO_URL", "NEXT_PUBLIC_PLATFORM_LOGO_MARK_URL", "NEXT_PUBLIC_PLATFORM_FAVICON_URL", "NEXT_PUBLIC_PWA_ICON_URL", "NEXT_PUBLIC_PWA_MASKABLE_ICON_URL", "NEXT_PUBLIC_APPLE_TOUCH_ICON_URL", "NEXT_PUBLIC_PLATFORM_SOCIAL_IMAGE_URL"];
const defaults = {
  NEXT_PUBLIC_PLATFORM_LOGO_URL: "/images/brand/businesssite-logo-horizontal-v3.png",
  NEXT_PUBLIC_PLATFORM_LOGO_MARK_URL: "/images/brand/businesssite-logo.png",
  NEXT_PUBLIC_PLATFORM_FAVICON_URL: "/images/brand/businesssite-logo.png",
  NEXT_PUBLIC_PWA_ICON_URL: "/images/brand/businesssite-logo.png",
  NEXT_PUBLIC_PWA_MASKABLE_ICON_URL: "/images/brand/businesssite-logo.png",
  NEXT_PUBLIC_APPLE_TOUCH_ICON_URL: "/images/brand/businesssite-logo.png",
  NEXT_PUBLIC_PLATFORM_SOCIAL_IMAGE_URL: "/images/brand/businesssite-logo-horizontal-v3.png",
};
const pngSize = (file) => { const data = readFileSync(file); return data.subarray(1, 4).toString() === "PNG" ? `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}` : null; };

export function brandProfileEnvironmentErrors(environment = process.env, { production = environment.NODE_ENV === "production" || environment.RELEASE_TARGET === "production" } = {}) {
  const errors = [];
  const key = environment.NEXT_PUBLIC_BRAND_PROFILE_KEY?.trim() || "businesssite-rc";
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(key)) errors.push("NEXT_PUBLIC_BRAND_PROFILE_KEY");
  if (!/^[^\s]+$/.test(environment.NEXT_PUBLIC_BRAND_ASSET_VERSION?.trim() || "2026-08-24")) errors.push("NEXT_PUBLIC_BRAND_ASSET_VERSION");
  for (const name of assetNames) {
    const asset = environment[name]?.trim() || defaults[name];
    if (!asset.startsWith("/") || asset.includes("..") || /[?#\\]/.test(asset)) { errors.push(`${name} (local root-relative asset required)`); continue; }
    const file = resolve(import.meta.dirname, "../apps/web/public", `.${asset}`);
    if (!existsSync(file)) { errors.push(`${name} (missing ${asset})`); continue; }
    if (asset.endsWith(".png") && !pngSize(file)) errors.push(`${name} (PNG MIME/header)`);
    if (production && /(?:placeholder|fixture|test)/i.test(asset)) errors.push(`${name} (production placeholder/test asset)`);
  }
  for (const name of ["NEXT_PUBLIC_BRAND_PRIMARY", "NEXT_PUBLIC_BRAND_ACCENT", "NEXT_PUBLIC_BRAND_BACKGROUND", "NEXT_PUBLIC_BRAND_TEXT"])
    if (environment[name]?.trim() && !/^#[0-9a-f]{6}$/i.test(environment[name])) errors.push(`${name} (six-digit hex)`);
  if (production && (!environment.NEXT_PUBLIC_PLATFORM_NAME?.trim() || !environment.NEXT_PUBLIC_SUPPORT_EMAIL?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))) errors.push("production platform name/support email");
  // A buyer cannot silently inherit BusinessSite RC artwork. The first-party
  // profile is the only production profile allowed to rely on bundled defaults.
  if (production && key !== "businesssite-rc") {
    for (const name of assetNames) if (!environment[name]?.trim()) errors.push(`${name} (required for buyer production profile)`);
    for (const name of ["NEXT_PUBLIC_PLATFORM_NAME", "NEXT_PUBLIC_PLATFORM_SHORT_NAME", "NEXT_PUBLIC_PLATFORM_DESCRIPTION", "NEXT_PUBLIC_SUPPORT_EMAIL"])
      if (!environment[name]?.trim()) errors.push(`${name} (required for buyer production profile)`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = brandProfileEnvironmentErrors();
  if (errors.length) { console.error(`Invalid brand profile: ${errors.join(", ")}`); process.exitCode = 1; }
  else console.log("Brand profile assets and configuration passed.");
}
