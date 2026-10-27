# Database migration inventory

- `048_authenticated_privacy_exports.sql`: additive authenticated export ledger, FORCE RLS, safe projections, leased worker, checksum-required completion, one-time capabilities and temporary-artifact cleanup. It seeds no jobs/artifacts/capabilities and mutates no source customer data.
- `049_customer_deletion_workflow.sql`: controlled BusinessSite closure ledger, eligibility/cooling/provider/approval/execution state machine, FORCE RLS and deterministic anonymization. It seeds no work and invokes no provider.
- `067_owner_finder_workspace_query.sql`: forward-only correction for the owner business-workspace composite-field query; it preserves the existing SECURITY DEFINER owner/grant boundary and changes no data.

Migrations are append-only and run in filename order through `npm run migrate`. The `schema_migrations` table records each applied filename. Never edit a migration after it has reached any shared environment.

| Migration | Purpose |
| --- | --- |
| `001_platform_core.sql` | Users, roles, leads, scoring, pipeline, prepared profiles, sites, demos and base feature flags |
| `002_finder_runtime.sql` | Google Finder fields, search/cache persistence, audit events and profile handoff state |
| `003_align_lead_runtime_columns.sql` | Aligns the durable lead score used by the Finder runtime |
| `004_site_owner_portal.sql` | Business-admin accounts/sessions, media metadata and appointment requests |
| `005_site_media_blobs.sql` | PostgreSQL media fallback used outside production object storage |
| `006_subscriber_onboarding.sql` | Subscriber intake and conversion state |
| `007_demo_lifecycle_and_domains.sql` | Trial expiration, activation and initial custom-domain state |
| `008_self_service_trials.sql` | Self-service onboarding source and trial email |
| `009_stripe_checkout.sql` | Checkout session, payment timestamp and intake update state |
| `010_production_operations.sql` | Migration ledger and durable API rate limits |
| `011_custom_domain_verification.sql` | DNS verification evidence and verified-domain lookup index |
| `012_password_recovery.sql` | One-time business-admin password-reset tokens |
| `013_secure_previews_and_subscriptions.sql` | Revocable preview tokens and durable Stripe base subscriptions |
| `014_ai_assistant.sql` | Audited owner/client AI runs and idempotent application state |
| `015_tenant_usage_controls.sql` | Tenant quotas, fair-use state/events and concurrency leases |
| `016_finder_website_history.sql` | Website-presence observation history for durable leads |
| `017_finder_search_history.sql` | Search result, cache and completion history |
| `018_social_control_integration.sql` | Redi Control mapping, lifecycle events and the `social_media` feature key |
| `019_social_media_addon_billing.sql` | Separate Social Media add-on subscriptions; removes provisional base-plan grants |
| `020_custom_domains_for_all_subscriptions.sql` | Backfill custom-domain access for every active paid subscription |
| `021_information_sites.sql` | Backward-compatible site kind, editorial settings, tenant-scoped articles, categories, media references and content audit |
| `022_integration_inbound_security.sql` | Durable inbound integration nonces and request idempotency records; exposes no API route |
| `023_information_audit_tenant_integrity.sql` | Same-tenant article/audit integrity while retaining audit evidence after article deletion |
| `024_editorial_rbac.sql` | Editorial editor/publisher/administrator memberships with same-tenant account integrity and information-admin backfill |
| `025_information_media_delivery.sql` | Controlled editorial media URLs, private/public storage metadata and tenant-scoped article galleries |
| `026_information_media_cascade.sql` | Whole-site cleanup compatibility for article gallery relations |
| `027_information_ad_slots.sql` | Structured tenant-scoped Information ad placements without executable provider content |
| `028_redi_information_inbound.sql` | Explicit deny-by-default REDI CONTROL inbound permissions and owner approval metadata for Information sites |
| `029_multi_provider_billing.sql` | Additive Stripe/Paddle provider-neutral subscription identity, paused state and webhook idempotency index |
| `030_secure_checkout_ownership.sql` | Additive site-admin ownership and expected provider Price binding for subscriber intakes; legacy unbound rows remain retained but cannot activate a site |
| `031_auth_lifecycle_hardening.sql` | Additive normalized-email uniqueness plus an expiry index for server-side site-admin session cleanup |
| `032_owner_auth_core.sql` | Database owner identity, password-to-MFA challenges, encrypted TOTP state, one-time recovery-code hashes, revocable hashed sessions and owner-auth audit evidence |
| `033_owner_team_rbac.sql` | Fixed owner roles/status extension, hash-only expiring invitations, delivery state, actor/target/invitation audit attribution and active-role lookup indexes |
| `034_product_availability_entitlements.sql` | Additive Starter editor/media/AI/request/domain keys, safe backfill, legacy request-only `booking` alias and disabled reserved `booking_calendar` key |
| `035_subscription_access_lifecycle.sql` | Additive publication intent, trial recovery, durable grace/read-only/provider-ordering timestamps, checkout-attempt versioning and lifecycle audit evidence |
| `036_b2b_commercial_legal_boundary.sql` | Versioned platform legal/commercial config and documents, versioned customer business identities, immutable account/site/intake-bound contract acceptance and legacy acceptance-state marker |
| `037_customer_locale_preferences.sql` | Additive durable EN/DE customer-account and owner-invitation locale preferences with English backfill/default and database constraints |
| `038_pilot_row_level_security.sql` | Invoker-safe transaction-context readers and non-FORCE pilot RLS policies for `site_features` and `site_information_ad_slots`; grants remain administrative |
| `039_core_customer_row_level_security.sql` | Non-FORCE core customer RLS, active/disabled site-admin state and constrained authentication/session/recovery routines; grants remain administrative |
| `040_public_bootstrap_rls_boundaries.sql` | Exact business-site slug/domain/private-preview resolvers and constrained anonymous appointment-request creation with no new runtime table grants |
| `041_billing_legal_system_rls_boundaries.sql` | Non-FORCE billing/legal RLS; atomic session-bound Starter checkout/legal evidence; minimal customer billing projection; separate system-only Stripe/Paddle lifecycle routines |
| `042_owner_security_rbac_rls_boundaries.sql` | Non-FORCE owner-security RLS and procedure-only owner authentication/team/customer/legal boundary |
| `043_information_redi_rls_boundaries.sql` | Non-FORCE Information editorial/content/media/nonce/request RLS; owner provisioning/grants/placeholders; public projections; system-only REDI operations |
| `044_finder_demo_cleanup_rls_boundaries.sql` | Non-FORCE procedure-only Finder/search/cache/lead/profile/demo/preview/rate-limit/audit boundaries; atomic public trial and bounded system cleanup |
| `045_database_boundary_completion.sql` | Fixed-path routines for remaining usage, AI, domain, public media/legal and REDI storage paths |
| `046_force_row_level_security.sql` | Exact executor-owned routine boundary and FORCE readiness foundation |
| `047_privacy_retention_job_foundation.sql` | Versioned privacy policy, retention rules, jobs/events and legal holds |
| `048_authenticated_privacy_exports.sql` | Encrypted export ledger, leased worker and one-time download capabilities |
| `049_customer_deletion_workflow.sql` | Controlled customer closure, cooling, approval and deterministic anonymization |
| `050_provider_cleanup_reconciliation.sql` | Immutable provider bindings and reconciliation-first cleanup state |
| `051_vercel_blob_store_authority.sql` | Exact Vercel Blob store authority for media cleanup |
| `052_vercel_domain_project_authority.sql` | Exact Vercel team/project authority for domain detach |
| `053_hosted_database_readiness.sql` | Managed-extension-aware enforced readiness without widening application routines |
| `054_canonical_self_service_site_ids.sql` | Canonical UUID identity for new atomic self-service trials |
| `055_self_service_trial_entitlements.sql` | Catalog-aligned trial entitlements with planned/provider features disabled |
| `056_customer_deletion_rate_limit_scope.sql` | Exact authenticated deletion rate-limit purpose |
| `057_provider_cleanup_lease_uncertainty.sql` | Unknown provider outcome is preserved as uncertain after lease expiry |
| `058_provider_cleanup_expired_lease_reconciliation.sql` | Expired provider leases must reconcile before terminal evidence |
| `059_operational_monitoring_snapshot.sql` | Aggregate system-only database/webhook/privacy alert projection without tenant or subject data |
| `060_operational_monitoring_heartbeat.sql` | Durable, aggregate-only scheduler heartbeat state in one row with no tenant, customer or payload data |
| `061_operational_monitoring_readiness.sql` | Extends the enforced catalog readiness invariant for the B6A heartbeat table |
| `062_private_privacy_export_store.sql` | Binds privacy exports to an exact private provider store, environment and object with durable reservations |
| `063_privacy_export_rate_limit_scope.sql` | Authorizes the authenticated customer export request scope in the database-owned rate-limit allowlist; unknown scopes stay fail-closed |
| `064_privacy_export_capability_public_execute.sql` | Keeps the hosted readiness contract fail-closed after 062 recreated capability consumers |
| `065_privacy_scheduler_concurrency.sql` | Rejects overlapping scheduler runs while retaining lease evidence |
| `066_privacy_export_artifact_binding_authority.sql` | Keeps the export binding helper on the same classified owner boundary as its guard; canonical 066 baseline check |
| `067_owner_finder_workspace_query.sql` | Forward-only owner business-workspace composite-field query correction inside the existing SECURITY DEFINER owner boundary |
| `068_provider_usage_observability.sql` | Provider usage observability records and audited owner append audit routine |
| `069_provider_usage_public_execute_authority.sql` | Restores public execute authority for the provider usage snapshot routine after 068 recreated it |
| `070_owner_provider_controls.sql` | Owner provider controls for per-operator AI/Finder throttling settings |
| `071_durable_appointment_receipts.sql` | Additive durable appointment receipt metadata (fingerprint, digest, 24h receipt expiry, versioning) in the existing appointments privacy class |
| `072_information_sponsor_banners.sql` | First-party Information sponsor table, tenant RLS, public banner/media projections, privacy export/deletion and 68/65/65 readiness update |
| `073_owner_complimentary_access.sql` | Owner-granted permanent free business access (`site_complimentary_access`), owner create/revoke/list routines, entitlement-aware availability and lifecycle gates, idempotent conversion on verified billing activation, export projection and 69/66/66 readiness update |

