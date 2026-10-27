import type { BookingSnapshot } from "@platform/site-data";
import type { SupportedLocale } from "@platform/website-engine";

export function SiteAdminOverview({ name, active, websiteUrl, booking, locale, now }: {
  name: string; active: boolean; websiteUrl: string; booking: BookingSnapshot | null; locale: SupportedLocale; now: number;
}) {
  const de = locale === "de";
  const requests = booking?.appointments.filter(item => ["requested", "proposed", "accepted"].includes(item.status)) ?? [];
  const upcoming = booking?.appointments.filter(item => item.status === "confirmed" && Date.parse(item.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3) ?? [];
  const date = (value: string) => new Intl.DateTimeFormat(locale, { timeZone: booking?.settings?.timezone ?? "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <div className="premium-overview">
    <section className="premium-site-status"><div><span className={`premium-badge ${active ? "confirmed" : ""}`}>{active ? (de ? "Website aktiv" : "Website active") : (de ? "Vorschau" : "Preview")}</span><h2>{name}</h2><p>{de ? "Alles bereit für Ihren nächsten Kunden." : "Ready for your next customer."}</p></div><div className="premium-actions"><a className="button" href="#content">{de ? "Website bearbeiten" : "Edit website"}</a><a className="button secondary" href={websiteUrl} target="_blank" rel="noreferrer">{de ? "Website öffnen" : "Open website"} ↗</a></div></section>
    <section className="premium-summary"><div className="premium-section-heading"><h2>{de ? "Neue Terminanfragen" : "New requests"}</h2><a href="#appointments">{de ? "Ansehen" : "View"} →</a></div>{requests.length ? <><p className="premium-request-count">{requests.length} <span>{de ? "warten auf Ihre Antwort" : "waiting for your reply"}</span></p>{requests.slice(0, 3).map(item => <a className="premium-summary-row" href="#appointments" key={item.id}><div><strong>{item.name}</strong><span>{item.service}</span></div><time dateTime={item.startsAt}>{date(item.startsAt)}</time></a>)}</> : <p className="premium-empty">{de ? "Alles erledigt. Keine neuen Anfragen." : "All caught up. No new requests."}</p>}</section>
    <section className="premium-summary"><div className="premium-section-heading"><h2>{de ? "Nächste Termine" : "Upcoming appointments"}</h2><a href="#appointments">{de ? "Alle Termine" : "All appointments"} →</a></div>{upcoming.length ? upcoming.map(item => <div className="premium-summary-row" key={item.id}><div><strong>{item.name}</strong><span>{item.service}</span></div><time dateTime={item.startsAt}>{date(item.startsAt)}</time></div>) : <p className="premium-empty">{de ? "Noch keine bestätigten Termine." : "No confirmed appointments yet."}</p>}</section>
  </div>;
}
