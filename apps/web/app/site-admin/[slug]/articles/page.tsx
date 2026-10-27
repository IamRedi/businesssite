import Link from "next/link";
import { redirect } from "next/navigation";
import { PostgresInformationRepository } from "@platform/site-data";
import { articleStatuses, type ArticleStatus } from "@platform/website-engine";
import { EditorialAdminNav } from "../../../../components/editorial-admin-nav";
import { editorialCopy } from "../../../../lib/editorial-copy";
import { getEditorialAccess } from "../../../../lib/editorial-auth";
import { requireSiteAdmin } from "../../../../lib/site-admin-auth";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const isStatus = (value: string | undefined): value is ArticleStatus => articleStatuses.includes(value as ArticleStatus);

export default async function EditorialArticlesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!(await requireSiteAdmin(slug))) redirect("/site-admin/login");
  const access = await getEditorialAccess(slug);
  if (!access?.can("article:read")) redirect(`/site-admin/${slug}?editorial=forbidden`);
  const repository = new PostgresInformationRepository({ boundary: "site_admin", sessionHash: access.sessionHash });
  const settings = await repository.getSettings(access.siteId);
  if (!settings) redirect(`/site-admin/${slug}?editorial=unavailable`);
  const query = await searchParams;
  const statusValue = first(query.status);
  const categoryId = first(query.category) || undefined;
  const search = first(query.q) || undefined;
  const cursorCreated = first(query.before);
  const cursorId = first(query.cursorId);
  const [categories, page] = await Promise.all([
    repository.listCategories(access.siteId),
    repository.listArticles(access.siteId, {
      status: isStatus(statusValue) ? statusValue : undefined,
      categoryId,
      query: search,
      createdBefore: cursorCreated && cursorId ? { createdAt: cursorCreated, id: cursorId } : undefined,
      limit: 25,
    }),
  ]);
  const copy = editorialCopy[settings.locale];
  const categoryNames = new Map(categories.map((category) => [category.id as string, category.name as string]));
  const messageKey = first(query.message) as keyof typeof copy.messages | undefined;
  const buildPageHref = (cursor?: { createdAt: string; id: string }) => {
    const values = new URLSearchParams();
    if (statusValue) values.set("status", statusValue);
    if (categoryId) values.set("category", categoryId);
    if (search) values.set("q", search);
    if (cursor) { values.set("before", cursor.createdAt); values.set("cursorId", cursor.id); }
    return `/site-admin/${slug}/articles?${values}`;
  };

  return <main className="owner-shell site-admin-shell editorial-cms-shell">
    <header className="detail-header"><div><p className="eyebrow">{copy.list.eyebrow}</p><h1>{copy.list.title}</h1><p>{copy.list.intro}</p></div><EditorialAdminNav slug={slug} copy={copy} canManageSettings={access.can("settings:manage")} /></header>
    {messageKey && copy.messages[messageKey] ? <p className="editorial-notice">{copy.messages[messageKey]}</p> : null}
    <section className="workspace-card editorial-toolbar">
      <form method="get">
        <input name="q" defaultValue={search} placeholder={copy.list.search} />
        <select name="status" defaultValue={statusValue ?? ""}><option value="">{copy.list.allStatuses}</option>{articleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
        <select name="category" defaultValue={categoryId ?? ""}><option value="">{copy.list.allCategories}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <button className="button secondary compact" type="submit">{copy.list.filter}</button>
      </form>
      {access.can("article:create") ? <Link className="button compact" href={`/site-admin/${slug}/articles/new`}>{copy.list.create}</Link> : null}
    </section>
    <section className="editorial-article-list">
      {page.items.length ? page.items.map((article) => <article className="workspace-card editorial-article-card" key={article.id}>
        <div className="editorial-card-top"><span className={`article-status ${article.status}`}>{article.status}</span>{article.featured ? <span className="operation-status">Featured</span> : null}</div>
        <div><p className="eyebrow">{article.categoryId ? categoryNames.get(article.categoryId) : copy.form.noCategory}</p><h2>{article.title}</h2><p>{article.excerpt || "—"}</p></div>
        <dl><div><dt>{copy.list.updated}</dt><dd>{new Intl.DateTimeFormat(settings.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(article.updatedAt))}</dd></div><div><dt>{copy.list.author}</dt><dd>{article.displayAuthor || "—"}</dd></div></dl>
        <Link className="button secondary compact" href={`/site-admin/${slug}/articles/${article.id}`}>{copy.list.edit}</Link>
      </article>) : <div className="workspace-card editorial-empty"><p>{copy.list.empty}</p></div>}
    </section>
    <nav className="editorial-pagination">{cursorCreated ? <Link className="button secondary compact" href={buildPageHref()}>{copy.list.previous}</Link> : <span />}{page.nextCursor ? <Link className="button secondary compact" href={buildPageHref(page.nextCursor)}>{copy.list.next}</Link> : null}</nav>
  </main>;
}
