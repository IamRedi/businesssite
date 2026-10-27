# Environment configuration

Privacy export defaults off. `PRIVACY_EXPORT_ENABLED` enables request/worker processing; `PRIVACY_EXPORT_ARTIFACT_STORE` is `memory_test` outside production or `vercel_blob_private`; `PRIVACY_EXPORT_ENVIRONMENT_ID` is a stable non-secret environment boundary; `PRIVACY_EXPORT_BLOB_STORE_ID` is the exact dedicated private `store_...` authority and must match the identity embedded in `PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN`; `PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION` selects a canonical base64url 32-byte key in JSON `PRIVACY_EXPORT_ENCRYPTION_KEYS`. Production checks reject memory storage, malformed/mismatched environment/store authority and invalid/missing keys or private-store credentials. Never reuse the public business-media store or copy B6C acceptance credentials into Production.

## Redi Control (optional)

`REDI_CONTROL_ENABLED` is reserved for the customer Social Media Studio boundary. Social Media is currently Coming soon and setup/release checks reject enabling it in production. Future isolated acceptance uses `REDI_CONTROL_API_URL`, `REDI_CONTROL_APP_URL`, `REDI_CONTROL_INTEGRATION_ID` and a separate `REDI_CONTROL_INTEGRATION_SECRET` with at least 32 random characters.

These are server-only variables. Do not prefix them with `NEXT_PUBLIC_`. The remote deployment must implement the contract in REDI_CONTROL_INTEGRATION.md before enabling it.

`REDI_CONTROL_INBOUND_ENABLED` independently enables the REDI CONTROL to Information/News editorial API. It requires a unique `REDI_CONTROL_INBOUND_SECRET` of at least 32 random characters and an explicit owner-approved permission grant for each active Information site. It does not enable the customer Social Media add-on and must not reuse `REDI_CONTROL_INTEGRATION_SECRET`. See the inbound API contract.

Use `.env.local` for local development and the hosting provider's encrypted environment settings in deployed environments. `.env.local` is ignored by Git. `.env.example` contains names and safe placeholders only.

## Core

## White-label identity and PWA

`NEXT_PUBLIC_BRAND_PROFILE_KEY` is a stable lowercase installation key and
`NEXT_PUBLIC_BRAND_ASSET_VERSION` invalidates visual/PWA assets deliberately.
Set the product/display fields, support fields and root-relative local asset
paths documented in `.env.example`. `npm run check:brand` rejects traversal,
missing files, malformed PNG headers, invalid colors and production
placeholder/test asset names.

