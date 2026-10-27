# PostgreSQL row-level security

Migration 053 preserves 66 tables / 63 RLS / 63 FORCE while making readiness
portable to managed PostgreSQL extensions. `PUBLIC EXECUTE` still fails
readiness for every application routine; only routines proven by `pg_depend` to
be extension members are excluded because some providers retain ownership and
default grants. Export, customer-deletion and provider-binding ledger tables
are procedure-only; application identities have no direct grants, ownership or
BYPASSRLS. Customer routines derive account/site from session and owner/system
work is exact-routine only.

## Completed B4A local enforced boundary

Migrations `038_pilot_row_level_security.sql` through
`051_vercel_blob_store_authority.sql` provide the actor-specific boundary for
every active web-reachable path. The application has zero fallback paths
through `DATABASE_URL` or `MIGRATION_DATABASE_URL`. Exactly 63 protected tables
have RLS and FORCE; `platform_users`, `platform_roles` and `schema_migrations`
remain global/migrator-only.

The selected Model A uses four NOLOGIN routine owners:

- `bsrc_bootstrap_executor` for public, signup/auth/recovery and other bootstrap routines;
- `bsrc_runtime_executor` for authenticated customer routines;
- `bsrc_owner_executor` for owner authentication/RBAC/operations;
- `bsrc_system_executor` for billing webhooks, REDI and bounded cleanup.

They do not own tables, cannot log in, have no `BYPASSRLS`, and are not granted
to application roles. Application logins receive only exact routine EXECUTE or
existing trusted-session table grants. The migrator owns all 66 tables and is a
member of executors solely for controlled function ownership/backfill work; no
web process receives that identity. FORCE makes the table owner subject to RLS.

`DATABASE_URL` is local/test compatibility for `off` mode only and is forbidden
in pilot/enforced web and release environments.
`DATABASE_RUNTIME_URL` is a distinct customer-scoped LOGIN member of the
NOLOGIN `bsrc_runtime` group. `MIGRATION_DATABASE_URL` is administrative and
must be the `bsrc_migrator` role or an explicit member. Runtime is a non-owner,
non-superuser without `BYPASSRLS`, `CREATEDB` or `CREATEROLE`.
`DATABASE_SYSTEM_URL` is a distinct LOGIN member of `bsrc_system`, used only
after provider signature verification. It has no table grants and receives only
the explicit billing and Information/REDI system-routine allowlists. Run `npm run db:roles` after migrations;
credentials and LOGIN-role creation remain provider configuration, never SQL
migration content.

On PostgreSQL 15+ hosted databases, `npm run db:roles` grants schema `CREATE`
to the migrator before relation ownership transfer and to each NOLOGIN executor
only for its routine-ownership transfer window. Executor `CREATE` is revoked
immediately afterward; post-transfer EXECUTE grants run under the classified
routine owner. This keeps the final privilege model unchanged while supporting
providers where `public` schema creation belongs only to `pg_database_owner`.
Repeat provisioning preserves already-classified executor ownership and assumes
each exact catalog owner only for its own revoke/grant operations. A migration
that replaces an already-provisioned routine must declare the exact
`migrate-as-owner-of` signature; the runner accepts only a catalog-resolved
current owner or one of the four configured executors, and bounds temporary
schema `CREATE` plus `SET LOCAL ROLE` to that migration transaction.
The owner-owned `issue_preview_for_site` helper additionally grants EXECUTE to
the runtime executor because the authenticated `site_admin_preview_issue`
wrapper invokes it; application LOGIN roles still cannot call the helper.

`DATABASE_OWNER_URL` is a fourth distinct LOGIN member of `bsrc_owner_ops`.
It has EXECUTE only on the owner allowlist and zero table grants. RLS has no
broad owner policy: six owner security tables and the two legal tables are
accessed through constrained projections/mutations. `withAuthenticatedOwnerContext`
provides transaction-local context for compound repository work, rejects
nested contexts and clears GUC state after commit, rollback and error.

Migration `045` completes customer usage/concurrency/AI/domain, owner AI,
public business-media/public-legal and REDI media/quota/concurrency paths with
fixed-path routines, owned by the matching executor after provisioning. Provider calls occur only after database
authorization. See the machine-readable
[`database-access-manifest.json`](../config/database-access-manifest.json) and
the [database access inventory](DATABASE_ACCESS_INVENTORY.md).

## Trusted site-admin provenance

The trusted path is:

