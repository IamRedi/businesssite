# Quick start

Use this path for a local **core** installation without Google, Stripe, email, Blob or custom domains.

1. Install Node 22 and PostgreSQL 15+.
2. Clone the repository and run `npm ci`.
3. Create an empty PostgreSQL database.
4. Copy `.env.example` to `.env.local` and set `PLATFORM_PROFILE=core` plus `DATABASE_URL`, `DATABASE_RUNTIME_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_OWNER_URL` (for a local evaluation all four may point to the same database; production uses separate least-privilege roles, see [row-level security](ROW_LEVEL_SECURITY.md)), `OWNER_MFA_ENCRYPTION_KEY`, `PREVIEW_TOKEN_SECRET`, `PUBLIC_APP_URL` and `CRON_SECRET`.
5. Run `npm run setup:secrets` to replace missing or unsafe local secret placeholders with unique cryptographic values. The command never prints generated values.
6. Run `npm run migrate` and `npm run migrate:status`.
7. From an interactive administrative terminal run `npm run owner:bootstrap -- --email owner@example.com`; enter a unique 16+ character password only at the hidden prompt.
8. Run `npm run setup:check`, then `npm run dev`. `PUBLIC_APP_URL` must match the address you open in the browser, otherwise same-origin protection rejects logins. Sign in at `/owner/login`, enroll TOTP and store the one-time recovery codes offline.

Use [configuration](CONFIGURATION.md) to enable a provider profile and [deployment](DEPLOYMENT.md) for production. Start local development from the repository root with `npm run dev`; this command loads the root `.env.local` for the web workspace without relying on Node CLI environment flags.
