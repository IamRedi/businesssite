# Database access inventory

Migrations through 063 produce the exact catalog at 67 tables / 64 RLS / 64 FORCE. The machine manifest inventories customer export/deletion, exact private-export authority/reservation, provider binding/reconciliation, owner review, aggregate monitoring heartbeat and system worker routines; all privacy and monitoring state tables have zero PUBLIC/application-role direct access.

This is the human review companion to
[`config/database-access-manifest.json`](../config/database-access-manifest.json).
The JSON file is the machine-readable route/operation registry and the static
gate verifies web-source construction rules.

## Actor call graph

| Request family | Connection | Authorization before data/provider effect | Database surface |
| --- | --- | --- | --- |
| Public site, Information, media, legal, trial, appointment | runtime | exact slug/domain/token/rate-limit rules | public projection or constrained creation routine |
| Site-admin auth, editor, media, AI, domain, checkout intake | runtime | opaque session hash resolved to exact active account/site and current capability | RLS transaction or `site_admin_*` routine |
| Owner auth/RBAC, customers, Finder/demo, legal, privacy, Information, AI | owner | active MFA session plus DB-derived role/permission; fresh auth where required | `owner_*` routines only; zero table grants |
| Stripe/Paddle webhook, REDI inbound, bounded cleanup/privacy planning and aggregate monitoring | system | signature/secret plus exact purpose; REDI also exact installation/permission | provider/system routines only; zero table grants |
| Migration, role provisioning, catalog verification | migrator | operator/CI administrative control | DDL/catalog/table ownership; never web runtime |

## FORCE routine-owner matrix

| Routine owner | Login/bypass | Routine class | Table capability | Application exposure |
| --- | --- | --- | --- | --- |
| `bsrc_bootstrap_executor` | NOLOGIN, no BYPASSRLS | public resolution, trial, auth/recovery, readiness | allowlisted tables + FORCE policies | runtime receives exact EXECUTE |
| `bsrc_runtime_executor` | NOLOGIN, no BYPASSRLS | authenticated customer/billing/domain/AI | customer/editorial/billing allowlist | runtime receives exact EXECUTE |
| `bsrc_owner_executor` | NOLOGIN, no BYPASSRLS | owner auth/RBAC/Finder/legal/Information/AI | owner-operation allowlist | owner receives exact EXECUTE |
| `bsrc_system_executor` | NOLOGIN, no BYPASSRLS | billing lifecycle, REDI, cleanup | provider/system allowlist | system receives exact EXECUTE |

Application LOGIN/group roles have no membership in these roles or the
migrator. The migrator owns all tables and may become an executor only for
controlled migrations/function maintenance. The machine manifest enumerates
every routine signature, owner, security mode, EXECUTE ACL, touched table
families and bootstrap/authenticated classification.

## Table and grant matrix after migration 063 + role provisioning

Every listed application table is owned by `bsrc_migrator`; all 64 RLS tables
also have FORCE. Runtime table grants exist only where an exact site-admin RLS transaction
is required. Owner and system have zero table grants and use routines. PUBLIC has
zero application-table grants and zero execute on protected routines.

| Tables | RLS | Runtime | Owner | System | Access model |
| --- | --- | --- | --- | --- | --- |
| `sites`, `site_features`, `site_media`, `site_media_blobs`, `site_appointments`, `ai_runs` | on | constrained columns/operations plus routines | none | none | exact site-admin policies and public/owner/system projections |
| `tenant_usage_counters`, `tenant_usage_states`, `tenant_usage_events`, `tenant_concurrency_leases` | on | safe read plus atomic routines | none | none | exact customer/REDI/owner routines |
| `site_external_integrations`, `site_integration_events` | on | safe customer read | none | none | owner/system routines for mutation |
| `site_article_categories`, `site_article_media`, `site_article_sources`, `site_articles`, `site_content_audit_events`, `site_editorial_memberships`, `site_editorial_settings`, `site_information_ad_slots`, `site_media_assets` | on | exact editorial policies/projections | none | none | same-site membership; public and REDI routines |
| `site_admin_accounts`, `site_admin_sessions`, `site_admin_password_resets` | on | none | none | none | auth routines only, zero policies |
| `subscriber_intakes`, `contract_acceptances`, `site_subscriptions`, `site_addon_subscriptions`, `subscription_lifecycle_events`, `payment_webhook_events`, `customer_business_identities`, `platform_legal_config_versions`, `platform_legal_document_versions` | on | none | none | none | checkout/customer/owner/provider routines only |
| `owner_accounts`, `owner_sessions`, `owner_auth_challenges`, `owner_mfa_recovery_codes`, `owner_invitations`, `owner_auth_audit_events` | on | none | none | none | owner-auth routines only |
| `leads`, `lead_pipeline_events`, `lead_website_history`, `lead_scores`, `prepared_business_profiles`, `demo_sites`, `finder_searches`, `finder_search_cache` | on | none | none | none | owner Finder/demo routines only |
| `site_preview_tokens`, `api_rate_limits`, `audit_events`, `integration_nonces`, `integration_api_requests` | on | none | none | none | exact public/runtime/system routines |
| `privacy_policy_versions`, `privacy_retention_rules`, `privacy_jobs`, `privacy_job_items`, `privacy_job_events`, `privacy_legal_holds` | on + FORCE | none | routine-only | routine-only | owner technical console and system retention-scan planner; no destructive B1 executor |
| `privacy_export_artifacts`, `privacy_export_download_capabilities`, `customer_deletion_workflows`, `privacy_provider_cleanup_items`, `privacy_provider_cleanup_bindings` | on + FORCE | routine-only | routine-only | routine-only | exact self-service/export/review/worker routines; deletion flags default off |
| `platform_users`, `platform_roles` | off | none | none | none | legacy migrator-only tables; no active web path |
| `schema_migrations` | off | none | none | none | migration ledger only |

## Verification boundary

Local PostgreSQL 16 evidence proves migration repeatability, role/grant shape,
RLS denial and synthetic query behavior. B5C additionally proves isolated
managed-provider role/readiness behavior and the exact hosted-staging deletion
boundary. B6A must separately prove current hosted alert delivery and operator
escalation; the migration alone does not. Neither proves Production
latency/capacity, backups/restores or unaccepted external-provider journeys.
