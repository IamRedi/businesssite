import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import {
  acquisitionProviders,
  lifecycleConfigurationErrors,
  productCatalog,
  purchasablePlans,
} from "./product-catalog.mjs";
import { brandProfileEnvironmentErrors } from "./brand-profile-check.mjs";
import { databaseRoleNames } from "./database-role-config.mjs";
import { databaseAccessViolations } from "./database-access-verifier.mjs";

const legalDocumentManifest = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../config/legal-document-manifest.json"),
    "utf8",
  ),
);
const billingRoutineOnlyTables = [
  "subscriber_intakes",
  "site_subscriptions",
  "site_addon_subscriptions",
  "subscription_lifecycle_events",
  "payment_webhook_events",
  "customer_business_identities",
  "contract_acceptances",
  "platform_legal_config_versions",
  "platform_legal_document_versions",
];
const ownerRoutineOnlyTables = [
  "owner_accounts",
  "owner_sessions",
  "owner_auth_challenges",
  "owner_mfa_recovery_codes",
  "owner_invitations",
  "owner_auth_audit_events",
];
const ownerApplicationRoutines = [
  "owner_auth_resolve_session",
  "owner_auth_login_lookup",
  "owner_auth_challenge_lookup",
  "owner_auth_record_audit",
  "owner_auth_create_challenge",
  "owner_auth_complete_enrollment",
  "owner_auth_complete_verification",
  "owner_auth_complete_recovery",
  "owner_auth_revoke_session",
  "owner_auth_change_password",
  "owner_auth_regenerate_recovery_codes",
  "owner_team_list",
  "owner_invitation_list",
  "owner_invitation_lookup",
  "owner_invitation_create",
  "owner_invitation_resend",
  "owner_invitation_revoke",
  "owner_invitation_delivery",
  "owner_invitation_accept",
  "owner_team_change",
  "owner_customer_list",
  "owner_usage_snapshot",
  "owner_provider_usage_snapshot", "owner_provider_control",
  "owner_usage_override",
  "owner_legal_configs",
  "owner_legal_documents",
  "owner_legal_acceptances",
  "owner_legal_create_config",
  "owner_legal_activate_config",
  "owner_legal_register_document",
  "owner_legal_activate_document",
  "owner_legal_verify_business",
  "owner_information_create_publication",
  "owner_information_configure_redi",
  "owner_information_configure_ad_slots",
  "owner_finder_list_leads",
  "owner_finder_get_lead",
  "owner_finder_list_workspace",
  "owner_finder_create_search",
  "owner_finder_complete_search",
  "owner_finder_fail_search",
  "owner_finder_list_searches",
  "owner_finder_get_cache",
  "owner_finder_save_cache",
  "owner_finder_upsert_lead",
  "owner_finder_add_pipeline",
  "owner_finder_list_pipeline",
  "owner_finder_create_profile",
  "owner_finder_list_profiles",
  "owner_finder_append_audit",
  "owner_provider_usage_record",
  "owner_finder_list_audit",
  "owner_demo_create",
  "owner_preview_issue",
  "owner_demo_site_by_lead",
  "owner_demo_site_identity",
  "owner_demo_site_identity_by_slug",
  "owner_demo_configure_admin",
  "owner_demo_invitation_prepare",
  "owner_ai_start",
  "owner_ai_finish",
  "owner_ai_get",
  "owner_ai_apply",
];
const finalRuntimeRoutines = [
  "site_admin_site_projection",
  "site_admin_site_plan",
  "site_admin_cache_identities",
  "site_admin_reserve_usage",
  "site_admin_concurrency_acquire",
  "site_admin_concurrency_release",
  "site_admin_ai_start",
  "site_admin_ai_finish",
  "site_admin_domain_preflight",
  "site_admin_domain_persist",
  "resolve_public_business_media_blob",
  "resolve_public_legal_config",
  "resolve_public_legal_documents",
];
const finalSystemRoutines = [
  "information_redi_site_plan",
  "information_redi_media_blob_insert",
  "information_redi_usage_reserve",
  "information_redi_concurrency_acquire",
  "information_redi_concurrency_release",
];
finalRuntimeRoutines.push("site_admin_capability_allowed");
finalRuntimeRoutines.push("site_admin_request_customer_deletion","site_admin_customer_deletion_status","site_admin_cancel_customer_deletion");
const finalBootstrapRoutines = [
  "resolve_public_business_media_blob",
  "resolve_public_legal_config",
  "resolve_public_legal_documents",
];
const informationRlsTables = [
  "site_editorial_settings",
  "site_editorial_memberships",
  "site_article_categories",
  "site_articles",
  "site_article_sources",
  "site_article_media",
  "site_media_assets",
  "site_content_audit_events",
  "integration_nonces",
  "integration_api_requests",
];
const informationRoutineOnlyTables = [
  "integration_nonces",
  "integration_api_requests",
];
const finderRoutineOnlyTables = [
  "leads",
  "lead_scores",
  "lead_pipeline_events",
  "lead_website_history",
  "prepared_business_profiles",
  "finder_searches",
  "finder_search_cache",
  "demo_sites",
  "site_preview_tokens",
  "api_rate_limits",
  "audit_events",
];
const privacyRoutineOnlyTables = [
  "privacy_policy_versions",
  "privacy_retention_rules",
  "privacy_jobs",
  "privacy_job_items",
  "privacy_job_events",
  "privacy_legal_holds",
  "privacy_export_artifacts",
  "privacy_export_download_capabilities",
  "customer_deletion_workflows",
  "privacy_provider_cleanup_items",
  "privacy_provider_cleanup_bindings",
  "operational_monitoring_state",
];
ownerApplicationRoutines.push(
  "owner_privacy_snapshot",
  "owner_privacy_job_items",
  "owner_privacy_start_dry_run",
  "owner_privacy_create_hold",
  "owner_privacy_release_hold",
  "owner_privacy_clone_policy",
  "owner_privacy_activate_policy",
  "owner_privacy_control_job",
  "owner_review_customer_deletion",
  "owner_record_customer_deletion_legal_review",
);
finalSystemRoutines.push(
  "privacy_system_enqueue_retention_scan",
  "privacy_system_claim_retention_job",
  "privacy_system_plan_retention_job",
  "privacy_system_transition_retention_job",
  "privacy_system_recover_stuck_jobs",
  "privacy_system_claim_deletion_plan",
  "privacy_system_plan_customer_deletion",
  "privacy_system_record_deletion_legal_review",
  "privacy_system_claim_deletion_provider_item",
  "privacy_system_finish_deletion_provider_item",
  "privacy_system_claim_provider_cleanup_work_v2",
  "privacy_system_claim_deletion_execution",
  "privacy_system_execute_customer_deletion",
  "privacy_system_fail_customer_deletion",
  "privacy_system_recover_customer_deletions",
  "monitoring_system_snapshot",
  "monitoring_system_begin",
  "monitoring_system_complete",
  "monitoring_system_heartbeat",
  "privacy_system_reserve_export",
  "privacy_system_recover_stuck_exports",
);
const rlsTables = [
  "site_features",
  "site_information_ad_slots",
  "sites",
  "site_media",
  "site_media_blobs",
  "site_appointments",
  "ai_runs",
  "tenant_usage_counters",
  "tenant_usage_states",
  "tenant_usage_events",
  "tenant_concurrency_leases",
  "site_external_integrations",
  "site_integration_events",
  "site_admin_accounts",
  "site_admin_sessions",
  "site_admin_password_resets",
  ...billingRoutineOnlyTables,
  ...ownerRoutineOnlyTables,
  ...informationRlsTables,
  ...finderRoutineOnlyTables,
  ...privacyRoutineOnlyTables,
];