Remote brand assets and stylesheets are not accepted by the runtime. A local
stylesheet path is visual-only and does not widen CSP, authentication or
authorization. `INFORMATION_PRODUCT_NAME` is independent internal product
identity; it does not make Information navigation part of customer plans.

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Off mode only | Local/test server | Compatibility connection; forbidden in pilot web/release environments |
| `DATABASE_RUNTIME_URL` | Pilot | Server | Customer-scoped LOGIN member of `bsrc_runtime`; never use a table owner or migration credential |
| `DATABASE_SYSTEM_URL` | Pilot | Server | Provider-webhook and verified REDI inbound LOGIN member of `bsrc_system`; routine-only, distinct from runtime/migrator, non-owner, non-superuser and non-BYPASSRLS |
| `DATABASE_OWNER_URL` | Pilot | Server | Procedure-only platform owner/admin LOGIN member of `bsrc_owner_ops`; zero table grants |
| `MIGRATION_DATABASE_URL` | Pilot/production | Administrative CLI only | Separate DDL/migration connection; never expose it to web runtime |
| `DATABASE_RLS_MODE` | No | Server | `off` local compatibility, approval-only `pilot`, or B4A `enforced`. After migration 072, enforced requires four distinct URLs, canonical UUID identities, catalog-aligned trial features, the bounded deletion/export rate-limit scopes, uncertainty-first provider lease recovery and exact private-export authority, plus exact 68/65/65 catalog invariants; managed extension routines are catalog-exempt but application PUBLIC execute still fails closed. |
| `DATABASE_MIGRATOR_ROLE` | No | Administrative CLI | Strictly validated role name; defaults to `bsrc_migrator` |
| `DATABASE_RUNTIME_ROLE` | No | Administrative CLI | Strictly validated role name; defaults to `bsrc_runtime` |
| `DATABASE_SYSTEM_ROLE` | No | Administrative CLI | Provider lifecycle, REDI and bounded cleanup routine-only role with zero table grants; defaults to `bsrc_system` |
| `DATABASE_OWNER_ROLE` | No | Administrative CLI | Procedure-only owner application role; defaults to `bsrc_owner_ops` |
| `DATABASE_RUNTIME_EXECUTOR_ROLE` | No | Administrative CLI | NOLOGIN FORCE-aware owner for authenticated customer routines; defaults to `bsrc_runtime_executor` |
| `DATABASE_BOOTSTRAP_EXECUTOR_ROLE` | No | Administrative CLI | NOLOGIN FORCE-aware owner for public/auth/bootstrap routines; defaults to `bsrc_bootstrap_executor` |
| `DATABASE_OWNER_EXECUTOR_ROLE` | No | Administrative CLI | NOLOGIN FORCE-aware owner for owner routines; defaults to `bsrc_owner_executor` |
| `DATABASE_SYSTEM_EXECUTOR_ROLE` | No | Administrative CLI | NOLOGIN FORCE-aware owner for provider/system routines; defaults to `bsrc_system_executor` |
| `DATABASE_CREATE_ROLES` | Disposable/admin setup only | Administrative CLI | Explicitly permits NOLOGIN base-role creation; false for provider-created roles |
| `DATABASE_POOL_MAX` | No | Server | Maximum clients per runtime pool; defaults to 3 and is bounded to 1-20 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | No | Server | Connection acquisition timeout; defaults to 10,000 ms |
| `DATABASE_IDLE_TIMEOUT_MS` | No | Server | Idle client timeout; defaults to 30,000 ms |
| `DATABASE_QUERY_TIMEOUT_MS` | No | Server | Client and server statement timeout; defaults to 15,000 ms |
| `TENANT_QUOTA_MULTIPLIER_STARTER` | No | Server | Scales all Starter usage limits from one central policy; defaults to 1, accepted range 0.1-100 |
| `TENANT_QUOTA_MULTIPLIER_PROFESSIONAL` | No | Server | Scales all Professional usage limits; defaults to 1 |
| `TENANT_QUOTA_MULTIPLIER_PREMIUM` | No | Server | Scales all Premium usage limits; defaults to 1 |
| `TENANT_QUOTA_WARNING_PERCENT` | No | Server | Fair-use warning threshold from 50-95%; defaults to 80 |
| `OWNER_MFA_ENCRYPTION_KEY` | Yes | Server | Canonical base64url encoding of exactly 32 random bytes; AES-256-GCM key for owner TOTP secrets only |
| `OWNER_INVITATION_DEV_LINKS` | Local test only | Server | Set exactly `true` only in isolated non-production automation to permit an explicitly requested JSON response containing a fragment invitation URL; ignored in production |
| `PUBLIC_APP_URL` | Yes | Server | Canonical origin, without trailing slash, used for redirects and shared links |
| `PLATFORM_ADDITIONAL_HOSTS` | No | Server | Comma-separated exact platform/preview hostnames; no schemes, ports or wildcards. Vercel's exact runtime host variables are included automatically |
| `CRON_SECRET` | Production | Server | 32+ character bearer secret verified before opening the bounded system cleanup boundary |
| `PRIVACY_SCHEDULER_ENABLED` | No | Server | Master kill switch for authenticated `GET /api/internal/privacy-scheduler`; defaults to `false`. Enabling requires strong `CRON_SECRET` and `MONITORING_ALERTS_ENABLED=true`; every worker/provider flag remains independently fail-closed. |
| `PRIVACY_SCHEDULER_MAX_DELETION_STEPS` | No | Server | Maximum atomic deletion/provider/reconciliation claims per run, 1-25; defaults to 5. Each claim remains lease- and idempotency-protected in PostgreSQL. |
| `PRIVACY_SCHEDULER_MAX_DURATION_MS` | No | Server | Soft orchestration deadline checked between deletion claims, 1,000-120,000 ms; defaults to 50,000. Export cleanup remains separately hard-bounded to 25 artifacts. |
| `CENTRAL_ERROR_REPORTING_ENABLED` | Production | Server | Defaults to `false`; Production preflight requires `true`. Enables provider-neutral server error and aggregate operational-alert delivery, never a browser credential or customer analytics collector. |
| `CENTRAL_ERROR_REPORTING_ENDPOINT` | Error reporting | Server | HTTPS endpoint without URL credentials, query or fragment. Its exact hostname must be listed in `CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS`. |
| `CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS` | Error reporting | Server | Comma-separated exact sink hostnames; wildcards and suffix matching are forbidden. |
| `CENTRAL_ERROR_REPORTING_SECRET` | Production error reporting | Server | Distinct 32+ character bearer secret. Required in Production and never placed in the endpoint URL or event body. |
| `CENTRAL_ERROR_REPORTING_TIMEOUT_MS` | No | Server | Bounded 500–5,000 ms delivery timeout; defaults to 3,000 ms. Delivery failure writes only a secret-free event ID/fingerprint to platform logs and does not replace the original response. |
| `MONITORING_ALERTS_ENABLED` | Accepted environments | Server | Defaults to `false`. Enables the exact-secret operational snapshot route; Production requires this together with centralized delivery. |
| `MONITORING_WEBHOOK_WINDOW_MINUTES` | No | Server | Rejected Stripe/Paddle webhook lookback, 5–1,440 minutes; defaults to 15. |
| `MONITORING_STALE_LEASE_MINUTES` | No | Server | Grace applied before a privacy worker lease/retry is alerted, 1–60 minutes; defaults to 5. |
| `MONITORING_DATABASE_CONNECTION_WARNING_PERCENT` | No | Server | Database connection saturation threshold, 50–95%; defaults to 80. |
| `MONITORING_SYNTHETIC_PROBE_ENABLED` | Staging acceptance only | Server | Defaults to `false`. Enables authenticated error and fixed aggregate alert probes only when `RELEASE_TARGET=staging`; Vercel Production rejects them even if misconfigured. |
| `MONITORING_STAGING_SCHEDULER_ENABLED` | Preview/staging only | Server | Defaults to `false` and is rejected outside non-production staging. Enables the GET scheduler/dead-man endpoints needed by an external Preview monitor; never use it as the Production scheduler. |
| `MONITORING_STAGING_SCHEDULER_SECRET` | Preview/staging only | Server | Distinct 32+ character query capability for the staging scheduler and heartbeat endpoints. It may be sent only to the approved external staging monitor, must never enter event payloads, and must be rotated when that monitor retires. |
| `MONITORING_HEARTBEAT_MAX_AGE_SECONDS` | No | Server | Latest completed scheduler run age, 60–86,400 seconds; defaults to 900. Older state is `missed` and returns HTTP 503. |
| `MONITORING_HEARTBEAT_STALE_RUN_SECONDS` | No | Server | In-progress run timeout, 30–3,600 seconds and no greater than max age; defaults to 180. A stale run is `stalled` and returns HTTP 503. |
| `PRIVACY_RETENTION_EXECUTION_ENABLED` | No | Server | Defaults to `false`. `true` permits the authenticated B1 scheduler to claim and calculate retention scans only; B1 has no destructive registry executor. Keep false until a later explicitly approved execution milestone. |
| `PRIVACY_DELETION_REQUESTS_ENABLED` | No | Server | Defaults to `false`; enables only authenticated BusinessSite closure request/status/cancel UI and routines. |
| `PRIVACY_DELETION_EXECUTION_ENABLED` | No | Server | Defaults to `false`; enables the isolated deletion worker. The complete exact-boundary public business-Blob and Vercel project-domain lifecycle is hosted-staging accepted, but Production and all other destructive provider paths remain disabled pending B6 operational/legal approvals. |
| `PRIVACY_EXPORT_ENABLED` | No | Server | Defaults to `false`. Enables authenticated request and bounded worker/cleanup execution; hosted staging is accepted, but keep false in Production until the Production store, scheduler, monitoring, legal review and rollout gates are approved. |
| `PRIVACY_EXPORT_ARTIFACT_STORE` | Export | Server | `memory_test` for local/test only or `vercel_blob_private` for a deployed private store. Production rejects memory storage. |
| `PRIVACY_EXPORT_ENVIRONMENT_ID` | Export | Server | Stable lowercase/digit/hyphen identity, maximum 40 characters. It is persisted in the exact object authority and must differ between staging and Production. |
| `PRIVACY_EXPORT_BLOB_STORE_ID` | Private export Blob | Server | Exact dedicated private `store_...` authority. It must match the token-embedded store identity and must not be the public business-media store. |
| `PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN` | Private export Blob | Server | Server-only token for the exact dedicated private store. Provider URLs/tokens are never returned to the browser. |
| `PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION` | Export | Server | Active key version written to new artifacts. Keep previous versions available until all referencing objects expire and are deleted. |
| `PRIVACY_EXPORT_ENCRYPTION_KEYS` | Export | Server | JSON map of versions to canonical base64url 32-byte AES keys. Use distinct synthetic/staging/Production keys and provider secret storage. |
| `PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID` | Blob cleanup | Server | Exact trusted `store_...` authority. Must equal the bound media authority and the authenticated `BLOB_STORE_ID`; mismatch fails before provider transport. |
| `PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID` | Domain cleanup | Server | Exact `prj_...` cleanup authority. Must equal the immutable binding and runtime `VERCEL_PROJECT_ID`; mismatch fails before transport. |
| `PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID` | Domain cleanup | Server | Exact `team_...` cleanup scope. Must equal the immutable binding and runtime `VERCEL_TEAM_ID`; mismatch fails before transport. |
| `PREVIEW_TOKEN_SECRET` | Yes | Server | 32+ byte secret used to sign revocable private-preview URLs |
| `CONTROL_PANEL_HOST` | Optional | Server / host security | Exact owner-workspace host, for example `control.example.com`; no protocol, path or wildcard |
| `BLOB_STORE_ID` | Public business media | Server | Exact Vercel Blob `store_...` authority. Required for OIDC upload and cleanup; never infer it from the available credential. |
| `BLOB_READ_WRITE_TOKEN` | Non-OIDC Blob | Server | Long-lived Vercel Blob token only for deployments that do not use the preferred Vercel OIDC connection; its embedded store identity must match `BLOB_STORE_ID` |
| `INFORMATION_BLOB_READ_WRITE_TOKEN` | Information production media | Server | Token for a separate **private** Vercel Blob store used only by Information/News editorial media |
| `INFORMATION_PRODUCT_NAME` | No | Server-rendered internal UI | Internal Information/News product identity; default `InfoEsencë` |
| `INFORMATION_PRODUCT_SLUG_EXAMPLE` | No | Server-rendered internal UI | Safe example slug shown in owner publication setup |

