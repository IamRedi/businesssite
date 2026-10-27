"use client";

import { useEffect, useRef, useState } from "react";
import { resolveLocale, siteCopy } from "@platform/website-engine";
import { submitAppointmentRequest } from "../lib/appointment-request";
import { BookingRequestForm } from "./booking-request-form";

export function AppointmentRequestForm({
  slug,
  services,
  locale,
  privacyNoticeUrl,
}: {
  slug: string;
  services: Array<{ title: string }>;
  locale: string | undefined;
  privacyNoticeUrl?: string;
}) {
  const copy = siteCopy[resolveLocale(locale)];
  const [booking, setBooking] = useState<{ enabled: boolean; timezone?: string } | null>(null);
  const [bookingUnavailable, setBookingUnavailable] = useState(false);
  const inFlight = useRef(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  useEffect(() => {
    let active = true;
    fetch(`/api/public/booking?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async response => { if (response.status === 404) return { enabled: false }; if (!response.ok) throw new Error("config"); return response.json(); })
      .then(value => { if (active) setBooking(value); })
      .catch(() => { if (active) setBookingUnavailable(true); });
    return () => { active = false; };
  }, [slug]);
  if (bookingUnavailable) return <p className="appointment-error" role="alert">Termine sind derzeit nicht verfügbar.</p>;
  if (!booking) return <div><p role="status">Termine werden geladen…</p>{privacyNoticeUrl ? <a href={privacyNoticeUrl} target="_blank" rel="noreferrer">Datenschutzhinweise</a> : null}</div>;
  if (booking.enabled) return <BookingRequestForm slug={slug} services={services} timezone={booking.timezone ?? "Europe/Berlin"} privacyNoticeUrl={privacyNoticeUrl} />;
  async function submit(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("sending");
    setState(await submitAppointmentRequest(formData));
    inFlight.current = false;
  }
  return (
    <form className="appointment-form" aria-busy={state === "sending"} onSubmit={(event) => {
      event.preventDefault();
      // Keep uncontrolled field values on failure; a resolved React form action resets them.
      void submit(new FormData(event.currentTarget));
    }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="contractVersion" value="1" />
      <input className="form-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <label>
        {copy.fields.name}
        <input required name="customerName" autoComplete="name" maxLength={120} />
      </label>
      <label>
        {copy.fields.phone}
        <input required name="phone" type="tel" autoComplete="tel" maxLength={40} />
      </label>
      <label>
        {copy.fields.email}
        <input name="email" type="email" autoComplete="email" maxLength={160} />
      </label>
      <label>
        {copy.fields.service}
        <select name="serviceTitle">
          <option value="">{copy.generalRequest}</option>
          {services.map((service) => (
            <option key={service.title}>{service.title}</option>
          ))}
        </select>
      </label>
      <label>
        {copy.fields.date}
        <input required name="preferredDate" type="date" />
      </label>
      <label>
        {copy.fields.time}
        <input required name="preferredTime" type="time" />
      </label>
      <label className="wide">
        {copy.fields.message}
        <textarea name="note" maxLength={1000} rows={3} />
      </label>
      <p className="wide">
        {locale === "de" ? "Ihre Angaben werden zur Bearbeitung dieser Terminanfrage an das Unternehmen übermittelt." : "Your details are sent to the business to handle this appointment request."}{" "}
        {privacyNoticeUrl ? <a href={privacyNoticeUrl} target="_blank" rel="noreferrer">{locale === "de" ? "Datenschutzhinweise" : "Privacy notice"}</a> : null}
      </p>
      <button className="site-cta" disabled={state === "sending"}>
        {state === "sending" ? copy.sending : copy.requestAppointment}
      </button>
      {state === "sent" ? (
        <p className="appointment-success" role="status" aria-live="polite">{copy.requestSent}</p>
      ) : null}
      {state === "error" ? (
        <p className="appointment-error" role="alert">{copy.requestError}</p>
      ) : null}
    </form>
  );
}
