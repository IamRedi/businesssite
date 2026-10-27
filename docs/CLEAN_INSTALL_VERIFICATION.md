# Clean-install verification

Use this checklist before every commercial release or buyer handover. Run it from a separate clone or an empty CI workspace; never reuse the master working directory.

1. Clone the committed release and confirm `git status --short` has no output.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local`. For the `core` profile set `DATABASE_URL`, `OWNER_MFA_ENCRYPTION_KEY`, `PREVIEW_TOKEN_SECRET`, `PUBLIC_APP_URL` and `CRON_SECRET`.
4. Run `npm run migrate` and `npm run migrate:status`, then bootstrap the first owner from an interactive TTY with `npm run owner:bootstrap -- --email <owner-email>`.
5. Run `npm run quality`.
6. Start the application from the repository root with `npm run dev`. Sign in through `/owner/login`, complete TOTP enrollment, retain the one-time recovery codes offline, then rerun `npm run setup:check`. The command loads the root `.env.local` for the web workspace.
7. Create a self-service demo, open the signed preview, sign in as the business owner, edit content/media/design, save and verify the preview after refresh.
8. If Finder is included, add `GOOGLE_MAPS_API_KEY`, set `PLATFORM_PROFILE=finder`, rerun `npm run setup:check`, sign in at `/owner/login`, perform one real search and confirm the second identical search uses cache.
9. Record the commit SHA, migration status, quality result and any approved exceptions in the release record.

Do not use Stripe live keys, production customer data or a shared production database for this verification.

## Latest recorded verification

Date: 2026-08-21

Revision: `42d6fb1`

Workspace: separate `businesssite-rc-production` clone created from GitHub

Production-foundation verification:

- created a dedicated Neon project named `businesssite-rc-production` in AWS Europe Central 1 (Frankfurt), with Neon Auth disabled because application authentication remains the source of truth;
- stored the generated connection string only in the ignored local `.env.local`; no database credential, project identifier or secret was committed or printed in release evidence;
- verified a real pooled PostgreSQL connection with explicit `sslmode=verify-full`;
- applied migrations `001` through `028` to the empty database and confirmed that none remain pending;
- passed 26 real PostgreSQL integration tests against the new database, covering Finder persistence/history, site and subscription idempotency, tenant quotas, REDI mapping, Information lifecycle, private media isolation and nonce replay protection;
- passed the complete quality gate from the clean clone: typecheck, lint, 225 non-database tests, boundaries, documentation links, secret scan, SCA with zero reported vulnerabilities and the production build;
- retained `PLATFORM_PROFILE=core`, a 30-day trial, the `BusinessSite RC` brand, `https://www.businesssiterc.de` as the public URL and `info@businesssiterc.de` as owner/support/sender configuration.

The owner password was subsequently replaced locally, the setup check passed,
and the clean database was connected to the production-domain deployment. The
result is recorded in the production verification record.
Provider acceptance remains a separate controlled gate: Google Places, Stripe
test mode, Resend delivery, object storage, customer-domain automation, browser
E2E and InfoEsencë provisioning must still be revalidated against the clean
database before unrestricted launch.

## Previous recorded verification

Date: 2026-08-18

Revision: `b11e4af`

Workspace: separate `white-label-platform-release-test-b11e4af` clone

Latest automated verification:

- cloned only committed files from `b11e4af`; the checkout was clean and contained no local environment file;
- completed reproducible `npm ci` with zero reported vulnerabilities;
- passed the core setup check using the configured Neon connection and process-only test values for the three missing local core variables; no generated secret was written to disk or printed;
- confirmed migrations `001` through `018` applied with none pending;
- passed typecheck, lint, unit/handler tests, architecture boundary check, documentation links, secret scan, SCA and production build;
- passed 83 web tests, 48 website-engine tests, 5 AI tests, 4 social-control tests and 3 non-provider Finder tests;
- passed all 10 real Neon repository integration tests, including isolation/usage controls, password/session lifecycle, Stripe lifecycle idempotency and Redi Control mapping/audit persistence.

This pass proves clean installation and automated regression behavior for the committed revision. It does not replace the browser flow, Stripe/Resend/Blob staging acceptance or provider capacity tests. Permanent production values for `PREVIEW_TOKEN_SECRET`, `PUBLIC_APP_URL` and `CRON_SECRET` still need to be configured in the deployment environment.

Previous clean-install and browser/provider evidence follows for historical traceability.

Verified:

- clean fast-forward checkout and reproducible `npm ci` with zero reported vulnerabilities;
- `core` profile configuration, PostgreSQL connection and migrations `001` through `015`;
- typecheck, lint, all unit/handler tests, boundary scan, documentation links, secret scan, SCA and production build;
- eight real PostgreSQL/Neon repository integration tests, including tenant isolation, quotas, concurrency, one-time recovery/session revocation and subscription idempotency;
- production runtime `/api/health` and landing response `200`, plus unauthenticated Owner API denial `403`;
- bounded runtime check: 50/50 static-page responses succeeded at concurrency 10, with local p95 123.0 ms and no failures.

Browser acceptance follow-up: `a940171`

- created a synthetic Albanian barber trial through the public wizard against the configured Neon database;
- opened the signed private preview and verified category-correct barber content and imagery;
- opened the authenticated business editor, verified section-only navigation and fully localized Albanian page, service, design, appointment, domain and security copy;
- saved updated hero copy and confirmed that the private preview reflected the persisted change;
- saved the automatic design selection and confirmed that the selected theme remained stable after navigation.

Finder provider acceptance follow-up:

- ran a fresh, coordinate-bound Google Places search for `Schlüsseldienst Tresoröffnung` within 7 km of Essen-Rüttenscheid;
- the first request returned five persisted leads with `cached: false`;
- the immediately repeated identical request returned the same five leads with `cached: true`;
- PostgreSQL recorded one `google_places_discovered` audit event for the cache key, five cached lead IDs and the configured 30-day expiry;
- inspected the highest-scored persisted result: `Open Point Schlüsseldiesnt`, score 90, rating 5.0 from 115 reviews, with public address, website and scoring reasons present.

Not yet accepted by this automated pass:

- Stripe checkout/webhook with test-mode buyer products;
- Resend delivery from a verified sender;
- Vercel Blob upload and custom-domain DNS/certificate/routing on staging.

The recorded local timing is a regression check, not a production capacity guarantee.