## Finder

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | Finder | Server | Google Places and Geocoding credential |

Restrict the Google key to the enabled APIs and intended deployment. Finder is unavailable without this value; site generation from self-service intake still works. Finder persistence is owner-routine-only in pilot mode, but real Google quota/cost/terms/retention acceptance remains required.

Owner identity, password hashes, MFA state and revocable sessions are database-backed. `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_SESSION_SECRET` and `OWNER_API_TOKEN` are retired and are never login fallbacks. Create the first owner explicitly with `npm run owner:bootstrap -- --email <address>` after migrations; see [authentication](AUTHENTICATION.md).

`PLATFORM_PROFILE` selects configuration validation: `core` requires only core infrastructure; `finder` adds Google; `billing` adds Stripe; `full-production` adds Google, Stripe, Resend, Blob and Vercel domain integration. Run `npm run setup:check` before a deploy. `FINDER_PROVIDER_CALL_LIMIT` is the uncached Google request limit per owner IP per day and defaults to 30. Every Text Search result page consumes one unit before the provider request is sent; a Finder search can consume one to three units while looking for enough no-website candidates. Cache hits consume zero units.

## AI assistant

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `AI_PROVIDER` | AI | Server | `disabled` or `openai` |
| `OPENAI_API_KEY` | OpenAI | Server | Provider credential; never expose with `NEXT_PUBLIC_` |
| `OPENAI_BASE_URL` | No | Server | HTTPS OpenAI-compatible endpoint; defaults to the official API |
| `AI_OWNER_ENABLED` | No | Server | Enables the owner blueprint and AI demo flow |
| `AI_CLIENT_ENABLED` | No | Server | Enables allowlisted client text rewrites |
| `AI_WEBSITE_FETCH_ENABLED` | No | Server | Explicitly allows owner-only reading of an existing public website |
| `AI_OWNER_MODEL` | No | Server | Quality-first owner model |
| `AI_CLIENT_MODEL` | No | Server | Lower-cost client rewrite model |
| `AI_CLIENT_DAILY_LIMIT` | No | Server | Starter-plan per-site daily client AI limit; defaults to 10 and is enforced through tenant usage controls |
| `AI_MAX_WEBSITE_CHARACTERS` | No | Server | Maximum visible old-site text sent for analysis |
| `AI_MAX_WEBSITE_PAGES` | No | Server | Maximum same-host relevant pages read during owner analysis (default 6, maximum 10) |
| `PROVIDER_COST_DAILY_WARNING_USD` | No | Server | Positive owner-dashboard warning threshold for today's estimated provider list-price cost; it is not a hard execution limit |
| `PROVIDER_COST_MONTHLY_WARNING_USD` | No | Server | Positive owner-dashboard warning threshold for the current month's estimated provider list-price cost; it is not a hard execution limit |

