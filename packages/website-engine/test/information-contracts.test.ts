import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_KIND,
  canTransitionArticleStatus,
  informationAdFormats,
  informationAdSlotKeys,
  informationSubcategories,
} from "../src/index";

describe("information website contracts", () => {
  it("keeps existing sites on the business kind by default", () => {
    expect(DEFAULT_SITE_KIND).toBe("business");
  });

  it("registers reusable editorial subcategories without tenant-specific values", () => {
    expect(informationSubcategories).toEqual([
      "news",
      "technology_ai",
      "science",
      "magazine",
      "blog",
      "local_news",
      "industry_news",
      "general_information",
    ]);
  });

  it("allows explicit editorial lifecycle transitions only", () => {
    expect(canTransitionArticleStatus("draft", "published")).toBe(true);
    expect(canTransitionArticleStatus("published", "draft")).toBe(false);
    expect(canTransitionArticleStatus("published", "archived")).toBe(true);
    expect(canTransitionArticleStatus("archived", "published")).toBe(true);
  });

  it("exposes a fixed provider-neutral ad-slot vocabulary", () => {
    expect(informationAdSlotKeys).toEqual([
      "home_after_featured",
      "category_before_feed",
      "article_after_media",
      "article_sidebar",
    ]);
    expect(informationAdFormats).toEqual(["auto", "leaderboard", "rectangle", "in_feed"]);
  });
});