`opaque cookie -> strict 64-hex validation -> SHA-256 hash -> active session -> active account -> exact site_id -> transaction-local site_admin context`

`withAuthenticatedSiteAdminContext` performs resolution, context setup and its
callback on one acquired client and one transaction. An expected site/slug is
only a mismatch check after session resolution; it never supplies authority.
Unknown, deleted/revoked, expired and disabled-account sessions return no
context. Commit, rollback and pooled-client reuse reset all GUCs. Nested implicit
contexts fail. Preview and owner cookies use separate names and code paths.

Auth tables have RLS but no runtime table privileges or policies. Nine narrowly
scoped `site_admin_*` routines cover exact-email login lookup, active-session
resolution, password-bound session creation, revocation, reset creation,
single-use reset consumption, password change, same-context availability and a
minimal lifecycle snapshot for in-transaction product enforcement.
They are bootstrap-executor-owned `SECURITY DEFINER`, schema-qualify relations, use fixed
`search_path=pg_catalog`, accept typed scalar inputs, contain no dynamic SQL,
return minimal columns, revoke PUBLIC EXECUTE and grant only runtime EXECUTE.
Application routes retain generic login/recovery errors and only hashes reach
the database.

## Policy and grant matrix

All policies require `app_context_is_valid_site_admin()` and exact
`site_id=app_context_site_id()::text`; no policy uses `USING (true)`.

| Table | Customer policy | Runtime grant/projection |
| --- | --- | --- |
| `site_features` | own SELECT/INSERT/UPDATE | table SELECT/INSERT/UPDATE; no DELETE |
| `site_information_ad_slots` | own SELECT | SELECT only |
| `sites` | own SELECT/UPDATE | selected customer/lifecycle columns; UPDATE only `generated_document`, `publication_intent`; no INSERT/DELETE |
| `site_media` | own SELECT/INSERT/UPDATE/DELETE | CRUD; product/media quota remains application enforcement |
| `site_media_blobs` | own SELECT/INSERT/DELETE | metadata SELECT, constrained insert, delete; blob `data` is not readable |
| `site_appointments` | own SELECT/UPDATE | UPDATE only `status`, `note`, `updated_at`; anonymous INSERT uses the constrained B3A routine, never a table grant |
| `ai_runs` | own site-admin SELECT | safe audit/usage projection; no customer write |
| usage counters/states/events/leases | own SELECT | safe read projection only; atomic compatibility writers await constrained B3 procedures |
| external integrations/events | own SELECT | safe link/event projection; no metadata/details or customer mutation |
| site-admin auth tables | no direct policy | no table grant; auth routines only |
| billing/legal tables from `041` | no direct customer/system policy | no runtime/system table grants; four customer and three provider-system routines only |
| Information editorial tables from `043` | exact active session + editorial membership + site RLS | scoped CMS grants; owner/system have no table grants |
| Information public media/content | no raw table public policy | published-only runtime routines; private media requires same-site editor |
| REDI nonce/request/content | no direct policy | system routines recheck exact integration/site/permission |
| Finder leads/search/cache/profile/demo tables from `044` | no broad policy | owner routines recheck current DB session/MFA/permission; viewer read-only |
| preview/rate-limit/audit tables from `044` | no broad policy | exact owner/runtime/system routines; no direct application-role grant |
| privacy policy/rule/job/item/event/hold tables from `047` | no direct policy | owner/system routines only; admin read and owner manage are rechecked in DB; runtime has no generic job access |

## Privacy governance boundary

The six migration 047 tables are FORCE-RLS procedure-only. The owner executor
provides a bounded technical console and fresh-auth mutations; the system
executor can enqueue, claim, plan, transition and recover retention scans. The
runtime role cannot enumerate or create privacy jobs. PUBLIC has neither table
access nor function execution. Typed subject resolution verifies relationships
inside the database, and legal-hold creation/claim share an advisory subject
lock. B3 adds an independently default-off exact-customer closure executor with repeated hold/provider/policy checks. See [customer deletion](CUSTOMER_DATA_DELETION.md).

## Information and REDI boundary

Platform owner/admin provisioning, REDI grants and fixed ad placeholders use
`DATABASE_OWNER_URL`. The active publication CMS is preserved and uses an
opaque site-admin session plus exact `site_editorial_memberships`; platform
operator/viewer roles have no Information management permission. Public
Information routes use exact slug/verified-domain projections and never query
raw tables. REDI inbound uses `DATABASE_SYSTEM_URL` only after host, feature
flag, HMAC, timestamp and body validation; nonce and request claims are atomic.
See B3C2 implementation notes.