See [AI assistant setup](AI_SETUP.md) for permissions, migration, privacy and operational checks.

The owner-only `/owner/provider-usage` view counts each recorded Google request and each completed OpenAI run. OpenAI estimates use the actual response model plus input, cached-input and output tokens; unknown models retain token counts with no invented price. Google estimates use the dated global list price for the requested SKU. All amounts are explicitly gross estimates before free caps, volume discounts, credits, tax or negotiated terms and must not be treated as provider invoices. Pricing versions are stored with every record so historical usage is not silently repriced.

## Brand

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_PLATFORM_NAME` | Yes | Browser | Buyer product name |
| `NEXT_PUBLIC_PLATFORM_TAGLINE` | No | Browser | Short marketing description |
| `NEXT_PUBLIC_PLATFORM_LOGO_URL` | No | Browser | Buyer HTTPS logo asset |
| `NEXT_PUBLIC_PLATFORM_MARK` | No | Browser | One or two-character fallback logo mark |
| `NEXT_PUBLIC_PLATFORM_LOCALE` | No | Browser | Default customer lifecycle locale: `en` or `de`; unsupported values fall back to English |
| `NEXT_PUBLIC_SUPPORTED_LOCALES` | No | Browser | Customer UI locales; only `en,de` are supported |
| `NEXT_PUBLIC_WEBSITE_LOCALES` | No | Browser | Generated-site choices from `de,en,fr,es,it,sq`; defaults to all six |

| `NEXT_PUBLIC_SUPPORT_EMAIL` | Production | Browser | Buyer public customer-support address |
| `NEXT_PUBLIC_BRAND_PRIMARY` | No | Browser | Hex primary color |
| `NEXT_PUBLIC_BRAND_ACCENT` | No | Browser | Hex accent color |
| `NEXT_PUBLIC_BRAND_BACKGROUND` | No | Browser | Hex application background color |
| `NEXT_PUBLIC_BRAND_TEXT` | No | Browser | Hex main text color |
| `NEXT_PUBLIC_BRAND_STYLESHEET_URL` | No | Browser | `/brand.css` or HTTPS stylesheet for a full buyer visual override |
| `NEXT_PUBLIC_LANDING_*` | No | Browser | Buyer landing eyebrow, hero title and body |
| `TRIAL_DURATION_DAYS` | No | Server | Trial length from 1 to 30 days; default 14 |
| `TRIAL_RECOVERY_DAYS` | No | Server | Read-only recovery window after trial expiry; default 30, accepted range 1-90 |
| `SUBSCRIPTION_PAYMENT_GRACE_DAYS` | No | Server | Durable `past_due` grace window; default 7, accepted range 1-30 |
| `SUBSCRIPTION_READ_ONLY_DAYS` | No | Server | Paid-customer read-only window after suspension/effective cancellation; default 30, accepted range 1-180 |

Lifecycle values are server-only and feed the same central policy used by UI,
repositories and public resolution. Invalid, negative or excessive explicit
values fail setup/release validation; runtime falls back to safe catalog
defaults. See [Subscription lifecycle](SUBSCRIPTION_LIFECYCLE.md).

## Website languages

The website engine ships with German (`de`), English (`en`), French (`fr`), Spanish (`es`), Italian (`it`) and Albanian (`sq`) copy. Limit the independent website selector with `NEXT_PUBLIC_WEBSITE_LOCALES`. Customer lifecycle UI remains EN/DE and the owner panel remains English-only.

Each demo stores its selected locale inside the site document, so later changes to the platform default do not change an existing customer website. Older site documents without a locale safely fall back to English.

## Legal identity and public contact

The launch is B2B-only. Environment `LEGAL_*` fields are explicit development/test fixtures and setup inputs; production contract truth is the versioned database record activated in `/owner/legal`. Required fixture fields are `LEGAL_OPERATOR_NAME`, street, postal code, city, two-letter country code/name, separate `LEGAL_CONTACT_EMAIL` and `LEGAL_SUPPORT_EMAIL`, `LEGAL_TAX_DISPLAY_MODE`, `LEGAL_COMMERCIAL_CURRENCY` and `LEGAL_PRICE_TAX_LABEL`. Legal form, representative, phone, register, VAT ID, supervisory authority and editorial responsibility are conditional. `LEGAL_DISPUTE_METADATA` is private workflow metadata and is excluded from public projection.

`LEGAL_TAX_DISPLAY_MODE` must be `gross_inclusive`, `net_plus_tax` or `tax_exempt_or_special_note`; the last requires exact operator-reviewed `LEGAL_SPECIAL_TAX_NOTE`. No production default is inferred. `NEXT_PUBLIC_SUPPORT_EMAIL`, the legal contact, the versioned support contact and `EMAIL_FROM` remain distinct roles.

`CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED=true` is mandatory in production. Generated customer sites must supply their own public identity and privacy-notice URL; platform identity is never copied. See [legal configuration](LEGAL_CONFIGURATION.md).

## Buyer-visible plan copy

`NEXT_PUBLIC_PLAN_STARTER_*`, `NEXT_PUBLIC_PLAN_PROFESSIONAL_*` and `NEXT_PUBLIC_PLAN_PREMIUM_*` control the name, display price and description of each plan. They do not charge a card; the matching enabled-provider Price IDs below do that.

Every `NEXT_PUBLIC_` value is visible in browser bundles. Never use this prefix for secrets.

## Billing providers

`BILLING_PROVIDERS` is the acquisition-provider allowlist and must remain `stripe`. The product catalog, not environment completeness, controls launch availability. `/api/subscribe` accepts only authenticated Starter checkout through Stripe.

### Stripe

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Checkout | Server | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Checkout | Server | Signing secret for the registered webhook endpoint |
| `STRIPE_PRICE_STARTER` | Checkout | Server | Recurring Price ID for Starter |
| `STRIPE_PRICE_PROFESSIONAL` | Future plan | Server | Reserved recurring Price ID; Professional is Coming soon and rejected by the current API |
| `STRIPE_PRICE_PREMIUM` | Future plan | Server | Reserved recurring Price ID; Premium is Coming soon and rejected by the current API |
| `STRIPE_PRICE_SOCIAL_MEDIA_ADDON` | Historical/future only | Server | Dormant Social add-on Price mapping; no checkout or new entitlement activation exists |
| `STRIPE_STARTER_PRICE_CATALOG_VERIFIED` | Billing release | Server | Explicit `true` after displayed Starter amounts/intervals are reconciled with configured Price IDs |
| `STRIPE_PORTAL_CONFIGURATION_STARTER` | Billing portal | Server | Dedicated `bpc_...` configuration that permits payment/cancel management and prohibits plan switching |
| `STRIPE_PORTAL_STARTER_ONLY_VERIFIED` | Billing portal | Server | Explicit `true` only after the dedicated portal configuration is manually verified |

Register `/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use test-mode keys until the complete conversion flow passes.

