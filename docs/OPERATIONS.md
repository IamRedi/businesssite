# Operations runbook

Schedule exact-secret `POST /api/internal/privacy-exports` once daily for the current privacy-export contract. One call recovers expired leases, deletes at most 25 expired/uncertain temporary artifacts and processes at most one leased export. Artifact authorization ends at 24 hours even if physical provider deletion waits for that bounded cadence. Exact provider/store/environment/object authority is required; missing or mismatched authority stays `delete_retry` and must alert without attempting a guessed delete. During an incident set `PRIVACY_EXPORT_ENABLED=false`, stop scheduling and apply [the non-destructive B2 rollback](../db/admin/rollback-authenticated-privacy-exports.sql). Preserve durable job/event evidence and never delete source data; store failures remain retryable without false `deleted_at`.

Task Group 3-B1 through B3C4 RLS incidents use the non-destructive rollbacks in
[`ROW_LEVEL_SECURITY.md`](ROW_LEVEL_SECURITY.md): return application mode to
`off` first, revoke B3B with `db/admin/rollback-billing-legal-system-rls.sql`,
revoke B3A with `db/admin/rollback-public-bootstrap-rls.sql`, then an administrator may run
`db/admin/rollback-core-customer-rls.sql` for the exact B1/B2 table set.
Never drop tenant data, policies or migration history during rollback.
For B3C3, first disable the cleanup scheduler and deploy compatibility/off code,
then run `db/admin/rollback-finder-demo-cleanup-rls.sql`; it revokes only B3C3
routine grants and disables only its eleven RLS flags.
For B3C4, deploy compatible/off code first, then run
`db/admin/rollback-database-boundary-completion.sql`. It revokes only the new
045 grants and preserves routines, rows, ledgers and every RLS flag.

For B4A, follow `STAGING_FORCE_RLS_RUNBOOK.md`.
Do not remove FORCE while traffic is live. An approved rollback switches the
application to `pilot`, cuts traffic, runs the explicit FORCE rollback allowlist,
then reruns setup/preflight; RLS, policies, executor ownership and data remain.

For B1 privacy rollback, first disable the privacy scheduler and set
`PRIVACY_RETENTION_EXECUTION_ENABLED=false`, deploy compatible code, then run
`db/admin/rollback-privacy-retention-foundation.sql` only if the new table
boundary must be relaxed. It revokes only B1 grants and preserves all policy,
job, event and hold evidence plus every Task Group 3 protection.

## Daily checks

- Application and preview availability.
- Database connections, storage and backup status.
- Failed Google provider calls and quota consumption.
- Stripe webhook failures and incomplete checkouts.
- Subscription lifecycle events: grace entry/expiry, read-only/locked
  transitions, stale provider events and reactivations.
- Cleanup job success and count of expired demos removed.
- Authentication and authorization errors above baseline.
- Tenant usage warnings/throttles, abnormal per-site growth and expired concurrency leases.
- Privacy job failures, expired leases/retries, unexpected blocked counts, legal-hold changes and active-policy/hash drift. Receipts must remain free of PII and secrets.
- Privacy-export generation/storage/persistence/cleanup failures, stuck jobs, missing objects and security-invariant signals. Normal downloads are INFO and must not alert-spam. A private export URL, capability, object key, tenant identity or provider credential must never enter an alert payload.

## Backup and recovery

The repository provides a guarded logical backup/restore path and deletion
suppression reconciliation; it does not enable a Production schedule or select
a permanent backup store. Use the exact commands, authorization gates,
monitoring codes, bad-migration decision tree and cleanup procedure in the
PostgreSQL recovery runbook. A provider branch is
not an independent backup, and a successful dump is not accepted until its
checksum, archive listing and empty-target restore pass.

## Platform alerts and uptime

Historical Vercel error- and usage-anomaly rule bodies are retained in
`ops/vercel/alerts/`. They are plan-dependent and project-wide; do not claim
they are active from repository JSON or old IDs. On a project that also serves
Production, they cannot by themselves prove an isolated Preview alert. Record
the current plan, rule state, environment filter and a dated delivery drill.

Vercel anomaly alerts do not replace independent uptime monitoring. Monitor `GET /api/health` from outside Vercel for **application liveness only**: it must not connect to PostgreSQL, because recurring checks would keep Neon compute awake. The separate `GET /api/health/ready` checks database readiness and must run only on a deliberately approved low-frequency schedule (or on demand), not on the high-frequency uptime monitor. A liveness 200 is **not** evidence that database, backups, or billing are healthy. Maintain independent database, backup, deployment and provider alerts and route failures to an operator.

