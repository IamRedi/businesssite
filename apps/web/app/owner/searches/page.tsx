import Link from "next/link";
import { PostgresFinderRepository } from "@platform/business-finder";
import { ownerPanelLocale } from "../../../lib/locale-model";
import { ownerOperationsCopy } from "../../../lib/owner-navigation-copy";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";

export const dynamic = "force-dynamic";
const localeTags = { de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT", sq: "sq-AL" } as const;

export default async function OwnerSearchesPage({ searchParams }: { searchParams: Promise<{ q?: string; source?: string }> }) {
  const owner = await requireOwnerPagePermission("finder.read");
  const query = await searchParams;
  const locale = ownerPanelLocale;
  const copy = ownerOperationsCopy[locale].searches;
  const repository = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const [searches, leads] = await Promise.all([repository.listSearches(150), repository.listLeads()]);
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const term = query.q?.trim().toLocaleLowerCase() ?? "";
  const source = ["all", "fresh", "cached"].includes(query.source ?? "") ? query.source! : "all";
  const place = (filters: typeof searches[number]["filters"]) => {
    const extended = filters as typeof filters & { address?: string };
    return filters.location?.label || extended.address || filters.city || copy.noLocation;
  };
  const visible = searches.filter((record) => {
    const matches = !term || [record.query, place(record.filters), record.filters.category].some((value) => value?.toLocaleLowerCase().includes(term));
    return matches && (source === "all" || (source === "cached") === record.cached);
  });
  const cached = searches.filter((record) => record.cached).length;
  const found = searches.reduce((sum, record) => sum + record.resultCount, 0);
  const formatDate = (value: string) => new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <main className="owner-shell owner-operations-page">
    <header className="owner-header"><div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="owner-intro">{copy.intro}</p></div><span className="secure-badge">OWNER</span></header>
    <section className="metrics owner-operations-metrics"><article><span>{copy.total}</span><strong>{searches.length}</strong></article><article><span>{copy.cached}</span><strong>{cached}</strong></article><article><span>{copy.fresh}</span><strong>{searches.length - cached}</strong></article><article><span>{copy.results}</span><strong>{found}</strong></article></section>
    <form className="business-workspace-filters owner-operation-filters" method="get"><label><span>{copy.search}</span><input type="search" name="q" defaultValue={query.q} placeholder={copy.searchPlaceholder} /></label><label><span>{copy.source}</span><select name="source" defaultValue={source}><option value="all">{copy.all}</option><option value="fresh">{copy.freshFilter}</option><option value="cached">{copy.cachedFilter}</option></select></label><button className="button" type="submit">{copy.apply}</button>{term || source !== "all" ? <Link className="button secondary" href="/owner/searches">{copy.reset}</Link> : null}</form>
    {visible.length ? <div className="owner-search-history">{visible.map((record) => <article className="owner-search-card" key={record.id}>
      <header><div><span className={`operation-status ${record.status === "failed" ? "attention" : record.cached ? "trial" : "active"}`}>{record.status === "failed" ? copy.failed : record.status === "pending" ? copy.pending : record.cached ? copy.cachedFilter : copy.freshFilter}</span><h2>{record.query}</h2><p>{formatDate(record.createdAt)}</p></div><strong>{record.resultCount}</strong></header>
      <dl><div><dt>{copy.location}</dt><dd>{place(record.filters)}</dd></div><div><dt>{copy.radius}</dt><dd>{record.filters.radius ? `${record.filters.radius} km` : "—"}</dd></div><div><dt>{copy.resultCount}</dt><dd>{record.resultCount}</dd></div></dl>
      {record.leadIds.length ? <div className="search-result-links">{record.leadIds.slice(0, 6).map((id) => { const lead = leadsById.get(id); return lead ? <Link href={`/owner/leads/${encodeURIComponent(id)}`} key={id}>{lead.name}<span>→</span></Link> : null; })}</div> : null}
    </article>)}</div> : <section className="workspace-card empty-workspace"><h2>{copy.empty}</h2></section>}
  </main>;
}
