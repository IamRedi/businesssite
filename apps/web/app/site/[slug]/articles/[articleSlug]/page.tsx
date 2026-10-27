import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InformationArticlePage } from "../../../../../components/information-site";
import { getCachedPublicInformationArticle } from "../../../../../lib/public-information-cache";
import { informationArticleMetadata } from "../../../../../lib/public-information-seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; articleSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, articleSlug } = await params;
  const result = await getCachedPublicInformationArticle(slug, articleSlug);
  return result
    ? informationArticleMetadata(result.site, result.article)
    : { robots: { index: false, follow: false } };
}

export default async function PublicInformationArticleRoute({ params }: Props) {
  const { slug, articleSlug } = await params;
  const result = await getCachedPublicInformationArticle(slug, articleSlug);
  if (!result) notFound();
  return <InformationArticlePage site={result.site} article={result.article} related={result.related} />;
}
