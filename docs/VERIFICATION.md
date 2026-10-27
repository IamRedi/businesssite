# Verification catalog

This catalog defines what a command proves. Passing a lower level never proves
a hosted, provider, device or Production gate.

| Command or job | Level | Proves | Prerequisites / environment | Side effects and concurrent safety | Mandatory for |
| --- | --- | --- | --- | --- | --- |
| `npm run check:rws` | V0/V2 | RWS artifacts exist, task/status schema coheres and governance regression tests pass | Local or CI; no secrets | Temporary test directories only; safe with unrelated work | Every quality handoff after adoption |
| `npm run check:docs` | V0 | Local Markdown links resolve | Local or CI | Read-only | Every quality handoff |
| `npm run typecheck` | V1 | TypeScript static contracts compile | Installed dependencies | Compiler cache may be written | Code changes |
| `npm run lint` | V1 | Configured lint rules pass | Installed dependencies | Tool caches may be written | Code changes |
| `npm run test` | V2 and provider-independent V3 | Workspace unit/component and enabled integration suites pass | Installed dependencies; some suites skip without explicit database/provider authority | Test-local resources; output must disclose skips | Every quality handoff |
| `npm run test:rls` | V3 | Clean PostgreSQL role/RLS authority chain | Disposable PostgreSQL and `MIGRATION_DATABASE_URL`; `RLS_TEST_DISPOSABLE_DATABASE=true` | Destructive only to the exact disposable target; unsafe without identity proof | DB/RLS/release changes |
| `npm run test:rls-upgrade` | V3 | Upgrade preservation and migration authority | Same disposable DB safeguards | Destructive only to disposable target | Migration/release changes |
| `npm run migrate:status` | V3 | Configured database migration status | Explicit target database URL | Database connection; intended read-only catalog inspection | Environment/release verification |
| `npm run check:production-operations` | V0/V2 | Guard, protected-input source contracts and Cron configuration tests | Local or CI, no provider credential required | Read-only/static plus temporary tests | Operations changes and quality |
| `npm run check:secrets` | V1 | Tracked repository content matches secret-scanning policy | Git checkout | Read-only; does not prove provider secret hygiene | Every quality handoff |
| `npm run check:sca` | V1 | Registry currently reports no dependency vulnerability at the configured threshold | Network access to npm registry | Network-only; timeout/outage is NOT_VERIFIABLE, not PASS | Every quality handoff |
| `npm run build` | V1/V2 | Production application bundle builds | Installed dependencies and documented non-secret build config | Writes build output | Every quality handoff |
| `npm run quality` | V0-V3 aggregate | All commands encoded in `package.json` quality pass on that source/environment | Node 22, npm 10+, dependencies and npm registry | Writes normal caches/build output; no hosted/provider/device proof | Handoff and pre-commit request |
| `npm run preflight:release` | V3/V5 | Exact release configuration fails closed or satisfies configured release gates | Explicit intended environment and protected values | May connect to configured DB/provider endpoints; authorization required | Release candidate |
| `npm run smoke` / `npm run load:check` | V4/V5 | Selected deployed routes and bounded capacity | Exact authorized URL/environment | Sends HTTP traffic; not safe against Production without task authority | Hosted acceptance |
| `npm run acceptance:*` | V4/V5 | Only the named provider/lifecycle contract | Isolated target, synthetic data, exact provider authority | May mutate isolated DB/provider state; explicit authorization and cleanup required | Matching acceptance task |
| `npm run deploy:isolated-production` | V6 | Creates only a guard-verified isolated Production-target deployment | Exact SHA/team/project, provider credential, baseline alias inventory and explicit owner authority | External Production-target mutation; never implied by quality | Separately authorized B6H2-style task only |

Booking v1 local-only checks: `npx tsx scripts/booking-v1-local-acceptance.mts`
requires exact `BOOKING_LOCAL_DATABASE_URL` identity `127.0.0.1:55480/booking_local`
and resets only its synthetic fixture rows; it proves real PostgreSQL slot,
RLS and concurrency behavior. `node scripts/booking-v1-browser-acceptance.mjs`
requires the synthetic fixture and localhost Next preview on port 3001; it
captures 1280/390 screenshots, submits a synthetic request, confirms via local
Site Admin and validates the WhatsApp composer URL without external navigation.
Neither command proves hosted/Production behavior or WhatsApp delivery.
Migration 084 and the booking acceptance script additionally prove expired-hold
reconfirmation when free, refusal when taken, canonical proposal validation,
manual acceptance before proposed confirmation, and the retained exclusion race.
Migration 085 adds fall-back ambiguous-hour and break checks plus active-hold
past-time rejection to that same disposable booking acceptance script.
`node scripts/booking-v1-upgrade-acceptance.mjs` is a one-shot preservation
check on exact disposable `127.0.0.1:55480/booking_local_upgrade` with
`BOOKING_LOCAL_UPGRADE_DATABASE_URL`; it starts from the historical 052 fixture,
applies the known 066 owner correction only there, and verifies old appointment
rows survive through migration 083.

