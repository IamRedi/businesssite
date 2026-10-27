import { platformBrandProfile } from "../../../lib/brand-profile";

export const dynamic = "force-static";

export function GET() {
  const { pwa } = platformBrandProfile;
  return Response.json({
    id: `/site-admin/${platformBrandProfile.key}`,
    name: `${platformBrandProfile.displayName} Website Admin`,
    short_name: platformBrandProfile.shortName,
    description: platformBrandProfile.description,
    start_url: "/site-admin/login",
    scope: "/site-admin/",
    display: "standalone",
    background_color: platformBrandProfile.theme.background,
    theme_color: platformBrandProfile.theme.primary,
    icons: [
      { src: pwa.standard.src, sizes: pwa.standard.sizes, type: pwa.standard.type },
      { src: pwa.maskable.src, sizes: pwa.maskable.sizes, type: pwa.maskable.type, purpose: "maskable" },
      { src: pwa.appleTouch.src, sizes: pwa.appleTouch.sizes, type: pwa.appleTouch.type },
    ],
  }, { headers: { "Cache-Control": `public, max-age=0, must-revalidate`, "Content-Type": "application/manifest+json" } });
}
