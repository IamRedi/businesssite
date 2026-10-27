import {
  articleStatuses,
  type ArticleContent,
  type ArticleStatus,
} from "@platform/website-engine";
import type { InformationArticle } from "@platform/website-engine";
import type { ArticleSummary, CreateArticleInput, UpdateArticleInput } from "@platform/site-data";

export class RediContractError extends Error {
  constructor(public readonly field: string, message = "Invalid request schema.") {
    super(message);
    this.name = "RediContractError";
  }
}

type RecordValue = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function record(value: unknown, field: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RediContractError(field);
  return value as RecordValue;
}

function exact(value: RecordValue, allowed: readonly string[], field: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new RediContractError(field, "Unknown request field.");
}

function text(value: unknown, field: string, maximum: number, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new RediContractError(field);
    return undefined;
  }
  if (typeof value !== "string") throw new RediContractError(field);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) throw new RediContractError(field);
  return normalized || undefined;
}

function identifier(value: unknown, field: string, required = false) {
  const parsed = text(value, field, 36, required);
  if (parsed && !uuid.test(parsed)) throw new RediContractError(field);
  return parsed;
}

function optionalBoolean(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new RediContractError(field);
  return value;
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return value === null ? null : undefined;
  const parsed = text(value, field, 50, true)!;
  if (Number.isNaN(Date.parse(parsed))) throw new RediContractError(field);
  return new Date(parsed).toISOString();
}

function stringArray(value: unknown, field: string, maximumItems: number, maximumText: number) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximumItems) throw new RediContractError(field);
  return value.map((item, index) => text(item, `${field}.${index}`, maximumText, true)!);
}

function parseContent(value: unknown): ArticleContent {
  const body = record(value, "body");
  exact(body, ["version", "blocks"], "body");
  if (body.version !== 1 || !Array.isArray(body.blocks) || body.blocks.length > 200) throw new RediContractError("body");
  const blocks = body.blocks.map((candidate, index) => {
    const block = record(candidate, `body.blocks.${index}`);
    const type = text(block.type, `body.blocks.${index}.type`, 20, true);
    if (type === "paragraph") {
      exact(block, ["type", "text"], `body.blocks.${index}`);
      return { type, text: text(block.text, `body.blocks.${index}.text`, 10_000, true)! } as const;
    }
    if (type === "heading") {
      exact(block, ["type", "level", "text"], `body.blocks.${index}`);
      if (block.level !== 2 && block.level !== 3) throw new RediContractError(`body.blocks.${index}.level`);
      return { type, level: block.level, text: text(block.text, `body.blocks.${index}.text`, 500, true)! } as const;
    }
    if (type === "list") {
      exact(block, ["type", "style", "items"], `body.blocks.${index}`);
      if (block.style !== "ordered" && block.style !== "unordered") throw new RediContractError(`body.blocks.${index}.style`);
      const items = stringArray(block.items, `body.blocks.${index}.items`, 100, 2_000);
      if (!items?.length) throw new RediContractError(`body.blocks.${index}.items`);
      return { type, style: block.style, items } as const;
    }
    if (type === "quote") {
      exact(block, ["type", "text", "attribution"], `body.blocks.${index}`);
      return { type, text: text(block.text, `body.blocks.${index}.text`, 5_000, true)!, attribution: text(block.attribution, `body.blocks.${index}.attribution`, 500) } as const;
    }
    throw new RediContractError(`body.blocks.${index}.type`);
  });
  return { version: 1, blocks };
}

function parseSources(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 50) throw new RediContractError("sources");
  return value.map((candidate, index) => {
    const source = record(candidate, `sources.${index}`);
    exact(source, ["label", "url"], `sources.${index}`);
    const url = text(source.url, `sources.${index}.url`, 2_000, true)!;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch { throw new RediContractError(`sources.${index}.url`); }
    return { label: text(source.label, `sources.${index}.label`, 300), url };
  });
}

const articleFields = [
  "categoryId", "slug", "title", "excerpt", "body", "featuredMediaId", "articleMediaIds",
  "featuredImageAlt", "tags", "displayAuthor", "featured", "publishAt", "seoTitle",
  "seoDescription", "canonicalUrl", "sources",
] as const;

