# Local setup

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- PostgreSQL 15 or newer, including Neon
- A Google Cloud key with Places API (New) and Geocoding API enabled for Finder testing

Stripe is optional for local site generation and required only for a real checkout test.

## Installation

```bash
npm ci
```

Copy `.env.example` to `.env.local` and enter local values. Do not paste credentials into documentation, issues, commits or screenshots.

## Database

Create an empty database dedicated to this product. Use the standard runner; it applies ordered migrations and records successful names in `schema_migrations`:

```bash
npm run migrate
npm run migrate:status
```

Migration commands prefer `MIGRATION_DATABASE_URL`. Only local/test `off` mode
may fall back to `DATABASE_URL`. For the RLS pilot, configure a distinct
customer `DATABASE_RUNTIME_URL`, provider `DATABASE_SYSTEM_URL` and migration
identity plus procedure-only `DATABASE_OWNER_URL`, apply migrations `038`-`045`,
run `npm run db:roles`, then run `npm run test:rls`
against disposable PostgreSQL 16. Providers may create the validated roles when
`CREATE ROLE` is unavailable. See [the RLS runbook](ROW_LEVEL_SECURITY.md).

Create the first platform owner explicitly from an interactive terminal; the password is read only through a hidden prompt:

```bash
npm run owner:bootstrap -- --email owner@example.com
```

This works only while the owner table is empty. Configure `OWNER_MFA_ENCRYPTION_KEY` before login, then enroll TOTP on the first sign-in and store the displayed recovery codes offline.

For a billing or full-production profile, open `/owner/legal` after MFA enrollment. Create the exact platform legal/commercial version, register all repository-owned EN/DE legal sources, obtain professional review and activate the reviewed versions with fresh password + TOTP. Set `CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED=true`. `npm run setup:check` intentionally fails until the active config, eight active EN/DE documents and customer public-identity gate exist.

For a legacy database that already applied migrations manually, do not run the automatic runner until those applied migrations are recorded in `schema_migrations`. Use a fresh database for a commercial release where possible. Migration `001` is intentionally not rerunnable.

## Start the application

```bash
npm run dev
```

Open `http://localhost:3000`. The platform-owner entry point is `/owner/login`; the business-owner entry point is `/site-admin/login`.

## First verification

1. Complete the first owner TOTP enrollment (and, for billing profiles, legal setup above), run `npm run setup:check`, then create a B2B self-service trial from the landing page.
2. Confirm that the signed private preview opens in a new tab and contains template content.
3. Edit the site from the business-admin panel.
4. Sign in as owner, run a Finder search and create an outreach demo.
5. Run `npm run quality` before committing.

See [testing](TESTING.md) for complete acceptance scenarios.
