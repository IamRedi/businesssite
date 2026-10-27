import { articleBodyFromText, sourcesFromText, tagsFromText } from "./editorial-content";

export const formText = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
export const optionalFormText = (formData: FormData, key: string) => formText(formData, key) || undefined;

export function navigationFromText(input: string) {
  const parsed = JSON.parse(input || "[]") as unknown;
  if (!Array.isArray(parsed) || parsed.length > 20) throw new Error("invalid_navigation");
  return parsed.map((item) => {
    if (!item || typeof item !== "object") throw new Error("invalid_navigation");
    const value = item as Record<string, unknown>;
    const label = typeof value.label === "string" ? value.label.trim() : "";
    const categorySlug = typeof value.categorySlug === "string" ? value.categorySlug.trim() : undefined;
    const href = typeof value.href === "string" ? value.href.trim() : undefined;
    if (!label || label.length > 80) throw new Error("invalid_navigation");
    if (categorySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) throw new Error("invalid_navigation");
    if (href && (!href.startsWith("/") || href.startsWith("//") || href.length > 300)) throw new Error("invalid_navigation");
    if (!categorySlug && !href) throw new Error("invalid_navigation");
    return { label, ...(categorySlug ? { categorySlug } : {}), ...(href ? { href } : {}) };
  });
}

export function editorialArticleFields(formData: FormData) {
  const publishAt = optionalFormText(formData, "publishAt");
  return {
    categoryId: optionalFormText(formData, "categoryId") ?? null,
    slug: formText(formData, "slug"),
    title: formText(formData, "title"),
    excerpt: formText(formData, "excerpt"),
    body: articleBodyFromText(formText(formData, "body")),
    featuredMediaId: optionalFormText(formData, "featuredMediaId") ?? null,
    articleMediaIds: formData.getAll("articleMediaId").map(String),
    featuredImageAlt: formText(formData, "featuredImageAlt"),
    tags: tagsFromText(formText(formData, "tags")),
    displayAuthor: formText(formData, "displayAuthor"),
    featured: formData.get("featured") === "on",
    publishAt: publishAt ? new Date(publishAt).toISOString() : null,
    seoTitle: formText(formData, "seoTitle"),
    seoDescription: formText(formData, "seoDescription"),
    canonicalUrl: formText(formData, "canonicalUrl"),
    sources: sourcesFromText(formText(formData, "sources")),
  };
}