Server errors and aggregate operational alerts are delivered through the provider-neutral
`CENTRAL_ERROR_REPORTING_*` boundary. Events contain an opaque event ID,
deployment/environment, SHA-256 fingerprint, route template, request pathname
without query data and bounded stack frames; they exclude error messages,
request bodies, cookies and general headers. Test the sink only in staging with
an exact-secret `POST /api/internal/monitoring/error-probe`, then return
`MONITORING_SYNTHETIC_PROBE_ENABLED=false`. Alert on delivery-failure fallback
events in platform logs as well as sink events. A sink receipt proves transport,
not operator escalation: separately exercise the destination's notification
channel and record acknowledgement/recovery.

`POST /api/internal/monitoring/alerts` requires the exact cron bearer secret
before opening `DATABASE_SYSTEM_URL`. Migration 059 exposes one system-only
aggregate routine for database connection saturation, rejected billing
webhooks, failed/blocked/stale/overdue privacy jobs and provider-cleanup problem
states. Its projection contains only bounded counts, alert codes and thresholds;
it contains no tenant, provider reference or privacy subject. A live signal or
failed sink delivery returns HTTP 503 so an independent scheduler can also
alert. Schedule it at the approved interval and alert on missed executions.

For a protected Preview where Vercel Cron does not run, migration 060 adds one
aggregate-only `operational_monitoring_state` row plus stale-worker-safe begin,
complete and heartbeat routines. An external monitor may call staging-only
`GET /api/internal/monitoring/scheduled?key=...`; a separate monitor calls
`GET /api/internal/monitoring/heartbeat?key=...`. Both routes require
`RELEASE_TARGET=staging`, a non-Production Vercel environment, the explicit
scheduler flag and the exact dedicated query capability. The scheduled route
records success/alert/delivery failure; the heartbeat returns 503 for no run,
an overdue completion, a stalled run or an unhealthy last run. Query strings
must never be copied into tickets or logs. Rotate the capability and the Vercel
automation bypass when the monitor retires. Production must use an approved
scheduler and secret transport; this Preview mechanism is not that solution.

During rollback, stop both external monitors, set the staging scheduler flag
to false and deploy before running
`db/admin/rollback-operational-monitoring-heartbeat.sql`. The rollback revokes
only the application role's three heartbeat routine grants and preserves the
single aggregate state row, RLS/FORCE and migration history. Re-provisioning
restores the reviewed grants.

For staging acceptance only, the `x-businesssite-monitoring-probe: b6a` header
adds fixed synthetic database/webhook/privacy signals when
`MONITORING_SYNTHETIC_PROBE_ENABLED=true`. Disable that flag immediately after
the delivery and escalation drill. Synthetic delivery validates routing, not
the configured threshold or a real incident.

## Tenant usage controls

Usage counters are scoped by `site_id`, metric and UTC window. Plan limits are centralized in `apps/web/lib/tenant-usage-policy.ts`; buyer configuration may scale a complete plan with the documented `TENANT_QUOTA_MULTIPLIER_*` variables. Never accept a quota or tenant ID from public request data as an authorization decision.

The first enforced metrics are appointment submissions, client AI rewrites, upload count and monthly upload bytes. A warning begins at the configured threshold. Requests exceeding a window enter `throttled` until that window resets. `temporarily_restricted` is reserved for an explicit owner decision or later automated abuse escalation.

Open `/owner/sites/{slug}/usage` from a generated lead to inspect counters and enforcement events. Owner overrides are time-bounded, require a reason and are audited. `Allow temporarily` bypasses tenant quotas until expiry; `Restrict temporarily` fails tenant-metered operations closed.

The constrained system cleanup retains aggregate counters for 14 months,
enforcement events for 90 days and removes expired concurrency leases. It uses
`DATABASE_SYSTEM_URL`, a fixed purpose and a batch of at most 200; the cron
secret is verified before that pool is opened. Before changing these periods,
align the privacy policy, support needs and commercial reporting terms.

## Authentication and public-form abuse controls

Application-level thresholds are centralized in `apps/web/lib/abuse-policy.ts`. Login, recovery, trial, appointment and checkout subjects are normalized and SHA-256 hashed before they enter `api_rate_limits`; raw email addresses, tokens and replay fingerprints are not stored by the limiter.

Public JSON bodies are bounded before parsing. Trial and appointment forms include server-checked honeypots. Appointment replay suppression returns the same successful response for an identical submission during its short window, preventing accidental double-clicks without revealing the block. Media upload requires an authenticated site slug in the request header, a declared bounded request size, valid WebP bytes and dimensions no larger than 2,000 × 2,000.

These controls do not replace a trusted production proxy. Configure provider-level bot/WAF rules, make the proxy overwrite forwarding headers, and alert on sustained HTTP 429/413 responses. Change limits only after reviewing shared-network users, support impact and provider cost.