Also register `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`. The verified webhook, not the success redirect, controls public-site activation and plan entitlements.

### Paddle Billing

Paddle is hidden and runtime-disabled. The client-token and Price variables below are dormant future adapter configuration and do not create availability.

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `PADDLE_ENVIRONMENT` | Paddle | Server/browser config | `sandbox` or `production` |
| `PADDLE_API_KEY` | Paddle | Server secret | Paddle API key; never exposed to the browser |
| `PADDLE_WEBHOOK_SECRET` | Paddle | Server secret | Endpoint secret used for raw-body signature verification |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle | Browser | Paddle.js client token (`test_` in sandbox, `live_` in production) |
| `PADDLE_PRICE_STARTER` | Paddle | Server | Recurring Paddle Price ID for Starter |
| `PADDLE_PRICE_PROFESSIONAL` | Paddle | Server | Recurring Paddle Price ID for Professional |
| `PADDLE_PRICE_PREMIUM` | Paddle | Server | Recurring Paddle Price ID for Premium |
| `PADDLE_LIVE_REVIEWED` | Paddle live | Server | Explicit `true` only after identity/domain/live-account review |
| `PADDLE_LEGACY_LIFECYCLE_ENABLED` | Historical only | Server | Default `false`; when true, signed events may update only an already-bound Paddle subscription and cannot create/activate/change a plan |

