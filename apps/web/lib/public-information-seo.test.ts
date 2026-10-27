import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicInformationArticle, PublicInformationSite } from "@platform/site-data";
import {
  informationArticleMetadata,
  informationAssetUrl,
  informationCategoryMetadata,
  informationHomeMetadata,
  informationRoutePath,
  informationRouteUrl,
  publicInformationUrl,
  safeJsonLd,
} from "./public-information-seo";

const site = { slug: "daily-signal", publicationName: "Daily Signal", tagline: "Clear reporting.", locale: "en", subcategory: "news", themeKey: "clarity", navigation: [], categories: [], adSlots: [], siteId: "site-1", updatedAt: "2026-08-19T10:00:00.000Z" } satisfies PublicInformationSite;
const article = { id: "a1", slug: "first-report", title: "First report", excerpt: "A verified summary.", tags: [], featured: true, publishedAt: "2026-08-19T10:00:00.000Z", body: { version: 1, blocks: [] }, articleMedia: [], sources: [], version: 1 } as PublicInformationArticle;

afterEach(() => vi.unstubAllEnvs());

describe("public information SEO", () => {
  it("builds canonical publication and article metadata", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://publisher.example/");
    expect(publicInformationUrl("/site/daily-signal")).toBe("https://publisher.example/site/daily-signal");
    expect(informationHomeMetadata(site).alternates?.canonical).toBe("https://publisher.example/site/daily-signal");
    expect(informationArticleMetadata(site, article).openGraph).toMatchObject({ type: "article" });
  });

  it("escapes JSON-LD markup boundaries", () => {
    expect(safeJsonLd({ title: "</script>" })).not.toContain("<");
  });

  it("uses clean custom-domain paths and URLs for metadata and structured data", () => {
    const target = { kind: "custom-domain" as const, domain: "News.Example" };
    const category = { id: "c1", name: "Reports", slug: "reports", sortOrder: 1 };
    expect(informationRoutePath(site, "", target)).toBe("/");
    expect(informationRoutePath(site, "articles/first-report", target)).toBe("/articles/first-report");
    expect(informationRouteUrl(site, "category/reports", target)).toBe("https://news.example/category/reports");
    expect(informationAssetUrl(site, "/api/media/image-1", target)).toBe("https://news.example/api/media/image-1");
    expect(informationHomeMetadata(site, target).alternates?.canonical).toBe("https://news.example/");
    expect(informationCategoryMetadata(site, category, target)).toMatchObject({
      title: { absolute: "Reports | Daily Signal" },
      openGraph: { url: "https://news.example/category/reports" },
    });
    expect(informationArticleMetadata(site, { ...article, canonicalUrl: "https://other.example/report" }, target)).toMatchObject({
      title: { absolute: "First report | Daily Signal" },
      alternates: { canonical: "https://news.example/articles/first-report" },
      openGraph: { url: "https://news.example/articles/first-report" },
    });
  });
});