## CI mapping

P5-002 local custom design adds these scoped commands (customer inputs/evidence
stay private and no hosted target is used):

- `scripts/custom-design-db-acceptance.mjs` via tsx, explicit p5002 loopback
  disposable: real owner/runtime ACL, atomic backup, stale writes, bounded
  repeated saves, lifecycle denial and composition restore.
- `scripts/custom-design-upgrade-test.mjs`, explicit fresh p5002_custom_upgrade
  loopback disposable: migration 076 -> 077 and role provisioning preserve
  every existing row across the complete source-table snapshot.
- `scripts/custom-site-browser-acceptance.mjs URL PRIVATE_OUT`: hydrated 1280/390
  carousel/lightbox/video, media timing, overflow, local LCP/CLS and screenshots;
  `--owner-editor` tests preview isolation/invalidation, `--decorative` tests
  autoplay/reduced-motion/save-data. Loopback URL only, no Production claim.
- Existing `test:rls-upgrade` historical-schema provisioning permits only the
  specifically enumerated later tables under its explicit legacy flag. Normal
  provisioning still fails closed on that old schema.

- GitHub `CI / quality` installs dependencies, migrates disposable PostgreSQL,
  runs migration status, secret/SCA checks and `npm run quality`.
- `CI / enforced-rls` is the dedicated clean PostgreSQL 16 authority suite.
- `CI / rls-upgrade-preservation` is the dedicated upgrade-preservation suite.
- Backup workflows and B6H2 manual acceptance are operational workflows, not
  substitutes for CI or owner acceptance.

## Result vocabulary

Owner managed custom media: focused WebP/MP4 and Owner route tests run with
`npm run test`; `custom-media-upgrade-test.mjs` verifies077→078 full row
preservation, and `custom-media-db-acceptance.mjs` verifies authorization,
tenant/provider registration, lifecycle and exact catalog ACLs. Both V3 scripts
require `RLS_TEST_DISPOSABLE_DATABASE=true` and exactly
`postgresql://postgres@127.0.0.1:55456/p50021_custom_media_upgrade`.
The upgrade script requires a fresh database/role cluster. Never point these
fixture-writing scripts at shared or Production data. Hosted HTTP201/read/MIME,
asset registration, private draft and performance require separate real proofs.

- `PASS`: the required check ran and succeeded.
- `FAIL`: it ran and produced negative evidence.
- `NOT_RUN`: it was intentionally not executed.
- `NOT_VERIFIABLE`: required proof was unavailable.
- `NOT_APPLICABLE`: the check does not apply.
- `STALE`: evidence no longer matches the required revision or environment.

Every evidence record must bind task ID, exact source revision or defined
worktree fingerprint, timestamp/timezone, exact command, Node/npm and relevant
tool versions, execution environment, result/counts, skips, actor/role and a
durable output/artifact reference. A summary without this identity is
`NOT_VERIFIABLE`, not `PASS`.

## Site Admin UI consolidation

`node scripts/site-admin-ux-browser-acceptance.mjs` is V4 local browser evidence.
It requires the separately prepared disposable `premium_ux` database, the local
server at localhost:3012, a private fixture login in `.custom-site-private/login.json`,
and the installed Playwright module path in `.custom-site-private/playwright.txt`.
It logs in normally, creates synthetic local requests, exercises real confirmation,
proposal and hours-save APIs, simulates one HTTP409, and captures 1280/390 views.
It intercepts the WhatsApp composer; no message or hosted/provider request is sent.
Customer screenshots and logs stay in `.custom-site-private/ux-evidence`. It does
not provision/reset a database, prove Production, or prove custom-price/media edits.

## Site Admin custom content, local candidate

`BSRC-SITE-ADMIN-UX-002`: evidence. New gates cover price shape/cents, bounded uploads, customer authentication/origin, media quota, capability/lifecycle, tenant-owned managed asset references and optimistic concurrency. The local HTTP Blob simulator exercises the real SDK and validators without contacting a hosted store. Provider-hosted acceptance is not claimed.

`node --import tsx --test scripts/video-showcase-component.test.ts` runs five focused React/Chromium regressions against synthetic media on an ephemeral loopback server: source/poster replacement, state reset, lazy loading, reduced-motion/save-data opt-in and offscreen pause. It uses the existing ignored `.custom-site-private/playwright.txt` tool pointer, or `VIDEO_COMPONENT_PLAYWRIGHT_MODULE` as a test-tool path. Chrome must be installed. It requires no application server, database, provider credentials or customer fixture and does not prove Safari or hosted behavior.

## Portable Clouvider runtime

`npm run check:clouvider-runtime` is a Node-only fail-closed startup configuration regression, included in quality. It does not prove role ACLs, provider credentials or hosted behavior. Docker/native/static/start/restart acceptance uses the isolated mini-PC and synthetic database only; exact fingerprint/digest and failures are recorded in the migration evidence.
