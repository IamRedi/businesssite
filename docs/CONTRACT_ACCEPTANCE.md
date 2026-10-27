# Contract acceptance evidence

Migration `036_b2b_commercial_legal_boundary.sql` adds `customer_business_identities` and immutable `contract_acceptances`. These records are contract evidence distinct from owner audit logs and Stripe metadata.

Migration `041` persists current checkout acceptance inside the same
session-bound transaction as business identity and subscriber intake. Runtime
and system have no direct table grants; the update/delete immutability trigger
remains effective for both. Historical `acceptance_unknown` rows are retained
and are never converted by migration.

## Server-owned evidence

For each checkout attempt the server records:

- exact intake, checkout attempt, site, actor site-admin account and customer business-identity IDs;
- Terms and Privacy document key, locale, version and SHA-256 content hash;
- separate B2B, contracting-authority, automatic-renewal and Privacy Notice acknowledgement versions;
- promotion-terms version only when the configured promotion is active;
- platform legal/commercial config version, plan, provider Price ID, currency, tax mode/label, normal displayed price, trial duration and monthly billing interval as server-owned snapshots;
- server timestamp, locale and `site_admin_checkout` source.

The record contains no cookie/session token, password, TOTP secret/code, payment method or raw payment data. Stripe metadata carries only non-secret correlation IDs and selected versions; it is not the canonical acceptance record.

The recorded locale comes from the durable authenticated EN/DE account preference, not the website-content locale or request body. Terms and Privacy must both match that locale; the repository returns no checkout evidence when either exact active reviewed document is missing. B2B, authority, renewal, promotion and cancellation acknowledgement copy is therefore presented and snapshotted only in the selected legal locale.

## Integrity and retries

Database triggers verify that the acceptance matches the intake's account/site/identity/attempt binding and reject update or deletion. The browser cannot select document versions or hashes. A retry with identical evidence reuses the same intake attempt and acceptance ID. A changed document version, identity or acknowledgement starts a new attempt and leaves prior evidence unchanged.

Provider webhook activation requires the bound intake to contain contract acceptance. The success redirect never activates access. Existing subscriptions are not backfilled: `site_subscriptions.contract_acceptance_state` defaults to `acceptance_unknown`; provider-confirmed new intake activation becomes `accepted`. Historical absence is not represented as acceptance.

## Operations and retention

Owner Legal shows bounded evidence and business verification state without secrets. Owner-only manual review needs fresh password/TOTP and creates an audit event. Contract evidence retention, subject-access handling and an authorised deletion/export process require a later GDPR/retention decision; operators must not bypass immutability ad hoc.
## Owner evidence access

Migration 042 exposes contract acceptance only through the authenticated
`audit.read` owner projection. Admin is read-only; only owner fresh-auth
procedures may change the related business verification state. Acceptance rows
remain immutable, and no routine can synthesize or rewrite historical consent.
