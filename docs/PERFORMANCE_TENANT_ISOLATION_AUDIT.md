# Performance, cost and tenant-isolation audit

Audit date: 2026-08-18

Audited revision: `229aed6` plus the endpoint-security working tree state described below

Scope: `white-label-platform` only

Hardening progress: P0.1 shared and bounded PostgreSQL pooling, P0.2 tenant-scoped public-site caching/invalidations, P0.3 plan-aware usage controls, P0.4 application-level auth/form/upload abuse protection and P0.5 trusted-host routing are implemented. Provider-edge bot protection, broader provider ceilings and load verification remain open.

This is a current-state, evidence-based audit. It does not claim that a control exists unless it is visible in code, configuration, migrations or tests. The unrelated, user-owned working-tree change in `packages/website-engine/src/i18n.ts` was not modified or assessed as part of this audit.

## Executive conclusion

The product workflows, database-backed site isolation, signed sessions, private preview tokens, Stripe webhook verification, a 30-day Finder cache and several endpoint-specific rate limits are implemented. These are useful foundations.

The stronger target described for a commercially packaged multi-tenant SaaS is **not yet complete**. In particular:

- generated-site images are not delivered through a responsive image pipeline;
- per-tenant and platform-wide cost observability, alerts and emergency controls are missing.

Therefore a clean-install functional test may continue, but the package must not be described as performance-hardened, tenant-cost-isolated or unrestricted-production-ready until the P0 items and their tests are complete.

Status meanings:

- **Implemented**: directly proven by the current code/configuration.
- **Partially implemented**: a useful control exists but does not meet the full requirement.
- **Missing**: no implementation evidence was found.
- **Not applicable**: the named technology or behavior is not used here.

## 1. Current architecture and rendering

| Area | Status | Evidence and finding |
| --- | --- | --- |
| Public generated site `/site/[slug]` | Implemented | `apps/web/app/site/[slug]/page.tsx` uses five-minute on-demand ISR and a tenant-slug-scoped data cache. Content, subscription and domain mutations explicitly invalidate the affected tenant. |
| Custom-domain site `/customer-domain` | Partially implemented | Host resolution remains dynamic for security, while the resolved public document is cached by normalized domain for five minutes and explicitly invalidated. Full HTML edge caching remains open. |
| Private preview `/preview/[slug]` | Implemented | Token-based, private and dynamic by design. It must not enter a public cache. Evidence: `apps/web/app/preview/[slug]/page.tsx` and `apps/web/lib/preview-token.ts`. |
| Landing, legal, subscribe and login pages | Partially implemented | Legal pages are static. Landing, subscribe and login remain dynamic where request locale/session state is used. |
| Owner and site-admin pages | Implemented | Dynamic rendering is appropriate for authenticated, personalized control panels. |
| Site renderer JS | Implemented | `apps/web/components/site-preview.tsx` is a Server Component. The public appointment form is the main client component on a generated site. |
| CDN/cache strategy | Partially implemented | Files in `apps/web/public` can use Vercel static delivery, `/api/media/[id]` sends immutable one-year caching and slug sites use on-demand ISR. Custom-domain HTML still executes dynamically, although its database document is cached. |
| Cache key tenant safety | Implemented | Public documents are keyed and tagged by a validated, normalized slug or domain; SHA-256 tag identities prevent cross-tenant collisions and tests assert separation. Preview/admin data never uses this cache. Finder remains a single platform-owner workspace. |

Observed production build behavior: legal pages are static (`○`), `/site/[slug]` is SSG/ISR (`●`), and request-specific application routes remain dynamic (`ƒ`).

## 2. Assets, images and frontend delivery