## Finder, trial and cleanup boundary

Migration `044` moves active Finder persistence, prepared-demo creation,
preview issuance, public trial creation, global rate limiting and expired-demo
cleanup to actor-specific routines. Owner routines re-read exact permission;
the public trial routine atomically derives site/account/session bindings; the
system cleanup routine accepts one fixed purpose and bounded batch and excludes
subscription history, recent pending payment and active preview. These global
tables intentionally have no `USING (true)` policy. See
B3C3 implementation notes.

## Public bootstrap capabilities

Runtime receives EXECUTE, but no new table grant, for four bootstrap-executor-owned,
fixed-path `SECURITY DEFINER` routines. Slug and domain resolvers return only
`site_id` and `generated_document` after exact identity, publication, lifecycle
and website-entitlement checks. Domain normalization and configured platform-host
rejection happen in the app before an exact verified-domain DB match. Preview
keeps `app HMAC -> exact UUID token/revocation/expiry/site binding -> private
projection`, is uncached and remains `noindex,nofollow`. The appointment routine
re-resolves the public slug and request entitlement, assigns tenant/status/time
server-side and returns only the inserted request; it is not a booking calendar.

`public_site_lifecycle_allows(text)` is an internal helper with no runtime grant.
Provisioning revokes PUBLIC EXECUTE from every application routine before
granting the explicit context, auth and bootstrap allowlist. Public cache keys
remain exact normalized slug/domain hashes and cache only the safe projection.

RLS does not replace product authorization. Core document writes still call the
central subscription-access policy first. Media, AI, domain, quota and
concurrency providers must be called only after authentication, capability and
lifecycle checks. Payment grace permits core edits only; read-only/locked and
expired-trial states deny product mutations. Migration 045 places domain
preflight/result persistence, AI runs, usage and concurrency writes behind
exact actor routines; runtime has no broader direct grant.

## Verification and performance

Run only against disposable PostgreSQL 16:

```bash
RLS_TEST_DISPOSABLE_DATABASE=true \
MIGRATION_DATABASE_URL=postgresql://... npm run test:rls
```

The harness applies all migrations, provisions roles, creates ephemeral runtime,
system and owner LOGINs, seeds synthetic public/private/domain/preview/billing/Information fixtures,
and runs 121 tests including 10 FORCE-specific negative tests. It verifies auth rejection/provenance,
cross-tenant reads/writes, protected columns, safe projections, routine owner /
search path / PUBLIC EXECUTE, pool leakage, concurrency and representative
`EXPLAIN (ANALYZE, BUFFERS)` plans. Existing indexes cover tested lookups; this
small synthetic fixture is not a production benchmark.

## Rollback and limitations

The B4A rollback is approval-only: cut traffic, switch application configuration
to `pilot`, run `db/admin/rollback-force-row-level-security.sql`, then rerun exact
setup/release checks. The script uses a 52-table allowlist and preserves RLS,
policies, routines, grants, ownership and every row. See the staging runbook.

First deploy `DATABASE_RLS_MODE=off`, restoring compatibility repositories.
Revoke 045 grants with `db/admin/rollback-database-boundary-completion.sql`.
Disable the cleanup scheduler and roll back B3C3 application paths before
running `db/admin/rollback-finder-demo-cleanup-rls.sql`. Disable REDI inbound
and roll back the B3C2 application paths before running
`db/admin/rollback-information-redi-rls.sql`. If rollback must continue, an
administrator may then run `db/admin/rollback-owner-security-rbac-rls.sql`, followed by `db/admin/rollback-billing-legal-system-rls.sql`,
followed by `db/admin/rollback-public-bootstrap-rls.sql` to
revoke B3A capabilities, followed when required by
`db/admin/rollback-core-customer-rls.sql`. These steps
disable RLS only on their scoped tables and intentionally retain policies, routines,
the account-status column, data and migration ledger.

FORCE RLS is locally verified, not staging/production verified. A compromised
migration credential can change DDL and therefore remains outside the RLS threat
claim. PostgreSQL custom GUCs are transport only: customer policies re-resolve
the opaque `app.session_hash` and match its database-derived site; caller-set
`app.site_id` alone grants no row. Provider identities, load, monitoring and
backup/restore evidence remain staging/production prerequisites.
