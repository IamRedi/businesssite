# Security policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials or customer data. Report suspected vulnerabilities privately through GitHub's **Report a vulnerability** button (Security tab of this repository) or by contacting [@IamRedi](https://github.com/IamRedi). Include the affected commit, reproduction conditions and impact. This public repository is a read-only snapshot of a privately maintained codebase; fixes are made there first and then published here.

## Security model

- Secrets are server-side environment configuration and are excluded from Git.
- Business-admin passwords use salted `scrypt`; random 256-bit session/reset tokens are stored only as SHA-256 fingerprints and expire server-side.
- Site-admin login, signup and recovery normalize identity and use enumeration-safe public responses. Missing accounts perform dummy password work at login.
- Site-admin login/signup rotate the browser's prior valid session. Logout revokes the current PostgreSQL session before clearing the host-only `HttpOnly`, `SameSite=Strict` cookie.
- Manual password change requires the current password and revokes every account session. One-time password reset consumes the hashed token and revokes all sessions atomically without automatic login.
- Owner routes and APIs are isolated from customer routes.
- Platform-owner passwords, encrypted TOTP state and account status are database-backed. Password success creates only a short MFA challenge; full owner sessions are opaque, fingerprinted in PostgreSQL, MFA-complete, expiring and revocable.
- Owner TOTP codes reject reused time-steps, recovery codes are hashed and single-use, and password/administrative recovery revokes all sessions. There is no public owner signup/reset or static environment-credential fallback.
- Fixed owner roles are enforced by a typed fail-closed permission matrix in every owner server entrypoint. Team mutations require fresh password/TOTP; role/status changes revoke target sessions.
- Owner invitation secrets are random 256-bit values stored only as hashes. Fragment-based links avoid request-target/referrer leakage; acceptance is single-use, same-origin and pending until MFA.
- A shared PostgreSQL advisory lock serializes owner demotion, disable and administrative recovery so at least one active MFA-enrolled owner remains.
- Stripe Checkout requires a valid, available site-admin session plus same-origin POST protection. Site/account/email identity comes from the session and current database record, not the browser.
- Stripe checkout contract evidence uses server-selected document versions/hashes and database triggers bind the exact account/site/intake/attempt/business identity. Evidence contains no session, password or payment secret and rejects update/delete.
- Stripe activation requires a valid provider signature, a durable intake bound to the same administrator/site/Price, immutable B2B acceptance and an attached server-created Checkout Session; processed event IDs remain idempotent.
- Subscription access is resolved by one fail-closed server policy. Provider
  timestamps and event IDs prevent stale/equal-time permissive transitions;
  payment grace allows only core edits and appointments while media, AI and
  domain provider operations remain denied server-side.
- Billing-provider customer email is never used as login identity and webhook processing never creates or rewrites the site administrator.
- Private previews use revocable, expiring HMAC-signed tokens; slug guessing cannot resolve a preview.
- Preview tokens authorize rendering only. They grant no checkout, ownership or identity authority.
- Expired trial previews and mutations are denied at request time. Cleanup waits
  for the durable recovery deadline, excludes every subscription and recent
  pending checkout, and never deletes paid data merely because access is locked.
- The website engine cannot access environment variables, HTTP, persistence, auth or billing.

## Deployment responsibilities

Operators must enforce HTTPS, restrict provider credentials, use a TLS database connection, enable backups, rotate secrets, review logs and keep dependencies patched. Public endpoints require provider-level rate limiting and bot protection before unrestricted launch.

Legal/commercial config mutation is owner-only. Activation and manual business verification reuse fresh password/TOTP with replay-safe database state and secret-free audit. Admin legal access is read-only; operator/viewer cannot configure the boundary.

## Known limitations

Owner-provider email/authenticator browser acceptance, buyer-specific monitoring, legal copy and asset provenance remain deployment responsibilities. SSO, custom roles and tenant-scoped owner membership are not implemented. Track operational gates through [owner RBAC operations](docs/OWNER_RBAC.md).