function parseArticleFields(value: RecordValue, partial: boolean) {
  exact(value, articleFields, "article");
  const slug = text(value.slug, "slug", 180, !partial);
  if (slug && !slugPattern.test(slug)) throw new RediContractError("slug");
  const canonicalUrl = text(value.canonicalUrl, "canonicalUrl", 2_000);
  if (canonicalUrl) {
    try {
      const parsed = new URL(canonicalUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch { throw new RediContractError("canonicalUrl"); }
  }
  return {
    ...(value.categoryId !== undefined ? { categoryId: value.categoryId === null ? null : identifier(value.categoryId, "categoryId", true) } : {}),
    ...(slug !== undefined ? { slug } : {}),
    ...(value.title !== undefined || !partial ? { title: text(value.title, "title", 240, true)! } : {}),
    ...(value.excerpt !== undefined ? { excerpt: text(value.excerpt, "excerpt", 1_000) ?? "" } : {}),
    ...(value.body !== undefined || !partial ? { body: parseContent(value.body) } : {}),
    ...(value.featuredMediaId !== undefined ? { featuredMediaId: value.featuredMediaId === null ? null : identifier(value.featuredMediaId, "featuredMediaId", true) } : {}),
    ...(value.articleMediaIds !== undefined ? { articleMediaIds: stringArray(value.articleMediaIds, "articleMediaIds", 20, 36)?.map((id, index) => {
      if (!uuid.test(id)) throw new RediContractError(`articleMediaIds.${index}`);
      return id;
    }) } : {}),
    ...(value.featuredImageAlt !== undefined ? { featuredImageAlt: text(value.featuredImageAlt, "featuredImageAlt", 500) ?? "" } : {}),
    ...(value.tags !== undefined ? { tags: stringArray(value.tags, "tags", 30, 80) } : {}),
    ...(value.displayAuthor !== undefined ? { displayAuthor: text(value.displayAuthor, "displayAuthor", 200) ?? "" } : {}),
    ...(value.featured !== undefined ? { featured: optionalBoolean(value.featured, "featured") } : {}),
    ...(value.publishAt !== undefined ? { publishAt: optionalDate(value.publishAt, "publishAt") } : {}),
    ...(value.seoTitle !== undefined ? { seoTitle: text(value.seoTitle, "seoTitle", 240) ?? "" } : {}),
    ...(value.seoDescription !== undefined ? { seoDescription: text(value.seoDescription, "seoDescription", 500) ?? "" } : {}),
    ...(value.canonicalUrl !== undefined ? { canonicalUrl: canonicalUrl ?? "" } : {}),
    ...(value.sources !== undefined ? { sources: parseSources(value.sources) } : {}),
  };
}

export function parseCreateArticle(value: unknown): Omit<CreateArticleInput, "actorType" | "actorId" | "siteId" | "externalSource" | "status"> {
  const input = record(value, "request");
  exact(input, ["externalReference", ...articleFields], "request");
  const externalReference = text(input.externalReference, "externalReference", 300, true)!;
  return { externalReference, ...parseArticleFields(Object.fromEntries(Object.entries(input).filter(([key]) => key !== "externalReference")), false) } as ReturnType<typeof parseCreateArticle>;
}

export function parseUpdateArticle(value: unknown): { expectedVersion: number; patch: UpdateArticleInput["patch"] } {
  const input = record(value, "request");
  exact(input, ["expectedVersion", "patch"], "request");
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) throw new RediContractError("expectedVersion");
  const patch = record(input.patch, "patch");
  if (!Object.keys(patch).length) throw new RediContractError("patch");
  return { expectedVersion: input.expectedVersion as number, patch: parseArticleFields(patch, true) };
}

export function parseTransition(value: unknown) {
  const input = record(value, "request");
  exact(input, ["expectedVersion"], "request");
  if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) throw new RediContractError("expectedVersion");
  return { expectedVersion: input.expectedVersion as number };
}

