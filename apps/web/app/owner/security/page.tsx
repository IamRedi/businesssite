import { requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { PostgresPrivacyRepository } from "@platform/site-data";
import { PrivacyExportPanel } from "../../../components/privacy-export-panel";

export const dynamic = "force-dynamic";

export default async function OwnerSecurityPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const owner = await requireOwnerPagePermission("security.self");
  const exportStatus = await new PostgresPrivacyRepository({ boundary: "owner", sessionHash: owner.sessionHash }).ownerSelfExportStatus();
  const error = (await searchParams).error;
  return <main className="owner-shell">
    <header className="owner-header"><div><p className="eyebrow">Owner security</p><h1>Authentication settings</h1><p>{owner.email}</p></div></header>
    {error ? <p className="error">The supplied password or MFA code was invalid or already used.</p> : null}
    <section className="workspace-card"><h2>Change password</h2><p>A fresh authenticator code is required. Every owner session is revoked after the change.</p>
      <form action="/api/owner/auth/password" method="post" className="admin-login">
        <input required type="password" name="currentPassword" autoComplete="current-password" placeholder="Current password" />
        <input required type="password" name="newPassword" autoComplete="new-password" minLength={16} maxLength={200} placeholder="New password (16+ characters)" />
        <input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="Authenticator code" />
        <button className="button">Change password and sign out everywhere</button>
      </form>
    </section>
    <section className="workspace-card"><h2>Replace recovery codes</h2><p>The old codes are invalidated immediately. Save the replacement set from the one-time response.</p>
      <form action="/api/owner/auth/recovery-codes" method="post" className="admin-login">
        <input required type="password" name="currentPassword" autoComplete="current-password" placeholder="Current password" />
        <input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="Authenticator code" />
        <button className="button secondary">Generate replacement codes</button>
      </form>
    </section>
    <PrivacyExportPanel mode="owner" status={exportStatus} />
    <form action="/api/owner/auth/logout" method="post"><button className="button secondary">Sign out</button></form>
  </main>;
}
