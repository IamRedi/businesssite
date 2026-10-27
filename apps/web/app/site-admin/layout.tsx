import type { Metadata } from "next";
import { platformBrandProfile } from "../../lib/brand-profile";

// The PWA is deliberately advertised only inside the customer-admin boundary.
// Generated customer sites, previews, custom domains, and owner routes inherit
// no manifest link and cannot be installed as the platform application.
export const metadata: Metadata = {
  manifest: `/site-admin/manifest.webmanifest?v=${encodeURIComponent(`${platformBrandProfile.key}-${platformBrandProfile.assetVersion}`)}`,
  robots: { index: false, follow: false },
};

export default function SiteAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
