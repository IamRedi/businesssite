import type { SiteKind, SupportedLocale, ThemeSelection } from "./contracts";

export const INFORMATION_SITE_KIND: SiteKind = "information";

export const informationSubcategories = [
  "news",
  "technology_ai",
  "science",
  "magazine",
  "blog",
  "local_news",
  "industry_news",
  "general_information",
] as const;

export type InformationSubcategory = (typeof informationSubcategories)[number];

export const articleStatuses = ["draft", "pending", "published", "archived"] as const;
export type ArticleStatus = (typeof articleStatuses)[number];

export type ArticleContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; style: "ordered" | "unordered"; items: string[] }
  | { type: "quote"; text: string; attribution?: string };

export type ArticleContent = {
  version: 1;
  blocks: ArticleContentBlock[];
};

export type InformationArticleMedia = {
  id: string;
  url: string;
  altText?: string;
  width?: number;
  height?: number;
};

export const informationAdSlotKeys = [
  "home_after_featured",
  "category_before_feed",
  "article_after_media",
  "article_sidebar",
] as const;
export type InformationAdSlotKey = (typeof informationAdSlotKeys)[number];

export const informationAdFormats = ["auto", "leaderboard", "rectangle", "in_feed"] as const;
export type InformationAdFormat = (typeof informationAdFormats)[number];

export type InformationAdSlot = {
  siteId: string;
  slotKey: InformationAdSlotKey;
  format: InformationAdFormat;
  enabled: boolean;
  updatedAt: string;
};

export type InformationSponsorBanner = {
  id: string;
  siteId: string;
  slotKey: InformationAdSlotKey;
  sponsorName: string;
  headline: string;
  description: string;
  callToAction: string;
  destinationUrl: string;
  imageMediaId?: string;
  imageUrl?: string;
  enabled: boolean;
  sortOrder: number;
  version: number;
};

export type InformationSiteSettings = {
  siteId: string;
  publicationName: string;
  tagline?: string;
  subcategory: InformationSubcategory;
  locale: SupportedLocale;
  themeKey: ThemeSelection;
  navigation: Array<{ label: string; categorySlug?: string; href?: string }>;
  updatedAt: string;
};

export type InformationArticle = {
  id: string;
  siteId: string;
  categoryId?: string;
  externalSource: "site_admin" | "owner" | "redi_control";
  externalReference?: string;
  slug: string;
  title: string;
  excerpt: string;
  body: ArticleContent;
  featuredMediaId?: string;
  featuredImageAlt?: string;
  articleMedia: InformationArticleMedia[];
  tags: string[];
  displayAuthor?: string;
  status: ArticleStatus;
  featured: boolean;
  publishAt?: string;
  publishedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  sources: Array<{ label?: string; url: string; sortOrder: number }>;
};

const transitions: Record<ArticleStatus, readonly ArticleStatus[]> = {
  draft: ["pending", "published", "archived"],
  pending: ["draft", "published", "archived"],
  published: ["archived"],
  archived: ["draft", "published"],
};

export function canTransitionArticleStatus(from: ArticleStatus, to: ArticleStatus) {
  return from === to || transitions[from].includes(to);
}