export function parsePublish(value: unknown) {
  const input = record(value, "request");
  exact(input, ["expectedVersion", "approval"], "request");
  const transition = parseTransition({ expectedVersion: input.expectedVersion });
  const approval = record(input.approval, "approval");
  exact(approval, ["approvedBy", "approvedAt"], "approval");
  const approvedAt = optionalDate(approval.approvedAt, "approval.approvedAt");
  const approvedBy = text(approval.approvedBy, "approval.approvedBy", 200, true)!;
  if (!approvedAt) throw new RediContractError("approval.approvedAt");
  const age = Date.now() - Date.parse(approvedAt);
  if (age < -300_000 || age > 86_400_000) throw new RediContractError("approval.approvedAt", "Approval is outside the accepted 24-hour window.");
  return { ...transition, approval: { approvedBy, approvedAt } };
}

export function parseMediaUpload(value: unknown) {
  const input = record(value, "request");
  exact(input, ["filename", "mimeType", "dataBase64", "altText"], "request");
  const mimeType = text(input.mimeType, "mimeType", 100, true);
  if (mimeType !== "image/webp") throw new RediContractError("mimeType");
  const dataBase64 = text(input.dataBase64, "dataBase64", 5_700_000, true)!;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0) throw new RediContractError("dataBase64");
  return { filename: text(input.filename, "filename", 120, true)!, mimeType, dataBase64, altText: text(input.altText, "altText", 500) };
}

export function parseArticleListQuery(url: URL) {
  const allowed = new Set(["limit", "status", "before", "cursorId"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) throw new RediContractError("query", "Unknown query parameter.");
  const limit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RediContractError("limit");
  const statusValue = url.searchParams.get("status") ?? undefined;
  const status = statusValue && articleStatuses.includes(statusValue as ArticleStatus) ? statusValue as ArticleStatus : undefined;
  if (statusValue && !status) throw new RediContractError("status");
  const before = url.searchParams.get("before") ?? undefined;
  const cursorId = url.searchParams.get("cursorId") ?? undefined;
  if (Boolean(before) !== Boolean(cursorId) || (before && Number.isNaN(Date.parse(before))) || (cursorId && !uuid.test(cursorId))) throw new RediContractError("cursor");
  return { limit, status, createdBefore: before && cursorId ? { createdAt: new Date(before).toISOString(), id: cursorId } : undefined };
}

export function parseMediaListQuery(url: URL) {
  const allowed = new Set(["limit", "before", "cursorId"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) throw new RediContractError("query", "Unknown query parameter.");
  const limit = Number(url.searchParams.get("limit") ?? 25);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RediContractError("limit");
  const before = url.searchParams.get("before") ?? undefined;
  const cursorId = url.searchParams.get("cursorId") ?? undefined;
  if (Boolean(before) !== Boolean(cursorId) || (before && Number.isNaN(Date.parse(before))) || (cursorId && !uuid.test(cursorId))) throw new RediContractError("cursor");
  return { limit, before: before && cursorId ? { createdAt: new Date(before).toISOString(), id: cursorId } : undefined };
}

export function serializeArticle(article: InformationArticle) {
  if (!article?.id || !article.siteId || !article.slug || !article.title || !articleStatuses.includes(article.status))
    throw new RediContractError("response", "Invalid article response schema.");
  return {
    id: article.id, externalReference: article.externalReference, slug: article.slug, title: article.title,
    excerpt: article.excerpt, body: article.body, categoryId: article.categoryId, featuredMediaId: article.featuredMediaId,
    articleMedia: article.articleMedia, featuredImageAlt: article.featuredImageAlt, tags: article.tags,
    displayAuthor: article.displayAuthor, status: article.status, featured: article.featured,
    publishAt: article.publishAt, publishedAt: article.publishedAt, seoTitle: article.seoTitle,
    seoDescription: article.seoDescription, canonicalUrl: article.canonicalUrl, sources: article.sources,
    version: article.version, createdAt: article.createdAt, updatedAt: article.updatedAt,
  };
}

export function serializeArticleSummary(article: ArticleSummary) {
  if (!article?.id || !article.slug || !article.title || !articleStatuses.includes(article.status))
    throw new RediContractError("response", "Invalid article summary response schema.");
  return {
    id: article.id, externalReference: article.externalReference, slug: article.slug, title: article.title,
    excerpt: article.excerpt, categoryId: article.categoryId, status: article.status, featured: article.featured,
    tags: article.tags, displayAuthor: article.displayAuthor, version: article.version,
    publishAt: article.publishAt, publishedAt: article.publishedAt, createdAt: article.createdAt, updatedAt: article.updatedAt,
  };
}