Site-admin session records contain token fingerprints, never bearer tokens. Login and successful self-service signup rotate a valid cookie already held by the browser. Logout must delete that fingerprint before clearing the cookie; a generic HTTP 503 means revocation did not complete and should be retried after database health is restored. Password change/reset delete all sessions for the affected account, so a successful operation is expected to send every device back to login. Repeated logout, invalid/expired/used reset tokens and unknown recovery emails are normal non-sensitive outcomes.

Session creation removes expired session rows. Monitor abnormal growth in `site_admin_sessions`, failed authentication mutations and sustained rate-limit events, but never log cookie values, reset links, raw reset tokens or password fields. During an incident, revoking one known session means deleting only its fingerprint; account-wide containment requires deleting sessions by the verified account ID. Never accept an account or site identifier from a logout request.

Owner authentication uses the separate `owner_accounts`, `owner_auth_challenges`, `owner_sessions`, `owner_mfa_recovery_codes` and `owner_auth_audit_events` tables. Alert on sustained password/MFA failures, disabled-account denials, administrative recovery and abnormal session growth. Never query or export authentication tables into general analytics. Expected audit details are categories and counts only.

First-owner bootstrap and administrative recovery require an interactive administrative TTY; do not wrap them in a public endpoint or pass passwords as command arguments/stdin. Recovery revokes every session/challenge and forces MFA re-enrollment. If the MFA encryption key is lost, existing TOTP secrets are unrecoverable by design: use the documented administrative recovery for the exact owner, replace the key through the secret manager, and re-enroll. If the key may be exposed, revoke owner sessions, rotate it, recover the owner and review audit/deployment access.

Owner sessions expire after 12 hours and stale/revoked rows are pruned during new session creation. `setup:check` fails until migrations are current, a database owner exists and an active owner has enrolled MFA. Do not restore the retired owner environment password or API-token fallback during an incident.

Team membership is managed at `/owner/team` only by role `owner`. Invitation links expire after 24 hours; provider failure is shown as controlled delivery state and should be retried with the explicit resend action, which invalidates the old token. Never paste invitation URLs into tickets or logs. Alert on repeated permission denials, invitation delivery failures, last-owner denials and unusual target-wide session revocation. Administrative recovery, demotion and disable serialize on the same database lifecycle lock; do not bypass the runbook with manual account updates. See [owner RBAC and team operations](OWNER_RBAC.md).

## Host and custom-domain isolation

`PUBLIC_APP_URL` is the canonical platform host. Exact Vercel runtime hosts and optional exact entries in `PLATFORM_ADDITIONAL_HOSTS` are accepted; wildcard `*.vercel.app` trust is intentionally not supported. Keep the additional list empty unless a known preview/admin hostname must serve platform routes.

Customer hosts can render only the verified customer homepage, strict Information article/category paths, static site assets, media reads and the pre-existing public business appointment endpoint. Business login and subscription navigation redirect to `PUBLIC_APP_URL`; owner, private preview and privileged APIs fail closed on customer or unknown hosts. Invalid/ambiguous Host values return an error before routing. When adding a host, test the canonical platform, the exact preview, a verified customer domain, an unknown domain and a different `vercel.app` hostname. For Information sites also test a published article, a category, a draft/scheduled article denial and custom-domain canonical/JSON-LD URLs.

## Redi Control

The optional social-media module is disabled unless `REDI_CONTROL_ENABLED=true`. Monitor provider timeout/error rates and `site_external_integrations.status`; retry only through the authenticated site-admin flow so the stable provisioning idempotency key is retained. An outage must not affect the website, subscription or editor. Rotate the integration secret without exposing it to the browser. The complete provider contract and failure model are in REDI_CONTROL_INTEGRATION.md.

The Information/News inbound direction is independently disabled unless `REDI_CONTROL_INBOUND_ENABLED=true` and the mapped site has an explicit owner-approved grant. Monitor authentication failures, replay rejection, `integration_api_requests` failures and editorial audit events. Never retry with the same nonce; retain the idempotency key and exact body. Disable the site grant first during a suspected tenant or publisher compromise, then rotate the independent inbound secret. See REDI_CONTROL_INFORMATION_API.md.

## Bounded load check

Run the read-only harness only against an explicit local or staging URL:

```powershell
$env:LOAD_TEST_URL='http://localhost:3000/site/example-slug'
$env:LOAD_TEST_REQUESTS='100'
$env:LOAD_TEST_CONCURRENCY='10'
npm run load:check
```

The harness accepts only HTTP(S), performs GET requests, caps requests at 1,000 and concurrency at 50, and fails on transport or non-success HTTP responses. Record target type, revision, p50/p95/max latency, throughput, errors, Vercel function concurrency and Neon connections. A local result proves only regression behavior; production capacity claims require a staging run with production-equivalent providers and an approved traffic ceiling.

