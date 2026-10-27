/* eslint-disable @next/next/no-img-element -- authenticated previews use tenant media delivery URLs. */
import { redirect } from "next/navigation";
import { PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { EditorialAdminNav } from "../../../../../components/editorial-admin-nav";
import { EditorialArticleForm } from "../../../../../components/editorial-article-form";
import { EditorialContentPreview } from "../../../../../components/editorial-content-preview";
import { editorialCopy } from "../../../../../lib/editorial-copy";
import { editorialArticleFields, formText } from "../../../../../lib/editorial-form";
import { getEditorialAccess, hasEditorialPermission } from "../../../../../lib/editorial-auth";
import { expirePublicSiteAfterMutationById } from "../../../../../lib/public-site-cache";
import { requireSiteAdmin } from "../../../../../lib/site-admin-auth";

export default async function EditEditorialArticlePage({ params, searchParams }: {
  params: Promise<{ slug: string; articleId: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const { slug, articleId } = await params;
  if (!(await requireSiteAdmin(slug))) redirect("/site-admin/login");
  const access = await getEditorialAccess(slug);
  if (!access?.can("article:read")) redirect(`/site-admin/${slug}?editorial=forbidden`);
  const repository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash: access.sessionHash });
  const [settings, article, categories, assets] = await Promise.all([
    repository.getSettings(access.siteId),
    repository.getArticle(access.siteId, articleId),
    repository.listCategories(access.siteId),
    repository.listMediaAssets(access.siteId),
  ]);
  if (!settings || !article) redirect(`/site-admin/${slug}/articles?message=error`);
  const copy = editorialCopy[settings.locale];
  const featuredImageUrl = assets.find((asset) => asset.id === article.featuredMediaId)?.publicUrl;
  const { message } = await searchParams;

  async function saveArticle(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "article:update");
    if (!current) redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    try {
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).updateArticle({
        actorType: "site_admin",
        actorId: current.accountId,
        siteId: current.siteId,
        articleId,
        expectedVersion: Number(formText(formData, "version")),
        patch: editorialArticleFields(formData),
      });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    }
    redirect(`/site-admin/${slug}/articles/${articleId}?message=saved`);
  }

  async function changeStatus(formData: FormData) {
    "use server";
    const status = formText(formData, "status");
    const permission = status === "published" ? "article:publish" : status === "pending" ? "article:submit" : "article:archive";
    const current = await hasEditorialPermission(slug, permission);
    if (!current || (status !== "published" && status !== "pending" && status !== "archived"))
      redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    try {
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).transitionArticle({
        actorType: "site_admin",
        actorId: current.accountId,
        siteId: current.siteId,
        articleId,
        expectedVersion: Number(formText(formData, "version")),
        status,
      });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    }
    redirect(`/site-admin/${slug}/articles/${articleId}?message=${status === "published" ? "published" : status === "archived" ? "archived" : "saved"}`);
  }

  async function deleteArticle(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "article:delete");
    if (!current) redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    try {
      await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).deleteArticle({ actorType: "site_admin", actorId: current.accountId, siteId: current.siteId, articleId, expectedVersion: Number(formText(formData, "version")) });
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/articles/${articleId}?message=error`);
    }
    redirect(`/site-admin/${slug}/articles?message=deleted`);
  }

  const messageKey = message as keyof typeof copy.messages | undefined;
  return <main className="owner-shell site-admin-shell editorial-cms-shell">
    <header className="detail-header"><div><p className="eyebrow">{copy.list.eyebrow}</p><h1>{copy.form.editTitle}</h1><p>{article.title}</p></div><EditorialAdminNav slug={slug} copy={copy} canManageSettings={access.can("settings:manage")} /></header>
    {messageKey && copy.messages[messageKey] ? <p className="editorial-notice">{copy.messages[messageKey]}</p> : null}
    {access.can("article:update") ? <EditorialArticleForm slug={slug} article={article} categories={categories} assets={assets} copy={copy} locale={settings.locale} action={saveArticle} /> : <p className="editorial-notice error">{copy.form.forbidden}</p>}
    <section className="workspace-card editorial-private-preview"><div className="editor-section-heading"><div><p className="eyebrow">{article.status}</p><h2>{copy.form.preview}</h2></div></div><h1>{article.title}</h1>{article.excerpt ? <p className="editorial-preview-excerpt">{article.excerpt}</p> : null}{featuredImageUrl ? <img className="editorial-preview-featured" src={featuredImageUrl} alt={article.featuredImageAlt || article.title} /> : null}<EditorialContentPreview content={article.body} />{article.articleMedia.length ? <div className="editorial-preview-gallery">{article.articleMedia.map((media) => <img key={media.id} src={media.url} alt={media.altText || article.title} />)}</div> : null}</section>
    <section className="workspace-card editorial-lifecycle"><div><p className="eyebrow">{copy.form.publishing}</p><h2>{copy.form.status}: <span className={`article-status ${article.status}`}>{article.status}</span></h2></div><div className="editorial-lifecycle-actions">
      {article.status === "draft" && access.can("article:submit") ? <form action={changeStatus}><input type="hidden" name="version" value={article.version} /><input type="hidden" name="status" value="pending" /><button className="button secondary" type="submit">{copy.form.submitReview}</button></form> : null}
      {article.status !== "published" && access.can("article:publish") ? <form action={changeStatus}><input type="hidden" name="version" value={article.version} /><input type="hidden" name="status" value="published" /><button className="button" type="submit">{copy.form.publish}</button></form> : null}
      {article.status !== "archived" && access.can("article:archive") ? <form action={changeStatus}><input type="hidden" name="version" value={article.version} /><input type="hidden" name="status" value="archived" /><button className="button secondary" type="submit">{copy.form.archive}</button></form> : null}
      {access.can("article:delete") ? <form action={deleteArticle}><input type="hidden" name="version" value={article.version} /><button className="button danger" type="submit">{copy.form.delete}</button></form> : null}
    </div></section>
  </main>;
}