| Area | Status | Evidence and finding |
| --- | --- | --- |
| Runtime site images | Partially implemented | `apps/web/components/site-preview.tsx` uses raw `<img>` and CSS `background-image`. There is no `next/image`, `srcset`, `sizes`, AVIF negotiation or enforced intrinsic dimensions for generated sites. |
| Lazy loading | Partially implemented | The Google map iframe is lazy-loaded. CSS background hero/service/gallery images have no native image lazy-loading control. |
| Upload conversion | Implemented | `apps/web/components/image-upload-field.tsx` converts client-selected images to WebP, quality `0.84`, maximum dimension 2,000px. The server authenticates before multipart parsing, requires a bounded request length and validates WebP magic bytes and dimensions; client conversion is treated only as UX. |
| Template asset weight | Partially implemented | 186 template files total approximately 112.35 MB; the largest observed file is about 2.8 MB. Several PNG assets remain. This is repository/storage weight; per-page transfer still depends on the selected document. |
| JavaScript baseline | Partially implemented | The last built chunk directory contained 16 JS chunks totaling about 0.71 MB, largest about 224 KB. This is a build-output baseline, not a measured per-route transfer size. No route bundle budget is enforced. |
| CSS | Partially implemented | `apps/web/app/styles.css` is a global 71,249-byte stylesheet. No route-specific CSS budget or measured critical-CSS strategy exists. |
| Fonts | Implemented | System/local fallback stacks are used; no downloaded third-party font files or `@font-face` were found. |
| Third-party browser resources | Partially implemented | Generated sites can load Google Maps iframe content. Stripe checkout is hosted externally. There is no consent/performance policy recorded for map loading beyond lazy loading. |

## 3. Vercel, PostgreSQL and external services

| Area | Status | Evidence and finding |
| --- | --- | --- |
| Vercel Functions | Partially implemented | Dynamic pages and route handlers execute server-side. Timeouts exist for external website analysis and AI calls, but no function-duration telemetry or concurrency budget is implemented. |
| Scheduled jobs | Partially implemented | `apps/web/vercel.json` schedules daily expired-demo cleanup. `apps/web/app/api/internal/cleanup-expired-demos/route.ts` requires `CRON_SECRET`. The deletion query is unbounded and processes all expired demos in one transaction. |
| PostgreSQL provider | Implemented | The application uses `pg` and is compatible with Neon/Postgres through `DATABASE_URL`. |
| Supabase | Not applicable | No Supabase client, Auth, Storage or database integration was found. Supabase-specific usage controls are therefore not applicable to this revision. |
| Connection management | Implemented | `packages/database/src/index.ts` owns one runtime-level pool per database/settings combination. Site and Finder repositories reuse it. Pool size plus connection, idle and query timeouts are bounded and configurable. Deployment-wide connections still depend on the number of active serverless runtimes and must be monitored. |
| Blob storage | Partially implemented | Vercel Blob is used when configured; otherwise image bytes can be stored in PostgreSQL. There is no storage quota, lifecycle accounting or abandoned-object cleanup. |
| Email | Partially implemented | Resend-backed email flows exist when configured. There is no per-tenant/monthly send quota or email-abuse ledger. |
| Stripe | Partially implemented | Hosted checkout, signature-verified webhooks and persisted webhook idempotency exist. Checkout is IP-limited. Platform cost/event observability and webhook alerting are not implemented. |
| Google Places | Partially implemented | Finder has a normalized 30-day cache and a configurable daily uncached-provider limit per owner IP. Provider-budget alerts and platform usage reporting are missing. |
| OpenAI | Partially implemented | Calls have timeouts; client rewrites have a per-site daily limit and AI runs persist provider usage. Owner analysis has no cost quota/concurrency limit, and no monthly tenant/platform budget is enforced. |

## 4. Existing security and isolation controls

The following controls are confirmed:

- owner pages and `/api/owner/*` use a signed, expiring owner session in `apps/web/proxy.ts`;
- site-admin sessions are stored as token hashes and bound to a `site_id`;
- `requireSiteAdmin` verifies that the authenticated session owns the requested site;
- site-admin mutations resolve tenant identity server-side instead of trusting a client-supplied database ID;
- private previews use a signed token rather than an enumerable slug;
- custom domains are stored uniquely by migration `db/migrations/007_demo_lifecycle_and_domains.sql` and only verified, activated, public sites resolve;
- Stripe webhooks require a valid Stripe signature and event IDs are handled idempotently in persistence;
- owner website analysis includes DNS/private-address checks, redirect revalidation, page/byte/character limits and network timeouts;
- CSP and basic browser security headers are added in `apps/web/proxy.ts`;
- durable fixed-window counters are stored in `api_rate_limits`;
- owner/business login and password recovery use network plus hashed identity/token limits;
- password-reset responses do not reveal whether an account or email provider exists;
- public JSON handlers enforce content type and byte ceilings before parsing, with honeypots on trial and appointment forms;
- appointment submissions combine platform IP, site+network, replay and tenant-plan controls;
- upload authorization occurs before multipart parsing, with request/file ceilings and server-side WebP/dimension validation.

Tenant separation is currently application-level in one shared PostgreSQL database. No PostgreSQL row-level security policies were found. This is not automatically a defect, but it makes server-side tenant predicates and isolation tests mandatory.

## 5. Rate limits, quotas and fair use

### Implemented limits

| Operation | Current key and limit | Status |
| --- | --- | --- |
| Create public trial | hashed IP 5/hour plus hashed email 3/day; 8 KiB JSON ceiling and honeypot | Implemented at application level |
| Submit appointment | hashed IP 10/hour, site+IP 5/10 minutes, replay 1/10 minutes, tenant minute/day/month quota; 8 KiB JSON ceiling and honeypot | Implemented at application level |
| Start subscription checkout | hashed IP 10/hour plus demo+email 3/hour; 4 KiB JSON ceiling | Implemented at application level |
| Owner login | hashed network 10/15 minutes plus identity 5/15 minutes | Implemented at application level |
| Business login | hashed network 20/15 minutes plus account 10/15 minutes | Implemented at application level |
| Password reset/change | hashed network plus account/token limits; generic recovery response | Implemented at application level |
| Media upload | site-admin authorization before parsing; request/file/dimension checks, tenant count/byte quota and concurrency lease | Implemented at application level |
| Owner reverse geocode | hashed IP, 60/hour | Partially implemented |
| Uncached Finder provider search | hashed owner IP, configurable daily cap | Partially implemented |
| Client AI rewrite | site ID, configurable daily cap; default 10 | Partially implemented |

The common limiter in `apps/web/lib/rate-limit.ts` hashes normalized subjects before persistence. Limits are centralized in `apps/web/lib/abuse-policy.ts`. Forwarded client identity is still deployment-trust-sensitive, so the production proxy must strip external forwarding headers and supply its own canonical client address.

### Missing controls

- broader public/dynamic request and database-heavy operation metering beyond the currently protected workflows;
- plan-aware quotas and concurrency coverage for additional expensive owner/provider operations;
- bandwidth and storage accounting;
- tenant or subsystem kill switches;
- provider-level WAF/bot challenge evidence in repository configuration.

## 6. Expensive endpoint matrix

| Operation | Existing safeguards | Important gaps |
| --- | --- | --- |
| `POST /api/owner/ai/analyze` | Owner auth; SSRF protections; per-page and aggregate fetch bounds; request timeouts; schema validation | No rate, token/cost, monthly, concurrency or global-job deadline; analysis may inspect several pages and images. |
| Client AI rewrite endpoint | Site-admin ownership; field allowlist; input caps; 60s timeout; daily site limit; usage persistence | No plan-aware monthly cost, concurrency or fair-use state. |
| `POST /api/public/trials` | IP+email limits, 8 KiB pre-parse JSON ceiling, honeypot, field bounds and transactional persistence | No provider-edge challenge, global trial concurrency ceiling or device attestation. Includes password hashing, writes and optional email. |
| `POST /api/public/appointments` | IP+site-network+replay layers, tenant plan quota, 8 KiB pre-parse ceiling, honeypot and server-resolved tenant | Replay suppression is fixed-window rather than a database appointment idempotency key; notification delivery is still open. |
| `POST /api/site-admin/media` | Authorization before multipart parsing; declared request/file bounds; WebP byte/dimension checks; tenant count/byte quota and concurrency; site-prefixed key | Direct signed object-storage upload, content moderation/malware policy and abandoned-object cleanup remain open. |
| `POST /api/subscribe` | IP+demo/email limits, 4 KiB pre-parse ceiling, validated plan/demo, Stripe hosted checkout and stable intake/plan-scoped Stripe idempotency | Provider-level concurrency remains a deployment concern. |
| `POST /api/stripe/webhook` | 1 MiB pre-parse body ceiling, Stripe signature verification and persisted event idempotency | Operational alert/dead-letter behavior remains open. |
| Owner Finder search | Owner auth; 30-day normalized cache; provider daily cap after cache lookup | No concurrent-request coalescing, platform monthly budget or provider alerting. |
| Login/password recovery | Signed/hashed sessions and reset tokens; scrypt passwords; one-time reset; network+identity/token throttles; anti-enumeration recovery response | Provider-edge bot/challenge and distributed anomaly detection remain open. |
| Expired-demo cleanup | Cron secret; transactional cleanup | Unbounded selection/deletion; no batches, runtime budget, resume cursor or job metrics. |

