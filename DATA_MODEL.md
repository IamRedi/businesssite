# Data model

PostgreSQL is the system of record. JSONB is used at integration boundaries where the prepared profile, generated site and provider payload need schema evolution without duplicating engine contracts in SQL.

Migration `038_pilot_row_level_security.sql` adds no table or column. It adds
three invoker-safe context functions and enables non-FORCE RLS on
`site_features` (three policies) and `site_information_ad_slots` (one SELECT
policy). Runtime grants are administrative; see
[`docs/ROW_LEVEL_SECURITY.md`](docs/ROW_LEVEL_SECURITY.md).

## Identity and authorization

| Table | Purpose |
| --- | --- |
| `platform_users` | Platform-level identities reserved by the core schema |
| `platform_roles` | `OWNER` or `CUSTOMER` role assignment |
| `site_admin_accounts` | One password-based business-admin account per site |
| `site_admin_sessions` | Hashed, expiring business-admin sessions |

The current owner login uses one environment-configured email/password account and an HMAC-signed session. `platform_users` remains reserved for a future multi-user role model.

## Finder and audit

| Table | Purpose |
| --- | --- |
| `leads` | Normalized business record plus provider payload and current score |
| `lead_scores` | Score and structured score reasons |
| `lead_pipeline_events` | Append-only status history and notes |
| `lead_website_history` | Append-only first observation and material website URL/status changes for a deduplicated lead |
| `finder_searches` | Owner-visible history of every fresh or cached search, its input, result lead IDs, completion state and provider/cache source |
| `finder_search_cache` | Cached lead identifiers and expiration; default policy is 30 days |
| `audit_events` | Generic entity/action audit trail |
| `prepared_business_profiles` | Versioned website-engine input linked to a lead |

## Websites and content

| Table | Purpose |
| --- | --- |
| `sites` | Slug, generated `SiteDocument`, billing-independent publication intent, effective visibility, trial/recovery lifecycle, domain request state and exact Vercel team/project authority |
| `demo_sites` | Idempotent relationship between a prepared profile and its demo |
| `site_features` | Per-site `website`, `booking`, `custom_domain` and `social_media` feature flags |
| `site_external_integrations` | Secret-free site-to-provider installation, tenant and workspace mapping |
| `site_integration_events` | Append-only provisioning/session audit events for external integrations |
| `site_media` | Logical media slots and URLs used by a site |
| `site_media_blobs` | WebP binary uploads stored in PostgreSQL |
| `site_appointments` | Customer appointment requests and business-owner status |
| `site_editorial_settings` | Publication identity and reusable Information / News configuration |
| `site_article_categories` | Tenant-scoped editorial categories and ordering |
| `site_articles` | Tenant-scoped, versioned article content and publication lifecycle |
| `site_article_sources` | Ordered source references belonging to an article and tenant |
| `site_media_assets` | Logical, tenant-owned media metadata for editorial content |
| `site_content_audit_events` | Append-only editorial mutation audit trail |
| `site_editorial_memberships` | Per-site editorial role for authenticated site-admin accounts |
| `site_article_media` | Ordered, tenant-scoped gallery media attached to articles |
| `site_information_ad_slots` | Fixed provider-neutral advertising placements for Information sites |

`sites.generated_document` is the canonical rendered content document. Its `contact` object may include a seven-day `openingHours` array; each day contains `open`/`close` times or `closed: true`. Opening hours remain editable website content, while appointment requests are persisted separately. Templates and themes are source-controlled code in `packages/website-engine`, not database rows.

`sites.site_kind` defaults to `business`. The additive `information` value opts a site into editorial storage without changing or rewriting its existing `generated_document`. Article bodies use a versioned structured-block JSON contract rather than executable HTML. Composite tenant foreign keys prevent an article from referencing another site's category or media asset.

## Subscription acquisition

| Table | Purpose |
| --- | --- |
| `subscriber_intakes` | Plan selection, provider/Price and checkout reference, plus the authenticated site-admin account that authorized the payment target |
| `payment_webhook_events` | Processed provider event IDs for webhook idempotency |
| `schema_migrations` | Applied SQL migration ledger |
| `api_rate_limits` | Durable fixed-window limits for public endpoints |
| `ai_runs` | Provider-neutral AI audit, structured output, token usage and idempotent website application |
| `site_admin_password_resets` | One-time, expiring hashed password-reset tokens |
| `site_preview_tokens` | Revocable, expiring private-preview token identifiers; bearer signatures remain server-derived |
| `site_subscriptions` | Provider-neutral Stripe/Paddle identity, plan/status, durable grace/read-only timestamps and latest accepted provider-event ordering; legacy Stripe columns remain for compatibility |
| `subscription_lifecycle_events` | Secret-free audit evidence for grace, read-only/locked, trial expiry, stale provider events, reactivation and publication restoration |
| `platform_legal_config_versions` | Versioned platform operator identity, separate support/legal contacts, tax presentation and review/activation metadata |
| `platform_legal_document_versions` | Key/locale/version/hash lifecycle for immutable legal source evidence |
| `customer_business_identities` | Versioned customer contract identity plus self/provider/manual/rejected/review state; VAT ID optional |
| `contract_acceptances` | Immutable exact account/site/intake/attempt evidence for Terms, Privacy, B2B, authority, renewal and conditional promotion acknowledgement |
| `site_addon_subscriptions` | Independent Stripe lifecycle for separately billed add-ons such as Social Media |
| `tenant_usage_counters` | Atomic site/metric counters for minute, hour, day and month windows |
| `tenant_usage_states` | Current fair-use state and time-bounded owner override per site |
| `tenant_usage_events` | Warning, throttle, restriction and override audit events without request payloads or PII |
| `tenant_concurrency_leases` | Expiring leases used to cap simultaneous expensive operations per site |
| `integration_nonces` | Short-lived, one-use inbound integration replay protection |
| `integration_api_requests` | Durable request hash, state and response for inbound API idempotency |

