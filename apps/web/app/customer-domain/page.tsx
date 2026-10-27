import { headers } from "next/headers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationHome } from "../../components/information-site";
import { SitePreview } from "../../components/site-preview";
import { getCachedPublicInformationHomeByDomain } from "../../lib/public-information-cache";
import { informationHomeMetadata } from "../../lib/public-information-seo";
import { getCachedPublicSiteByDomain } from "../../lib/public-site-cache";
import { trustedCustomerDomainHost } from "../../lib/host-security";

export const dynamic = "force-dynamic";

async function requestDomain() {
  return trustedCustomerDomainHost((await headers()).get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  const domain = await requestDomain();
  if (!domain) return { robots: { index: false, follow: false } };
  const information = await getCachedPublicInformationHomeByDomain(domain);
  if (information) return informationHomeMetadata(information.site, { kind: "custom-domain", domain });
  const site = await getCachedPublicSiteByDomain(domain);
  return site ? { title: { absolute: site.content.name }, description: site.content.heroSubtitle || site.content.aboutBody, icons: site.media.logoUrl ? { icon: site.media.logoUrl } : { icon: [] }, openGraph: { images: site.media.logoUrl ? [site.media.logoUrl] : [] }, robots: { index: true, follow: true } } : {};
}

export default async function CustomerDomainSite() {
  const host = await requestDomain();
  if (!host) notFound();
  const information = await getCachedPublicInformationHomeByDomain(host);
  if (information)
    return <InformationHome site={information.site} articles={information.articles} target={{ kind: "custom-domain", domain: host }} />;
  const site = await getCachedPublicSiteByDomain(host);
  if (!site) notFound();
  return <SitePreview site={site} privacyHref="/privacy" />;
}
