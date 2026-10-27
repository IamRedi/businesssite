"use client";

import { useEffect, useState } from "react";

type Slot = { startsAt: string; endsAt: string; localTime: string };
export function BookingRequestForm({ slug, services, timezone, privacyNoticeUrl }: {
  slug: string; services: Array<{ title: string }>; timezone: string; privacyNoticeUrl?: string;
}) {
  const [service,setService] = useState("");
  const [day,setDay] = useState("");
  const [slots,setSlots] = useState<Slot[]>([]);
  const [start,setStart] = useState("");
  const [state,setState] = useState<"idle" | "loading" | "sending" | "sent" | "error" | "conflict">("idle");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  useEffect(() => {
    if (!day || !service) return;
    const controller = new AbortController();
    let cancelled = false;
    fetch(`/api/public/booking?slug=${encodeURIComponent(slug)}&date=${day}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("slots"); return response.json(); })
      .then(data => { if (!cancelled) { setSlots(Array.isArray(data.slots) ? data.slots : []); setStart(""); setState("idle"); } })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; controller.abort(); };
  }, [day,service,slug]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!service || !day || !slots.some(slot => slot.startsAt === start)) return;
    const data = new FormData(event.currentTarget);
    setState("sending");
    try {
      const response = await fetch("/api/public/booking", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, start, service, name: data.get("name"), phone: data.get("phone"), email: data.get("email") }) });
      if (response.status === 201) { setState("sent"); setSlots([]); return; }
      if (response.status === 409) {
        setState("conflict"); setStart("");
        const refresh = await fetch(`/api/public/booking?slug=${encodeURIComponent(slug)}&date=${day}`, { cache: "no-store" });
        if (refresh.ok) setSlots((await refresh.json()).slots ?? []);
        return;
      }
      setState("error");
    } catch { setState("error"); }
  }
  return <form className="appointment-form" onSubmit={submit} aria-busy={state === "sending" || state === "loading"}>
    <label>Leistung<select required value={service} onChange={event => { setService(event.target.value); setDay(""); setSlots([]); setStart(""); }}>
      <option value="">Leistung wählen</option>{services.map(item => <option key={item.title} value={item.title}>{item.title}</option>)}
    </select></label>
    <label>Datum<input required type="date" min={today} value={day} disabled={!service} onChange={event => { setDay(event.target.value); setSlots([]); setStart(""); }} /></label>
    <label>Freie Uhrzeit<select required value={start} disabled={!day || !slots.length} onChange={event => setStart(event.target.value)}>
      <option value="">Uhrzeit wählen</option>{slots.map(slot => <option key={slot.startsAt} value={slot.startsAt}>{slot.localTime}</option>)}
    </select></label>
    {day && slots.length === 0 ? <p className="wide">Keine freien Termine an diesem Tag.</p> : null}
    <label>Name<input required name="name" autoComplete="name" maxLength={120} /></label>
    <label>Telefon<input required name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
    <label>E-Mail (optional)<input name="email" type="email" autoComplete="email" maxLength={160} /></label>
    <p className="wide">Ihre Angaben werden zur Bearbeitung der Terminanfrage übermittelt. {privacyNoticeUrl ? <a href={privacyNoticeUrl} target="_blank" rel="noreferrer">Datenschutzhinweise</a> : null}</p>
    <button className="site-cta" disabled={state === "sending" || !start}>{state === "sending" ? "Wird gesendet…" : "Termin anfragen"}</button>
    {state === "sent" ? <p className="appointment-success" role="status">Termin angefragt – noch nicht bestätigt.</p> : null}
    {state === "conflict" ? <p className="appointment-error" role="alert">Dieser Termin ist nicht mehr frei. Bitte wählen Sie eine andere Uhrzeit.</p> : null}
    {state === "error" ? <p className="appointment-error" role="alert">Termine sind derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.</p> : null}
  </form>;
}
