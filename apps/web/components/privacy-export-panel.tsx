"use client";
import { useState } from "react";
import type { PrivacyExportStatus } from "@platform/site-data";

export function PrivacyExportPanel({
  mode,
  slug,
  status,
  locale = "en",
}: {
  mode: "customer" | "owner";
  slug?: string;
  status: PrivacyExportStatus | null;
  locale?: "en" | "de";
}) {
  const de = locale === "de";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const base =
    mode === "owner"
      ? "/api/owner/privacy-export"
      : `/api/site-admin/${encodeURIComponent(slug ?? "")}/privacy-export`;
  async function post(action: "request" | "download", form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    try {
      const body = new URLSearchParams();
      for (const [key, value] of new FormData(form))
        if (typeof value === "string") body.append(key, value);
      if (action === "request") {
        const response = await fetch(`${base}/request`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Request failed");
        setMessage(
          de
            ? "Export wurde angefordert. Aktualisieren Sie den Status in Kürze."
            : "Export requested. Refresh the status shortly.",
        );
        return;
      }
      const capability = await fetch(`${base}/capability`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const issued = await capability.json();
      if (!capability.ok || !issued.token)
        throw new Error(issued.error ?? "Capability failed");
      const download = await fetch(`${base}/download`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: issued.token }),
      });
      if (!download.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await download.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "businesssite-data-export.zip";
      link.click();
      URL.revokeObjectURL(url);
      setMessage(
        de
          ? "Download abgeschlossen. Der Einmal-Code ist verbraucht."
          : "Download completed. The one-time capability is consumed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-card">
      <h2>{de ? "Ihre Daten exportieren" : "Export your data"}</h2>
      <p>
        {mode === "owner"
          ? de
            ? "Exportiert nur Ihr eigenes Teamkonto. Kunden-Datensätze sind ausgeschlossen."
            : "Exports only your own team account. Customer datasets are excluded."
          : de
            ? "Exportiert Daten nur für dieses angemeldete Kundenkonto und diese Website."
            : "Exports data only for this signed-in customer account and website."}
      </p>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>
            {status?.status ??
              (de ? "Noch nicht angefordert" : "Not requested")}
          </dd>
        </div>
        {status?.requestedAt ? (
          <div>
            <dt>{de ? "Angefordert" : "Requested"}</dt>
            <dd>{new Date(status.requestedAt).toLocaleString(locale)}</dd>
          </div>
        ) : null}
        {status?.artifact ? (
          <>
            <div>
              <dt>{de ? "Läuft ab" : "Expires"}</dt>
              <dd>
                {new Date(status.artifact.expiresAt).toLocaleString(locale)}
              </dd>
            </div>
            <div>
              <dt>{de ? "Größe" : "Size"}</dt>
              <dd>
                {status.artifact.archiveBytes} bytes ·{" "}
                {status.artifact.fileCount} files
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <form
        className="admin-login"
        onSubmit={(event) => {
          event.preventDefault();
          void post("request", event.currentTarget);
        }}
      >
        <input
          required
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          placeholder={de ? "Aktuelles Passwort" : "Current password"}
        />
        {mode === "owner" ? (
          <input
            required
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder={de ? "Neuer MFA-Code" : "Fresh MFA code"}
          />
        ) : null}
        <button className="button" disabled={busy}>
          {de ? "Export anfordern" : "Request export"}
        </button>
      </form>
      {status?.status === "completed" && status.artifact?.status === "ready" ? (
        <form
          className="admin-login"
          onSubmit={(event) => {
            event.preventDefault();
            void post("download", event.currentTarget);
          }}
        >
          <input type="hidden" name="jobId" value={status.jobId} />
          <input
            required
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            placeholder={
              de
                ? "Aktuelles Passwort erneut eingeben"
                : "Enter current password again"
            }
          />
          {mode === "owner" ? (
            <input
              required
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder={
                de ? "Neuer, unbenutzter MFA-Code" : "New, unused MFA code"
              }
            />
          ) : null}
          <button className="button secondary" disabled={busy}>
            {de ? "Einmal-Download erstellen" : "Create one-time download"}
          </button>
        </form>
      ) : null}
      {status?.errorCode ? (
        <p className="error">
          {de
            ? "Export konnte nicht abgeschlossen werden"
            : "Export could not be completed"}
          : {status.errorCode}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <small>
        {de
          ? "Der verschlüsselte Export wird nach höchstens 24 Stunden gelöscht. Download-Codes sind einmalig und 10 Minuten gültig."
          : "The encrypted export is deleted after at most 24 hours. Download capabilities are single-use and valid for 10 minutes."}
      </small>
    </section>
  );
}
