# Owner roles, permissions and team operations

Migration `033_owner_team_rbac.sql` extends the database-backed owner authentication core with fixed roles, invitations and attributed audit evidence. There is no public owner registration. SSO, custom roles and tenant-scoped owner memberships are outside this release.

Migration `042_owner_security_rbac_rls_boundaries.sql` moves the web owner
team boundary to `bsrc_owner_ops`. Every authenticated team/legal/customer
routine re-resolves the session hash and current database role. Sensitive team
and legal routines validate the same session, current password hash and a
non-replayed TOTP step in one database transaction. Browser actor IDs and roles
are not authority. The current automated inventory contains 14 owner pages, 25
API methods and four server actions; additions without classification fail the
inventory test.

Migration `043_information_redi_rls_boundaries.sql` moves publication
provisioning, REDI inbound grants and fixed ad-placeholder configuration behind
`DATABASE_OWNER_URL` routines. Each routine re-resolves the MFA owner session
and `information.manage` in PostgreSQL. Owner/admin succeed; operator/viewer
deny. Publication editorial roles remain a separate exact-site CMS boundary.

## Permission matrix

The executable source of truth is `apps/web/lib/owner-permissions.ts`; an inventory test fails when an owner page/API method is added without a classification or when an authenticated entrypoint omits its authorization helper.

| Permission | Owner | Admin | Operator | Viewer | Reason |
| --- | ---: | ---: | ---: | ---: | --- |
| `team.manage` | yes | no | no | no | Identity, invitation and role administration is owner-only. |
| `security.self` | yes | yes | yes | yes | Every signed-in person may secure their own account. |
| `security.accounts` | yes | no | no | no | Reserved for owner recovery/account administration. |
| `finder.read` | yes | yes | yes | yes | Operational records may be reviewed by all roles. |
| `finder.write` | yes | yes | yes | no | Provider calls and discovery mutations are not read-only. |
| `demos.manage` | yes | yes | yes | no | Demo generation changes customer-facing state. |
| `websites.read` | yes | yes | yes | yes | Read-only website visibility. |
| `websites.manage` | yes | yes | yes | no | Website credentials, previews and usage overrides mutate tenants. |
| `subscriptions.read` | yes | yes | yes | yes | Subscription status supports operations and viewer reporting. |
| `billing.manage` | yes | yes | no | no | Promotions and billing controls are restricted to owner/admin. |
| `ai.manage` | yes | yes | yes | no | AI runs can consume quota and apply content. |
| `information.manage` | yes | yes | no | no | Internal publication and REDI Information changes are restricted to owner/admin. |
| `audit.read` | yes | yes | no | no | Admin may investigate operations but cannot manage identities. |
| `platform.configure` | yes | no | no | no | Reserved for future explicit platform configuration routes. |

Unknown roles and permissions always deny. UI navigation is role-aware, but it is only a convenience: every authenticated page, API and server action performs its own database-session and permission check. Every state-changing owner request also requires same-origin headers.

## Route/action inventory

| Surface | Required permission |
| --- | --- |
| `/owner`, `/owner/businesses`, `/owner/leads/[id]`, `/owner/searches` | `finder.read` |
| `/owner/customers`, `/owner/sites/[slug]/usage` | `subscriptions.read` |
| `/owner/promotions` | `billing.manage` |
| `/owner/publications` | `information.manage` |
| `/owner/security` | `security.self` |
| `/owner/team` | `team.manage` |
| Finder search/geocode APIs | `finder.write` |
| Demo API | `demos.manage` |
| Owner AI analyze/apply APIs | `ai.manage` |
| Site admin/invitation/preview APIs | `websites.manage` |
| REDI Information grant API | `information.manage` |
| Password/recovery-code APIs | `security.self` |
| Team invitation/account/session APIs | `team.manage` |
| Promotion create/deactivate actions | `billing.manage` |
| Publication create action | `information.manage` |
| Tenant usage override action | `websites.manage` |
| Login, logout, MFA and invitation acceptance | Explicit public-auth/invitation classification; each mutation remains same-origin |

## Invitation and activation lifecycle

Only an active MFA-enrolled `owner` can issue, resend or revoke an invitation, and each operation requires the actor's current password plus a fresh non-replayed TOTP. Tokens contain 256 random bits; PostgreSQL stores only SHA-256 fingerprints. Invitations expire after 24 hours, are bound to normalized email and fixed role, and are single-use. A duplicate unexpired invitation is refused. Resend transactionally revokes the old invitation and creates a new token. An expired record is revoked before a new invitation for that email is inserted.

The email uses the configured white-label name and puts the secret in the URL fragment. Fragments are not sent in HTTP request targets or referrers; the invitation client removes it from browser history and submits it only in a same-origin POST body. The page is `no-store` with `Referrer-Policy: no-referrer`. Production never returns or displays a raw link. For isolated local automation only, `OWNER_INVITATION_DEV_LINKS=true` plus a JSON-format form request may return the fragment URL; the code disables that path when `NODE_ENV=production`.

Acceptance transactionally consumes the invitation and creates the invitation-bound account as `pending`; it creates no session. Successful mandatory MFA enrollment changes the account to `active` and only then issues a full owner session. An abandoned pending user can repeat password login to receive a fresh five-minute enrollment challenge. An owner may explicitly disable the pending account. Existing or disabled accounts are never automatically replaced/reactivated by an invitation.

Email delivery status is recorded as `sent`, `provider_not_configured` or `provider_error`; failure leaves one controlled invitation that can be explicitly resent and never creates a duplicate account.

## Team mutations and last-owner invariant

The team page shows email, role, status, MFA enrollment boolean, creation time, last session activity, active-session count and invitation delivery/lifecycle state. It never reads or renders password hashes, TOTP secrets, recovery/session hashes or invitation tokens. Role change, status change and revoke-all require explicit confirmation plus fresh password/TOTP.

Role changes revoke every target session and challenge. Disable does the same. Reactivation creates no session; an account without MFA becomes `pending` and must enroll. Target-session revocation is isolated by verified account ID.

Demotion, disable and administrative recovery share PostgreSQL advisory lock `7310331`, row locks and an in-transaction count of active MFA-enrolled `owner` accounts. Pending invitations, pending-MFA accounts and disabled accounts never count. Concurrent cross-demotions/disables therefore serialize, and the operation that would remove the last usable owner is denied and audited. First-owner bootstrap is the controlled provisioning exception before this invariant can exist.

Audit rows attribute actor, target owner/invitation and an optional correlation ID. Details use a fixed category/count allowlist. Passwords, TOTP values/secrets, recovery codes, session tokens and invitation tokens/URLs are prohibited from audit and application logs.
