import type { InformationArticle, SupportedLocale } from "@platform/website-engine";
import type { EditorialCopy } from "../lib/editorial-copy";
import { articleBodyToText, sourcesToText } from "../lib/editorial-content";
import { EditorialMediaField } from "./editorial-media-field";

type Category = { id: string; name: string };
type Asset = { id: string; publicUrl: string | null; storageKey: string; altText: string | null };

const articleMediaLabels: Record<SupportedLocale, string> = {
  en: "Article image gallery",
  de: "Bilder im Artikel",
  fr: "Images de l'article",
  es: "Galería de imágenes del artículo",
  it: "Galleria immagini dell'articolo",
  sq: "Galeria e fotove të artikullit",
};

const localDateTime = (value?: string) => value ? new Date(value).toISOString().slice(0, 16) : "";

export function EditorialArticleForm({
  slug,
  article,
  categories,
  assets,
  copy,
  locale,
  action,
}: {
  slug: string;
  article?: InformationArticle;
  categories: Category[];
  assets: Asset[];
  copy: EditorialCopy;
  locale: SupportedLocale;
  action: (formData: FormData) => Promise<void>;
}) {
  const hasAdvancedPublishing = Boolean(article?.publishAt || article?.displayAuthor || article?.featured || article?.seoTitle || article?.seoDescription || article?.canonicalUrl || article?.sources.length);
  return (
    <form action={action} className="editorial-article-form">
      {article ? <input type="hidden" name="version" value={article.version} /> : null}
      <section className="workspace-card editorial-form-section span-two">
        <div className="editor-section-heading"><div><p className="eyebrow">01</p><h2>{copy.form.content}</h2></div>{article ? <span className="operation-status">{copy.form.version} {article.version}</span> : null}</div>
        <label>{copy.form.title}<input name="title" defaultValue={article?.title} maxLength={240} required /></label>
        <label>{copy.form.slug}<input name="slug" defaultValue={article?.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} required /></label>
        <label>{copy.form.excerpt}<textarea name="excerpt" defaultValue={article?.excerpt} maxLength={1000} rows={4} /></label>
        <label>{copy.form.body}<textarea name="body" defaultValue={article ? articleBodyToText(article.body) : ""} rows={18} required /><small>{copy.form.bodyHelp}</small></label>
      </section>

      <section className="workspace-card editorial-form-section">
        <div className="editor-section-heading"><div><p className="eyebrow">02</p><h2>{copy.form.organization}</h2></div></div>
        <label>{copy.form.category}<select name="categoryId" defaultValue={article?.categoryId ?? ""}><option value="">{copy.form.noCategory}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>{copy.form.tags}<input name="tags" defaultValue={article?.tags.join(", ")} /></label>
        <div className="editorial-field">
          <span className="editorial-field-label">{copy.form.featuredImage}</span>
          <EditorialMediaField
            slug={slug}
            assets={assets}
            initialId={article?.featuredMediaId}
            initialArticleMediaIds={article?.articleMedia.map((media) => media.id)}
            articleMediaLabel={articleMediaLabels[locale]}
            copy={copy.upload}
          />
        </div>
        <label>{copy.form.imageAlt}<input name="featuredImageAlt" defaultValue={article?.featuredImageAlt} maxLength={500} /></label>
      </section>

      <details className="workspace-card editorial-advanced-section span-two" open={hasAdvancedPublishing}>
        <summary><span>03</span><div><p className="eyebrow">{copy.form.publishing}</p><h2>{copy.form.seo}</h2></div><b aria-hidden="true">+</b></summary>
        <div className="editorial-advanced-content">
          {article ? <p><strong>{copy.form.status}:</strong> <span className={`article-status ${article.status}`}>{article.status}</span></p> : null}
          <div className="editor-grid two-columns">
            <label>{copy.form.publishAt}<input name="publishAt" type="datetime-local" defaultValue={localDateTime(article?.publishAt)} /></label>
            <label>{copy.form.author}<input name="displayAuthor" defaultValue={article?.displayAuthor} maxLength={200} /></label>
          </div>
          <label className="editorial-checkbox"><input name="featured" type="checkbox" defaultChecked={article?.featured} /><span>{copy.form.featured}</span></label>
          <div className="editor-grid two-columns">
            <label>{copy.form.seoTitle}<input name="seoTitle" defaultValue={article?.seoTitle} maxLength={240} /></label>
            <label>{copy.form.canonicalUrl}<input name="canonicalUrl" type="url" defaultValue={article?.canonicalUrl} /></label>
          </div>
          <label>{copy.form.seoDescription}<textarea name="seoDescription" defaultValue={article?.seoDescription} maxLength={500} rows={3} /></label>
          <label>{copy.form.sources}<textarea name="sources" defaultValue={article ? sourcesToText(article.sources) : ""} rows={5} /><small>{copy.form.sourcesHelp}</small></label>
        </div>
      </details>
      <div className="editorial-form-actions span-two"><button className="button" type="submit">{article ? copy.form.save : copy.form.saveDraft}</button></div>
    </form>
  );
}
