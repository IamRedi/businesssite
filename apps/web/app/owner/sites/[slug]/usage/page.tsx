import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PostgresSiteRepository } from "@platform/site-data";
import { requireOwnerActionPermission, requireOwnerPagePermission } from "../../../../../lib/owner-authorization";

export const dynamic = "force-dynamic";

const formatQuantity = (metric: string, quantity: number) =>
  metric === "media_upload_bytes"
    ? `${(quantity / 1024 / 1024).toFixed(1)} MB`
    : new Intl.NumberFormat("en").format(quantity);

const overrideExpiry = (hours: number) =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

export default async function OwnerSiteUsagePage({ params }: { params: Promise<{ slug: string }> }) {
  const owner = await requireOwnerPagePermission("subscriptions.read");
  const { slug } = await params;
  const sites = new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId });
  const usage = await sites.getOwnerTenantUsageSnapshot(owner.sessionHash, slug);
  if (!usage) notFound();

  async function setOverride(formData: FormData) {
    "use server";
    const actionOwner = await requireOwnerActionPermission("usage.override");
    const action = String(formData.get("action") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const hours = Math.min(168, Math.max(1, Number.parseInt(String(formData.get("hours") ?? "1"), 10) || 1));
    if (!reason) redirect(`/owner/sites/${slug}/usage?error=reason`);
    const repository = new PostgresSiteRepository({ boundary: "owner", sessionHash: actionOwner.sessionHash, correlationId: actionOwner.correlationId });
    await repository.setOwnerTenantUsageOverride({
      sessionHash: actionOwner.sessionHash,
      slug,
      state: action === "allow" ? "normal" : action === "restrict" ? "temporarily_restricted" : undefined,
      reason,
      expiresAt: action === "clear" ? undefined : overrideExpiry(hours),
      correlationId: crypto.randomUUID(),
    });
    redirect(`/owner/sites/${slug}/usage?saved=1`);
  }

  return <main className="owner-shell">
    <header className="owner-header"><div><Link className="back-link" href="/owner/businesses">← Business workspace</Link><p className="eyebrow">Tenant usage</p><h1>{slug}</h1><p className="owner-intro">Plan-aware consumption, fair-use state and audited owner controls.</p></div><span className="secure-badge">Owner-only</span></header>
    <section className="metrics"><article><span>Current state</span><strong>{usage.state.replaceAll("_", " ")}</strong></article><article><span>Active override</span><strong>{usage.overrideState?.replaceAll("_", " ") ?? "none"}</strong></article><article><span>Reason</span><strong>{usage.overrideReason ?? usage.reasonCode ?? "normal usage"}</strong></article></section>
    <section className="workspace-card"><p className="eyebrow">Owner control</p><h2>Temporary, audited override</h2><p>Allow a verified legitimate spike, or restrict a tenant while abuse is investigated. Every change requires a reason.</p><form action={setOverride} className="business-workspace-filters"><label><span>Action</span><select name="action" defaultValue="allow"><option value="allow">Allow temporarily</option><option value="restrict">Restrict temporarily</option><option value="clear">Clear override</option></select></label><label><span>Hours</span><input name="hours" type="number" min="1" max="168" defaultValue="1" /></label><label><span>Reason</span><input name="reason" required maxLength={240} placeholder="Verified campaign, suspected abuse, support case…" /></label><button className="button" type="submit">Apply override</button></form></section>
    <div className="detail-grid"><section className="workspace-card"><p className="eyebrow">Current month</p><h2>Usage counters</h2>{usage.counters.length ? <dl className="data-list">{usage.counters.map((counter) => <div key={`${counter.metric}-${counter.window}-${counter.windowStart}`}><dt>{counter.metric.replaceAll("_", " ")} · {counter.window}</dt><dd>{formatQuantity(counter.metric, counter.quantity)}</dd></div>)}</dl> : <p>No metered usage yet.</p>}</section><section className="workspace-card"><p className="eyebrow">Audit</p><h2>Recent enforcement</h2>{usage.events.length ? <ol className="timeline">{usage.events.map((event) => <li key={event.id}><strong>{event.decision} · {event.metric.replaceAll("_", " ")}</strong><span>{new Date(event.createdAt).toLocaleString()}</span><p>{event.reasonCode.replaceAll("_", " ")}</p></li>)}</ol> : <p>No warning, throttle or override events.</p>}</section></div>
  </main>;
}
