import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicInformationArticle, PublicInformationSite } from "@platform/site-data";

vi.mock("server-only", () => ({}));

import { InformationArticlePage, InformationHome } from "./information-site";

const category = { id: "category-1", name: "Reports", slug: "reports", sortOrder: 0 };
const site = {
  siteId: "site-1",
  slug: "platform-publication",
  publicationName: "Domain Review",
  tagline: "Verified reporting.",
  subcategory: "news",
  locale: "en",
  themeKey: "clarity",
  navigation: [],
  updatedAt: "2026-08-19T10:00:00.000Z",
  categories: [category],
  adSlots: [
    { siteId: "site-1", slotKey: "home_after_featured", format: "leaderboard", enabled: true, updatedAt: "2026-08-19T10:00:00.000Z" },
    { siteId: "site-1", slotKey: "article_sidebar", format: "rectangle", enabled: true, updatedAt: "2026-08-19T10:00:00.000Z" },
  ],
  sponsorBanners: [{
    id: "banner-1", siteId: "site-1", slotKey: "home_after_featured", sponsorName: "Local Studio",
    headline: "Discover local craft", description: "A short introduction.", callToAction: "Visit business",
    destinationUrl: "https://sponsor.example/", imageMediaId: "image-3", imageUrl: "/api/media/image-3",
    enabled: true, sortOrder: 0, version: 1,
  }, {
    id: "banner-2", siteId: "site-1", slotKey: "article_sidebar", sponsorName: "Family Bakery",
    headline: "Fresh every morning", description: "Visit our bakery.", callToAction: "See the menu",
    destinationUrl: "https://bakery.example/", imageMediaId: "image-4", imageUrl: "/api/media/image-4", enabled: true, sortOrder: 0, version: 1,
  }],
} satisfies PublicInformationSite;
const article = {
  id: "article-1",
  slug: "verified-report",
  title: "Verified report",
  excerpt: "A careful summary.",
  tags: [],
  displayAuthor: "Editorial Desk",
  featured: true,
  publishedAt: "2026-08-19T10:00:00.000Z",
  category,
  featuredImageUrl: "/api/media/image-1",
  body: { version: 1, blocks: [{ type: "paragraph", text: "Confirmed facts." }] },
  articleMedia: [{ id: "image-2", url: "/api/media/image-2", altText: "Supporting evidence", width: 1200, height: 800 }],
  canonicalUrl: "https://unrelated.example/override",
  sources: [],
} satisfies PublicInformationArticle;
const target = { kind: "custom-domain" as const, domain: "news.example" };

describe("custom-domain information renderer", () => {
  it("renders clean root, article and category links", () => {
    const html = renderToStaticMarkup(<InformationHome site={site} articles={[article]} target={target} />);
    expect(html).toContain('href="/articles/verified-report"');
    expect(html).toContain('href="/category/reports"');
    expect(html).not.toContain("/site/platform-publication");
    expect(html).toContain('"url":"https://news.example/"');
    expect(html).toContain('data-ad-slot="home_after_featured"');
    expect(html).toContain('data-ad-format="leaderboard"');
    expect(html).toContain('href="https://sponsor.example/"');
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(html).toContain('src="/api/media/image-3"');
    expect(html).toContain("Advertisement · Local Studio");
    expect(html).toContain("information-world-desk");
    expect(html).not.toContain("<script src=");
  });

  it("uses the verified custom domain in article JSON-LD and share URLs", () => {
    const html = renderToStaticMarkup(<InformationArticlePage site={site} article={article} related={[]} target={target} />);
    expect(html).toContain('"mainEntityOfPage":"https://news.example/articles/verified-report"');
    expect(html).toContain('"image":["https://news.example/api/media/image-1"]');
    expect(html).toContain('src="/api/media/image-2"');
    expect(html).toContain("Supporting evidence");
    expect(html).toContain('data-ad-slot="article_sidebar"');
    expect(html).toContain('href="https://bakery.example/"');
    expect(html).toContain('src="/api/media/image-4"');
    expect(html).not.toContain('data-ad-slot="article_after_media"');
    expect(html).toContain(encodeURIComponent("https://news.example/articles/verified-report"));
    expect(html).not.toContain("https://unrelated.example/override");
  });

  it("does not show empty or disabled sponsor positions", () => {
    const html = renderToStaticMarkup(<InformationHome site={{ ...site, sponsorBanners: [] }} articles={[article]} />);
    expect(html).not.toContain('data-ad-slot="home_after_featured"');
    expect(html).not.toContain("sponsor.example");
  });
});