With the legacy flag false, `/api/paddle/webhook` returns `410`. Follow [Paddle boundary](PADDLE_SETUP.md).

## Email and custom domains

| Variable | Required | Scope | Description |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Production | Server | Resend API key for trial and password-reset emails |
| `EMAIL_FROM` | Production | Server | Verified sender, for example `Platform <support@yourdomain.com>` |
| `VERCEL_TOKEN` | Domains | Server | Scoped token with access only to the hosting project |
| `VERCEL_PROJECT_ID` | Domains | Server | Vercel project ID used to add and verify customer domains |
| `VERCEL_TEAM_ID` | Domains | Server | Exact Vercel `team_...` scope required by the accepted domain authority contract |
| `DOMAIN_REGISTRAR_NAME` | Optional | Server-rendered UI | Customer-facing name for the external registrar link |
| `DOMAIN_REGISTRAR_URL` | Optional | Server-rendered UI | Exact HTTPS destination for customers who need to buy a domain; invalid/non-HTTPS values fail closed and hide the link |

New public Vercel Blob stores can use short-lived OIDC authentication automatically. Vercel supplies `VERCEL_OIDC_TOKEN` to the SDK; do not copy it into Git or treat it as a permanent secret. Set `BLOB_STORE_ID` explicitly even with OIDC, and set the cleanup authority separately to the same reviewed value. `BLOB_READ_WRITE_TOKEN` remains the compatibility option for non-OIDC deployments. Information/News editorial media uses a separate private store configured by `INFORMATION_BLOB_READ_WRITE_TOKEN`; do not reuse the public business-media token or authority.

The domain flow adds an activated customer's existing domain to the exact configured Vercel team/project, validates the returned project ID, reads Vercel's current recommended routing records and checks both ownership and DNS configuration. The customer must still authorize or add the displayed DNS records at their provider. Raw provider responses are not shown in the customer UI. A domain is marked verified only when Vercel reports ownership and correct DNS routing, and its exact team/project authority is persisted for later cleanup.

## Subscription activation boundary

The legacy bearer-token route `/api/internal/subscriptions/activate` is retired and returns `410`. There is no `SUBSCRIPTION_WEBHOOK_TOKEN` configuration. Base subscription activation must arrive through a verified provider webhook and match the authenticated account/site-bound intake created by the server.

## Secret generation and rotation

