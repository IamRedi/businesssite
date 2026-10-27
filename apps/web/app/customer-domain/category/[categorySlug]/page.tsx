import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { InformationCategoryPage } from "../../../../components/information-site";
import { getCachedPublicInformationCategoryByDomain } from "../../../../lib/public-information-cache";
import { decodeArticleCursor } from "../../../../lib/public-information-routing";
import { informationCategoryMetadata } from "../../../../lib/public-information-seo";
import { trustedCustomerDomainHost } from "../../../../lib/host-security";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

async function requestDomain() {
  return trustedCustomerDomainHost((await headers()).get("host"));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ categorySlug }, domain] = await Promise.all([params, requestDomain()]);
  if (!domain) return { robots: { index: false, follow: false } };
  const result = await getCachedPublicInformationCategoryByDomain(domain, categorySlug);
  return result
    ? informationCategoryMetadata(result.site, result.category, { kind: "custom-domain", domain })
    : { robots: { index: false, follow: false } };
}

export default async function CustomDomainInformationCategory({ params, searchParams }: Props) {
  const [{ categorySlug }, query, domain] = await Promise.all([params, searchParams, requestDomain()]);
  if (!domain) notFound();
  const result = await getCachedPublicInformationCategoryByDomain(domain, categorySlug, decodeArticleCursor(query.cursor));
  if (!result) notFound();
  return <InformationCategoryPage site={result.site} category={result.category} articles={result.articles.items} nextCursor={result.articles.nextCursor} target={{ kind: "custom-domain", domain }} />;
}
