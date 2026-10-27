import { redirect } from "next/navigation";
import { PostgresInformationRepository, PostgresSiteRepository } from "@platform/site-data";
import { EditorialAdminNav } from "../../../../../components/editorial-admin-nav";
import { EditorialArticleForm } from "../../../../../components/editorial-article-form";
import { editorialCopy } from "../../../../../lib/editorial-copy";
import { editorialArticleFields } from "../../../../../lib/editorial-form";
import { getEditorialAccess, hasEditorialPermission } from "../../../../../lib/editorial-auth";
import { expirePublicSiteAfterMutationById } from "../../../../../lib/public-site-cache";
import { requireSiteAdmin } from "../../../../../lib/site-admin-auth";

export default async function NewEditorialArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await requireSiteAdmin(slug))) redirect("/site-admin/login");
  const access = await getEditorialAccess(slug);
  if (!access?.can("article:create")) redirect(`/site-admin/${slug}/articles?message=error`);
  const repository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash: access.sessionHash });
  const settings = await repository.getSettings(access.siteId);
  if (!settings) redirect(`/site-admin/${slug}?editorial=unavailable`);
  const [categories, assets] = await Promise.all([repository.listCategories(access.siteId), repository.listMediaAssets(access.siteId)]);
  const copy = editorialCopy[settings.locale];

  async function createArticle(formData: FormData) {
    "use server";
    const current = await hasEditorialPermission(slug, "article:create");
    if (!current) redirect(`/site-admin/${slug}/articles?message=error`);
    let createdId = "";
    try {
      const article = await new PostgresInformationRepository({ boundary: "site_admin", sessionHash: current.sessionHash }).createArticle({
        actorType: "site_admin",
        actorId: current.accountId,
        siteId: current.siteId,
        externalSource: "site_admin",
        status: "draft",
        ...editorialArticleFields(formData),
      });
      createdId = article.id;
      await expirePublicSiteAfterMutationById(new PostgresSiteRepository({ boundary: "site_admin", sessionHash: current.sessionHash }), current.siteId);
    } catch {
      redirect(`/site-admin/${slug}/articles/new?message=error`);
    }
    redirect(`/site-admin/${slug}/articles/${createdId}?message=created`);
  }

  return <main className="owner-shell site-admin-shell editorial-cms-shell">
    <header className="detail-header"><div><p className="eyebrow">{copy.list.eyebrow}</p><h1>{copy.form.newTitle}</h1><p>{copy.list.intro}</p></div><EditorialAdminNav slug={slug} copy={copy} canManageSettings={access.can("settings:manage")} /></header>
    <EditorialArticleForm slug={slug} categories={categories} assets={assets} copy={copy} locale={settings.locale} action={createArticle} />
  </main>;
}