const profiles = ["core", "finder", "billing", "full-production"];
const profile = process.env.PLATFORM_PROFILE?.trim() || "core";
let failed = false;
const report = (state, name, detail) => {
  console.log(`${state.padEnd(8)} ${name}${detail ? ` — ${detail}` : ""}`);
  if (state === "MISSING" || state === "INVALID") failed = true;
};
const value = (name) => process.env[name]?.trim();
const required = [
  "OWNER_MFA_ENCRYPTION_KEY",
  "PREVIEW_TOKEN_SECRET",
  "PUBLIC_APP_URL",
  "CRON_SECRET",
];
const rlsMode = value("DATABASE_RLS_MODE") || "off";
const privacyExecution =
  value("PRIVACY_RETENTION_EXECUTION_ENABLED") || "false";
const privacyExport = value("PRIVACY_EXPORT_ENABLED") || "false";
const production =
  process.env.NODE_ENV === "production" ||
  process.env.RELEASE_TARGET === "production";
const centralErrorEnabled =
  value("CENTRAL_ERROR_REPORTING_ENABLED") || "false";
if (!['true', 'false'].includes(centralErrorEnabled))
  report("INVALID", "CENTRAL_ERROR_REPORTING_ENABLED", "use true or false");
else
  report(
    production && centralErrorEnabled !== "true" ? "MISSING" : "OK",
    "CENTRAL_ERROR_REPORTING_ENABLED",
    centralErrorEnabled === "true"
      ? "server error delivery enabled"
      : production
        ? "required for production"
        : "disabled outside an accepted environment",
  );