## 7. Database cost findings

### Confirmed strengths

- parameterized SQL is used in the inspected repositories;
- site-admin reads/writes use server-resolved `site_id`;
- useful indexes exist for site slug, custom domain, demo expiry, sessions, appointments, preview tokens, audit entities, AI runs and rate-limit cleanup;
- prepared-profile and Stripe event persistence include idempotent/unique structures for their workflows.

### Hotspots

- repository constructors now reuse the bounded runtime pool; deployment-wide connection count still scales with active serverless runtimes;
- `PostgresFinderRepository.listLeads()` and `listBusinessWorkspace()` are unbounded;
- owner workspace pagination/filtering is performed after all rows are loaded;
- `listAppointments(siteId)` and lead history/profile/audit lists are unbounded;
- the business workspace query uses three lateral lookups per lead;
- public appointment and checkout flows perform duplicate site lookups;
- no explicit `leads(updated_at desc)` index was found for the main owner ordering;
- no explicit composite `(lead_id, created_at)` index was found for pipeline history ordering;
- cleanup holds a transaction while handling the complete expired set;
- there are no query-duration metrics, slow-query thresholds or load-tested connection limits.

## 8. Tenant/domain/cache isolation

| Requirement | Status | Finding |
| --- | --- | --- |
| DB tenant scope | Partially implemented | Customer-site operations generally use server-derived `site_id`; no RLS provides a second boundary. |
| Session tenant scope | Implemented | Site-admin session records and authorization are site-bound. |
| Storage tenant scope | Partially implemented | Blob keys include site identity and PostgreSQL media rows store `site_id`; read URLs use opaque global IDs and there is no quota/accounting. |
| Cache tenant scope | Implemented for slug documents | Validated normalized slug/domain identities use hashed cache tags; mutation paths invalidate only the affected site. Private preview/admin content is excluded. Full custom-domain HTML caching remains open. |
| Rate-limit tenant scope | Implemented for current customer entry points | Appointments, client AI and uploads use tenant controls; auth, trial, recovery and checkout use layered hashed network/account/resource keys. Owner AI and platform-provider totals still need cost ceilings. |
| Usage/log tenant scope | Partially implemented | Tenant counters, fair-use state and warning/throttle/override events exist and are visible to Owner. Public origin/bandwidth, auth and platform-provider totals remain open. |
| Custom-domain uniqueness | Implemented | `sites.custom_domain` is unique in migration 007. |
| Trusted-host validation | Implemented | Only the canonical platform host, exact Vercel runtime hosts and explicitly configured additional hosts serve platform routes. Customer hosts have a narrow public surface; ambiguous values are rejected, domains are IDNA-normalized and tests cover spoofed/arbitrary Vercel hosts. |

## 9. Observability and cost guardrails

### Implemented

- domain audit events for Finder/profile/demo workflows;
- AI run records with provider usage where returned;
- persisted Stripe webhook event processing;
- `/api/health` database check;
- migration, quality, dependency and secret checks.

### Missing

