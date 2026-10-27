import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  getPublicSiteByDomain: vi.fn(),
  listPublicArticlesByDomain: vi.fn(),
  getPublicArticleByDomain: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((callback: () => unknown) => callback) }));
vi.mock("@platform/site-data", () => ({
  PostgresInformationRepository: class {
    getPublicSiteByDomain = repositoryMocks.getPublicSiteByDomain;
    listPublicArticlesByDomain = repositoryMocks.listPublicArticlesByDomain;
    getPublicArticleByDomain = repositoryMocks.getPublicArticleByDomain;
  },
}));

import {
  getCachedPublicInformationArticleByDomain,
  getCachedPublicInformationCategoryByDomain,
  getCachedPublicInformationHomeByDomain,
} from "./public-information-cache";

const category = { id: "category-1", name: "Reports", slug: "reports", sortOrder: 0 };
const site = { siteId: "site-1", slug: "publication", categories: [category] };
const article = { id: "article-1", slug: "verified-report", category };

describe("custom-domain information cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMocks.getPublicSiteByDomain.mockResolvedValue(site);
    repositoryMocks.listPublicArticlesByDomain.mockResolvedValue({ items: [article] });
    repositoryMocks.getPublicArticleByDomain.mockResolvedValue(article);
  });

  it("uses only normalized domain-scoped repository reads", async () => {
    await expect(getCachedPublicInformationHomeByDomain("WWW.News.Example")).resolves.toEqual({ site, articles: [article] });
    expect(repositoryMocks.getPublicSiteByDomain).toHaveBeenCalledWith("news.example");
    expect(repositoryMocks.listPublicArticlesByDomain).toHaveBeenCalledWith({ domain: "news.example", featuredFirst: true, limit: 25 });
  });

  it("keeps article and category reads on the same domain identity", async () => {
    await expect(getCachedPublicInformationArticleByDomain("news.example", "verified-report")).resolves.toMatchObject({ site, article });
    expect(repositoryMocks.getPublicArticleByDomain).toHaveBeenCalledWith("news.example", "verified-report");
    await expect(getCachedPublicInformationCategoryByDomain("news.example", "reports")).resolves.toMatchObject({ site, category });
    expect(repositoryMocks.listPublicArticlesByDomain).toHaveBeenLastCalledWith({ domain: "news.example", categorySlug: "reports", publishedBefore: undefined, limit: 12 });
  });

  it("rejects ambiguous domains and unsafe slugs before repository access", async () => {
    await expect(getCachedPublicInformationHomeByDomain("news.example,attacker.example")).resolves.toBeNull();
    await expect(getCachedPublicInformationArticleByDomain("news.example", "../owner")).resolves.toBeNull();
    expect(repositoryMocks.getPublicArticleByDomain).not.toHaveBeenCalled();
  });
});