No card data is stored locally. Stripe Checkout owns payment entry and payment-method handling.
Legacy intakes created before migration `030` remain stored but have no `site_admin_account_id`; they fail closed during webhook activation until a new authenticated checkout re-binds the intake.

## Deletion and retention

Foreign keys use cascading deletion for site-scoped accounts, sessions, media and appointments. Expired never-paid demos are deleted only after their durable recovery window and only when no subscription row exists. Activated/paid sites are retained when access becomes locked.

Migration 047 adds `sites.appointment_retention_days` constrained to 90, 180 or
365 (180 default) and six FORCE-RLS procedure-only governance tables:

| Table | Purpose |
| --- | --- |
| `privacy_policy_versions` | Immutable version/hash/activation evidence for the technical policy |
| `privacy_retention_rules` | Normalized class, trigger, duration, disposition, legal/provider flags and store coverage |
| `privacy_jobs` | Typed subject, pinned policy/snapshot, state/lease/attempt and correlation ledger |
| `privacy_job_items` | PII-free per-class/store plan with pinned rule, count, prerequisites and blockers |
| `privacy_job_events` | Append-only controlled state and receipt events |
| `privacy_legal_holds` | Scoped immutable hold creation and audited release evidence |

B1 calculates dry-run plans only. It does not create exports or execute
customer deletion/anonymization/provider cleanup. See
`docs/PRIVACY_RETENTION_POLICY.md`.

## Migration order

1. `001_platform_core.sql`
2. `002_finder_runtime.sql`
3. `003_align_lead_runtime_columns.sql`
4. `004_site_owner_portal.sql`
5. `005_site_media_blobs.sql`
6. `006_subscriber_onboarding.sql`
7. `007_demo_lifecycle_and_domains.sql`
8. `008_self_service_trials.sql`
9. `009_stripe_checkout.sql`
10. `010_production_operations.sql`
11. `011_custom_domain_verification.sql`
12. `012_password_recovery.sql`
13. `013_secure_previews_and_subscriptions.sql`
14. `014_ai_assistant.sql`
15. `015_tenant_usage_controls.sql`
16. `016_finder_website_history.sql`
17. `017_finder_search_history.sql`
18. `018_social_control_integration.sql`
19. `019_social_media_addon_billing.sql`
20. `020_custom_domains_for_all_subscriptions.sql`
21. `021_information_sites.sql`
22. `022_integration_inbound_security.sql`
23. `023_information_audit_tenant_integrity.sql`
24. `024_editorial_rbac.sql`
25. `025_information_media_delivery.sql`
26. `026_information_media_cascade.sql`
27. `027_information_ad_slots.sql`
28. `028_redi_information_inbound.sql`
29. `029_multi_provider_billing.sql`
30. `030_secure_checkout_ownership.sql`
31. `031_auth_lifecycle_hardening.sql`
32. `032_owner_auth_core.sql`
33. `033_owner_team_rbac.sql`
34. `034_product_availability_entitlements.sql`
35. `035_subscription_access_lifecycle.sql`
36. `036_b2b_commercial_legal_boundary.sql`
37. `037_customer_locale_preferences.sql`
38. `038_pilot_row_level_security.sql`
39. `039_core_customer_row_level_security.sql`
40. `040_public_bootstrap_rls_boundaries.sql`
41. `041_billing_legal_system_rls_boundaries.sql`
42. `042_owner_security_rbac_rls_boundaries.sql`
43. `043_information_redi_rls_boundaries.sql`
44. `044_finder_demo_cleanup_rls_boundaries.sql`
45. `045_database_boundary_completion.sql`
46. `046_force_row_level_security.sql`
47. `047_privacy_retention_job_foundation.sql`
48. `048_authenticated_privacy_exports.sql`
49. `049_customer_deletion_workflow.sql`
50. `050_provider_cleanup_reconciliation.sql`
51. `051_vercel_blob_store_authority.sql`
52. `052_vercel_domain_project_authority.sql`

Never edit an applied migration. Add a new numbered migration for every schema change.
