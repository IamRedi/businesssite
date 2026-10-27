import Link from "next/link";
import { cookies } from "next/headers";
import { PostgresSiteRepository } from "@platform/site-data";
import { configuredBillingCurrency, plansForCurrency } from "../../../lib/platform-config";
import { ownerPanelLocale } from "../../../lib/locale-model";
import { ownerOperationsCopy } from "../../../lib/owner-navigation-copy";
import { customerStateGroup, ownerCustomerState } from "../../../lib/owner-customer-state";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";

export const dynamic = "force-dynamic";

const localeTags = { de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT", sq: "sq-AL" } as const;
const socialLabels = {
  de: { title: "Social Media Add-on", none: "Nicht abonniert", workspace: "Nicht verbunden" }, en: { title: "Social Media add-on", none: "Not subscribed", workspace: "Not connected" },
  fr: { title: "Module réseaux sociaux", none: "Non abonné", workspace: "Non connecté" }, es: { title: "Complemento de redes sociales", none: "Sin suscripción", workspace: "Sin conectar" },
  it: { title: "Componente Social Media", none: "Non abbonato", workspace: "Non collegato" }, sq: { title: "Add-on i rrjeteve sociale", none: "Pa abonim", workspace: "Pa lidhur" },
} as const;

export default async function OwnerCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const owner = await requireOwnerPagePermission("subscriptions.read");
  const query = await searchParams;
  const requestCookies = await cookies();
  const locale = ownerPanelLocale;
  const currency = configuredBillingCurrency(requestCookies.get("platform_currency")?.value);
  const copy = ownerOperationsCopy[locale].customers;
  const socialCopy = socialLabels[locale];
  const records = await new PostgresSiteRepository({ boundary: "owner", sessionHash: owner.sessionHash, correlationId: owner.correlationId }).listOwnerCustomers(owner.sessionHash);
  const enriched = records.map((record) => ({ record, state: ownerCustomerState(record) }));
  const term = query.q?.trim().toLocaleLowerCase() ?? "";
  const filter = ["all", "active", "trial", "attention", "canceled"].includes(query.status ?? "") ? query.status! : "all";
  const visible = enriched.filter(({ record, state }) => {
    const matches = !term || [record.businessName, record.email, record.customDomain, record.slug].some((value) => value?.toLocaleLowerCase().includes(term));
    return matches && (filter === "all" || customerStateGroup(state) === filter);
  });
  const active = enriched.filter(({ state }) => customerStateGroup(state) === "active").length;
  const trials = enriched.filter(({ state }) => customerStateGroup(state) === "trial").length;
  const attention = enriched.filter(({ state }) => customerStateGroup(state) === "attention").length;
  const activePlans = (plan: "starter" | "professional" | "premium") => enriched.filter(({ record, state }) => record.planKey === plan && customerStateGroup(state) === "active").length;
  const formatDate = (value?: string) => value ? new Intl.DateTimeFormat(localeTags[locale], { dateStyle: "medium" }).format(new Date(value)) : "—";
  const shortId = (value?: string) => value ? `…${value.slice(-7)}` : undefined;

  return <main className="owner-shell owner-operations-page">
    <header className="owner-header"><div><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="owner-intro">{copy.intro}</p></div><span className="secure-badge">OWNER</span></header>
    <section className="metrics owner-operations-metrics"><article><span>{copy.total}</span><strong>{records.length}</strong></article><article><span>{copy.active}</span><strong>{active}</strong></article><article><span>{copy.trials}</span><strong>{trials}</strong></article><article><span>{copy.attention}</span><strong>{attention}</strong></article></section>
    <section className="metrics owner-plan-metrics">{plansForCurrency(currency).map((plan) => <article key={plan.key}><span>{plan.name} · {plan.price}</span><strong>{activePlans(plan.key)}</strong></article>)}</section>
    <form className="business-workspace-filters owner-operation-filters" method="get"><label><span>{copy.search}</span><input type="search" name="q" defaultValue={query.q} placeholder={copy.searchPlaceholder} /></label><label><span>{copy.status}</span><select name="status" defaultValue={filter}><option value="all">{copy.all}</option><option value="active">{copy.activeFilter}</option><option value="trial">{copy.trialFilter}</option><option value="attention">{copy.attentionFilter}</option><option value="canceled">{copy.canceledFilter}</option></select></label><button className="button" type="submit">{copy.apply}</button>{term || filter !== "all" ? <Link className="button secondary" href="/owner/customers">{copy.reset}</Link> : null}</form>
    {visible.length ? <div className="owner-customer-grid">{visible.map(({ record, state }) => {
      const group = customerStateGroup(state);
      return <article className="owner-customer-card" key={record.siteId}>
        <header><div><span className={`operation-status ${group}`}>{copy.states[state as keyof typeof copy.states] ?? state}</span><h2>{record.businessName}</h2><p>{record.email || copy.noEmail}</p></div><strong className="plan-badge">{record.planKey || copy.noPlan}</strong></header>
        <dl><div><dt>{copy.plan}</dt><dd>{record.planKey || copy.noPlan}</dd></div><div><dt>{copy.renewal}</dt><dd>{formatDate(record.currentPeriodEnd || (group === "trial" ? record.demoExpiresAt : undefined))}</dd></div><div><dt>{copy.domain}</dt><dd>{record.customDomain || copy.noDomain}</dd></div><div><dt>{copy.source}</dt><dd>{record.onboardingSource === "self_service" ? copy.selfService : copy.outreach}</dd></div><div><dt>{copy.created}</dt><dd>{formatDate(record.createdAt)}</dd></div><div><dt>Billing</dt><dd title={record.providerSubscriptionId}>{record.billingProvider ? `${record.billingProvider === "stripe" ? "Stripe" : "Paddle"} ${shortId(record.providerSubscriptionId) || ""}` : "—"}</dd></div><div><dt>{socialCopy.title}</dt><dd title={record.socialAddonSubscriptionId}>{record.socialAddonStatus || socialCopy.none}</dd></div><div><dt>Redi Control</dt><dd title={record.socialControlWorkspaceId}>{record.socialControlStatus || socialCopy.workspace}</dd></div></dl>
        {record.cancelAtPeriodEnd ? <p className="subscription-warning">{copy.ending}</p> : null}
        <footer>{record.activatedAt ? <Link className="button secondary" href={`/site/${encodeURIComponent(record.slug)}`} target="_blank">{copy.openSite}</Link> : null}<Link className="detail-link" href={`/owner/sites/${encodeURIComponent(record.slug)}/usage`}>{copy.usage}</Link>{owner.role !== "viewer" ? <Link className="detail-link" href={`/owner/sites/${encodeURIComponent(record.slug)}/custom-design`}>Custom design</Link> : null}</footer>
      </article>;
    })}</div> : <section className="workspace-card empty-workspace"><h2>{copy.empty}</h2></section>}
  </main>;
}
