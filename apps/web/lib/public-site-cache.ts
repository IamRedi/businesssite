import "server-only";
import { cache } from "react";
import { revalidatePath, revalidateTag, unstable_cache, updateTag } from "next/cache";
import { PostgresSiteRepository } from "@platform/site-data";
import {
  normalizePublicSiteIdentity,
  publicSiteCacheTag,
  type PublicSiteIdentity,
} from "./public-site-cache-identity";

const revalidateSeconds = 300;

async function cachedPublicSite(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return null;
  const tag = publicSiteCacheTag(normalized);
  if (!tag) return null;
  const site = await unstable_cache(
    async () => {
      const sites = new PostgresSiteRepository({ boundary: "runtime" });
      return normalized.kind === "slug"
        ? sites.getPublicBySlug(normalized.value)
        : sites.getByVerifiedCustomDomain(normalized.value);
    },
    ["public-site-v1", normalized.kind, normalized.value],
    { revalidate: revalidateSeconds, tags: [tag] },
  )();
  if (!site) return null;
  // Re-run the same constrained resolver outside the shared cache so lifecycle,
  // publication or domain reassignment cannot serve a previously eligible
  // tenant until the five-minute content entry expires.
  const current = normalized.kind === "slug"
    ? await new PostgresSiteRepository({ boundary: "runtime" }).getPublicBySlug(normalized.value)
    : await new PostgresSiteRepository({ boundary: "runtime" }).getByVerifiedCustomDomain(normalized.value);
  if (!current) return null;
  return current.id === site.id ? site : current;
}

// Layout, metadata and page share one resolver result within a server render.
// React discards this memoization on the next request, so the fresh lifecycle
// check above still runs for every visitor request, including after unpublish.
// Primitive, normalized arguments keep slug/domain and tenant keys distinct.
const publicSiteForRender = cache((kind: PublicSiteIdentity["kind"], value: string) =>
  cachedPublicSite({ kind, value }),
);

function publicSiteForRequest(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  return normalized
    ? publicSiteForRender(normalized.kind, normalized.value)
    : Promise.resolve(null);
}

export function getCachedPublicSiteBySlug(slug: string) {
  return publicSiteForRequest({ kind: "slug", value: slug });
}

export function getCachedPublicSiteByDomain(domain: string) {
  return publicSiteForRequest({ kind: "domain", value: domain });
}

export function invalidatePublicSite(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return;
  const tag = publicSiteCacheTag(normalized);
  if (tag) revalidateTag(tag, "max");
  if (normalized.kind === "slug")
    revalidatePath(`/site/${normalized.value}`);
}

// Route Handlers cannot use updateTag. Customer Save must expire the exact
// tenant entry instead of serving one stale response while revalidating it.
export function expirePublicSiteFromRoute(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return;
  const tag = publicSiteCacheTag(normalized);
  if (tag) revalidateTag(tag, { expire: 0 });
  if (normalized.kind === "slug")
    revalidatePath(`/site/${normalized.value}`);
}

// Call only from Server Actions. Immediate expiry guarantees that the next
// public request observes the editorial write instead of one stale response.
export function expirePublicSiteAfterMutation(identity: PublicSiteIdentity) {
  const normalized = normalizePublicSiteIdentity(identity);
  if (!normalized) return;
  const tag = publicSiteCacheTag(normalized);
  if (tag) updateTag(tag);
  if (normalized.kind === "slug")
    revalidatePath(`/site/${normalized.value}`);
}

export async function expirePublicSiteAfterMutationById(sites: PostgresSiteRepository, siteId: string) {
  const { slug, customDomain } = await sites.getActorCacheIdentities(siteId);
  if (slug) expirePublicSiteAfterMutation({ kind: "slug", value: slug });
  if (customDomain) expirePublicSiteAfterMutation({ kind: "domain", value: customDomain });
}

export async function invalidatePublicSiteById(
  sites: PostgresSiteRepository,
  siteId: string,
) {
  const { slug, customDomain } = await sites.getBillingSystemCacheIdentities(siteId);
  if (slug) invalidatePublicSite({ kind: "slug", value: slug });
  if (customDomain)
    invalidatePublicSite({ kind: "domain", value: customDomain });
}