Generate exactly 32 random bytes for `OWNER_MFA_ENCRYPTION_KEY` and at least 32 random bytes for other application secrets. `npm run setup:secrets` writes safe local values without printing them. Rotate values immediately if they appear in terminal recordings, logs, tickets or commits. Rotating the MFA key requires a controlled owner MFA reset/re-enrollment because existing TOTP ciphertext cannot be decrypted; revoking owner sessions alone is insufficient. Rotation of `CRON_SECRET` requires updating the scheduler atomically.

## PostgreSQL recovery operator variables

These are short-lived server/operator inputs for
`npm run recovery:postgres -- <command>`. They are not web runtime variables and
must not be copied into Vercel Production configuration.

| Variable | Command | Description |
| --- | --- | --- |
| `SOURCE_DATABASE_URL` | backup/export/restore guard | Unpooled administrative source URL; hosted URLs must set `sslmode=require`, `verify-ca` or `verify-full` |
| `TARGET_DATABASE_URL` | restore/validate/apply | Empty, isolated recovery target; never the active Production database |
| `RECOVERY_READINESS_DATABASE_URL` | backup/validate | Short-lived non-elevated LOGIN member of `DATABASE_RUNTIME_ROLE` for the same database; required when the provider-admin URL cannot execute the runtime-only readiness routine |
| `RECOVERY_BACKUP_DIRECTORY` | backup/check-stale | Absolute dedicated private working directory |
| `RECOVERY_BACKUP_MANIFEST` | verify/restore | Exact `.dump.manifest.json` path |
| `POSTGRES_CLIENT_IMAGE` | backup/verify/restore | Optional pinned `postgres:16` or newer client image |
| `PG_DUMP_BIN`, `PG_RESTORE_BIN` | backup/verify/restore | Optional native binary paths when no client image is used |
| `RECOVERY_TARGET_ENVIRONMENT` | restore/apply | Explicit `preview`, `staging`, `test` or `recovery` classification, optionally suffixed |
| `RECOVERY_OPERATOR_AUTHORIZATION` | restore/apply | Bounded incident/ticket/operator approval reference; only its hash belongs in acceptance evidence |
| `RECOVERY_TARGET_CONFIRM_DATABASE` | restore/apply | Must exactly match the target database name |
| `ALLOW_POSTGRES_RESTORE` | restore/apply | Exact `true` mutation gate |
| `RECOVERY_CREATE_CLASSIFIED_ROLES` | clean restore | Exact `true` permission to create only the reviewed NLOGIN policy roles |
| `RECOVERY_SUPPRESSION_HMAC_KEY` | export/apply | Separate 32+ byte key held outside the database |
| `RECOVERY_SUPPRESSION_MANIFEST` | export/apply | Private external completed-deletion ledger path |
| `RECOVERY_BACKUP_MAX_AGE_HOURS` | check-stale | Positive freshness ceiling; default `24` |
| `RECOVERY_OBJECT_STORE_ALLOWED_HOSTS` | upload/backup-upload | Exact S3 endpoint hostname allowlist; wildcards are not accepted |
| `RECOVERY_OBJECT_PREFIX` | upload/backup-upload | Private object-key prefix; defaults to `daily` |
| `AWS_ENDPOINT_URL` | upload/backup-upload | Exact HTTPS S3-compatible account/jurisdiction endpoint |
| `AWS_DEFAULT_REGION` | upload/backup-upload | Must be `auto` for the selected R2 endpoint |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | upload/backup-upload | Bucket-scoped writer credentials held only by the recovery scheduler |
| `R2_BUCKET_NAME` | upload/backup-upload | Exact approved private recovery bucket |

See the recovery runbook before using any of
these inputs. A restore creates a target only; it never authorizes database URL
replacement or traffic cutover.
## Owner database boundary

In `DATABASE_RLS_MODE=pilot`, configure `DATABASE_OWNER_URL` as a distinct
non-privileged LOGIN member of `DATABASE_OWNER_ROLE` (default
`bsrc_owner_ops`). It must differ from `DATABASE_RUNTIME_URL`,
`DATABASE_SYSTEM_URL` and `MIGRATION_DATABASE_URL`. The application does not
create this credential and does not fall back when it is absent.

## Owner provider control center (migration 070)

`/owner/provider-usage` has Overview, Controls and Activity. The existing
`audit.read` permission can view it; only `platform.configure` can update
`POST /api/owner/provider-controls`. Supported actions are `save` and
`add_budget`, with an exact settings allowlist, optimistic revision and UUID
idempotency key. Server credentials and feature flags remain authoritative.

Owner AI supports the installed OpenAI Sol/Terra/Luna models and pause/resume.
The EUR 5 default is an **estimated-spend admission guard**, not a provider
billing cap. A final request can exceed the remaining estimate. The runtime
allows only one owner AI request at a time, caps its output at 8,000 tokens and
retains allowance for requests without confirmed cost. Price settlement occurs
before response-schema validation. Extra allowance is added only for the
current UTC month and never erases usage. The regular budget renews at the
start of the next UTC month. Historical unpriced calls and customer AI are
outside this new owner admission ledger and remain explicitly identified.
The planning conversion is fixed at EUR 1 = USD 1.1592 (ECB, 2026-09-11), not a
live conversion; no exchange-rate provider is called at runtime.

