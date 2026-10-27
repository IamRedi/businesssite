import Link from "next/link";
import { PostgresFinderRepository } from "@platform/business-finder";
import { businessWorkspaceCopy } from "../../../lib/owner-workspace-copy";
import { formatOwnerDate } from "../../../lib/owner-workspace-copy";
import { ownerPanelLocale } from "../../../lib/locale-model";
import { businessWorkspaceUiCopy, workspaceCategoryFor, workspaceCategoryKeys, type WorkspaceCategoryKey } from "../../../lib/business-workspace";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";

export const dynamic = "force-dynamic";

const pageSize = 32;
const websiteHost = (value: string | undefined, fallback: string) => {
  if (!value) return fallback;
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; }
};

export default async function BusinessWorkspacePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }> }) {
  const owner = await requireOwnerPagePermission("finder.read");
  const query = await searchParams;
  const locale = ownerPanelLocale;
  const copy = businessWorkspaceCopy[locale];
  const ui = businessWorkspaceUiCopy[locale];
  const records = await new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).listBusinessWorkspace();
  const categorized = records.map((record) => ({ ...record, workspaceCategory: workspaceCategoryFor(record.lead.category, record.lead.name) }));
  const categoryCounts = new Map<WorkspaceCategoryKey, number>();
  for (const record of categorized) categoryCounts.set(record.workspaceCategory, (categoryCounts.get(record.workspaceCategory) ?? 0) + 1);
  const generated = records.filter((record) => record.profileCount > 0).length;
  const withWebsite = records.filter((record) => record.lead.signals.hasWebsite).length;
  const term = query.q?.trim().toLocaleLowerCase() ?? "";
  const status = ["all", "generated", "existing", "opportunity"].includes(query.status ?? "") ? query.status! : "all";
  const activeCategory = workspaceCategoryKeys.includes(query.category as WorkspaceCategoryKey) ? query.category as WorkspaceCategoryKey : "all";
  const filtered = categorized.filter((record) => {
    const email = record.lead.signals.email || record.latestProfile?.profile.business.email || "";
    const matchesTerm = !term || [record.lead.name, record.lead.category, record.lead.address, email].some((value) => value?.toLocaleLowerCase().includes(term));
    const recordStatus = record.profileCount ? "generated" : record.lead.signals.hasWebsite ? "existing" : "opportunity";
    return matchesTerm && (status === "all" || status === recordStatus) && (activeCategory === "all" || activeCategory === record.workspaceCategory);
  });
  filtered.sort((left, right) => ui.categories[left.workspaceCategory].localeCompare(ui.categories[right.workspaceCategory], locale) || Date.parse(right.lead.updatedAt) - Date.parse(left.lead.updatedAt));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (term) params.set("q", query.q?.trim() ?? "");
    if (status !== "all") params.set("status", status);
    if (activeCategory !== "all") params.set("category", activeCategory);
    params.set("page", String(page));
    return `/owner/businesses?${params}`;
  };
  const categoryUrl = (category: WorkspaceCategoryKey | "all") => {
    const params = new URLSearchParams();
    if (term) params.set("q", query.q?.trim() ?? "");
    if (status !== "all") params.set("status", status);
    if (category !== "all") params.set("category", category);
    const suffix = params.toString();
    return `/owner/businesses${suffix ? `?${suffix}` : ""}`;
  };
  const groupedVisible = new Map<WorkspaceCategoryKey, typeof visible>();
  for (const record of visible) groupedVisible.set(record.workspaceCategory, [...(groupedVisible.get(record.workspaceCategory) ?? []), record]);
  return <main className="owner-shell">
    <header className="owner-header">
      <div><Link className="back-link" href="/owner">{copy.back}</Link><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="owner-intro">{copy.intro}</p></div>
      <span className="secure-badge">{copy.ownerOnly}</span>
    </header>
    <section className="metrics"><article><span>{copy.businesses}</span><strong>{records.length}</strong></article><article><span>{copy.profiles}</span><strong>{generated}</strong></article><article><span>{copy.existingWebsites}</span><strong>{withWebsite}</strong></article></section>
    <nav className="business-category-nav" aria-label={ui.categoryNavigation}><Link className={activeCategory === "all" ? "active" : ""} href={categoryUrl("all")}><strong>{ui.allCategories}</strong><span>{records.length}</span></Link>{workspaceCategoryKeys.filter((key) => categoryCounts.has(key)).map((key) => <Link className={activeCategory === key ? "active" : ""} href={categoryUrl(key)} key={key}><strong>{ui.categories[key]}</strong><span>{categoryCounts.get(key)}</span></Link>)}</nav>
    <form className="business-workspace-filters" method="get">{activeCategory !== "all" ? <input type="hidden" name="category" value={activeCategory} /> : null}<label><span>{copy.search}</span><input type="search" name="q" defaultValue={query.q} placeholder={copy.searchPlaceholder} /></label><label><span>{copy.websiteStatus}</span><select name="status" defaultValue={status}><option value="all">{copy.all}</option><option value="generated">{copy.generated}</option><option value="existing">{copy.existing}</option><option value="opportunity">{copy.opportunity}</option></select></label><button className="button" type="submit">{copy.apply}</button>{term || status !== "all" || activeCategory !== "all" ? <Link className="button secondary" href="/owner/businesses">{copy.reset}</Link> : null}</form>
    {visible.length ? <><div className="business-results-meta"><p>{copy.showing((currentPage - 1) * pageSize + 1, Math.min(currentPage * pageSize, filtered.length), filtered.length)}</p><span>{copy.page(currentPage, pageCount)}</span></div>{[...groupedVisible.entries()].map(([group, groupRecords]) => <section className="business-category-group" key={group}><header><div><p className="eyebrow">{ui.categories[group]}</p><h2>{ui.businesses(categoryCounts.get(group) ?? groupRecords.length)}</h2></div></header><div className="business-card-grid">{groupRecords.map(({ lead, latestProfile, profileCount, latestWebsiteChange }) => {
      const profile = latestProfile?.profile;
      const email = lead.signals.email || profile?.business.email;
      const services = profile?.services.map((service) => service.title) ?? lead.signals.services ?? [];
      const state = profileCount ? copy.generated : lead.signals.hasWebsite ? copy.existing : copy.opportunity;
      return <Link className="business-record-card" href={`/owner/leads/${encodeURIComponent(lead.id)}`} key={lead.id}>
        <div className="business-record-top"><span className={profileCount ? "record-state generated" : lead.signals.hasWebsite ? "record-state existing" : "record-state opportunity"}>{state}</span><strong className="business-score" aria-label={copy.score(lead.score)}>{lead.score}<small>/100</small></strong></div>
        <div><p className="eyebrow">{lead.category || copy.unclassified}</p><h2>{lead.name}</h2><p>{lead.address || copy.addressUnavailable}</p></div>
        <dl className="business-card-facts"><div><dt>{copy.rating}</dt><dd>{lead.rating ? `${lead.rating} · ${copy.reviews(lead.reviewCount ?? 0)}` : copy.notAvailable}</dd></div><div><dt>{copy.website}</dt><dd title={lead.website}>{websiteHost(lead.website, copy.noWebsite)}</dd></div><div><dt>{copy.email}</dt><dd>{email || copy.notFound}</dd></div><div><dt>{copy.phone}</dt><dd>{lead.phone || copy.notFound}</dd></div></dl>
        {latestWebsiteChange ? <div className={`website-change ${latestWebsiteChange.type}`} title={`${latestWebsiteChange.previousWebsite ?? copy.noWebsite} → ${latestWebsiteChange.currentWebsite ?? copy.noWebsite}`}><strong>{ui.websiteChange[latestWebsiteChange.type]}</strong><span>{formatOwnerDate(locale, latestWebsiteChange.observedAt)}</span></div> : null}
        {services.length ? <div className="business-service-tags">{services.slice(0, 2).map((service) => <span key={service}>{service}</span>)}</div> : null}
        <footer><span>{ui.lastChecked}: {formatOwnerDate(locale, lead.updatedAt)}</span><strong>{copy.open}</strong></footer>
      </Link>;
    })}</div></section>)}{pageCount > 1 ? <nav className="business-pagination" aria-label={copy.pages}>{currentPage > 1 ? <Link className="button secondary" href={pageUrl(currentPage - 1)}>{copy.previous}</Link> : <span />}{currentPage < pageCount ? <Link className="button secondary" href={pageUrl(currentPage + 1)}>{copy.next}</Link> : null}</nav> : null}</> : <section className="workspace-card empty-workspace"><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><div className="action-row"><Link className="button secondary" href="/owner/businesses">{copy.resetFilters}</Link><Link className="button" href="/owner">{copy.openFinder}</Link></div></section>}
  </main>;
}