- per-tenant request/API/form/auth/upload/storage/bandwidth counters;
- platform totals reconcilable against Vercel, Neon, Blob, Resend, Google and OpenAI;
- structured throttle/block/abuse logs without sensitive content;
- dashboards, alert thresholds and anomaly detection;
- function duration/error/concurrency monitoring;
- storage-growth and database-connection alerts;
- emergency ceiling and tenant/subsystem kill switches;
- a tested degraded-mode policy.

Repository documentation already identifies uptime monitoring, centralized error reporting, database/webhook alerts and provider-level bot protection as launch blockers in `docs/PRODUCTION_READINESS.md`.

## 10. Verification coverage

Current quality gates cover typecheck, lint, unit tests, boundary checks, documentation links, secret scanning, dependency audit and production build. PostgreSQL integration tests run when `DATABASE_URL` is supplied; the current pass completed all eight repository integration tests against the configured Neon database.

Local production-build regression baseline on 2026-08-18, using `scripts/load-check.mjs`, 100 requests and concurrency 10: static `/legal/privacy` returned 100/100 HTTP 200 with p50 40.1 ms, p95 204.0 ms and 147.1 requests/second; dynamic landing `/` returned 100/100 HTTP 200 with p50 111.5 ms, p95 341.2 ms and 66.4 requests/second. This is a single-machine regression measurement, not a staging/provider capacity claim.

The following broader hardening verification remains:

- tenant A cannot consume tenant B quota;
- tenant A cannot read tenant B usage;
- tenant-specific cache isolation and invalidation;
- burst/concurrency handling and recovery;
- repeated expensive AI/provider requests;
- monthly quota exhaustion and fair-use transitions;
- owner override audit and expiry;
- representative load tests for cached public pages and high-cost routes.

## 11. Ranked hardening plan

### P0 — required before an unrestricted production/commercial v1.0 claim

1. **Completed: share and constrain database pools.** Both repositories use the runtime-safe pool factory with explicit pool/connect/query timeouts. Validate the final Neon/Vercel connection budget under load before release.
2. **Completed core: create the tenant usage-control foundation.** Plan-configured counters, burst/concurrency leases, fair-use state, enforcement events and Owner override are implemented. Broader provider and bandwidth metrics remain P1 work.
3. **Completed at application level: protect public/auth/upload entry points.** Layered hashed subjects, bounded bodies, login/recovery throttles, recovery anti-enumeration, honeypots, replay suppression and server-side media validation are implemented. Provider-edge bot protection remains a deployment gate.
4. **Partially completed: make public site delivery cache-first.** The global layout is static, slug sites use on-demand ISR, tenant slug/domain documents are cached and mutations invalidate them. Responsive media optimization and full custom-domain HTML edge caching remain open; preview/admin stay private.
5. **Partially completed: harden upload architecture.** Authentication-before-parse, byte/dimension verification, quota and concurrency are implemented. Signed direct-to-storage upload and object lifecycle cleanup remain open.
6. **Completed: tighten tenant host resolution.** Platform/preview hosts use exact allowlisting, customer-domain surfaces are constrained, domains are canonicalized and spoofed/ambiguous/arbitrary Vercel hosts are tested.
7. **Substantially completed: add P0 integration/security tests.** Quota, cache identity, concurrency, rate-subject, bounded bodies, media bytes, host routing, signed Owner access and password hashing are covered. Trial and appointment handlers now have direct abuse/replay/persistence tests, and Neon verifies one-time password recovery plus session revocation. A bounded read-only load harness is included; staging capacity remains open.

### P1 — required for controlled launch operations

1. Add per-tenant and platform dashboards, structured enforcement logs, provider reconciliation and alerts.
2. Batch/resume cleanup jobs and record duration/results.
3. Add DB pagination, safe maximums, missing query indexes and slow-query measurements.
4. Add responsive image variants, intrinsic dimensions, safe lazy loading and asset/page-weight budgets.
5. Add subsystem and tenant emergency controls with audited expiry/reason.
6. Configure and verify provider-level WAF/bot protection without blocking legitimate crawlers.
7. Establish load-test baselines for cached public pages, forms, login and AI/provider operations.

