import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InformationArticlePage } from "../../../../components/information-site";
import { getCachedPublicInformationArticleByDomain } from "../../../../lib/public-information-cache";
import { informationArticleMetadata } from "../../../../lib/public-information-seo";
import { trustedCustomerDomainHost } from "../../../../lib/host-security";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ articleSlug: string }> };

async function requestDomain() {
  return trustedCustomerDomainHost((await headers()).get("host"));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ articleSlug }, domain] = await Promise.all([params, requestDomain()]);
  if (!domain) return { robots: { index: false, follow: false } };
  const result = await getCachedPublicInformationArticleByDomain(domain, articleSlug);
  return result
    ? informationArticleMetadata(result.site, result.article, { kind: "custom-domain", domain })
    : { robots: { index: false, follow: false } };
}

export default async function CustomDomainInformationArticle({ params }: Props) {
  const [{ articleSlug }, domain] = await Promise.all([params, requestDomain()]);
  if (!domain) notFound();
  const result = await getCachedPublicInformationArticleByDomain(domain, articleSlug);
  if (!result) notFound();
  return <InformationArticlePage site={result.site} article={result.article} related={result.related} target={{ kind: "custom-domain", domain }} />;
}
