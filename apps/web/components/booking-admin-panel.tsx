"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmedBookingWhatsApp } from "../lib/booking-whatsapp";
import type { BookingSnapshot } from "@platform/site-data";

const days = ["Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag","Sonntag"];
type Weekly = BookingSnapshot["weekly"][number];
export function BookingAdminPanel({ slug, initial, businessName = "" }: { slug: string; initial: BookingSnapshot; businessName?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"new" | "confirmed" | "all">("new");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [proposing, setProposing] = useState<string | null>(null);
  const [proposedTime, setProposedTime] = useState("");
  const [snapshot,setSnapshot] = useState(initial);
  const [timezone] = useState(initial.settings?.timezone ?? "Europe/Berlin");
  const [slotMinutes,setSlotMinutes] = useState(initial.settings?.slotMinutes ?? 30);
  const [enabled,setEnabled] = useState(initial.settings?.enabled ?? false);
  const [weekly,setWeekly] = useState(initial.weekly);
  const [blocks,setBlocks] = useState(initial.blocks);
  const [feedback,setFeedback] = useState("");
  const [composerUrl,setComposerUrl] = useState("");
  const [busy,setBusy] = useState(false);
  const [blockKind,setBlockKind] = useState<"closed_day" | "manual">("closed_day");
  const [blockStart,setBlockStart] = useState("");
  const [blockEnd,setBlockEnd] = useState("");
  async function post(body: object) {
    const response = await fetch(`/api/site-admin/${slug}/booking`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  }
  async function save() {
    setBusy(true); setFeedback("");
    try {
      const { response,data } = await post({ action: "configure", version: snapshot.settings?.version ?? 0, timezone, slotMinutes, enabled, weekly, blocks });
      if (!response.ok) { setFeedback(data.errorCode === "stale" ? "Konfiguration wurde anderswo geändert. Bitte neu laden." : "Speichern fehlgeschlagen."); return; }
      setSnapshot(previous => ({ ...previous, settings: { timezone, slotMinutes, enabled, holdMinutes: 15, version: data.version }, weekly, blocks }));
      setFeedback("Verfügbarkeit gespeichert.");
    } catch { setFeedback("Speichern fehlgeschlagen."); } finally { setBusy(false); }
  }
  function addWeekly(day: number, kind: Weekly["kind"]) {
    setWeekly(previous => [...previous,{ day,kind,start:kind === "work" ? "09:00" : "12:00",end:kind === "work" ? "17:00" : "13:00" }]);
  }
  function editWeekly(index: number, field: "start" | "end", value: string) {
    setWeekly(previous => previous.map((item,i) => i === index ? { ...item,[field]:value } : item));
  }
  function addBlock() {
    if (!blockStart || !blockEnd || Date.parse(blockStart) >= Date.parse(blockEnd)) { setFeedback("Ungültiger Sperrzeitraum."); return; }
    setBlocks(previous => [...previous,{ kind: blockKind, start: new Date(blockStart).toISOString(), end: new Date(blockEnd).toISOString() }]);
    setBlockStart(""); setBlockEnd("");
  }
  async function transition(id: string, action: "confirm" | "confirm_proposed" | "decline" | "cancel" | "propose" | "accept_proposed", version: number, newStart?: string, composer?: Window | null) {
    setBusy(true); setFeedback(""); setComposerUrl("");
    try {
      const { response,data } = await post({ action,id,version,newStart });
      if (!response.ok) { composer?.close(); setFeedback(data.errorCode === "slot_unavailable" ? "Slot nicht mehr frei. Bitte andere Zeit wählen." : "Aktion fehlgeschlagen. Bitte neu laden."); return; }
      setSnapshot(previous => ({ ...previous, appointments: previous.appointments.map(item => item.id === id
        ? { ...item, status: data.status ?? item.status, version: data.version ?? item.version,
            startsAt: action === "confirm_proposed" ? data.startsAt ?? item.startsAt : item.startsAt,
            proposedStart: action === "propose" ? newStart ?? null : action === "confirm_proposed" || action === "decline" ? null : item.proposedStart } : item) }));
      if (action === "confirm" || action === "confirm_proposed" || action === "propose") {
        if (data.whatsappUrl && composer) { composer.opener = null; composer.location.href = data.whatsappUrl; }
        else composer?.close();
        if (data.whatsappUrl && !composer) setComposerUrl(data.whatsappUrl);
        setFeedback(data.whatsappUrl
          ? `${action === "propose" ? "Vorschlag gespeichert" : "Bestätigt"}. ${composer ? "WhatsApp Composer geöffnet" : "WhatsApp Link unten öffnen"}; Versand nicht geprüft.`
          : "Gespeichert. WhatsApp Link konnte nicht erzeugt werden.");
      } else setFeedback("Gespeichert.");
      router.refresh();
    } catch { composer?.close(); setFeedback("Aktion fehlgeschlagen."); } finally { setBusy(false); }
  }
  const formatDate = (value: string) => new Intl.DateTimeFormat("de-DE", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const visible = snapshot.appointments.filter(item => tab === "all" || (tab === "confirmed" ? item.status === "confirmed" : ["requested", "proposed", "accepted"].includes(item.status)));
  const statusLabels = { requested: "Neue Anfrage", proposed: "Antwort ausstehend", accepted: "Zugesagt", confirmed: "Bestätigt", declined: "Abgelehnt", cancelled: "Storniert" };
  return <div className="premium-booking">
    <div className="premium-booking-toolbar"><div className="premium-segments" aria-label="Termine filtern">{(["new", "confirmed", "all"] as const).map((key, i) => <button key={key} type="button" aria-pressed={tab === key && !settingsOpen} onClick={() => { setTab(key); setSettingsOpen(false); }}>{["Neu", "Bestätigt", "Alle"][i]}</button>)}</div><button type="button" className="button secondary compact" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>Einstellungen</button></div>
    {feedback ? <p className="premium-feedback" role="status">{feedback} {composerUrl ? <a href={composerUrl} target="_blank" rel="noopener noreferrer">WhatsApp öffnen</a> : null}</p> : null}
    <section hidden={settingsOpen} aria-label="Termine">
      {visible.length ? visible.map(item => {
        const whatsapp = item.status === "confirmed" ? confirmedBookingWhatsApp({ phone: item.phone, name: item.name, startsAt: item.startsAt, timezone, businessName }) : null;
        return <article key={item.id} className="premium-appointment">
          <div className="premium-section-heading"><h2>{item.name}</h2><span className={`premium-badge ${item.status === "confirmed" ? "confirmed" : ""}`}>{statusLabels[item.status]}</span></div>
          <p className="premium-service">{item.service}</p><time dateTime={item.startsAt}>{formatDate(item.startsAt)}</time><a className="premium-phone" href={`tel:${item.phone}`}>{item.phone}</a>
          {item.proposedStart ? <p>Vorgeschlagen: {formatDate(item.proposedStart)}</p> : null}
          <div className="premium-actions">
            {item.status === "requested" || item.status === "accepted" ? <button className="button" disabled={busy} onClick={() => void transition(item.id, item.status === "accepted" ? "confirm_proposed" : "confirm", item.version, undefined, window.open("about:blank", "_blank"))}>Bestätigen &amp; WhatsApp</button> : null}
            {item.status === "proposed" ? <button className="button" disabled={busy} onClick={() => void transition(item.id, "accept_proposed", item.version)}>Kunde hat zugesagt</button> : null}
            {["requested", "proposed", "accepted"].includes(item.status) ? <><button className="button secondary" disabled={busy} aria-expanded={proposing === item.id} onClick={() => { setProposing(proposing === item.id ? null : item.id); setProposedTime(""); }}>Andere Zeit</button><button className="button secondary destructive" disabled={busy} onClick={() => void transition(item.id, "decline", item.version)}>Ablehnen</button></> : null}
            {item.status === "confirmed" ? <>{whatsapp ? <a className="button" href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}<button className="button secondary destructive" disabled={busy} onClick={() => void transition(item.id, "cancel", item.version)}>Stornieren</button></> : null}
          </div>
          {proposing === item.id ? <form className="premium-propose" onSubmit={event => { event.preventDefault(); if (!proposedTime || !Number.isFinite(Date.parse(proposedTime))) return; void transition(item.id, "propose", item.version, new Date(proposedTime).toISOString(), window.open("about:blank", "_blank")); setProposing(null); }}><label>Andere Zeit <input required type="datetime-local" value={proposedTime} onChange={event => setProposedTime(event.target.value)} /></label><small>Ortszeit Ihres Geräts</small><button className="button secondary" disabled={busy}>Vorschlagen &amp; WhatsApp</button></form> : null}
        </article>;
      }) : <div className="premium-empty"><h2>{tab === "new" ? "Alles erledigt" : "Noch keine Termine"}</h2><p>{tab === "new" ? "Neue Anfragen erscheinen hier." : "Ihre Termine erscheinen hier."}</p></div>}
    </section>
    <section hidden={!settingsOpen} className="premium-booking-settings" aria-label="Termin-Einstellungen">
      <div className="premium-section-heading"><h2>Terminbuchung</h2><label className="premium-switch"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />{enabled ? "EIN" : "AUS"}</label></div>
      <label>Dauer<select value={slotMinutes} onChange={event => setSlotMinutes(Number(event.target.value))}>{[15,30,45,60,90,120].map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}</select></label>
      <p className="premium-muted">Zeitzone: {timezone === "Europe/Berlin" ? "Deutschland" : timezone}</p>
      <h3>Öffnungszeiten &amp; Pausen</h3>
      {days.map((label,index) => { const day=index+1; return <div key={day} className="premium-booking-day"><strong>{label}</strong><div>{weekly.map((item,i) => item.day === day ? <div className="premium-time-row" key={`${day}-${i}`}><span>{item.kind === "work" ? "Geöffnet" : "Pause"}</span><input aria-label={`${label} ${item.kind === "work" ? "Öffnung" : "Pause"} Beginn ${i+1}`} type="time" value={item.start} onChange={event => editWeekly(i,"start",event.target.value)} /><span>–</span><input aria-label={`${label} Ende ${i+1}`} type="time" value={item.end} onChange={event => editWeekly(i,"end",event.target.value)} /><button className="premium-remove" aria-label={`${label} Zeitraum entfernen`} type="button" onClick={() => setWeekly(previous => previous.filter((_,n) => n !== i))}>×</button></div> : null)}{!weekly.some(item => item.day === day && item.kind === "work") ? <p className="premium-muted">Geschlossen</p> : null}<div className="premium-inline-actions"><button type="button" onClick={() => addWeekly(day,"work")}>+ Öffnungszeit</button><button type="button" onClick={() => addWeekly(day,"break")}>+ Pause</button></div></div></div>; })}
      <details className="premium-disclosure"><summary>Geschlossene Tage</summary><div className="premium-blocks"><label>Zeitraum<select value={blockKind} onChange={event => setBlockKind(event.target.value as "closed_day" | "manual")}><option value="closed_day">Geschlossener Tag</option><option value="manual">Abwesenheit</option></select></label><p className="premium-muted">Ortszeit Ihres Geräts</p><label>Von<input type="datetime-local" value={blockStart} onChange={event => setBlockStart(event.target.value)} /></label><label>Bis<input type="datetime-local" value={blockEnd} onChange={event => setBlockEnd(event.target.value)} /></label><button className="button secondary" type="button" onClick={addBlock}>Hinzufügen</button>{blocks.map((block,index) => <p key={`${block.start}-${index}`}>{formatDate(block.start)} – {formatDate(block.end)} <button type="button" className="premium-remove" aria-label="Schließung entfernen" onClick={() => setBlocks(previous => previous.filter((_,i) => i!==index))}>×</button></p>)}</div></details>
      <button className="button" type="button" disabled={busy} onClick={() => void save()}>Einstellungen speichern</button>
    </section>
  </div>;
}