Google controls add global app monthly SKU limits and a UTC daily search
limit. `FINDER_PROVIDER_CALL_LIMIT` remains the separate server/IP safety
ceiling. The UI and settings API cannot raise that ceiling. Google billing
free allowances are only references because other projects can consume them.
The existing `PROVIDER_COST_*_WARNING_USD` variables are legacy warning-only
settings; this redesigned page uses its DB-backed controls instead.

`owner_provider_control(text,text,jsonb)` uses canonical owner execution and
existing RLS-protected audit events; it creates no new tables. New admission
paths fail closed until migration 070 is installed. A pre-migration page may
show existing usage read-only, but cannot save settings. See
task evidence. This candidate has not been
applied to a hosted database.


## Durable appointment requests (BSRC-APPT-002)

Version 1 POST /api/public/appointments requires an Idempotency-Key containing
32 random bytes encoded as canonical base64url. POST /api/public/appointments/receipt
uses the same header and {contractVersion:1,slug}; never put this capability in
URLs, logs, traces, analytics or error details. Configure request-header redaction
before any hosted activation. Responses are private/no-store. v1 sends no email:
notification.state is disabled. Requests without contractVersion retain the
legacy 201/429 behavior and have no durable-retry guarantee.

APPOINTMENT_FINGERPRINT_KEY_VERSION selects an immutable key-version identifier
from APPOINTMENT_FINGERPRINT_KEYS, a server-only JSON object containing canonical
base64url encodings of dedicated 32-byte HMAC-SHA-256 keys. Maximum 32 versions;
version identifiers use 1-40 ASCII letters, digits, dot, underscore or hyphen.
No MFA, preview, export, provider or recovery key may be reused. Missing/invalid
configuration or a receipt whose stored version is unavailable fails closed.
There is no fallback key, unkeyed PII digest or automatic new request.

Rotation: deploy the old and new versions to every runtime first, then switch
the active version. Never replace bytes under an existing version identifier.
Keep each prior version for at least every outstanding 24-hour receipt window
measured from its last issuance across all runtimes. Retire a version only after
all receipts issued with it have expired. Rolling-deployment readiness must
prove all serving instances can verify every live version. External provisioning
and activation require separate owner authority; local tests use synthetic keys.
The receipt SHA-256 digest is independent of HMAC rotation. Canonical fingerprint
v1 covers the normalized accepted fields plus server-resolved tenant identity.

Migration 071 adds receipt digest, versioned keyed fingerprint, expiry, service
snapshot identifier and appointment version to site_appointments. No child store
or retention exception is added. Existing appointment created_at retention,
tenant options 90/180/365 days, holds and provider reconciliation remain in force.
The existing customer-deletion anonymization clears receipt/fingerprint fields;
row deletion purges them with the appointment. Exports include service ID/version
but exclude capability material. No destructive worker is enabled. The physical
mapping is recorded in config/database-access-manifest.json without rehashing
privacy-retention-policy-v1.json.

Successful quota and v1 creation share one tenant-serialized transaction; abuse
attempt accounting is separate. Same key/payload replays the original receipt
and current safe status/version, even after catalog edits. A changed payload is
409; a retained expired receipt is 410. After privacy purge no replay guarantee
exists. The client stores only per-site capability/expiry in sessionStorage or
memory. Expiry clears capability material and retains only an expired marker;
an explicit new intention clears that marker. No form/contact data is persisted.
Existing uniquely matching service titles remain usable; unknown/duplicate IDs
or titles require explicit selection. This task creates no scheduling settings,
availability, duration defaults, calendar or automatic confirmation.

Focused disposable upgrade command: MIGRATION_DATABASE_URL=<loopback-disposable-target>
RLS_TEST_DISPOSABLE_DATABASE=true node scripts/rls-appointment-upgrade-test.mjs.
Use a separate fresh PostgreSQL 16 database. The runner applies/provisions through
070, checks actual 071 preservation, reprovisions and runs the full role suite
including appointment concurrency, rollback, expiry and privacy regressions.
Run only under a sanitized environment with no .env.local loading. Clean-target
RLS remains node scripts/rls-pilot-test.mjs under the same disposable safeguards.

## P5-002 custom design operations

The local candidate uses migration 077, owner-executor grants and existing
DATABASE_OWNER_URL. No new env var or hosted service. Snapshot/media retention
and restricted local/Drive exports are described in
[custom foundation](design/CUSTOM_SITE_FOUNDATION.md).
