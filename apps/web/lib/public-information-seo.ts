import type { Metadata } from "next";
import type { PublicInformationArticle, PublicInformationCategory, PublicInformationSite } from "@platform/site-data";
import { normalizePublicSiteIdentity } from "./public-site-cache-identity";

export type InformationRouteTarget =
  | { kind: "platform" }
  | { kind: "custom-domain"; domain: string };

function canonicalOrigin() {
  const configured = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  return configured && /^https?:\/\//i.test(configured) ? configured : "http://localhost:3000";
}

export function publicInformationUrl(path: string, origin = canonicalOrigin()) {
  return new URL(path.startsWith("/") ? path : `/${path}`, origin).toString();
}

function customDomainOrigin(domain: string) {
  const normalized = normalizePublicSiteIdentity({ kind: "domain", value: domain });
  return normalized ? `https://${normalized.value}` : null;
}

export function informationRoutePath(
  site: PublicInformationSite,
  suffix = "",
  target: InformationRouteTarget = { kind: "platform" },
) {
  const normalizedSuffix = suffix ? `/${suffix.replace(/^\/+/, "")}` : "";
  return target.kind === "custom-domain"
    ? normalizedSuffix || "/"
    : `/site/${site.slug}${normalizedSuffix}`;
}

export function informationRouteUrl(
  site: PublicInformationSite,
  suffix = "",
  target: InformationRouteTarget = { kind: "platform" },
) {
  const origin = target.kind === "custom-domain" ? customDomainOrigin(target.domain) : canonicalOrigin();
  if (!origin) throw new Error("Invalid information-site domain.");
  return publicInformationUrl(informationRoutePath(site, suffix, target), origin);
}

export function informationAssetUrl(
  site: PublicInformationSite,
  assetUrl: string,
  target: InformationRouteTarget = { kind: "platform" },
) {
  return new URL(assetUrl, informationRouteUrl(site, "", target)).toString();
}

export function informationHomeMetadata(site: PublicInformationSite, target?: InformationRouteTarget): Metadata {
  const canonical = informationRouteUrl(site, "", target);
  const description = site.tagline || `${site.publicationName} — ${site.subcategory.replaceAll("_", " ")}`;
  return {
    title: { absolute: site.publicationName },
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, siteName: site.publicationName, title: site.publicationName, description },
    twitter: { card: "summary", title: site.publicationName, description },
  };
}

export function informationCategoryMetadata(site: PublicInformationSite, category: PublicInformationCategory, target?: InformationRouteTarget): Metadata {
  const canonical = informationRouteUrl(site, `category/${category.slug}`, target);
  const description = category.description || `${category.name} — ${site.publicationName}`;
  const title = `${category.name} | ${site.publicationName}`;
  return {
    title: target?.kind === "custom-domain" ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: canonical, siteName: site.publicationName, title: category.name, description },
  };
}

export function informationArticleMetadata(site: PublicInformationSite, article: PublicInformationArticle, target: InformationRouteTarget = { kind: "platform" }): Metadata {
  const routeCanonical = informationRouteUrl(site, `articles/${article.slug}`, target);
  const canonical = target.kind === "custom-domain" ? routeCanonical : article.canonicalUrl || routeCanonical;
  const title = article.seoTitle || article.title;
  const brandedTitle = `${title} | ${site.publicationName}`;
  const description = article.seoDescription || article.excerpt;
  const images = article.featuredImageUrl ? [{ url: informationAssetUrl(site, article.featuredImageUrl, target), alt: article.featuredImageAlt || article.title }] : undefined;
  return {
    title: target.kind === "custom-domain" ? { absolute: brandedTitle } : brandedTitle,
    description,
    alternates: { canonical },
    authors: article.displayAuthor ? [{ name: article.displayAuthor }] : undefined,
    category: article.category?.name,
    openGraph: { type: "article", url: canonical, siteName: site.publicationName, title, description, publishedTime: article.publishedAt, authors: article.displayAuthor ? [article.displayAuthor] : undefined, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((image) => image.url) },
  };
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
