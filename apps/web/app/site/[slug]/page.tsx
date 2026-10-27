import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationHome } from "../../../components/information-site";
import { SitePreview } from "../../../components/site-preview";
import { getCachedPublicInformationHome } from "../../../lib/public-information-cache";
import { informationHomeMetadata } from "../../../lib/public-information-seo";
import { getCachedPublicSiteBySlug } from "../../../lib/public-site-cache";

// The root layout resolves the visitor locale from cookies. Keep the route
// request-bound while the site document itself remains cached and tagged by
// getCachedPublicSiteBySlug.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const information = await getCachedPublicInformationHome(slug);
  if (information) return informationHomeMetadata(information.site);
  const site = await getCachedPublicSiteBySlug(slug);
  return site ? { title: { absolute: site.content.name }, description: site.content.heroSubtitle || site.content.aboutBody, icons: site.media.logoUrl ? { icon: site.media.logoUrl } : { icon: [] }, openGraph: { images: site.media.logoUrl ? [site.media.logoUrl] : [] }, robots: { index: true, follow: true } } : {};
}

export default async function PublicSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const information = await getCachedPublicInformationHome(slug);
  if (information)
    return <InformationHome site={information.site} articles={information.articles} />;
  const site = await getCachedPublicSiteBySlug(slug);
  if (!site) notFound();
  return <SitePreview site={site} />;
}