### P2 — efficiency and maintainability improvements

1. Split or reduce global CSS and enforce route-level JS/CSS budgets.
2. Add historical usage reports, forecasted quota warnings and buyer-configurable plan presets.
3. Automate Vercel/Neon/Blob/provider cost anomaly reconciliation where APIs permit.
4. Add capacity-runbook scenarios and periodic restore/failover exercises.

## 12. Expected impact

| Change group | Expected impact | Evidence required after implementation |
| --- | --- | --- |
| Cache-first public rendering | Fewer function executions and DB reads; lower latency and compute use | Build classification, cache headers, hit/miss test, invalidation test and before/after request/query timing |
| Shared bounded DB pool | Lower connection amplification under serverless concurrency | Pool/connection metrics and concurrent integration/load test |
| Tenant quotas and concurrency | One tenant cannot consume another tenant's allowance or all expensive workers | Cross-tenant, burst, recovery and override tests |
| Layered abuse protection | Reduced spam, brute-force, replay and provider-cost exposure | Endpoint security tests and structured enforcement events |
| Direct, validated, quota-bound media | Lower function bandwidth/memory risk and bounded tenant storage | Oversize/type/dimension/quota/isolation/cleanup tests |
| Observability and kill switches | Faster detection and controlled degradation | Alert tests, dashboard reconciliation and audited switch behavior |

These are expected outcomes, not completed performance claims.

## 13. Primary files/components likely affected

The implementation should be split into small auditable changes. Expected areas are:

- rendering/cache: `apps/web/app/layout.tsx`, `apps/web/app/site/[slug]/page.tsx`, `apps/web/app/customer-domain/page.tsx`, site-admin save/publish actions and a new cache/invalidation module;
- tenant resolution/security: `apps/web/proxy.ts`, custom-domain repository methods and domain setup tests;
- database connections/queries: `packages/site-data/src/index.ts`, `packages/business-finder/src/index.ts`, new shared database adapter, and new migrations;
- quotas/metering: new core policy types, site-data persistence, middleware/route helpers, owner usage UI and migrations;
- public/auth routes: `apps/web/app/api/public/*`, `apps/web/app/api/subscribe/route.ts`, owner/site-admin login and password recovery actions;
- AI/Finder: owner analysis/apply routes, client rewrite route, Finder provider route and usage reporting;
- media: `apps/web/app/api/site-admin/media/route.ts`, `apps/web/app/api/media/[id]/route.ts`, `apps/web/components/image-upload-field.tsx` and storage adapter;
- operations: `apps/web/app/api/internal/cleanup-expired-demos/route.ts`, `apps/web/vercel.json`, health/monitoring configuration and `docs/OPERATIONS.md`;
- verification: repository integration tests, web security tests, cache tests and a dedicated load-test directory.

## 14. Initial threshold proposal for implementation review

These are conservative starting values, not final measured limits. They must live in buyer/plan configuration, not be scattered as constants.

| Action | Suggested initial control |
| --- | --- |
| Public HTML | CDN/cache first; origin burst 60/min/site, warning rather than immediate suspension |
| Appointment/contact | 5/10 min/site+IP, 30/day/site on starter, replay fingerprint and honeypot |
| Login | 5/15 min/account+IP plus broader network/site ceiling; exponential cooldown |
| Password email | 3/hour/account+IP, uniform response |
| Upload | 4 MB/image, verified dimensions, 10/day starter, plan storage ceiling |
| Client AI rewrite | daily plus monthly token/cost budget, one concurrent job/site |
| Owner AI analysis | small concurrent platform queue, request and monthly provider ceiling |

Before finalizing values, run representative load tests and compare actual Vercel function, Neon connection/query, Blob transfer and AI/provider usage.

## Decision

Status against the supplied hardening specification: **foundation present; P0 hardening still required**.

Recommended sequence: complete the clean-install functional validation, preserve that baseline, then implement P0 in small commits before tagging or selling `v1.0.0`. P1 operational controls should be complete before unrestricted customer traffic. P2 can follow as measured optimization work.