if (centralErrorEnabled === "true") {
  let endpointValid = false;
  let endpointHost = "";
  try {
    const endpoint = new URL(value("CENTRAL_ERROR_REPORTING_ENDPOINT") || "");
    endpointHost = endpoint.hostname.toLowerCase();
    const allowedHosts = new Set(
      (value("CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS") || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
    endpointValid =
      endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      allowedHosts.has(endpoint.hostname.toLowerCase());
  } catch {}
  report(
    endpointValid ? "OK" : "INVALID",
    "CENTRAL_ERROR_REPORTING_ENDPOINT",
    endpointValid ? "HTTPS and exact-host allowlisted" : "unsafe or not allowlisted",
  );
  if (production)
    report(
      ((value("CENTRAL_ERROR_REPORTING_SECRET")?.length || 0) >= 32 || (/^[A-Za-z0-9]{24}$/.test(value("CENTRAL_ERROR_REPORTING_SECRET") || "") && (endpointHost === "betterstackdata.com" || endpointHost.endsWith(".betterstackdata.com"))))
        ? "OK"
        : "MISSING",
      "CENTRAL_ERROR_REPORTING_SECRET",
      "production requires a strong application or exact Better Stack source secret",
    );
}
const monitoringAlerts = value("MONITORING_ALERTS_ENABLED") || "false";
if (!['true', 'false'].includes(monitoringAlerts))
  report("INVALID", "MONITORING_ALERTS_ENABLED", "use true or false");
else
  report(
    production && monitoringAlerts !== "true" ? "MISSING" : "OK",
    "MONITORING_ALERTS_ENABLED",
    monitoringAlerts === "true"
      ? "aggregate database/webhook/privacy signals enabled"
      : production
        ? "required for production"
        : "disabled outside an accepted environment",
  );
for (const [name, fallback, minimum, maximum] of [
  ["MONITORING_WEBHOOK_WINDOW_MINUTES", 15, 5, 1440],
  ["MONITORING_STALE_LEASE_MINUTES", 5, 1, 60],
  ["MONITORING_DATABASE_CONNECTION_WARNING_PERCENT", 80, 50, 95],
]) {
  const configured = Number.parseInt(value(name) || String(fallback), 10);
  report(
    Number.isInteger(configured) && configured >= minimum && configured <= maximum
      ? "OK"
      : "INVALID",
    name,
    String(configured),
  );
}
const syntheticProbe = value("MONITORING_SYNTHETIC_PROBE_ENABLED") || "false";
if (!['true', 'false'].includes(syntheticProbe) || (production && syntheticProbe === "true"))
  report(
    "INVALID",
    "MONITORING_SYNTHETIC_PROBE_ENABLED",
    "use true only for an explicit staging acceptance",
  );
else
  report(
    "OK",
    "MONITORING_SYNTHETIC_PROBE_ENABLED",
    syntheticProbe === "true" ? "staging probe enabled" : "disabled",
  );
const stagingScheduler = value("MONITORING_STAGING_SCHEDULER_ENABLED") || "false";
const schedulerIsStaging =
  process.env.RELEASE_TARGET === "staging" &&
  process.env.VERCEL_ENV !== "production";
if (
  !["true", "false"].includes(stagingScheduler) ||
  (stagingScheduler === "true" && !schedulerIsStaging)
)
  report(
    "INVALID",
    "MONITORING_STAGING_SCHEDULER_ENABLED",
    "may be true only in a non-production staging deployment",
  );
else
  report(
    "OK",
    "MONITORING_STAGING_SCHEDULER_ENABLED",
    stagingScheduler === "true" ? "staging dead-man scheduler enabled" : "disabled",
  );
if (stagingScheduler === "true")
  report(
    (value("MONITORING_STAGING_SCHEDULER_SECRET")?.length || 0) >= 32
      ? "OK"
      : "MISSING",
    "MONITORING_STAGING_SCHEDULER_SECRET",
    "staging-only query capability requires 32+ characters",
  );
for (const [name, fallback, minimum, maximum] of [
  ["MONITORING_HEARTBEAT_MAX_AGE_SECONDS", 900, 60, 86400],
  ["MONITORING_HEARTBEAT_STALE_RUN_SECONDS", 180, 30, 3600],
]) {
  const configured = Number.parseInt(value(name) || String(fallback), 10);
  report(
    Number.isInteger(configured) && configured >= minimum && configured <= maximum
      ? "OK"
      : "INVALID",
    name,
    String(configured),
  );
}
if (!["true", "false"].includes(privacyExecution))
  report("INVALID", "PRIVACY_RETENTION_EXECUTION_ENABLED", "use true or false");
else
  report(
    "OK",
    "PRIVACY_RETENTION_EXECUTION_ENABLED",
    privacyExecution === "false"
      ? "dry-run only; destructive registry execution disabled"
      : "retention-scan scheduler enabled; B1 still has no destructive executor",
  );
if (!["true", "false"].includes(privacyExport))
  report("INVALID", "PRIVACY_EXPORT_ENABLED", "use true or false");
else
  report(
    "OK",
    "PRIVACY_EXPORT_ENABLED",
    privacyExport === "true"
      ? "authenticated export worker enabled"
      : "export requests/worker disabled",
  );
if (privacyExport === "true") {
  const adapter = value("PRIVACY_EXPORT_ARTIFACT_STORE");
  report(
    ["memory_test", "vercel_blob_private"].includes(adapter) ? "OK" : "INVALID",
    "PRIVACY_EXPORT_ARTIFACT_STORE",
    adapter || "required",
  );
  if (
    (process.env.NODE_ENV === "production" ||
      process.env.RELEASE_TARGET === "production") &&
    adapter !== "vercel_blob_private"
  )
    report(
      "INVALID",
      "PRIVACY_EXPORT_ARTIFACT_STORE",
      "production requires vercel_blob_private",
    );
  if (adapter === "vercel_blob_private")
  {
    const storeId = value("PRIVACY_EXPORT_BLOB_STORE_ID");
    const token = value("PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN");
    const tokenStore = token?.split("_")[3];
    report(
      /^store_[A-Za-z0-9]{16}$/.test(storeId) && `store_${tokenStore}` === storeId ? "OK" : "INVALID",
      "PRIVACY_EXPORT_BLOB_STORE_ID",
      "exact dedicated private store must match token authority",
    );
    report(
      token ? "OK" : "MISSING",
      "PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN",
      token
        ? "dedicated private store token configured"
        : "required for private artifacts",
    );
  }
  report(
    /^[a-z0-9][a-z0-9-]{0,39}$/.test(value("PRIVACY_EXPORT_ENVIRONMENT_ID")) ? "OK" : "INVALID",
    "PRIVACY_EXPORT_ENVIRONMENT_ID",
    "explicit private-export environment identity",
  );
  try {
    const parsed = JSON.parse(value("PRIVACY_EXPORT_ENCRYPTION_KEYS") || "");
    const version = value("PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION");
    const encoded = version && parsed?.[version];
    const key =
      typeof encoded === "string"
        ? Buffer.from(encoded, "base64url")
        : Buffer.alloc(0);
    report(
      version && key.length === 32 && key.toString("base64url") === encoded
        ? "OK"
        : "INVALID",
      "PRIVACY_EXPORT_ENCRYPTION_KEYS",
      "active version must resolve to one canonical 32-byte base64url key",
    );
  } catch {
    report(
      "INVALID",
      "PRIVACY_EXPORT_ENCRYPTION_KEYS",
      "valid versioned JSON key map required",
    );
  }
}
if (!["off", "pilot", "enforced"].includes(rlsMode))
  report("INVALID", "DATABASE_RLS_MODE", "use off, pilot or enforced");
else
  report(
    "OK",
    "DATABASE_RLS_MODE",
    rlsMode === "off"
      ? "compatibility mode; no RLS protection is claimed"
      : rlsMode === "enforced"
        ? "FORCE RLS and exact executor invariants required"
        : "break-glass/pilot application mode; no compatibility fallback",
  );
if (["pilot", "enforced"].includes(rlsMode)) {
  report(
    value("DATABASE_URL") ? "INVALID" : "OK",
    "DATABASE_URL",
    value("DATABASE_URL")
      ? "forbidden in scoped web runtime"
      : "absent; no compatibility fallback",
  );
  report(
    value("MIGRATION_DATABASE_URL") ? "OK" : "MISSING",
    "MIGRATION_DATABASE_URL",
    value("MIGRATION_DATABASE_URL")
      ? "separate administrative connection configured"
      : "required in scoped mode",
  );
  report(
    value("DATABASE_RUNTIME_URL") ? "OK" : "MISSING",
    "DATABASE_RUNTIME_URL",
    value("DATABASE_RUNTIME_URL")
      ? "customer-scoped runtime connection configured"
      : "required in scoped mode",
  );
  report(
    value("DATABASE_SYSTEM_URL") ? "OK" : "MISSING",
    "DATABASE_SYSTEM_URL",
    value("DATABASE_SYSTEM_URL")
      ? "provider-system connection configured"
      : "required in scoped mode",
  );
  report(
    value("DATABASE_OWNER_URL") ? "OK" : "MISSING",
    "DATABASE_OWNER_URL",
    value("DATABASE_OWNER_URL")
      ? "procedure-only owner connection configured"
      : "required in scoped mode",
  );
}
if (rlsMode === "off")
  report(
    value("DATABASE_URL") ? "OK" : "MISSING",
    "DATABASE_URL",
    value("DATABASE_URL")
      ? "explicit compatibility tooling connection"
      : "required in off mode",
  );
for (const error of brandProfileEnvironmentErrors())
  report("INVALID", "BRAND_PROFILE", error);

if (!profiles.includes(profile)) {
  report(
    "INVALID",
    "PLATFORM_PROFILE",
    "use core, finder, billing or full-production",
  );
} else {
  report("OK", "PLATFORM_PROFILE", profile);
}
for (const name of required)
  report(
    value(name) ? "OK" : "MISSING",
    name,
    value(name) ? "configured" : "required for core",
  );
for (const error of lifecycleConfigurationErrors(process.env))
  report("INVALID", error.split(" must", 1)[0], error);
if (
  value("CONTROL_PANEL_HOST") &&
  (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    value("CONTROL_PANEL_HOST"),
  ) ||
    /[/:@\s]/.test(value("CONTROL_PANEL_HOST")))
)
  report(
    "INVALID",
    "CONTROL_PANEL_HOST",
    "use one exact DNS hostname without a protocol, path or wildcard",
  );
else
  report(
    value("CONTROL_PANEL_HOST") ? "OK" : "OPTIONAL",
    "CONTROL_PANEL_HOST",
    value("CONTROL_PANEL_HOST") || "not configured",
  );
for (const name of ["PREVIEW_TOKEN_SECRET", "CRON_SECRET"]) {
  if (value(name) && value(name).length < 32)
    report("INVALID", name, "use at least 32 characters");
}
if (value("OWNER_MFA_ENCRYPTION_KEY")) {
  const key = Buffer.from(value("OWNER_MFA_ENCRYPTION_KEY"), "base64url");
  if (
    key.length !== 32 ||
    key.toString("base64url") !== value("OWNER_MFA_ENCRYPTION_KEY")
  )
    report(
      "INVALID",
      "OWNER_MFA_ENCRYPTION_KEY",
      "use one canonical base64url-encoded 32-byte key",
    );
}

const needsFinder = profile === "finder" || profile === "full-production";
const needsBilling = profile === "billing" || profile === "full-production";
const optional = (name, needed) =>
  report(
    value(name) ? "OK" : needed ? "MISSING" : "OPTIONAL",
    name,
    value(name)
      ? "configured"
      : needed
        ? `required by ${profile}`
        : "not enabled by this profile",
  );
optional("GOOGLE_MAPS_API_KEY", needsFinder);
const billingProviders = [
  ...new Set(
    (value("BILLING_PROVIDERS") || "stripe")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
if (
  !billingProviders.length ||
  billingProviders.some((provider) => !acquisitionProviders.includes(provider))
)
  report(
    "INVALID",
    "BILLING_PROVIDERS",
    `use catalog-active providers only: ${acquisitionProviders.join(",")}`,
  );
else report("OK", "BILLING_PROVIDERS", billingProviders.join(","));
const stripeEnabled = needsBilling && billingProviders.includes("stripe");
const paddleLegacyEnabled = value("PADDLE_LEGACY_LIFECYCLE_ENABLED") === "true";
for (const name of [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...purchasablePlans.map((plan) => `STRIPE_PRICE_${plan.toUpperCase()}`),
])
  optional(name, stripeEnabled);
optional("STRIPE_STARTER_PRICE_CATALOG_VERIFIED", stripeEnabled);
optional("STRIPE_PORTAL_CONFIGURATION_STARTER", stripeEnabled);
optional("STRIPE_PORTAL_STARTER_ONLY_VERIFIED", stripeEnabled);
if (stripeEnabled && value("STRIPE_STARTER_PRICE_CATALOG_VERIFIED") !== "true")
  report(
    "INVALID",
    "STRIPE_STARTER_PRICE_CATALOG_VERIFIED",
    "confirm displayed Starter prices match configured Stripe Price IDs",
  );
if (stripeEnabled && value("STRIPE_PORTAL_STARTER_ONLY_VERIFIED") !== "true")
  report(
    "INVALID",
    "STRIPE_PORTAL_STARTER_ONLY_VERIFIED",
    "verify that the portal cannot switch products or plans",
  );
if (
  stripeEnabled &&
  !/^bpc_[A-Za-z0-9]+$/.test(value("STRIPE_PORTAL_CONFIGURATION_STARTER") || "")
)
  report(
    "INVALID",
    "STRIPE_PORTAL_CONFIGURATION_STARTER",
    "use a verified Stripe portal configuration ID",
  );
for (const name of ["STRIPE_PRICE_PROFESSIONAL", "STRIPE_PRICE_PREMIUM"])
  optional(name, false);
if (
  value("NEXT_PUBLIC_LAUNCH_OFFER_ENABLED") === "true" &&
  !/^promo_[A-Za-z0-9]+$/.test(value("STRIPE_LAUNCH_PROMOTION_CODE") || "")
)
  report(
    "INVALID",
    "STRIPE_LAUNCH_PROMOTION_CODE",
    "required before the launch offer is visible",
  );
for (const name of ["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"])
  optional(name, paddleLegacyEnabled);
if (
  paddleLegacyEnabled &&
  !["sandbox", "production"].includes(value("PADDLE_ENVIRONMENT") || "sandbox")
)
  report("INVALID", "PADDLE_ENVIRONMENT", "use sandbox or production");
if (
  paddleLegacyEnabled &&
  value("PADDLE_ENVIRONMENT") === "production" &&
  value("PADDLE_LIVE_REVIEWED") !== "true"
)
  report(
    "INVALID",
    "PADDLE_LIVE_REVIEWED",
    "required for explicit legacy lifecycle processing",
  );
for (const name of [
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "BLOB_READ_WRITE_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_PROJECT_ID",
])
  optional(name, profile === "full-production");
optional("INFORMATION_BLOB_READ_WRITE_TOKEN", profile === "full-production");
optional("VERCEL_TEAM_ID", false);

const aiProvider = value("AI_PROVIDER") || "disabled";
if (!["disabled", "openai"].includes(aiProvider))
  report("INVALID", "AI_PROVIDER", "use disabled or openai");
else report("OK", "AI_PROVIDER", aiProvider);
const aiEnabled =
  value("AI_OWNER_ENABLED") === "true" || value("AI_CLIENT_ENABLED") === "true";
optional("OPENAI_API_KEY", aiProvider === "openai" || aiEnabled);
if (aiEnabled && aiProvider !== "openai")
  report("INVALID", "AI_PROVIDER", "set openai when an AI feature is enabled");
if (
  value("OPENAI_BASE_URL") &&
  !value("OPENAI_BASE_URL").startsWith("https://")
)
  report("INVALID", "OPENAI_BASE_URL", "use an HTTPS endpoint");

const rediEnabled = value("REDI_CONTROL_ENABLED") === "true";
if (
  rediEnabled &&
  productCatalog.capabilities.social_media.launchStatus !== "active"
)
  report(
    "INVALID",
    "REDI_CONTROL_ENABLED",
    "Social Media is Coming soon and runtime-disabled",
  );
for (const name of [
  "REDI_CONTROL_API_URL",
  "REDI_CONTROL_APP_URL",
  "REDI_CONTROL_INTEGRATION_ID",
  "REDI_CONTROL_INTEGRATION_SECRET",
])
  optional(name, rediEnabled);
optional("STRIPE_PRICE_SOCIAL_MEDIA_ADDON", rediEnabled);
if (rediEnabled && value("REDI_CONTROL_INTEGRATION_SECRET")?.length < 32)
  report(
    "INVALID",
    "REDI_CONTROL_INTEGRATION_SECRET",
    "use at least 32 random characters",
  );
const rediInboundEnabled = value("REDI_CONTROL_INBOUND_ENABLED") === "true";
if (rediInboundEnabled)
  report(
    "INVALID",
    "REDI_CONTROL_INBOUND_ENABLED",
    "two-system acceptance is incomplete",
  );
optional("REDI_CONTROL_INBOUND_SECRET", rediInboundEnabled);
if (rediInboundEnabled && value("REDI_CONTROL_INBOUND_SECRET")?.length < 32)
  report(
    "INVALID",
    "REDI_CONTROL_INBOUND_SECRET",
    "use at least 32 random characters",
  );
for (const name of ["REDI_CONTROL_API_URL", "REDI_CONTROL_APP_URL"])
  if (
    rediEnabled &&
    value(name) &&
    !value(name).startsWith("https://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(value(name))
  )
    report("INVALID", name, "use HTTPS or a local development URL");

if (
  ["pilot", "enforced"].includes(rlsMode)
    ? value("MIGRATION_DATABASE_URL")
    : value("DATABASE_URL")
) {
  if (
    ["pilot", "enforced"].includes(rlsMode) &&
    value("MIGRATION_DATABASE_URL") &&
    value("DATABASE_RUNTIME_URL") &&
    value("DATABASE_SYSTEM_URL") &&
    value("DATABASE_OWNER_URL")
  ) {
    const runtimePool = new pg.Pool({
      connectionString: value("DATABASE_RUNTIME_URL"),
    });
    const systemPool = new pg.Pool({
      connectionString: value("DATABASE_SYSTEM_URL"),
    });
    const ownerPool = new pg.Pool({
      connectionString: value("DATABASE_OWNER_URL"),
    });
    const migrationPool = new pg.Pool({
      connectionString: value("MIGRATION_DATABASE_URL"),
    });
    try {
      const runtime = (
        await runtimePool.query(
          `select current_user as role,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole
         from pg_roles r where r.rolname=current_user`,
        )
      ).rows[0];
      const migration = (
        await migrationPool.query("select current_user as role")
      ).rows[0];
      const system = (
        await systemPool.query(
          `select current_user as role,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole
         from pg_roles r where r.rolname=current_user`,
        )
      ).rows[0];
      const ownerOps = (
        await ownerPool.query(
          `select current_user as role,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole from pg_roles r where r.rolname=current_user`,
        )
      ).rows[0];
      const identitiesDistinct =
        new Set([runtime.role, system.role, ownerOps.role, migration.role])
          .size === 4;
      report(
        identitiesDistinct ? "OK" : "INVALID",
        "DATABASE_IDENTITIES",
        identitiesDistinct
          ? `runtime=${runtime.role}; system=${system.role}; owner=${ownerOps.role}; migration=${migration.role}`
          : "runtime, system, owner and migration identities must differ",
      );
      report(
        !runtime.rolsuper &&
          !runtime.rolbypassrls &&
          !runtime.rolcreatedb &&
          !runtime.rolcreaterole
          ? "OK"
          : "INVALID",
        "DATABASE_RUNTIME_ROLE",
        `role=${runtime.role}; superuser=${runtime.rolsuper}; bypassrls=${runtime.rolbypassrls}; createdb=${runtime.rolcreatedb}; createrole=${runtime.rolcreaterole}`,
      );
      const configuredRoles = databaseRoleNames();
      const runtimeMember = (
        await migrationPool.query(
          "select ($1=$2 or pg_has_role($1,$2,'member')) as member",
          [runtime.role, configuredRoles.runtime],
        )
      ).rows[0].member;
      report(
        runtimeMember ? "OK" : "INVALID",
        "DATABASE_RUNTIME_IDENTITY",
        runtimeMember
          ? `member of ${configuredRoles.runtime}`
          : `must be ${configuredRoles.runtime} or a member`,
      );
      const systemMembership = (
        await migrationPool.query(
          "select ($1=$2 or pg_has_role($1,$2,'member')) as system_member,pg_has_role($1,$3,'member') as migrator_member",
          [system.role, configuredRoles.system, configuredRoles.migrator],
        )
      ).rows[0];
      const systemSafe =
        system &&
        !system.rolsuper &&
        !system.rolbypassrls &&
        !system.rolcreatedb &&
        !system.rolcreaterole &&
        systemMembership.system_member &&
        !systemMembership.migrator_member;
      report(
        systemSafe ? "OK" : "INVALID",
        "DATABASE_SYSTEM_ROLE",
        systemSafe
          ? `role=${system.role}; non-owner, non-BYPASSRLS`
          : "system role is privileged or inherits migrator",
      );
      const ownerMembership = (
        await migrationPool.query(
          "select ($1=$2 or pg_has_role($1,$2,'member')) owner_member,pg_has_role($1,$3,'member') migrator_member",
          [ownerOps.role, configuredRoles.owner, configuredRoles.migrator],
        )
      ).rows[0];
      const ownerSafe =
        ownerOps &&
        !ownerOps.rolsuper &&
        !ownerOps.rolbypassrls &&
        !ownerOps.rolcreatedb &&
        !ownerOps.rolcreaterole &&
        ownerMembership.owner_member &&
        !ownerMembership.migrator_member;
      report(
        ownerSafe ? "OK" : "INVALID",
        "DATABASE_OWNER_ROLE",
        ownerSafe
          ? `role=${ownerOps.role}; procedure-only, non-BYPASSRLS`
          : "owner role is privileged, reused or inherits migrator",
      );
      const ownerTableGrants = (
        await migrationPool.query(
          "select count(*)::int count from information_schema.role_table_grants where grantee=$1",
          [configuredRoles.owner],
        )
      ).rows[0].count;
      report(
        ownerTableGrants === 0 ? "OK" : "INVALID",
        "DATABASE_OWNER_TABLE_GRANTS",
        ownerTableGrants === 0
          ? "zero direct table grants"
          : "owner role has direct table grants",
      );
      const ownerRoutines = await migrationPool.query(
        `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
        has_function_privilege('public',p.oid,'execute') public_execute,has_function_privilege($1,p.oid,'execute') owner_execute
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
        where n.nspname='public' and p.proname=any($2::text[])`,
        [configuredRoles.owner, ownerApplicationRoutines],
      );
      const ownerRoutinesSafe =
        ownerRoutines.rows.length === ownerApplicationRoutines.length &&
        ownerRoutines.rows.every(
          (row) =>
            row.prosecdef &&
            row.fixed_path &&
            row.owner === configuredRoles.ownerExecutor &&
            !row.public_execute &&
            row.owner_execute,
        );
      report(
        ownerRoutinesSafe ? "OK" : "INVALID",
        "DATABASE_OWNER_ROUTINES",
        ownerRoutinesSafe
          ? `${ownerApplicationRoutines.length} fixed-path owner-executor routines`
          : "owner routine inventory, ownership or execute grants differ",
      );
      const finalRoutines = await migrationPool.query(
        `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
        has_function_privilege('public',p.oid,'execute') public_execute,
        has_function_privilege($1,p.oid,'execute') runtime_execute,
        has_function_privilege($2,p.oid,'execute') system_execute
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
        where n.nspname='public' and p.proname=any($3::text[])`,
        [
          configuredRoles.runtime,
          configuredRoles.system,
          [...finalRuntimeRoutines, ...finalSystemRoutines],
        ],
      );
      const finalRoutinesSafe =
        finalRoutines.rows.length ===
          finalRuntimeRoutines.length + finalSystemRoutines.length &&
        finalRoutines.rows.every(
          (row) =>
            row.prosecdef &&
            row.fixed_path &&
            !row.public_execute &&
            (finalRuntimeRoutines.includes(row.proname)
              ? row.owner ===
                  (finalBootstrapRoutines.includes(row.proname)
                    ? configuredRoles.bootstrapExecutor
                    : configuredRoles.runtimeExecutor) &&
                row.runtime_execute &&
                !row.system_execute
              : row.owner === configuredRoles.systemExecutor &&
                row.system_execute &&
                !row.runtime_execute),
        );
      report(
        finalRoutinesSafe ? "OK" : "INVALID",
        "FINAL_DATABASE_BOUNDARY_ROUTINES",
        finalRoutinesSafe
          ? `${finalRuntimeRoutines.length} runtime and ${finalSystemRoutines.length} system B3C4 routines with exact grants`
          : "B3C4 routine inventory, ownership or grants differ",
      );
      const owner = (
        await migrationPool.query(
          `select count(*)::int as count from pg_class c join pg_roles r on r.oid=c.relowner
         where r.rolname=$1 and c.relkind in ('r','p')`,
          [runtime.role],
        )
      ).rows[0];
      report(
        owner.count === 0 ? "OK" : "INVALID",
        "DATABASE_RUNTIME_OWNERSHIP",
        owner.count === 0 ? "runtime owns no table" : "runtime owns a table",
      );
      const rls = await migrationPool.query(
        `select c.relname,c.relrowsecurity,c.relforcerowsecurity,
                (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
         from pg_class c where c.relname=any($1::text[]) order by c.relname`,
        [rlsTables],
      );
      const forceCount = rls.rows.filter(
        (row) => row.relforcerowsecurity,
      ).length;
      const validRls =
        rls.rows.length === rlsTables.length &&
        rls.rows.every((row) => row.relrowsecurity) &&
        (rlsMode === "enforced"
          ? forceCount === rlsTables.length
          : [0, rlsTables.length].includes(forceCount));
      report(
        validRls ? "OK" : "INVALID",
        "DATABASE_RLS",
        validRls
          ? `${rlsTables.length}/${rlsTables.length} RLS; ${forceCount}/${rlsTables.length} FORCE`
          : "RLS/FORCE state differs from the selected mode",
      );
      const roles = databaseRoleNames();
      const migrationAuthority = (
        await migrationPool.query(
          "select current_user::text=$1 or pg_has_role(current_user,$1,'member') as allowed",
          [roles.migrator],
        )
      ).rows[0];
      report(
        migrationAuthority.allowed ? "OK" : "INVALID",
        "DATABASE_MIGRATOR_AUTHORITY",
        migrationAuthority.allowed
          ? `migration identity is ${roles.migrator} or an explicit member`
          : `migration identity is not a member of ${roles.migrator}`,
      );
      const policies = await migrationPool.query(
        `select policyname,roles::text as role_targets from pg_policies
         where schemaname='public' and tablename in ('site_features','site_information_ad_slots')
           and policyname in ('site_features_site_admin_select','site_features_site_admin_insert','site_features_site_admin_update','site_information_ad_slots_site_admin_select')`,
      );
      const expectedPolicies = new Set([
        "site_features_site_admin_select",
        "site_features_site_admin_insert",
        "site_features_site_admin_update",
        "site_information_ad_slots_site_admin_select",
      ]);
      const exactPolicies =
        policies.rows.length === expectedPolicies.size &&
        policies.rows.every(
          (row) =>
            expectedPolicies.has(row.policyname) &&
            row.role_targets === `{${roles.runtime}}`,
        );
      report(
        exactPolicies ? "OK" : "INVALID",
        "PILOT_POLICY_TARGETS",
        exactPolicies
          ? `all policies target ${roles.runtime}`
          : "policy names or target roles differ from the pilot matrix",
      );
      const grants = await migrationPool.query(
        `select grantee,table_name,privilege_type from information_schema.role_table_grants
         where grantee in ($1,$2,'PUBLIC') and table_name in ('site_features','site_information_ad_slots')`,
        [roles.runtime, roles.system],
      );
      const actualGrants = new Set(
        grants.rows
          .filter((row) => row.grantee === roles.runtime)
          .map((row) => `${row.table_name}:${row.privilege_type}`),
      );
      const expectedGrants = new Set([
        "site_features:SELECT",
        "site_features:INSERT",
        "site_features:UPDATE",
        "site_information_ad_slots:SELECT",
      ]);
      const exactGrants =
        actualGrants.size === expectedGrants.size &&
        [...actualGrants].every((grant) => expectedGrants.has(grant)) &&
        grants.rows.every((row) => row.grantee === roles.runtime);
      report(
        exactGrants ? "OK" : "INVALID",
        "PILOT_GRANTS",
        exactGrants
          ? "exact runtime grants; no PUBLIC/system table grants"
          : "pilot grants are broader or incomplete",
      );
      const authBoundary = (
        await migrationPool.query(
          `select count(*)::int as count from information_schema.role_table_grants
         where grantee=$1 and table_name=any($2::text[])`,
          [
            roles.runtime,
            [
              "site_admin_accounts",
              "site_admin_sessions",
              "site_admin_password_resets",
            ],
          ],
        )
      ).rows[0];
      report(
        authBoundary.count === 0 ? "OK" : "INVALID",
        "SITE_ADMIN_AUTH_TABLE_GRANTS",
        authBoundary.count === 0
          ? "runtime uses constrained routines only"
          : "runtime has direct auth-table grants",
      );
      const authRoutines = (
        await migrationPool.query(
          `select count(*)::int as count from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
         where n.nspname='public' and p.proname=any($1::text[]) and p.prosecdef
           and p.proconfig @> array['search_path=pg_catalog'] and r.rolname=$2`,
          [
            [
              "site_admin_login_lookup",
              "site_admin_resolve_session",
              "site_admin_create_session",
              "site_admin_revoke_session",
              "site_admin_create_password_reset",
              "site_admin_consume_password_reset",
              "site_admin_change_password",
              "site_admin_site_available",
              "site_admin_access_snapshot",
            ],
            roles.bootstrapExecutor,
          ],
        )
      ).rows[0];
      report(
        authRoutines.count === 9 ? "OK" : "INVALID",
        "SITE_ADMIN_AUTH_ROUTINES",
        authRoutines.count === 9
          ? "9 fixed-path SECURITY DEFINER routines owned by bootstrap executor"
          : "auth routine owner/security/search_path inventory differs",
      );
      const publicRoutines = await migrationPool.query(
        `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] as fixed_path,
                r.rolname as owner,has_function_privilege('public',p.oid,'execute') as public_execute,
                has_function_privilege($1,p.oid,'execute') as runtime_execute
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
         where n.nspname='public' and p.proname=any($2::text[])`,
        [
          roles.runtime,
          [
            "resolve_public_site_by_slug",
            "resolve_public_site_by_domain",
            "resolve_private_preview",
            "create_public_appointment_request",
          ],
        ],
      );
      const validPublicRoutines =
        publicRoutines.rows.length === 4 &&
        publicRoutines.rows.every(
          (row) =>
            row.prosecdef &&
            row.fixed_path &&
            row.owner === roles.bootstrapExecutor &&
            !row.public_execute &&
            row.runtime_execute,
        );
      report(
        validPublicRoutines ? "OK" : "INVALID",
        "PUBLIC_BOOTSTRAP_ROUTINES",
        validPublicRoutines
          ? "4 fixed-path bootstrap-executor routines; runtime-only execute"
          : "B3A routine owner/security/grants differ",
      );
      const finderOperations = await migrationPool.query(
        `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
                has_function_privilege('public',p.oid,'execute') public_execute,
                has_function_privilege($1,p.oid,'execute') runtime_execute,
                has_function_privilege($2,p.oid,'execute') system_execute,
                has_function_privilege($3,p.oid,'execute') owner_execute
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
         where n.nspname='public' and p.proname=any($4::text[])`,
        [
          roles.runtime,
          roles.system,
          roles.owner,
          [
            "consume_api_rate_limit",
            "public_trial_create",
            "site_admin_preview_issue",
            "cleanup_expired_demo_batch",
          ],
        ],
      );
      const validFinderOperations =
        finderOperations.rows.length === 4 &&
        finderOperations.rows.every(
          (row) =>
            row.prosecdef &&
            row.fixed_path &&
            row.owner ===
              (row.proname === "cleanup_expired_demo_batch"
                ? roles.systemExecutor
                : row.proname === "site_admin_preview_issue"
                  ? roles.runtimeExecutor
                  : roles.bootstrapExecutor) &&
            !row.public_execute &&
            !row.owner_execute &&
            (row.proname === "cleanup_expired_demo_batch"
              ? row.system_execute && !row.runtime_execute
              : row.runtime_execute && !row.system_execute),
        );
      report(
        validFinderOperations ? "OK" : "INVALID",
        "FINDER_OPERATIONS_ROUTINES",
        validFinderOperations
          ? "3 runtime and 1 system B3C3 routines; exact actor grants"
          : "B3C3 runtime/system routine ownership or grants differ",
      );
      const systemGrants = (
        await migrationPool.query(
          "select count(*)::int as count from information_schema.role_table_grants where grantee=$1",
          [roles.system],
        )
      ).rows[0];
      report(
        systemGrants.count === 0 ? "OK" : "INVALID",
        "DATABASE_SYSTEM_GRANTS",
        systemGrants.count === 0
          ? "reserved role has no table grants"
          : "reserved role has table privileges",
      );
      const billingRoutines = await migrationPool.query(
        `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,
                r.rolname owner,has_function_privilege('public',p.oid,'execute') public_execute,
                has_function_privilege($1,p.oid,'execute') runtime_execute,
                has_function_privilege($2,p.oid,'execute') system_execute
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
         where n.nspname='public' and p.proname like 'billing_%'`,
        [roles.runtime, roles.system],
      );
      const validBillingRoutines =
        billingRoutines.rows.length === 7 &&
        billingRoutines.rows.every(
          (row) =>
            row.prosecdef &&
            row.fixed_path &&
            row.owner ===
              (row.proname.startsWith("billing_system_")
                ? roles.systemExecutor
                : roles.runtimeExecutor) &&
            !row.public_execute &&
            (row.proname.startsWith("billing_system_")
              ? row.system_execute && !row.runtime_execute
              : row.runtime_execute && !row.system_execute),
        );
      report(
        validBillingRoutines ? "OK" : "INVALID",
        "BILLING_BOUNDARY_ROUTINES",
        validBillingRoutines
          ? "4 runtime and 3 system routines; exact actor grants"
          : "billing routine owner/security/grants differ",
      );
      const catalogViolations = await databaseAccessViolations(
        migrationPool,
        rlsMode,
      );
      report(
        catalogViolations.length ? "INVALID" : "OK",
        "DATABASE_ACCESS_MANIFEST",
        catalogViolations.length
          ? catalogViolations.join("; ")
          : "exact table/policy/grant/routine/role catalog matches",
      );
    } catch {
      report(
        "INVALID",
        "DATABASE_RLS",
        "role/property/policy checks failed; connection values were not printed",
      );
    } finally {
      await runtimePool.end();
      await systemPool.end();
      await ownerPool.end();
      await migrationPool.end();
    }
  }
  const inspectionUrl =
    ["pilot", "enforced"].includes(rlsMode) && value("MIGRATION_DATABASE_URL")
      ? value("MIGRATION_DATABASE_URL")
      : value("DATABASE_URL");
  const pool = new pg.Pool({ connectionString: inspectionUrl });
  try {
    await pool.query("select 1");
    report(
      "OK",
      ["pilot", "enforced"].includes(rlsMode)
        ? "MIGRATION_DATABASE_URL"
        : "DATABASE_URL",
      "inspection connection succeeded",
    );
    const expected = readdirSync(
      resolve(import.meta.dirname, "../db/migrations"),
    ).filter((name) => /^\d+_.+\.sql$/.test(name));
    const table = await pool.query(
      "select to_regclass('public.schema_migrations') as name",
    );
    const applied = table.rows[0]?.name
      ? new Set(
          (await pool.query("select name from schema_migrations")).rows.map(
            (row) => row.name,
          ),
        )
      : new Set();
    const pending = expected.filter((name) => !applied.has(name));
    report(
      pending.length ? "MISSING" : "OK",
      "MIGRATIONS",
      pending.length
        ? `${pending.length} pending; run npm run migrate`
        : "all applied",
    );
    if (!pending.length) {
      const owners = await pool.query(
        "select count(*)::int as count,count(*) filter (where role='owner' and status='active' and mfa_enrolled_at is not null)::int as enrolled from owner_accounts",
      );
      report(
        owners.rows[0].count ? "OK" : "MISSING",
        "OWNER_ACCOUNT",
        owners.rows[0].count
          ? `${owners.rows[0].count} database owner account(s)`
          : "run npm run owner:bootstrap -- --email <owner-email>",
      );
      report(
        owners.rows[0].enrolled ? "OK" : "MISSING",
        "OWNER_MFA",
        owners.rows[0].enrolled
          ? "an active owner-role account has enrolled MFA"
          : "activate at least one MFA-enrolled owner-role account",
      );
      if (needsBilling) {
        const legal =
          await pool.query(`select currency,tax_display_mode,price_tax_label from platform_legal_config_versions
          where status='active' and legal_review_status='reviewed' and effective_from <= now()
            and btrim(legal_business_name)<>'' and btrim(street)<>'' and btrim(postal_code)<>''
            and btrim(city)<>'' and country_code ~ '^[A-Z]{2}$' and btrim(country_name)<>''
            and btrim(contact_email)<>'' and btrim(support_email)<>'' and btrim(price_tax_label)<>'' limit 1`);
        report(
          legal.rows[0] ? "OK" : "MISSING",
          "PLATFORM_LEGAL_CONFIG",
          legal.rows[0]
            ? `${legal.rows[0].tax_display_mode}; ${legal.rows[0].currency}`
            : "activate one reviewed version in Owner Legal",
        );
        const documents = await pool.query(
          "select document_key,locale,version,content_hash from platform_legal_document_versions where status='active' and reviewed_at is not null and effective_from <= now() and document_key in ('terms','privacy','imprint','cancellation') and locale in ('de','en')",
        );
        const evidence = new Set(
          documents.rows.map(
            (row) =>
              `${row.document_key}:${row.locale}:${row.version}:${row.content_hash}`,
          ),
        );
        const missingDocuments = legalDocumentManifest
          .filter(
            (item) =>
              !evidence.has(
                `${item.documentKey}:${item.locale}:${item.version}:${item.contentHash}`,
              ),
          )
          .map((item) => `${item.documentKey}:${item.locale}@${item.version}`);
        report(
          missingDocuments.length ? "MISSING" : "OK",
          "LEGAL_DOCUMENTS",
          missingDocuments.length
            ? `review and activate exact sources ${missingDocuments.join(", ")}`
            : "exact reviewed DE/EN version/hash set active",
        );
        report(
          value("CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED") === "true"
            ? "OK"
            : "INVALID",
          "CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED",
          "must be true for production billing profiles",
        );
      }
    }
  } catch {
    report(
      "INVALID",
      ["pilot", "enforced"].includes(rlsMode)
        ? "MIGRATION_DATABASE_URL"
        : "DATABASE_URL",
      "connection failed; value was not printed",
    );
  } finally {
    await pool.end();
  }
}
process.exitCode = failed ? 1 : 0;