## Release verification

1. Create a provider backup or recovery point.
2. Run `npm run migrate` once from the intended revision.
3. Run `npm run migrate:status`; every tracked migration must report `applied`.
4. Run the database integration suites against the migrated database.
   For `072`, rerun `npm run db:roles` before serving the new application revision.
5. Record database environment, highest migration and commit SHA without recording the connection string.

## Rollback policy

Application rollback is allowed only to a revision compatible with the applied schema. Do not delete tables or columns during an incident. Correct schema defects with a new forward migration; restore data only from a verified recovery point after the incident scope is recorded.

Migration `031` is forward-compatible with the prior application. Before applying it to an existing environment, run this read-only preflight and stop if it returns any row:

```sql
select lower(btrim(email)) as normalized_email, count(*) as account_count
from site_admin_accounts
group by lower(btrim(email))
having count(*) > 1
order by account_count desc, normalized_email;
```

Resolve each ownership conflict manually with the customer and a recorded, reviewed procedure. Do not delete, merge or rename accounts automatically. The unique-index creation intentionally fails if a conflict remains. Do not rewrite an applied migration; use a reviewed forward migration.

Migration `032` is additive and does not import legacy owner environment credentials. After applying it, configure the MFA encryption key, run the explicit first-owner CLI once and complete enrollment. An application rollback to static owner authentication is prohibited because it would reintroduce an authentication downgrade.

