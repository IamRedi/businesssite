import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationCategoryPage } from "../../../../../components/information-site";
import { getCachedPublicInformationCategory } from "../../../../../lib/public-information-cache";
import { decodeArticleCursor } from "../../../../../lib/public-information-routing";
import { informationCategoryMetadata } from "../../../../../lib/public-information-seo";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string; categorySlug: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params;
  const result = await getCachedPublicInformationCategory(slug, categorySlug);
  return result
    ? informationCategoryMetadata(result.site, result.category)
    : { robots: { index: false, follow: false } };
}

export default async function PublicInformationCategoryRoute({ params, searchParams }: Props) {
  const [{ slug, categorySlug }, query] = await Promise.all([params, searchParams]);
  const result = await getCachedPublicInformationCategory(slug, categorySlug, decodeArticleCursor(query.cursor));
  if (!result) notFound();
  return <InformationCategoryPage site={result.site} category={result.category} articles={result.articles.items} nextCursor={result.articles.nextCursor} />;
}
