# Authentication and session model

Export is a separate fresh-auth boundary. Customer request/capability POSTs verify current password for the exact session-derived account/site. Owner request/capability POSTs require exact owner session, current password and a new non-replayed TOTP; every team role exports only itself. Raw capabilities are returned once, SHA-256 stored, 10-minute and atomically single-use.

Platform-owner and customer/site-admin identities are independent trust zones. Neither cookie, account ID nor recovery capability is accepted by the other zone.

## Platform owner

### Identity and bootstrap

Owner accounts live in `owner_accounts`; email lookup uses `lower(btrim(email))`, passwords use salted `scrypt`, and disabled accounts cannot authenticate or reuse an existing session. There is no public signup or email-reset endpoint and no environment-password fallback.

In RLS pilot mode owner authentication uses the procedure-only
`DATABASE_OWNER_URL` identity. The database chain is `opaque cookie -> strict
SHA-256 token hash -> active session -> active MFA-enrolled account ->
DB-derived role/permission`. Password login, five-minute challenges, TOTP,
single-use recovery, session rotation and revocation execute through fixed-path
`SECURITY DEFINER` routines from migration 042. The owner identity has no table
grants, ownership, DDL, `BYPASSRLS` or migrator membership. Missing owner
credentials fail closed and never fall back to `DATABASE_URL` in pilot.

After migrations `032_owner_auth_core.sql` and `033_owner_team_rbac.sql`, create the first owner from an interactive administrative TTY:

```bash
npm run owner:bootstrap -- --email owner@example.com
```

The command accepts the password only in a hidden prompt, refuses stdin piping and password arguments, obtains an exclusive table lock, and succeeds only when `owner_accounts` is empty. A second attempt is denied and audited. It does not create an owner at startup or from a web request. Sign in immediately to complete mandatory TOTP enrollment and store the one-time recovery codes offline.

Threat model: the bootstrap operator already has local/deployment-shell access and the database connection capability. The CLI prevents browser-based takeover, URL/history leakage and accidental repeat provisioning; it does not protect a database from an administrator who can execute arbitrary SQL. Restrict shell and database access separately and retain the owner-auth audit records.

The bootstrap identity is role `owner`. Further identities are provisioned only by an authenticated owner through the hash-only invitation/MFA lifecycle documented in [owner RBAC and team operations](OWNER_RBAC.md). Pending invitation accounts cannot authorize a page or API and receive a full session only after successful MFA enrollment.

### Password, MFA and session flow

`POST /api/owner/auth/login` normalizes email, performs persistent network and identity rate limits, and returns one generic error for unknown, disabled and wrong-password accounts. A correct password creates only a random five-minute `mfa_enroll` or `mfa_verify` challenge. Only the SHA-256 challenge fingerprint is stored. The challenge is account-bound, purpose-bound, expiring and single-use; its cookie cannot open owner UI or APIs.

TOTP follows RFC 6238 with SHA-1, six digits, a 30-second period and a ±1-step validation window. The current accepted time-step is saved to reject replay. Enrollment becomes active only after a valid code. The 20-byte secret is encrypted with AES-256-GCM under the independent `OWNER_MFA_ENCRYPTION_KEY`; the database never stores the plaintext secret or `otpauth` URI. The QR data URL is generated only on the dynamic enrollment page and auth responses are not publicly cacheable.

After MFA, `owner_session` contains a random canonical 256-bit hexadecimal bearer token. PostgreSQL stores only its SHA-256 fingerprint with owner ID, MFA completion, created/last-used/expiry and revocation timestamps. Every request reloads the session and active account from PostgreSQL. Cookies are host-only, `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` in production and expire after 12 hours. Successful full login rotates a prior browser session.

Recovery codes are ten random 80-bit values shown only in the enrollment or regeneration response. Only hashes are stored and each code is account-bound and single-use. Code login still requires a valid password challenge. Regeneration requires current password plus a fresh TOTP and atomically replaces the old set.

### Logout, password change and administrative recovery

`POST /api/owner/auth/logout` validates same-origin, revokes the session fingerprint in PostgreSQL and clears session/challenge cookies. It is safe to repeat. If revocation storage fails, it returns 503 without pretending the session was revoked.

`POST /api/owner/auth/password` requires an authenticated owner, current password and a fresh non-replayed TOTP. The password update and all-session/challenge revocation are transactional; the browser is sent back to login.

There is deliberately no public owner recovery. From a controlled administrative TTY use:

```bash
npm run owner:recover -- --email owner@example.com
```

This exact-email operation refuses missing/disabled targets, accepts the new password only through hidden prompts, revokes every owner session and challenge, deletes recovery codes, clears MFA enrollment and audits the result. It also refuses recovery of the last active MFA-enrolled owner because clearing that MFA would leave no usable owner. Provision and enroll another owner first. The next password login must enroll MFA again. It leaves no bypass credential.

`owner_auth_audit_events` also attributes team access, permission denial, invitations, delivery outcome, role/status changes, last-owner denial and target session revocation to actor/target/invitation/correlation identifiers. Its action and detail allowlists exclude arbitrary event types, passwords, tokens, TOTP values/secrets, recovery codes and encryption keys.

## Customer/site admin

A site-admin account owns exactly one `site_id`; authorization comes from a validated server-side session, never from a form email, slug, site ID, owner identity or billing-provider identity. Emails are normalized and passwords use salted `scrypt`. Unknown email, wrong password and unavailable site share one response; recovery is enumeration-safe.

`site_admin_session` is a random 256-bit token whose SHA-256 fingerprint is stored in PostgreSQL. Server-side expiry and current site availability are checked on each privileged request. Successful login/signup rotates the browser session. Logout revokes server-side before clearing the cookie; password change/reset revokes all account sessions. Reset tokens are random, hashed, expiring and transactionally single-use.

All authentication mutations are POST-only and same-origin. Preview tokens grant rendering only. Customer sessions, preview capabilities and owner MFA challenges never grant checkout ownership or owner access.

Customer authentication remains available across payment grace, paid
read-only and locked lifecycle states so billing/reactivation, logout, password
change and other security actions remain reachable. Lifecycle authorization is
separate from identity: an authenticated session never grants content mutation
unless the central subscription policy permits that exact capability. Expired
trials keep read-only panel access only through the configured recovery window;
private preview tokens still expire at the trial deadline and cannot bypass it.
See [Subscription lifecycle and customer access](SUBSCRIPTION_LIFECYCLE.md).
