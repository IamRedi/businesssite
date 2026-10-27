import type { CustomerDeletionStatus } from "@platform/site-data";
export function PrivacyDeletionPanel({
  slug,
  status,
  locale,
  enabled,
}: {
  slug: string;
  status: CustomerDeletionStatus | null;
  locale: "de" | "en";
  enabled: boolean;
}) {
  const de = locale === "de";
  const active =
    status &&
    !["completed", "canceled", "rejected", "failed"].includes(status.phase);
  return (
    <section className="workspace-card">
      <h2>
        {de
          ? "Website schließen und Daten löschen"
          : "Close website and delete data"}
      </h2>
      <p>
        {de
          ? "Die Website wird zuerst privat geschaltet. Nach Vertragsende, 30 Tagen Schreibschutz und weiteren 30 Tagen Abkühlzeit sind Anbieterabgleich und Freigabe erforderlich."
          : "The website is made private first. After contract end, 30 days read-only and a further 30-day cooling period, provider reconciliation and approval are required."}
      </p>
      {!enabled ? (
        <p>
          <strong>
            {de
              ? "Löschanträge sind derzeit deaktiviert."
              : "Deletion requests are currently disabled."}
          </strong>
        </p>
      ) : null}
      {status ? (
        <p>
          {de ? "Status" : "Status"}: <strong>{status.phase}</strong>
          {status.coolingEndsAt
            ? ` · ${new Date(String(status.coolingEndsAt)).toLocaleString(locale)}`
            : ""}
        </p>
      ) : null}
      {enabled && !active ? (
        <form
          action={`/api/site-admin/${encodeURIComponent(slug)}/privacy-deletion/request`}
          method="post"
          className="admin-login"
        >
          <label>
            {de ? "Grund" : "Reason"}
            <select name="reason" required>
              <option value="business_closed">business_closed</option>
              <option value="service_no_longer_needed">
                service_no_longer_needed
              </option>
              <option value="business_transferred">business_transferred</option>
              <option value="privacy_request">privacy_request</option>
              <option value="other">other</option>
            </select>
          </label>
          <label>
            {de ? "Optionale Notiz" : "Optional note"}
            <textarea name="note" maxLength={500} />
          </label>
          <label>
            <input type="checkbox" name="acknowledge" value="yes" required />
            {de
              ? " Ich verstehe, dass die Ausführung unwiderruflich ist."
              : " I understand that execution is irreversible."}
          </label>
          <label>
            {de ? "Aktuelles Passwort" : "Current password"}
            <input
              type="password"
              name="currentPassword"
              maxLength={200}
              required
              autoComplete="current-password"
            />
          </label>
          <button className="button" type="submit">
            {de ? "Schließung beantragen" : "Request closure"}
          </button>
        </form>
      ) : null}
      {enabled && active && status ? (
        <form
          action={`/api/site-admin/${encodeURIComponent(slug)}/privacy-deletion/cancel`}
          method="post"
          className="admin-login"
        >
          <input type="hidden" name="jobId" value={status.jobId} />
          <label>
            {de ? "Aktuelles Passwort" : "Current password"}
            <input
              type="password"
              name="currentPassword"
              maxLength={200}
              required
              autoComplete="current-password"
            />
          </label>
          <button className="button secondary" type="submit">
            {de ? "Antrag abbrechen" : "Cancel request"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