## Trial lifecycle

An inactive demo expires after `TRIAL_DURATION_DAYS` (default fourteen days).
Private preview access stops immediately; the authenticated customer panel is
read-only until `trial_recovery_ends_at` (default 30 additional days). Only
after that durable deadline may the bounded system routine delete a never-paid site,
site-scoped account, sessions, media, appointments and unused prepared profile
through reviewed eligibility and foreign keys. Any `site_subscriptions` row excludes
the site from this cleanup even if stale trial fields say it is expired.

Investigate any cleanup failure before manually deleting records. Manual production SQL requires a backup, a reviewed predicate and an audit note.

For controlled staging acceptance, use the guarded harness with a staging-only database and cron secret:

```powershell
$env:ALLOW_DEMO_EXPIRY_ACCEPTANCE='true'
$env:ACCEPTANCE_BASE_URL='https://your-staging.example'
npm run acceptance:demo-expiry
```

The harness creates its own technical trial, verifies preview access before and
after expiry, verifies cleanup retains it during recovery, advances only that
technical recovery deadline, invokes cleanup again and confirms that every
site-scoped row plus the now-unused prepared profile and self-service lead were
removed. It is intentionally destructive and must never target production or a
database containing customer trials.

## Subscription support

Use Stripe as the payment source of truth. For a reported activation failure:

1. Confirm payment status in Stripe.
2. Check webhook delivery and signature errors.
3. Confirm the event ID in `payment_webhook_events`.
4. Confirm `subscriber_intakes.status`, `paid_at`, `contract_acceptance_id`, `site_subscriptions.contract_acceptance_state` and the linked `sites.activated_at`.
5. Retry the verified Stripe event when appropriate.

Inspect `site_subscriptions` lifecycle timestamps and
`subscription_lifecycle_events` before retrying. Do not reset
`first_past_due_at` or extend grace from the current request time. A stale event
is expected to have `payment_webhook_events.disposition='ignored_stale'`; a
permissive state restoration requires a newer provider timestamp. Customer
content must not be manually deleted when access becomes locked.

Use `/owner/legal` for bounded acceptance review and business-verification state. Do not edit contract evidence, legal hashes, VAT status or lifecycle timestamps directly. Manual verification and legal activation require owner role plus fresh password/TOTP. A VAT syntax flag is not a provider result.

The canonical state/capability matrix, equal-timestamp rule and reactivation
behavior are documented in [Subscription lifecycle](SUBSCRIPTION_LIFECYCLE.md).

Do not mark an intake paid solely from a customer screenshot. The generic activation endpoint is reserved for an explicitly configured trusted provider.

### Stripe Test Clock acceptance

Run the lifecycle harness only against an isolated staging database and Stripe Sandbox. It creates two clearly named technical trials, customers, subscriptions and test clocks and intentionally retains them as acceptance evidence.

```powershell
$env:ALLOW_STRIPE_TEST_CLOCK_ACCEPTANCE='true'
$env:ACCEPTANCE_BASE_URL='https://your-staging.example'
$env:STRIPE_PRICE_STARTER='price_test_value'
npm run acceptance:stripe-clock
```

The command loads `DATABASE_URL` and `STRIPE_SECRET_KEY` from the normal environment, rejects any key that is not a Stripe test key, and verifies provider delivery and persisted lifecycle state. Re-run/update the acceptance evidence for migration `035`: `past_due` now remains public during grace and becomes private only after the durable grace end. Never point it at production or use a live Price ID.

## Backup and restore

Enable automated database backups before accepting customer data. Test restoration into an isolated database at least quarterly. Record recovery time and recovery point objectives in the customer contract and deployment handover.

The canonical monitoring, scheduler, severity, kill-switch, role and controlled
cohort design is the Production operations and rollout runbook.
Its selected launch backup design is a verified encrypted logical archive every
day with 30 recovery points in private storage outside the source Neon project.
This design is not active: no permanent sink, backup store, Production privacy
scheduler or named escalation roster has been approved/configured. Keep all
privacy execution/provider-cleanup flags false until that runbook's activation
checklist and the separate legal/provider acceptance gates pass.

## Security incident

1. Contain access and rotate affected credentials.
2. Preserve relevant logs and provider event records.
3. Identify affected tenants, data classes and time window.
4. Restore service through a reviewed change.
5. Follow contractual and legal notification obligations.
6. Document root cause and preventive action.

## Customer deletion

Authenticated BusinessSite closure uses the default-off B3 workflow documented in [customer deletion](CUSTOMER_DATA_DELETION.md). Keep both flags false until the exact environment is approved. Alert on blocked/retry/failed jobs and stale leases; never edit ledger/evidence, bypass holds, request subscription cancellation from this flow or substitute a real provider call for the fake adapter without a separately reviewed task.
