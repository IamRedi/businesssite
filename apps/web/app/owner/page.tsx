import Link from "next/link";
import { PostgresFinderRepository } from "@platform/business-finder";
import { OwnerSearch } from "../../components/owner-search";
import { ownerPanelLocale } from "../../lib/locale-model";
import { ownerCopy } from "../../lib/owner-copy";
import { translateLeadReason } from "../../lib/owner-workspace-copy";
import { requireOwnerPagePermission } from "../../lib/owner-authorization";
import { hasOwnerPermission } from "../../lib/owner-permissions";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const owner = await requireOwnerPagePermission("finder.read");
  const leads = await new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).listLeads();
  const priority = leads.filter((lead) => lead.score >= 75).length;
  const locale = ownerPanelLocale;
  const copy = ownerCopy[locale];
  return <main className="owner-shell">
    <header className="owner-header">
      <div><p className="eyebrow">{copy.dashboard.eyebrow}</p><h1>{copy.dashboard.title}</h1></div>
      <nav className="owner-actions" aria-label={copy.dashboard.eyebrow}>
        <Link className="button secondary" href="/owner/businesses">{copy.dashboard.savedBusinesses}</Link>
        <span className="secure-badge">{copy.dashboard.ownerOnly}</span>
      </nav>
    </header>
    <section className="metrics"><article><span>{copy.dashboard.savedLeads}</span><strong>{leads.length}</strong></article><article><span>{copy.dashboard.priorityLeads}</span><strong>{priority}</strong></article><article><span>{copy.dashboard.provider}</span><strong>Google Places</strong></article></section>
    <section className="workspace-card" id="finder"><div className="section-heading"><div><p className="eyebrow">{copy.dashboard.discovery}</p><h2>{copy.dashboard.findBusinesses}</h2></div><p>{copy.dashboard.cacheNote}</p></div>{hasOwnerPermission(owner.role, "finder.write") ? <OwnerSearch locale={locale} /> : <p>Your role can review Finder records but cannot run provider searches.</p>}</section>
    <section className="workspace-card"><div className="section-heading"><div><p className="eyebrow">{copy.dashboard.recentPipeline}</p><h2>{copy.dashboard.latestBusinesses}</h2></div><Link className="detail-link" href="/owner/businesses">{copy.dashboard.openWorkspace}</Link></div>{leads.length ? <div className="lead-table"><div className="lead-row lead-head"><span>{copy.dashboard.business}</span><span>{copy.dashboard.signals}</span><span>{copy.dashboard.score}</span><span>{copy.dashboard.stage}</span><span /></div>{leads.slice(0, 8).map((lead) => <div className="lead-row" key={lead.id}><div><strong>{lead.name}</strong><small>{lead.address || copy.dashboard.addressUnavailable}</small></div><div><span className={lead.signals.hasWebsite ? "chip neutral" : "chip alert"}>{lead.signals.hasWebsite ? copy.dashboard.websiteFound : copy.dashboard.noWebsite}</span><small>{lead.rating ? `${lead.rating} · ${lead.reviewCount ?? 0}` : copy.dashboard.noRating}</small></div><div><b className="score">{lead.score}</b><small>{translateLeadReason(locale, lead.reasons[0] ?? "")}</small></div><div><span className="chip">{copy.dashboard.discovered}</span></div><Link className="detail-link" href={`/owner/leads/${encodeURIComponent(lead.id)}`}>{copy.dashboard.review}</Link></div>)}</div> : <p>{copy.dashboard.empty}</p>}</section>
  </main>;
}
