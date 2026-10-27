# Architecture

PostgreSQL tenant enforcement is incremental. Task Group 3-B1 adds distinct
migration/runtime boundaries and transaction-local context, with non-FORCE RLS
on only `site_features` and `site_information_ad_slots`. See
[`docs/ROW_LEVEL_SECURITY.md`](docs/ROW_LEVEL_SECURITY.md); other repositories
remain application-scoped until 3-B2–3-B4.

## System overview

```text
Google Places
     |
     v
Owner finder -> PostgreSQL -> PreparedBusinessProfile
                                  |
Self-service intake --------------+
                                  v
                         website-engine
                                  |
                                  v
                            SiteDocument
                                  |
                +-----------------+----------------+
                |                 |                |
          private preview   site-admin editor   subscription
                                                    |
                                              Stripe webhook
                                                    |
                                              public `/site/[slug]`
```

The Next.js application owns HTTP, cookies, UI and external-provider adapters. PostgreSQL is the system of record. The website engine is a deterministic package with no framework, network, database, authentication or billing dependency.

## Package responsibilities

### `packages/website-engine`

Validates and transforms `PreparedBusinessProfile` into `SiteDocument`. It owns template selection, theme tokens, default business copy, services and demo media. This package must remain pure and portable.

### `packages/business-finder`

Contains finder-domain types and the adapter that produces a versioned `PreparedBusinessProfile`. It does not render sites.

### `packages/site-data`

Owns PostgreSQL repositories and application services for leads, search cache, prepared profiles, sites, admin accounts, media, appointments, subscriptions and lifecycle cleanup.

### `packages/platform`

Contains neutral shared contracts used across packages. It must not acquire UI or provider-specific behavior.

### `apps/web`

Composes packages into four trust zones:

- Public marketing and trial routes.
- Private preview and business-admin routes, including authenticated subscription checkout.
- Owner-only Finder and demo-management routes.
- Internal webhook and scheduled-operation routes.

## Trust boundaries

| Zone | Authentication | Allowed responsibilities |
| --- | --- | --- |
| Public | None | Marketing, trial intake and preview token/slug resolution |
| Business admin | Rotating random cookie with a hashed, expiring and revocable PostgreSQL session | Edit only the session-bound account's site, review its appointments, change credentials and start checkout for that same site |
| Platform owner | Signed email/password session | Finder, leads, demos and credential creation |
| Internal | Dedicated bearer secret or provider signature | Cleanup; subscription activation requires a verified billing-provider signature |

Owner token authentication is suitable for controlled operation, not for a multi-user production organization. See production readiness.

## Critical invariants

- Finder-to-site communication occurs only through `PreparedBusinessProfile`.
- A profile version maps idempotently to a demo site.
- Stripe state changes are accepted only after signature verification and recorded idempotently.
- Base checkout requires an available site-admin session. The server binds the intake to that account/site and never derives ownership from browser or billing-provider email.
- Site-admin logout deletes the current server-side session; password change/reset delete every session for that account. Manual password changes compare the current password and account/hash inside an atomic update boundary.
- A preview token authorizes preview rendering only; it cannot authorize checkout, ownership or identity changes.
- Inactive demos become inaccessible at their expiration timestamp, even if cleanup has not run.
- A custom domain is never marked verified without confirmation from Vercel's domain-verification API.
- Secrets remain deployment configuration and never enter generated documents or source control.

## Persistence and migrations

Migrations in `db/migrations` are append-only and run through `npm run migrate`. The `schema_migrations` ledger records applied names. See [data model](DATA_MODEL.md) and [deployment](docs/DEPLOYMENT.md).
## Optional AI assistant

`packages/ai-assistant` owns provider-neutral request/result contracts, strict website-blueprint and text-rewrite schemas, and the included OpenAI Responses adapter. It may depend on no application route. `packages/website-engine` does not import AI and remains deterministic.

Owner endpoints under `/api/owner/ai` load approved lead/profile facts, request a structured blueprint, persist an audited `ai_runs` record, and apply the reviewed result through the existing `PreparedBusinessProfile -> SiteDocument` boundary. Site-admin AI is isolated under `/api/site-admin/[slug]/ai/rewrite`, requires the matching site session, accepts only allowlisted text fields, and never writes until the client saves the editor form.
