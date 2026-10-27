# Deployment

Before export enablement, configure a separate private artifact store and versioned encryption keys. Staging must verify private Blob create/get/delete, scheduler concurrency, old/new key rotation, representative-size export/download and expiry cleanup. Local memory-store evidence is not provider, staging or production verification.

For the locally completed B4A enforced boundary, the migration job receives
`MIGRATION_DATABASE_URL`; customer-scoped operations use
`DATABASE_RUNTIME_URL`; signed provider lifecycle processing uses the distinct
`DATABASE_SYSTEM_URL`; owner operations use `DATABASE_OWNER_URL`.
`DATABASE_URL` and `MIGRATION_DATABASE_URL` must be absent from the deployed web
runtime. Application identities must not be owners, superusers or `BYPASSRLS`.
Apply `038`-`047`, run role setup, the disposable PG16 enforced suite and
`setup:check` before staging. `enforced` is locally verified only; do not claim provider or production RLS;
see [`ROW_LEVEL_SECURITY.md`](ROW_LEVEL_SECURITY.md).

## Runtime topology

Deploy the Next.js application to a Node.js 22-compatible platform with HTTPS and outbound access to PostgreSQL, Google and the configured payment providers. Use a managed PostgreSQL database with TLS, automated backups and point-in-time recovery where available.

Business-site customer media uploads use Vercel Blob when the deployment has the preferred Vercel OIDC store connection plus explicit `BLOB_STORE_ID`, or a legacy `BLOB_READ_WRITE_TOKEN` whose embedded store matches that ID. Cleanup additionally requires the same reviewed `PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID`; credentials never select authority implicitly. Information/News editorial media uses a separate private Blob store through `INFORMATION_BLOB_READ_WRITE_TOKEN` and is delivered only by the application authorization route. PostgreSQL `bytea` is an intentional local/core fallback only; do not rely on it as the primary production media store.

For Vercel, set the project **Root Directory** to `apps/web`. The checked-in cron configuration is [apps/web/vercel.json](../apps/web/vercel.json); configure all environment variables in that Vercel project. The repository-root scripts remain the source for CI and migrations.

## Optional dedicated owner host

Set `CONTROL_PANEL_HOST` to an exact subdomain such as `control.example.com`, add that subdomain to the Vercel project and configure its DNS record at the domain provider. On this host `/` redirects to `/owner`; only `/owner`, `/api/owner` and `/api/health` are served. Public website, customer-admin and unrelated API routes redirect to the canonical public host or fail closed. Keep `PUBLIC_APP_URL` on the public canonical domain for customer links, preview URLs and SEO.

## Release procedure

1. Review production readiness and the release diff.
2. Create a database backup or recovery point.
3. Run `npm run migrate`, then confirm `npm run migrate:status` has no pending migration.
4. Run `npm run setup:check` with the target profile, then deploy the application with encrypted environment values from [configuration](CONFIGURATION.md).
5. Run the smoke tests from [testing](TESTING.md).
6. Verify scheduled cleanup and every enabled payment-provider webhook.
7. Record the version, commit SHA, migration set and operator in the release log.

For migration 047, verify the active policy hash against `config/privacy-retention-policy-v1.json`, keep `PRIVACY_RETENTION_EXECUTION_ENABLED=false`, and do not schedule `/api/internal/privacy-retention` until technical dry-run operation is explicitly accepted. Enabling that route in B1 still only claims/plans; it does not authorize customer, provider or artifact deletion.

Do not run two incompatible application versions against a destructive schema change. Prefer additive migrations, deploy compatible code, backfill and remove deprecated fields only in a later release.

## Required platform jobs

The repository includes a Vercel production cron at 03:00 UTC daily for `GET /api/internal/cleanup-expired-demos`. The preview route enforces trial expiration immediately; physical deletion waits for the configured recovery deadline and excludes every site with a subscription row. Use a Pro scheduler or external scheduler for more frequent reconciliation if required.

For a non-Vercel deployment, call the endpoint with:

```text
Authorization: Bearer <CRON_SECRET>
```

The job performs permanent deletion and should be monitored.

## Stripe webhook

Register the public HTTPS endpoint `/api/stripe/webhook`. Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.paid`, `invoice.payment_failed`

Store the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. Confirm that duplicate event delivery is acknowledged without duplicate activation.

## Paddle webhook

When Paddle is enabled, register `/api/paddle/webhook` and subscribe to subscription created/activated/updated/trialing/resumed/paused/past-due/canceled plus transaction payment-failed events. Store the endpoint secret as `PADDLE_WEBHOOK_SECRET`. The route verifies the exact raw request body with Paddle's official SDK, persists events idempotently and fails closed when configuration or signatures are invalid.

## Health and observability

Use `GET /api/health` for availability and database checks. Before production, connect it to external uptime monitoring and add centralized error reporting, request correlation, database saturation alerts, cleanup failure alerts and payment-webhook failure alerts. Never log authorization cookies, passwords, database URLs or provider secrets.

## Rollback

Roll back application code to the previous compatible commit. Do not reverse a migration by deleting columns or tables during an incident. Restore data only from a verified backup and only after recording the incident scope and recovery point.
