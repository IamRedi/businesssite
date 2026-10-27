import Link from "next/link";
import { notFound } from "next/navigation";
import { PostgresFinderRepository } from "@platform/business-finder";
import type { PreparedBusinessProfile } from "@platform/website-engine";
import { CreateDemoButton } from "../../../../components/create-demo-button";
import { AiWebsiteStudio } from "../../../../components/ai-website-studio";
import { ownerPanelLocale } from "../../../../lib/locale-model";
import { PostgresSiteRepository } from "@platform/site-data";
import { formatOwnerDate, leadDetailCopy, translateLeadReason } from "../../../../lib/owner-workspace-copy";
import { requireOwnerPagePermission } from "../../../../lib/owner-authorization";
import { platformBrandProfile } from "../../../../lib/brand-profile";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerPagePermission("finder.read");
  const { id } = await params;
  const locale = ownerPanelLocale;
  const copy = leadDetailCopy[locale];
  const repo = new PostgresFinderRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const lead = await repo.getLead(id);
  if (!lead) notFound();
  const [pipeline, profiles, audit] = await Promise.all([repo.listPipelineEvents(id), repo.listPreparedProfiles(id), repo.listAuditEvents(id)]);
  const latest = profiles.at(-1);
  const prepared = latest?.profile as PreparedBusinessProfile | undefined;
  const generatedSite = await new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).getSiteByLeadId(id);
  return <main className="owner-shell">
    <nav className="detail-nav" aria-label={copy.navigation}><Link className="back-link" href="/owner/businesses">{copy.back}</Link><Link className="back-link" href="/owner">{copy.finder}</Link></nav>
    <header className="detail-header"><div><p className="eyebrow">{copy.intelligence}</p><h1>{lead.name}</h1><p>{lead.address || copy.addressUnavailable}</p></div><div className="score-card"><span>{copy.opportunityScore}</span><strong>{lead.score}</strong><small>/100</small></div></header>
    <div className="detail-grid">
      <section className="workspace-card"><p className="eyebrow">{copy.scoreEyebrow}</p><h2>{copy.scoreTitle}</h2><ul className="reason-list">{lead.reasons.map((reason) => <li key={reason}>{translateLeadReason(locale, reason)}</li>)}</ul><div className="signal-grid">{[
        [copy.website, lead.signals.hasWebsite ? (lead.signals.websiteQuality === "unknown" ? copy.unknown : lead.signals.websiteQuality) : copy.missing],
        [copy.phone, lead.signals.hasPhone ? copy.available : copy.missing],
        [copy.email, lead.signals.hasEmail ? copy.available : copy.notEnriched],
        [copy.rating, lead.signals.rating || copy.notAvailable],
        [copy.reviews, lead.signals.reviewCount || copy.notAvailable],
        [copy.activity, lead.signals.isActive ? copy.active : copy.unknown],
      ].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{String(value)}</strong></div>)}</div></section>
      <section className="workspace-card"><p className="eyebrow">{copy.businessEyebrow}</p><h2>{copy.businessTitle}</h2><dl className="data-list"><div><dt>{copy.category}</dt><dd>{lead.category || "—"}</dd></div><div><dt>{copy.website}</dt><dd>{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer">{copy.openWebsite}</a> : copy.notFound}</dd></div><div><dt>{copy.email}</dt><dd>{lead.signals.email || prepared?.business.email || copy.notFound}</dd></div><div><dt>{copy.phone}</dt><dd>{lead.phone || prepared?.business.phone || "—"}</dd></div><div><dt>{copy.address}</dt><dd>{lead.address || prepared?.business.address || "—"}</dd></div><div><dt>{copy.hours}</dt><dd>{lead.signals.openingHours?.length || prepared?.business.openingHours?.length ? copy.daysIdentified(lead.signals.openingHours?.length ?? prepared?.business.openingHours?.length ?? 0) : copy.notFound}</dd></div><div><dt>{copy.source}</dt><dd>Google Places{lead.signals.description ? ` + ${copy.aiAnalysis}` : ""}</dd></div></dl>{lead.signals.services?.length ? <div className="record-services"><span>{copy.servicesFound}</span><div className="business-service-tags">{lead.signals.services.map((service) => <span key={service}>{service}</span>)}</div></div> : null}{lead.signals.description ? <div className="record-description"><span>{copy.summary}</span><p>{lead.signals.description}</p></div> : null}</section>
      <AiWebsiteStudio leadId={lead.id} website={lead.website} locale={locale} publicAppUrl={platformBrandProfile.publicAppUrl} />
      <section className="workspace-card span-two"><div className="section-heading"><div><p className="eyebrow">{copy.demo}</p><h2>{copy.demoTitle}</h2></div><div className="action-row">{generatedSite ? <Link className="button secondary compact" href={`/owner/sites/${generatedSite.slug}/usage`}>{copy.usage}</Link> : null}<CreateDemoButton leadId={lead.id} locale={locale} publicAppUrl={platformBrandProfile.publicAppUrl} /></div></div>{latest && prepared ? <div className="prepared"><div><span>{copy.version}</span><strong>v{latest.version}</strong></div><div><span>{copy.status}</span><strong>{latest.status.replaceAll("_", " ")}</strong></div><div><span>{copy.services}</span><strong>{prepared.services.map((service) => service.title).join(" · ")}</strong></div></div> : <p>{copy.noProfile}</p>}</section>
      <section className="workspace-card"><p className="eyebrow">{copy.pipeline}</p><h2>{copy.pipelineTitle}</h2><ol className="timeline">{pipeline.length ? pipeline.map((event) => <li key={event.id}><strong>{event.status.replaceAll("_", " ")}</strong><span>{formatOwnerDate(locale, event.createdAt)}</span>{event.notes ? <p>{event.notes}</p> : null}</li>) : <li>{copy.noPipeline}</li>}</ol></section>
      <section className="workspace-card"><p className="eyebrow">{copy.audit}</p><h2>{copy.auditTitle}</h2><ol className="timeline">{audit.length ? audit.map((event) => <li key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong><span>{formatOwnerDate(locale, event.createdAt)}</span></li>) : <li>{copy.noAudit}</li>}</ol></section>
    </div>
  </main>;
}
