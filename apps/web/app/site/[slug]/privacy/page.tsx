import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePrivacyPage } from "../../../../components/site-privacy-page";
import { getCachedPublicSiteBySlug } from "../../../../lib/public-site-cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCachedPublicSiteBySlug(slug);
  return site ? { title: { absolute: `${site.content.name} — Privacy notice` }, robots: { index: true, follow: true } } : {};
}

export default async function PublicSitePrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getCachedPublicSiteBySlug(slug);
  if (!site) notFound();
  return <SitePrivacyPage site={site} />;
}
