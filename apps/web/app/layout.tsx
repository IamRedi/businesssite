import type { Metadata } from "next";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import "./styles.css";
import { platformConfig } from "../lib/platform-config";
import { platformBrandProfile } from "../lib/brand-profile";
import { SiteAdminInstallPrompt } from "../components/site-admin-install-prompt";
import { trustedCustomerDomainHost } from "../lib/host-security";
import { getCachedPublicInformationHomeByDomain } from "../lib/public-information-cache";
import { getCachedPublicInformationHome } from "../lib/public-information-cache";
import { getCachedPublicSiteByDomain, getCachedPublicSiteBySlug } from "../lib/public-site-cache";
import { documentBoundaryHeader, parseDocumentBoundary } from "../lib/document-locale-boundary";
import { ownerPanelLocale, type CustomerUiLocale, type WebsiteContentLocale } from "../lib/locale-model";
import { PostgresSiteRepository } from "@platform/site-data";
import { previewTokenId } from "../lib/preview-token";
import { requireSiteAdmin } from "../lib/site-admin-auth";

export async function generateMetadata(): Promise<Metadata> {
  const boundary = parseDocumentBoundary((await headers()).get(documentBoundaryHeader));
  const domain = boundary?.kind === "domain" ? trustedCustomerDomainHost(boundary.value) : null;
  const metadataBase = new URL(domain ? `https://${domain}` : platformBrandProfile.publicAppUrl);
  // Public business and custom-domain pages own their metadata/icons. Do not
  // inherit a platform favicon or Open Graph image into customer identity.
  if (boundary?.kind === "site" || boundary?.kind === "domain" || boundary?.kind === "preview")
    return { metadataBase, icons: { icon: [] }, openGraph: { images: [] } };
  return {
    metadataBase,
    title: { default: platformConfig.brand.name, template: `%s | ${platformConfig.brand.name}` },
    description: platformConfig.brand.description,
    icons: { icon: platformBrandProfile.favicon.src, apple: platformBrandProfile.pwa.appleTouch.src },
    openGraph: { images: [platformBrandProfile.socialImage.src] },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const boundary = parseDocumentBoundary(requestHeaders.get(documentBoundaryHeader));
  let locale: CustomerUiLocale | WebsiteContentLocale = "en";
  if (boundary?.kind === "owner") locale = ownerPanelLocale;
  else if (boundary?.kind === "platform") locale = boundary.locale;
  else if (boundary?.kind === "site") {
    const information = await getCachedPublicInformationHome(boundary.value);
    const business = information ? null : await getCachedPublicSiteBySlug(boundary.value);
    locale = information?.site.locale ?? business?.locale ?? "en";
  } else if (boundary?.kind === "domain") {
    const requestHost = trustedCustomerDomainHost(boundary.value);
    const information = requestHost ? await getCachedPublicInformationHomeByDomain(requestHost) : null;
    const business = requestHost && !information ? await getCachedPublicSiteByDomain(requestHost) : null;
    locale = information?.site.locale ?? business?.locale ?? "en";
  } else if (boundary?.kind === "site-admin") {
    const account = await requireSiteAdmin(boundary.value);
    locale = account?.preferredLocale ?? "en";
  } else if (boundary?.kind === "preview") {
    const tokenId = previewTokenId(boundary.value);
    const site = tokenId ? await new PostgresSiteRepository({ boundary: "runtime" }).getByPreviewTokenId(tokenId) : null;
    locale = site?.locale ?? "en";
  }
  const theme = {
    "--brand-primary": platformConfig.theme.primary,
    "--brand-accent": platformConfig.theme.accent,
    "--brand-background": platformConfig.theme.background,
    "--brand-text": platformConfig.theme.text,
  } as CSSProperties;
  return (
    <html lang={locale}>
      <head>
        {platformConfig.theme.stylesheetUrl ? (
          <link rel="stylesheet" href={platformConfig.theme.stylesheetUrl} />
        ) : null}
      </head>
      <body style={theme}>{children}<SiteAdminInstallPrompt /></body>
    </html>
  );
}
