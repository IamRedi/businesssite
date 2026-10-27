import { PostgresOwnerTeamRepository } from "@platform/site-data";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";
import { ownerRoles } from "../../../lib/owner-permissions";

export const dynamic = "force-dynamic";

function FreshFields() {
  return <>
    <input required type="password" name="currentPassword" autoComplete="current-password" placeholder="Your current password" />
    <input required name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="Fresh MFA code" />
  </>;
}

export default async function OwnerTeamPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const owner = await requireOwnerPagePermission("team.manage");
  const repository = new PostgresOwnerTeamRepository(undefined, owner.sessionHash);
  const [accounts, invitations] = await Promise.all([repository.listTeam(), repository.listInvitations()]);
  await repository.recordSensitiveTeamAccess(owner.ownerId, owner.correlationId);
  const { result } = await searchParams;
  return <main className="owner-shell">
    <header className="owner-header"><div><p className="eyebrow">Access control</p><h1>Owner team</h1><p>Invite people, assign least-privilege roles, and revoke access. Every mutation requires your password and a fresh MFA code.</p></div></header>
    {result ? <p className={result === "success" ? "success" : "error"}>{result === "success" ? "Team change completed." : `Team change was refused (${result.replaceAll("_", " ")}).`}</p> : null}
    <section className="workspace-card"><h2>Invite a team member</h2>
      <form action="/api/owner/team/invitations" method="post" className="admin-login">
        <input required type="email" name="email" autoComplete="email" placeholder="person@example.com" />
        <select name="role" defaultValue="viewer">{ownerRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select>
        <label>Invitation language<select name="recipientLocale" defaultValue="en"><option value="en">English</option><option value="de">Deutsch</option></select></label>
        <FreshFields />
        <button className="button">Send invitation</button>
      </form>
    </section>
    <section className="workspace-card"><h2>Accounts</h2>
      <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Email</th><th>Role / status</th><th>MFA</th><th>Activity</th><th>Controls</th></tr></thead><tbody>
        {accounts.map((account) => <tr key={account.id}><td>{account.email}{account.id === owner.ownerId ? " (you)" : ""}</td><td>{account.role} / {account.status}</td><td>{account.mfaEnrolled ? "Enrolled" : "Pending"}</td><td>{account.lastActivityAt ? new Date(account.lastActivityAt).toLocaleString("en-GB") : "Never"}<br />{account.activeSessions} active session(s)</td><td>
          <details><summary>Change role</summary><form action={`/api/owner/team/accounts/${account.id}/role`} method="post" className="admin-login"><select name="role" defaultValue={account.role}>{ownerRoles.map((role) => <option key={role}>{role}</option>)}</select><label><input required type="checkbox" name="confirm" value="yes" /> Confirm role change and forced sign-out</label><FreshFields /><button className="button secondary">Apply role</button></form></details>
          <details><summary>{account.status === "disabled" ? "Reactivate" : "Disable"}</summary><form action={`/api/owner/team/accounts/${account.id}/status`} method="post" className="admin-login"><input type="hidden" name="status" value={account.status === "disabled" ? "active" : "disabled"} /><label><input required type="checkbox" name="confirm" value="yes" /> Confirm account status change</label><FreshFields /><button className="button secondary">Confirm status</button></form></details>
          <details><summary>Revoke sessions</summary><form action={`/api/owner/team/accounts/${account.id}/sessions`} method="post" className="admin-login"><label><input required type="checkbox" name="confirm" value="yes" /> Confirm revocation of every target session</label><FreshFields /><button className="button secondary">Revoke all sessions</button></form></details>
        </td></tr>)}
      </tbody></table></div>
    </section>
    <section className="workspace-card"><h2>Invitations</h2>
      <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Email</th><th>Role</th><th>State</th><th>Expires</th><th>Controls</th></tr></thead><tbody>
        {invitations.map((invitation) => {
          const active = invitation.active;
          return <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role}</td><td>{invitation.acceptedAt ? "Accepted" : invitation.revokedAt ? "Revoked" : active ? `Pending / ${invitation.deliveryStatus}` : "Expired"}</td><td>{new Date(invitation.expiresAt).toLocaleString("en-GB")}</td><td>{active ? <>
            <details><summary>Resend</summary><form action={`/api/owner/team/invitations/${invitation.id}/resend`} method="post" className="admin-login"><FreshFields /><button className="button secondary">Replace link and resend</button></form></details>
            <details><summary>Revoke</summary><form action={`/api/owner/team/invitations/${invitation.id}/revoke`} method="post" className="admin-login"><FreshFields /><button className="button secondary">Revoke invitation</button></form></details>
          </> : "—"}</td></tr>;
        })}
      </tbody></table></div>
    </section>
  </main>;
}