Migration `033` is additive and backfills every existing owner identity to role `owner`. It introduces no public registration and does not alter customer/site-admin identities. Apply it before deploying team routes; older application revisions remain schema-compatible but cannot manage invitations or roles.

Migration `034` is additive and idempotent. It retains all legacy feature rows, treats legacy `booking` only as a request-appointment compatibility alias, adds canonical `appointment_requests` and `custom_domain_existing`, and reserves `booking_calendar=false`. Existing subscriptions receive the current Starter-capability keys without deleting media, content or provider records.

Migration `035` is additive and idempotent. It backfills a 30-day trial
recovery deadline, conservatively separates publication intent from
billing-forced visibility, and derives initial lifecycle timestamps from
existing row history. Active/manual-public state is retained; historical
inactive rows are not made public. No paid site, account, content, media,
appointment or provider record is deleted. Apply it before deploying the
central access policy.

Migration `036` is additive and idempotent. Existing subscriptions retain `acceptance_unknown`; no acceptance is backfilled. Legal/config identities and content hashes are immutable, contract evidence rejects update/delete, and new activation from an intake requires a bound acceptance. Apply it before enabling production billing setup. Roll back application code only to a schema-compatible revision; correct defects with a forward migration.

Migration `037` is additive and idempotent. Existing customer accounts and pending owner invitations are backfilled to English; no website content locale is changed. It adds EN/DE constraints so transactional/customer UI preferences cannot drift into the six-language generated-site domain. Apply it before deploying code that reads `preferred_locale` or `recipient_locale`.

Migration `038` is additive and enables non-FORCE RLS on two pilot tables only.
Apply it with the migration identity, then provision/assert runtime grants with
`npm run db:roles`. See [the RLS runbook](ROW_LEVEL_SECURITY.md). Incident
rollback disables only those two RLS flags and never reverses schema or data.

