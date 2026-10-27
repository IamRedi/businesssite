"use client";

import { useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ProviderUsageSnapshot } from "@platform/site-data";
import { googleAllowances, modelLabel, monthlyAllowance, providerModels, remainingPercent, usageView, type ProviderCapabilities, type ProviderControlChange, type ProviderControlSnapshot, type ProviderSettings } from "../lib/provider-controls";
import styles from "./provider-control-center.module.css";

const integer = (n: number) => new Intl.NumberFormat("en-GB").format(n);
const euros = (n: number, precise = false) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: precise ? 4 : 2 }).format(n);
const dateLabel = (value: string, full = false) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", ...(full ? { year: "numeric" } : {}) }).format(new Date(value));
const tabs = ["Overview", "Controls", "Activity"] as const;
type Tab = typeof tabs[number];
type IconName = "spark" | "search" | "pin" | "arrow" | "settings" | "check" | "refresh" | "clock" | "plus" | "external";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    spark: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" /><path d="m20 2 .7 1.3L22 4l-1.3.7L20 6l-.7-1.3L18 4l1.3-.7Z" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 8a8 8 0 0 1 13-4l2 3M4 17l2 3a8 8 0 0 0 13-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    external: <><path d="M14 4h6v6m0-6L10 14" /><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Progress({ used, limit, label, tone = "coral" }: { used: number; limit: number; label: string; tone?: string }) {
  const percent = limit <= 0 ? 100 : Math.max(0, Math.min(100, used / limit * 100));
  return <div className={`${styles.progress} ${styles[tone] ?? ""}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${Math.round(percent)}% used`}><span style={{ "--progress": `${percent}%` } as CSSProperties} /></div>;
}
function Status({ active, children }: { active: boolean; children: ReactNode }) { return <span className={`${styles.status} ${active ? styles.active : styles.inactive}`}><i />{children}</span>; }
function Switch({ id, checked, onChange, disabled, label }: { id: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return <button id={id} className={styles.switch} type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span /></button>;
}
const editable = (settings: ProviderSettings) => ({ aiEnabled: settings.aiEnabled, aiModel: settings.aiModel, aiBudgetEur: settings.aiBudgetEur, googleEnabled: settings.googleEnabled, googleDailyLimit: settings.googleDailyLimit, googleMonthlyLimit: settings.googleMonthlyLimit, geocodingMonthlyLimit: settings.geocodingMonthlyLimit });

export function ProviderControlCenter({ usage, initialControls, capabilities }: { usage: ProviderUsageSnapshot; initialControls: ProviderControlSnapshot | null; capabilities: ProviderCapabilities }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [controls, setControls] = useState(initialControls);
  const [draft, setDraft] = useState(initialControls ? editable({ ...initialControls.settings, aiModel: initialControls.configured ? initialControls.settings.aiModel : capabilities.aiModel }) : null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState("all");
  const [extra, setExtra] = useState(5);
  const dialog = useRef<HTMLDialogElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const ids = useId();
  const view = usageView(usage);
  const fx = controls?.settings.usdPerEur ?? 1.1592;
  const convert = (micros: number) => micros / 1_000_000 / fx;
  const allowance = controls ? monthlyAllowance(controls) : 0;
  const spent = convert(controls?.aiUsedUsdMicros ?? 0);
  const held = convert(Math.max(0, (controls?.aiCommittedUsdMicros ?? 0) - (controls?.aiUsedUsdMicros ?? 0)));
  const percentLeft = remainingPercent(spent + held, allowance);
  const canEdit = capabilities.canManage && controls !== null;
  const effectiveAi = capabilities.aiReady && !!controls?.settings.aiEnabled;
  const effectiveGoogle = capabilities.googleReady && !!controls?.settings.googleEnabled;
  const original = controls ? editable({ ...controls.settings, aiModel: controls.configured ? controls.settings.aiModel : capabilities.aiModel }) : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const currentModel = controls?.configured ? controls.settings.aiModel : capabilities.aiModel;
  const resetDate = controls?.resetAt ?? new Date(Date.UTC(new Date(usage.generatedAt).getUTCFullYear(), new Date(usage.generatedAt).getUTCMonth() + 1, 1)).toISOString();
  const selectedModel = providerModels.find(model => model.id === draft?.aiModel);
  const hasUnpriced = view.unknownCalls > 0;

  async function update(change: Omit<ProviderControlChange, "revision" | "requestId">) {
    if (!controls || busy) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/owner/provider-controls", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...change, revision: controls.settings.revision, requestId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save. Refresh the page and try again.");
      const snapshot = result.snapshot as ProviderControlSnapshot;
      if (!snapshot?.settings || !Number.isSafeInteger(snapshot.settings.revision)) throw new Error("Settings response was incomplete. Refresh before retrying.");
      setControls(snapshot); setDraft(editable(snapshot.settings));
      setNotice({ kind: "success", text: change.action === "add_budget" ? "Extra allowance added for this month. Usage history is unchanged." : "Settings saved. New requests use these settings immediately." });
      dialog.current?.close();
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "Unable to save settings." }); }
    finally { setBusy(false); }
  }
  function changeTab(next: Tab) { setTab(next); setNotice(null); }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); changeTab(tabs[next]); document.getElementById(`${ids}-tab-${next}`)?.focus(); }
  }
  function openAllowance() { setNotice(null); setExtra(controls?.settings.aiBudgetEur || 5); dialog.current?.showModal(); }
  const days = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(usage.generatedAt); day.setUTCDate(day.getUTCDate() - 13 + index);
    const key = day.toISOString().slice(0, 10);
    const rows = usage.recent.filter(row => row.createdAt.slice(0, 10) === key);
    return { key, label: dateLabel(key), ai: rows.filter(row => row.provider === "openai").length, google: rows.filter(row => row.provider === "google_maps").length };
  });
  const largestDay = Math.max(1, ...days.map(day => day.ai + day.google));

  return <main className={`owner-shell ${styles.center}`}>
    <header className={styles.header}>
      <div><div className={styles.kicker}><Icon name="settings" size={15} /> YOUR WORKSPACE, YOUR LIMITS</div><h1>Usage & providers<span>.</span></h1><p>See what you use. Choose how you work. Stay in control.</p></div>
      <div className={styles.month}><Icon name="clock" size={17} /><span>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(usage.generatedAt))}<small>Usage period · UTC</small></span><button type="button" className={styles.iconButton} aria-label="Refresh usage" onClick={() => window.location.reload()}><Icon name="refresh" size={17} /></button></div>
    </header>
    <div className={styles.tabs} role="tablist" aria-label="Provider dashboard">
      {tabs.map((name, index) => <button key={name} id={`${ids}-tab-${index}`} type="button" role="tab" aria-selected={tab === name} aria-controls={`${ids}-panel-${index}`} tabIndex={tab === name ? 0 : -1} onKeyDown={event => tabKeys(event, index)} onClick={() => changeTab(name)}>{name}{name === "Controls" && dirty && <span className={styles.unsavedDot} aria-label="Unsaved changes" />}</button>)}
      <span className={styles.readOnly}>{canEdit ? "Owner controls" : "Read-only access"}</span>
    </div>
    {!controls && <div role="status" className={styles.banner}>Usage is available. Saving settings needs the provider-controls database migration. No controls have been activated.</div>}
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`${styles.banner} ${notice.kind === "error" ? styles.error : styles.success}`}><Icon name={notice.kind === "error" ? "clock" : "check"} />{notice.text}</div>}

    {tab === "Overview" && <section role="tabpanel" id={`${ids}-panel-0`} aria-labelledby={`${ids}-tab-0`} className={styles.reveal}>
      <div className={styles.summary}>
        <div className={styles.summaryPrimary}><div className={styles.sectionLabel}>THIS MONTH · KNOWN USAGE</div><strong className={styles.total}>{euros(convert(usage.month.estimatedCostUsdMicros))}</strong><p>List-price estimate before free allowances</p>{hasUnpriced && <button type="button" className={styles.textButton} onClick={() => changeTab("Activity")}>{view.unknownCalls} earlier calls have no recorded price <Icon name="arrow" size={15} /></button>}</div>
        <div className={styles.summaryStat}><span>Provider requests</span><strong>{integer(usage.month.calls)}</strong><small><b>{integer(usage.today.calls)}</b> today</small><span className={styles.microline}>Cache hits do not consume quota</span></div>
        <div className={styles.summaryStat}><span>AI tokens</span><strong>{integer(view.aiTokens)}</strong><small>Across {integer(view.aiCalls)} AI requests</small><span className={styles.microline}>Actual input + output tokens</span></div>
      </div>
      <div className={styles.sectionHeading}><div><h2>Your usage limits</h2><p>Room to work, at a glance.</p></div><button className={styles.textButton} type="button" onClick={() => changeTab("Controls")}>Manage controls <Icon name="arrow" size={16} /></button></div>
      <div className={styles.usagePanel}>
        <article className={styles.usageRow}>
          <div className={styles.providerIdentity}><span className={`${styles.providerIcon} ${styles.aiIcon}`}><Icon name="spark" size={24} /></span><div><h3>Owner AI <Status active={effectiveAi}>{effectiveAi ? "Available" : "Paused"}</Status></h3><p>OpenAI · {modelLabel(currentModel)}</p></div></div>
          <div className={styles.quota}><div><strong>{controls ? euros(spent) : "—"}<span> / {controls ? euros(allowance) : "—"}</span></strong><b>{controls ? `${percentLeft}% left` : "Setup needed"}</b></div><Progress used={spent + held} limit={allowance} label="Owner AI monthly budget" /><p>{held > 0 ? `${euros(held)} held for ${controls?.aiPending ? "an active request" : "a request with unconfirmed cost"}` : `Monthly allowance · renews ${dateLabel(resetDate)}`}</p></div>
          <button ref={addButton} type="button" className={styles.secondaryButton} disabled={!canEdit || busy} onClick={openAllowance}><Icon name="plus" size={16} /> Add allowance</button>
        </article>
        {view.google.map((sku, index) => <article className={styles.usageRow} key={sku.service}>
          <div className={styles.providerIdentity}><span className={`${styles.providerIcon} ${styles.googleIcon}`}><Icon name={index === 0 ? "search" : "pin"} size={23} /></span><div><h3>{sku.name}</h3><p>{sku.detail} <span className={styles.freeTag}>Free tier</span></p></div></div>
          <div className={styles.quota}><div><strong>{integer(sku.calls)}<span> / {integer(sku.freeCalls)} requests</span></strong><b>{remainingPercent(sku.calls, sku.freeCalls)}% left*</b></div><Progress used={sku.calls} limit={sku.freeCalls} label={`${sku.name} reference free allowance`} tone="mint" /><p>Published monthly free allowance · app-tracked usage</p></div>
          <button className={styles.secondaryButton} type="button" onClick={() => changeTab("Controls")}><Icon name="settings" size={16} /> Manage</button>
        </article>)}
        <div className={styles.footnote}>* Google shares free allowances across its billing account. Other projects may use the same allowance; the remaining amount here is a reference, not a verified Google balance. <a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Check billing <Icon name="external" size={12} /></a></div>
      </div>
      <div className={styles.lowerGrid}>
        <section className={styles.chartPanel}><div className={styles.sectionHeading}><div><h2>Recent activity</h2><p>Last 14 days · up to 50 recent requests</p></div><span className={styles.legend}><i className={styles.coralDot} /> AI <i className={styles.mintDot} /> Google</span></div><div className={styles.chart} role="img" aria-label={`Recent provider calls: ${days.map(day => `${day.label}: ${day.ai} AI, ${day.google} Google`).join("; ")}`}>{days.map(day => <div key={day.key} className={styles.chartColumn} title={`${day.label}: ${day.ai} AI, ${day.google} Google`}><div className={styles.barSlot}><i className={styles.aiBar} style={{ height: `${day.ai / largestDay * 100}%` }} /><i className={styles.googleBar} style={{ height: `${day.google / largestDay * 100}%` }} /></div><small>{day.key.slice(-2)}</small></div>)}</div></section>
        <aside className={styles.allowanceNote}><span className={styles.noteIcon}><Icon name="refresh" size={23} /></span><h2>A fresh allowance.<br />Every month.</h2><p>Your regular AI budget renews on <strong>{dateLabel(resetDate, true)}</strong>. Need more room? Add allowance just for this month.</p><small>Adding allowance changes your app limit. It does not purchase provider credits or charge a card.</small></aside>
      </div>
    </section>}

    {tab === "Controls" && <section role="tabpanel" id={`${ids}-panel-1`} aria-labelledby={`${ids}-tab-1`} className={styles.reveal}>
      {draft && controls ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); void update({ action: "save", settings: draft }); }}>
        <div className={styles.controlsGrid}>
          <section className={styles.settingsPanel}><header className={styles.settingsHeader}><span className={`${styles.providerIcon} ${styles.aiIcon}`}><Icon name="spark" size={23} /></span><div><h2>AI workspace</h2><p>Intelligence that fits the job.</p></div><Status active={effectiveAi}>{effectiveAi ? "Available" : "Paused"}</Status></header>
            <div className={styles.settingRow}><div><label htmlFor={`${ids}-ai-switch`}>Owner AI</label><p>Allow new owner analyses and website plans.</p></div><Switch id={`${ids}-ai-switch`} checked={draft.aiEnabled} label="Enable owner AI" disabled={!canEdit || busy} onChange={aiEnabled => setDraft({ ...draft, aiEnabled })} /></div>
            {!capabilities.aiReady && <p className={styles.inlineNotice}>OpenAI also needs the existing server connection and owner execution flag. This switch cannot override them.</p>}
            <div className={styles.field}><label htmlFor={`${ids}-provider`}>Provider</label><select id={`${ids}-provider`} value="openai" disabled><option value="openai">OpenAI · current integration</option></select><small>Other AI providers can be selected once their integration is installed.</small></div>
            <div className={styles.field}><label htmlFor={`${ids}-model`}>Model</label><select id={`${ids}-model`} value={draft.aiModel} disabled={!canEdit || busy} onChange={event => setDraft({ ...draft, aiModel: event.target.value })}>{!providerModels.some(model => model.id === draft.aiModel) && <option value={draft.aiModel}>{draft.aiModel} · unsupported for budget control</option>}{providerModels.map(model => <option key={model.id} value={model.id}>{model.name} — {model.description}</option>)}</select><div className={styles.modelInfo}><span><strong>{selectedModel ? `$${selectedModel.input.toFixed(2)}` : "Unknown"}</strong> input / 1M tokens</span><span><strong>{selectedModel ? `$${selectedModel.output.toFixed(2)}` : "Unknown"}</strong> output / 1M tokens</span></div></div>
            <div className={styles.field}><label htmlFor={`${ids}-budget`}>Monthly AI budget</label><div className={styles.moneyInput}><span>€</span><input id={`${ids}-budget`} type="number" min="0" max="1000" step="0.01" value={draft.aiBudgetEur} disabled={!canEdit || busy} onChange={event => setDraft({ ...draft, aiBudgetEur: Number(event.target.value) })} /><span>per month</span></div><small>€0 blocks new owner AI requests. Extra allowance is separate.</small></div>
            <div className={styles.budgetDetail}><Icon name="clock" size={18} /><p>New requests stop when the estimated allowance is used. One AI request runs at a time; its final cost can exceed the remaining estimate. This is an app spending guard, not a provider billing cap.</p></div>
            <div className={styles.miniStats}><span>Extra this month<strong>{euros(controls.settings.aiExtraEur)}</strong></span><span>Next renewal<strong>{dateLabel(resetDate)}</strong></span><button type="button" className={styles.textButton} disabled={!canEdit || busy} onClick={openAllowance}>Add allowance <Icon name="plus" size={15} /></button></div>
          </section>
          <section className={styles.settingsPanel}><header className={styles.settingsHeader}><span className={`${styles.providerIcon} ${styles.googleIcon}`}><Icon name="search" size={23} /></span><div><h2>Business discovery</h2><p>Find businesses. Keep usage predictable.</p></div><Status active={effectiveGoogle}>{effectiveGoogle ? "Available" : "Paused"}</Status></header>
            <div className={styles.settingRow}><div><label htmlFor={`${ids}-google-switch`}>Google requests</label><p>Pause live requests. Saved and cached results remain available.</p></div><Switch id={`${ids}-google-switch`} checked={draft.googleEnabled} label="Enable Google requests" disabled={!canEdit || busy} onChange={googleEnabled => setDraft({ ...draft, googleEnabled })} /></div>
            {!capabilities.googleReady && <p className={styles.inlineNotice}>The server Google connection is not configured. No credential is exposed here.</p>}
            <div className={styles.field}><label htmlFor={`${ids}-google-provider`}>Provider</label><select id={`${ids}-google-provider`} disabled value="google"><option value="google">Google Maps Platform</option></select><small>One page of search results counts as one provider request.</small></div>
            <div className={styles.fieldPair}><div className={styles.field}><label htmlFor={`${ids}-daily`}>Search requests / day</label><input id={`${ids}-daily`} type="number" min="0" max={capabilities.googleDailyCeiling} step="1" value={draft.googleDailyLimit} disabled={!canEdit || busy} onChange={event => setDraft({ ...draft, googleDailyLimit: Number(event.target.value) })} /><small>{integer(controls.googleToday)} used today · server ceiling {capabilities.googleDailyCeiling}</small></div><div className={styles.field}><label htmlFor={`${ids}-monthly`}>Search requests / month</label><input id={`${ids}-monthly`} type="number" min="0" max="100000" step="1" value={draft.googleMonthlyLimit} disabled={!canEdit || busy} onChange={event => setDraft({ ...draft, googleMonthlyLimit: Number(event.target.value) })} /><small>{integer(controls.googleCalls)} used this month</small></div></div>
            <div className={styles.field}><label htmlFor={`${ids}-geocode`}>Address lookups / month</label><input id={`${ids}-geocode`} type="number" min="0" max="100000" step="1" value={draft.geocodingMonthlyLimit} disabled={!canEdit || busy} onChange={event => setDraft({ ...draft, geocodingMonthlyLimit: Number(event.target.value) })} /><small>{integer(controls.geocodingCalls)} used · reference free allowance {integer(googleAllowances[1].freeCalls)}</small></div>
            <div className={styles.budgetDetail}><Icon name="check" size={18} /><p>These app limits are checked before every provider request, including each search page. Free allowances cannot be reset from this dashboard.</p></div>
            <a className={styles.providerLink} href="https://console.cloud.google.com/google/maps-apis/quotas" target="_blank" rel="noreferrer">Google Cloud quotas <Icon name="external" size={15} /></a>
          </section>
        </div>
        <div className={styles.saveBar}><div><strong>{dirty ? "You have unsaved changes" : "Your settings are up to date"}</strong><p>{dirty ? "Save to apply these settings to new owner requests." : "Saved controls apply across owner sessions."}</p></div><div><button type="button" className={styles.secondaryButton} disabled={!dirty || busy} onClick={() => { setDraft(original); setNotice(null); }}>Discard changes</button><button className={styles.primaryButton} type="submit" disabled={!canEdit || busy || (!dirty && controls.configured)}>{busy ? "Saving…" : "Save settings"}<Icon name="check" size={17} /></button></div></div>
      </form> : <div className={styles.empty}>Provider settings will be available after the database migration is applied.</div>}
      <details className={styles.disclosure}><summary>Pricing, security & how limits work</summary><div><p>All settings are owner-only, audited and protected by the current MFA session. API keys stay in the server secret store. An application switch cannot enable a disabled server feature.</p><p>EUR planning conversion: €1 = ${fx.toFixed(4)}, ECB reference dated {controls?.settings.fxAsOf ?? "2026-09-11"}. This is a fixed planning rate, not a live currency conversion. Google estimates use standard global list prices; free allowances, other projects, discounts, tax and credits can change the final bill.</p><p>The AI spending guard covers owner requests metered by these controls from their installation. Earlier unpriced calls remain visible in Activity and are not guessed or erased. Requests with no confirmed cost retain their remaining allowance as a hold; extra allowance never clears that record. Customer AI has its own existing controls.</p>{capabilities.customAiEndpoint && <p>A custom AI endpoint is configured. Standard OpenAI prices are reference estimates; its invoice may differ.</p>}<p><a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI pricing</a> · <a href="https://developers.google.com/maps/billing-and-pricing/pricing" target="_blank" rel="noreferrer">Google free allowances</a> · <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html" target="_blank" rel="noreferrer">ECB reference rate</a></p></div></details>
    </section>}

    {tab === "Activity" && <section role="tabpanel" id={`${ids}-panel-2`} aria-labelledby={`${ids}-tab-2`} className={styles.reveal}>
      <div className={styles.sectionHeading}><div><h2>What was used</h2><p>Current month · recorded usage, without prompts or private content.</p></div><label className={styles.filter}>Show<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All providers</option><option value="openai">OpenAI</option><option value="google_maps">Google</option></select></label></div>
      <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Provider usage breakdown this month</caption><thead><tr><th scope="col">Provider & service</th><th scope="col">Requests</th><th scope="col">Tokens</th><th scope="col">Known estimate</th></tr></thead><tbody>{usage.providers.filter(row => filter === "all" || row.provider === filter).map(row => <tr key={`${row.provider}-${row.service}`}><td><span className={styles.tableIdentity}><Icon name={row.provider === "openai" ? "spark" : "search"} /><span><strong>{row.provider === "openai" ? `OpenAI ${modelLabel(row.service)}` : googleAllowances.find(sku => sku.service === row.service)?.name ?? row.service}</strong><small>{row.provider === "openai" ? row.service : "Google Maps Platform"}</small></span></span></td><td>{integer(row.calls)}</td><td>{row.totalTokens ? <><strong>{integer(row.totalTokens)}</strong><small>{integer(row.inputTokens)} in · {integer(row.outputTokens)} out</small></> : <span className={styles.muted}>Not token-based</span>}</td><td><strong>{row.unknownPriceCalls === row.calls ? "Not priced" : euros(convert(row.estimatedCostUsdMicros), true)}</strong>{row.unknownPriceCalls > 0 && <small className={styles.unpriced}>{row.unknownPriceCalls} unpriced {row.unknownPriceCalls === 1 ? "call" : "calls"}</small>}</td></tr>)}</tbody></table>{!usage.providers.filter(row => filter === "all" || row.provider === filter).length && <div className={styles.empty}>No recorded usage for this provider this month.</div>}</div>
      <p className={styles.activityNote}>An unpriced call is not a free call. Token counts are preserved; no historical price is invented. Google figures show list-price equivalents before free allowances.</p>
    </section>}
    <footer className={styles.footer}><span><Icon name="check" size={14} /> Private owner workspace</span><span>Snapshot {dateLabel(usage.generatedAt)} · {new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date(usage.generatedAt))} UTC</span></footer>
    <dialog ref={dialog} className={styles.dialog} onClose={() => addButton.current?.focus()}>
      <form onSubmit={event => { event.preventDefault(); void update({ action: "add_budget", amountEur: extra }); }}><span className={styles.noteIcon}><Icon name="plus" size={26} /></span><h2>A little more room.</h2><p>Add AI allowance for the current month. Your regular monthly budget and usage history stay unchanged.</p><label htmlFor={`${ids}-extra`}>Extra allowance in EUR</label><div className={styles.moneyInput}><span>€</span><input id={`${ids}-extra`} type="number" autoFocus min="0.01" max="1000" step="0.01" value={extra} onChange={event => setExtra(Number(event.target.value))} disabled={busy} /></div><div className={styles.presets}>{[5, 10, 20].map(amount => <button key={amount} type="button" aria-pressed={extra === amount} onClick={() => setExtra(amount)}>{euros(amount)}</button>)}</div><p className={styles.microline}>Expires {dateLabel(resetDate)}. This does not buy credits or charge your card.</p>{notice?.kind === "error" && <p role="alert" className={styles.inlineNotice}>{notice.text}</p>}<div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => dialog.current?.close()} disabled={busy}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy || !canEdit || extra <= 0}>{busy ? "Adding…" : `Add ${euros(extra)}`}</button></div></form>
    </dialog>
  </main>;
}
