import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SitePrivacyPage } from "../../../components/site-privacy-page";
import { getCachedPublicSiteByDomain } from "../../../lib/public-site-cache";
import { trustedCustomerDomainHost } from "../../../lib/host-security";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const domain = trustedCustomerDomainHost((await headers()).get("host"));
  const site = domain ? await getCachedPublicSiteByDomain(domain) : null;
  return site ? { title: { absolute: `${site.content.name} — Privacy notice` }, robots: { index: true, follow: true } } : { robots: { index: false, follow: false } };
}

export default async function CustomerDomainPrivacyPage() {
  const host = trustedCustomerDomainHost((await headers()).get("host"));
  if (!host) notFound();
  const site = await getCachedPublicSiteByDomain(host);
  if (!site) notFound();
  return <SitePrivacyPage site={site} />;
}