Migration `039` is additive. Existing accounts are backfilled `active`; no
account or customer data is disabled or deleted. Apply it with the migration
identity, immediately run `npm run db:roles`, configure the distinct
`DATABASE_RUNTIME_URL`, and run the disposable PG16 suite. Emergency rollback
uses `db/admin/rollback-core-customer-rls.sql` after application mode is `off`.

Migration `040` is additive: it adds nullable `customer_message` to separate
visitor text from the internal appointment note, but creates no table, policy,
FORCE flag or data rewrite. Run `npm run db:roles` after migration. Rollback first deploys
compatibility/off code, then runs `db/admin/rollback-public-bootstrap-rls.sql`;
it retains routines, content, tokens, appointments and the migration ledger.

Migration `041` is additive and data-preserving. It enables non-FORCE RLS on
nine existing billing/legal tables, creates four customer-runtime and three
provider-system routines, and rewrites no historical acceptance or provider
binding. Apply it, run `npm run db:roles`, configure distinct runtime/system
LOGIN URLs and run the disposable PG16 suite. Emergency rollback uses
`db/admin/rollback-billing-legal-system-rls.sql` only after compatibility/off
application code is live; it deletes no data, routines or migration history.

Migration `042` is additive and data-preserving. It enables non-FORCE RLS on
the six owner security tables, adds owner authentication/team/customer/legal
procedures, and performs no account, session, MFA, recovery, invitation, audit
or legal evidence rewrite. Apply it, provision roles, configure the distinct
owner LOGIN and run the PG16 suite. Rollback uses
`db/admin/rollback-owner-security-rbac-rls.sql` only after owner routes are off;
it preserves data, routines and migration history.

Migration `043` is additive and data-preserving. It enables non-FORCE RLS on
ten Information/REDI tables without rewriting content or integration history.
Apply it, run `npm run db:roles`, configure distinct runtime/owner/system LOGIN
URLs and run `npm run test:rls`. The disposable upgrade fixture is
`db/test/042-information-redi-upgrade-fixtures.sql`. Emergency rollback uses
`db/admin/rollback-information-redi-rls.sql` only after Information paths are
in compatibility/off mode and inbound REDI is disabled; data, routines and the
migration ledger are retained.

Migration `044` is additive and data-preserving. It enables non-FORCE RLS on
eleven Finder/demo/operation tables, adds only nullable actor/correlation fields,
schema-version defaults and lookup indexes, and rewrites no historical row.
Apply it, run `npm run db:roles`, configure distinct runtime/owner/system LOGIN
URLs and run `npm run test:rls`. The disposable `043→044` fixture is
`db/test/043-finder-demo-cleanup-upgrade-fixtures.sql`. Emergency rollback uses
`db/admin/rollback-finder-demo-cleanup-rls.sql` only after compatibility/off code
is live and the cleanup scheduler is disabled; it preserves data, routines,
indexes and the migration ledger.

Migration `045` is additive, idempotent and data-preserving. It adds no tables,
columns, policies or FORCE flags. It introduces fixed-path, migrator-owned
actor routines for the final usage, concurrency, AI, domain, public media/legal
and REDI storage paths; PUBLIC execute is revoked and grants are provisioned by
`npm run db:roles`. The `044->045` fixture is
`db/test/044-database-boundary-completion-upgrade-fixtures.sql`. Emergency
rollback first deploys compatible/off code, then runs
`db/admin/rollback-database-boundary-completion.sql`; it revokes new grants but
deletes no routines, rows or migration history.

Migration `046` changes no customer row or schema shape. It hardens site-admin
policy provenance to an opaque DB-resolved session and adds a runtime readiness
assertion. Run `npm run db:roles` immediately afterward: it creates/verifies the
four NOLOGIN executors, transfers exact routine ownership, installs executor
policies/grants, and activates FORCE on the exact 52 already-RLS tables only as
the final mutation in its transaction.
The three global/migration tables stay non-RLS. Controlled rollback uses
`db/admin/rollback-force-row-level-security.sql`; it removes only FORCE flags
from the explicit allowlist and preserves RLS, policies, routines, grants and data.

Migration `047` is additive and data-preserving. It adds six migrator-owned
privacy governance tables, seeds one deterministic active technical policy with
17 normalized rules, and brings all six under RLS + FORCE. It also adds typed
subject resolution, constrained owner/system routines, dry-run planning, safe
events and scoped legal holds. It creates no synthetic customer job or hold and
does not execute export, deletion, anonymization or provider cleanup. Apply it,
run `npm run db:roles`, verify the policy hash and run both disposable upgrade
and enforced suites. The non-destructive rollback is
`db/admin/rollback-privacy-retention-foundation.sql`.

