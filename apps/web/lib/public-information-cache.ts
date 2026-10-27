import "server-only";
import { unstable_cache } from "next/cache";
import { PostgresInformationRepository } from "@platform/site-data";
import {
  normalizePublicSiteIdentity,
  publicSiteCacheTag,
  type PublicSiteIdentity,
} from "./public-site-cache-identity";
import { normalizeEditorialSlug } from "./public-information-routing";

const revalidateSeconds = 300;

function informationCache<T>(identity: PublicSiteIdentity, key: string[], query: () => Promise<T>) {
  const tag = publicSiteCacheTag(identity);
  if (!tag) return Promise.resolve(null);
  return unstable_cache(query, ["public-information-v2", identity.kind, identity.value, ...key], {
    revalidate: revalidateSeconds,
    tags: [tag],
  })();
}

async function getCachedPublicInformationHomeByIdentity(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return null;
  return informationCache(normalized, ["home"], async () => {
    const repository = new PostgresInformationRepository({ boundary: "public" });
    const site = normalized.kind === "slug"
      ? await repository.getPublicSiteBySlug(normalized.value)
      : await repository.getPublicSiteByDomain(normalized.value);
    if (!site) return null;
    const articles = normalized.kind === "slug"
      ? await repository.listPublicArticlesBySlug({ siteSlug: normalized.value, featuredFirst: true, limit: 25 })
      : await repository.listPublicArticlesByDomain({ domain: normalized.value, featuredFirst: true, limit: 25 });
    return { site, articles: articles.items };
  });
}

async function getCachedPublicInformationCategoryByIdentity(
  identity: PublicSiteIdentity,
  categorySlug: string,
  cursor?: { publishedAt: string; id: string },
) {
  const normalized = normalizePublicSiteIdentity(identity);
  const category = normalizeEditorialSlug(categorySlug);
  if (!normalized || !category) return null;
  return informationCache(
    normalized,
    ["category", category, cursor?.publishedAt ?? "first", cursor?.id ?? "first"],
    async () => {
      const repository = new PostgresInformationRepository({ boundary: "public" });
      const site = normalized.kind === "slug"
        ? await repository.getPublicSiteBySlug(normalized.value)
        : await repository.getPublicSiteByDomain(normalized.value);
      const selectedCategory = site?.categories.find((item) => item.slug === category);
      if (!site || !selectedCategory) return null;
      const filters = { categorySlug: category, publishedBefore: cursor, limit: 12 };
      const articles = normalized.kind === "slug"
        ? await repository.listPublicArticlesBySlug({ siteSlug: normalized.value, ...filters })
        : await repository.listPublicArticlesByDomain({ domain: normalized.value, ...filters });
      return { site, category: selectedCategory, articles };
    },
  );
}

async function getCachedPublicInformationArticleByIdentity(identity: PublicSiteIdentity, articleSlug: string) {
  const normalized = normalizePublicSiteIdentity(identity);
  const article = normalizeEditorialSlug(articleSlug);
  if (!normalized || !article) return null;
  return informationCache(normalized, ["article", article], async () => {
    const repository = new PostgresInformationRepository({ boundary: "public" });
    const [site, item] = await Promise.all([
      normalized.kind === "slug"
        ? repository.getPublicSiteBySlug(normalized.value)
        : repository.getPublicSiteByDomain(normalized.value),
      normalized.kind === "slug"
        ? repository.getPublicArticleBySlug(normalized.value, article)
        : repository.getPublicArticleByDomain(normalized.value, article),
    ]);
    if (!site || !item) return null;
    const filters = { categorySlug: item.category?.slug, limit: 5 };
    const related = normalized.kind === "slug"
      ? await repository.listPublicArticlesBySlug({ siteSlug: normalized.value, ...filters })
      : await repository.listPublicArticlesByDomain({ domain: normalized.value, ...filters });
    return {
      site,
      article: item,
      related: related.items.filter((candidate) => candidate.id !== item.id).slice(0, 3),
    };
  });
}

export function getCachedPublicInformationHome(slug: string) {
  return getCachedPublicInformationHomeByIdentity({ kind: "slug", value: slug });
}

export function getCachedPublicInformationHomeByDomain(domain: string) {
  return getCachedPublicInformationHomeByIdentity({ kind: "domain", value: domain });
}

export function getCachedPublicInformationCategory(slug: string, categorySlug: string, cursor?: { publishedAt: string; id: string }) {
  return getCachedPublicInformationCategoryByIdentity({ kind: "slug", value: slug }, categorySlug, cursor);
}

export function getCachedPublicInformationCategoryByDomain(domain: string, categorySlug: string, cursor?: { publishedAt: string; id: string }) {
  return getCachedPublicInformationCategoryByIdentity({ kind: "domain", value: domain }, categorySlug, cursor);
}

export function getCachedPublicInformationArticle(slug: string, articleSlug: string) {
  return getCachedPublicInformationArticleByIdentity({ kind: "slug", value: slug }, articleSlug);
}

export function getCachedPublicInformationArticleByDomain(domain: string, articleSlug: string) {
  return getCachedPublicInformationArticleByIdentity({ kind: "domain", value: domain }, articleSlug);
}