Migration `048` adds authenticated privacy-export artifacts and one-time
capabilities under FORCE RLS. Migration `049` adds the exact customer closure
workflow, and migration `050` adds immutable provider cleanup bindings and
reconciliation state. Their detailed operational boundaries are documented in
the privacy export, customer deletion and provider cleanup runbooks.

Migration `051` is additive and data-preserving. It adds nullable explicit
provider authority to business media and immutable cleanup bindings, registers
new public Blob uploads through an authenticated same-site routine, and exposes
authority only through the system claim v2 routine. Existing Blob records with
no authority are not guessed or backfilled; they fail closed into manual
review. Apply it with the migration identity, rerun `npm run db:roles`, and keep
all cleanup flags off until exact-store staging acceptance is recorded.

Migration `052` is additive and data-preserving. It adds nullable exact Vercel
team/project authority to custom-domain source rows, validates and persists that
authority through the authenticated domain routine, and creates exact domain
cleanup bindings. Existing domain rows are not guessed or backfilled;
missing/malformed authority stops in manual review before transport. The
049→052 upgrade fixture verifies source-row preservation and unchanged 66/63/63
coverage. Keep the domain cleanup and parent worker flags off outside an
explicitly bounded accepted operation.

Migration `053` changes no table, row, RLS policy or provider binding. It
narrows `database_enforced_readiness()` so only catalog-declared extension
routines are exempt from the zero-PUBLIC-execute check; every application
routine remains covered. Its owner directive supports both a clean chain and a
post-provision upgrade by assuming only the existing classified routine owner
inside the migration transaction. Run `npm run db:roles` afterward; repeat
provisioning is idempotent and leaves executor schema `CREATE` revoked.

Migration `054` changes no existing row. It replaces the bootstrap-owned atomic
self-service trial routine so every new `sites.id` is a canonical PostgreSQL
UUID, matching the enforced site-admin context contract. Existing legacy
non-UUID sites are not rewritten or guessed; they require an explicit operator
disposition. Apply it with the migration runner's exact owner directive and
rerun `npm run db:roles`.

Migration `055` changes no existing row. It makes future atomic self-service
trials seed the active trial capabilities (`website`, editor, media, AI rewrite
and appointment requests) and their request-only booking alias. Booking
calendar, custom domain and social media remain disabled for trials. This
matches the versioned product catalog without backfilling legacy sites.

Migration `056` changes no existing row. It adds the authenticated customer
deletion subject scope to the database-owned rate-limit allowlist while keeping
unknown scopes fail-closed. Apply it before enabling deletion requests under
enforced RLS, then rerun exact role provisioning.

Migrations `057`–`058` change no provider object and preserve an expired
cleanup operation as `uncertain`, requiring reconciliation instead of blind
destructive replay. Migration `059` adds no table or customer row; it adds one
system-executor aggregate monitoring routine over bounded operational counts.
Migrations `060`–`061` add one aggregate-only scheduler heartbeat table, three
system-only lifecycle routines and the exact 67/64/64 enforced-readiness
invariant. No tenant/customer/provider identifier is stored. Apply through
`061`, rerun exact role provisioning and verify the 67/64/64 catalog before
enabling the staging scheduler/dead-man routes.

Migration `062` is additive and data-preserving. It binds every new privacy
export artifact to an exact provider, private store, environment and opaque
object key; reserves that authority durably before upload; adds bounded
uncertain/stuck cleanup; and makes incomplete legacy authority fail closed.
Because the replaced routines span classified NOLOGIN executors, its explicit
`migrate-as-migrator` and `migrate-as-owner-of` segments are executed in one
transaction by the allowlisted migration runner. Existing ready legacy rows are
not guessed or backfilled. Rerun exact role provisioning after application.

Migration `063` changes no row or catalog count. It adds only
`privacy_export_customer` to the database-owned authenticated rate-limit scope
allowlist; all unknown scopes remain fail closed. Apply it before enabling
hosted privacy-export requests. Migrations through `063` retain 67 tables, 64
RLS, 64 FORCE and `database_enforced_readiness() = true` after role provisioning.

Migration `066` changes no table or customer row. It verifies that
`privacy_export_artifact_binding_valid(privacy_export_artifacts)` remains on
the same classified owner boundary as `privacy_export_artifact_guard()`, fails
closed rather than reassigning an unexpected owner, and revokes `PUBLIC`
execute. Exact owner and executor grants are reapplied by role provisioning.
Migrations through `066` retain 67 tables, 64 RLS, 64 FORCE and
`database_enforced_readiness() = true` after role provisioning.
