import { readFileSync } from "node:fs";
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
import { unsafeProductionMasterGates } from "./production-execution-gates.mjs";

const legalDocumentManifest = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../config/legal-document-manifest.json"),
    "utf8",
  ),
);
const databaseAccessManifest = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../config/database-access-manifest.json"),
    "utf8",
  ),
);
const privacyPolicyManifest = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../config/privacy-retention-policy-v1.json"),
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
);
finalRuntimeRoutines.push("site_admin_capability_allowed");
finalRuntimeRoutines.push(
  "site_admin_request_customer_deletion",
  "site_admin_customer_deletion_status",
  "site_admin_cancel_customer_deletion",
);
finalSystemRoutines.push(
  "privacy_system_claim_deletion_plan",
  "privacy_system_plan_customer_deletion",
  "privacy_system_record_deletion_legal_review",
  "privacy_system_claim_deletion_provider_item",
  "privacy_system_finish_deletion_provider_item",
  "privacy_system_claim_deletion_execution",
  "privacy_system_execute_customer_deletion",
  "privacy_system_fail_customer_deletion",
  "privacy_system_recover_customer_deletions",
  "monitoring_system_snapshot",
  "monitoring_system_begin",
  "monitoring_system_complete",
  "monitoring_system_heartbeat",
);
const finalBootstrapRoutines = [
  "resolve_public_business_media_blob",
  "resolve_public_legal_config",
  "resolve_public_legal_documents",
];
const rlsTables = Object.entries(databaseAccessManifest.tableClasses)
  .filter(
    ([key]) => !["legacy_migrator_only", "migration_ledger"].includes(key),
  )
  .flatMap(([, tables]) => tables);

const profiles = ["core", "finder", "billing", "full-production"];
const profile = process.env.PLATFORM_PROFILE?.trim() || "core";
if (!profiles.includes(profile)) {
  console.error(
    `INVALID PLATFORM_PROFILE: ${profile}. Use one of: ${profiles.join(", ")}`,
  );
  process.exit(1);
}
const required = [
  "OWNER_MFA_ENCRYPTION_KEY",
  "PREVIEW_TOKEN_SECRET",
  "PUBLIC_APP_URL",
  "CRON_SECRET",
];
const stripePrices = [
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PROFESSIONAL",
  "STRIPE_PRICE_PREMIUM",
];
const stripe = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...purchasablePlans.map((plan) => `STRIPE_PRICE_${plan.toUpperCase()}`),
];
const paddlePrices = [
  "PADDLE_PRICE_STARTER",
  "PADDLE_PRICE_PROFESSIONAL",
  "PADDLE_PRICE_PREMIUM",
];
const billingProviders = [
  ...new Set(
    (process.env.BILLING_PROVIDERS?.trim() || "stripe")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const missing = required.filter((key) => !process.env[key]?.trim());
const production =
  process.env.NODE_ENV === "production" ||
  process.env.RELEASE_TARGET === "production";
const rlsMode = process.env.DATABASE_RLS_MODE?.trim() || "off";
const unsafe = [];
unsafe.push(...unsafeProductionMasterGates(process.env, production));
unsafe.push(...lifecycleConfigurationErrors(process.env));
unsafe.push(...brandProfileEnvironmentErrors(process.env));
const centralErrorEnabledValue =
  process.env.CENTRAL_ERROR_REPORTING_ENABLED?.trim() || "false";
if (!['true', 'false'].includes(centralErrorEnabledValue))
  unsafe.push("CENTRAL_ERROR_REPORTING_ENABLED");
if (production && centralErrorEnabledValue !== "true")
  unsafe.push("CENTRAL_ERROR_REPORTING_ENABLED (required for production)");
if (centralErrorEnabledValue === "true") {
  let centralErrorHost = "";
  try {
    const endpoint = new URL(
      process.env.CENTRAL_ERROR_REPORTING_ENDPOINT?.trim() || "",
    );
    const allowedHosts = new Set(
      (process.env.CENTRAL_ERROR_REPORTING_ALLOWED_HOSTS || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    );
    centralErrorHost = endpoint.hostname.toLowerCase();
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      !allowedHosts.has(endpoint.hostname.toLowerCase())
    )
      unsafe.push("CENTRAL_ERROR_REPORTING_ENDPOINT");
  } catch {
    unsafe.push("CENTRAL_ERROR_REPORTING_ENDPOINT");
  }
  if (
    production &&
    !((process.env.CENTRAL_ERROR_REPORTING_SECRET?.trim().length || 0) >= 32 || (/^[A-Za-z0-9]{24}$/.test(process.env.CENTRAL_ERROR_REPORTING_SECRET?.trim() || "") && (centralErrorHost === "betterstackdata.com" || centralErrorHost.endsWith(".betterstackdata.com"))))
  )
    unsafe.push("CENTRAL_ERROR_REPORTING_SECRET");
}
const monitoringAlerts =
  process.env.MONITORING_ALERTS_ENABLED?.trim() || "false";
if (!['true', 'false'].includes(monitoringAlerts))
  unsafe.push("MONITORING_ALERTS_ENABLED");
if (production && monitoringAlerts !== "true")
  unsafe.push("MONITORING_ALERTS_ENABLED (required for production)");
for (const [name, fallback, minimum, maximum] of [
  ["MONITORING_WEBHOOK_WINDOW_MINUTES", 15, 5, 1440],
  ["MONITORING_STALE_LEASE_MINUTES", 5, 1, 60],
  ["MONITORING_DATABASE_CONNECTION_WARNING_PERCENT", 80, 50, 95],
]) {
  const configured = Number.parseInt(
    process.env[name]?.trim() || String(fallback),
    10,
  );
  if (!Number.isInteger(configured) || configured < minimum || configured > maximum)
    unsafe.push(name);
}
const syntheticProbe =
  process.env.MONITORING_SYNTHETIC_PROBE_ENABLED?.trim() || "false";
if (!['true', 'false'].includes(syntheticProbe) || (production && syntheticProbe === "true"))
  unsafe.push("MONITORING_SYNTHETIC_PROBE_ENABLED");
const stagingMonitoringScheduler =
  process.env.MONITORING_STAGING_SCHEDULER_ENABLED?.trim() || "false";
if (!['true', 'false'].includes(stagingMonitoringScheduler) || stagingMonitoringScheduler !== "false")
  unsafe.push("MONITORING_STAGING_SCHEDULER_ENABLED");
if (!["off", "pilot", "enforced"].includes(rlsMode))
  unsafe.push("DATABASE_RLS_MODE");
if (
  !["true", "false"].includes(
    process.env.PRIVACY_RETENTION_EXECUTION_ENABLED?.trim() || "false",
  )
)
  unsafe.push("PRIVACY_RETENTION_EXECUTION_ENABLED");
for (const flag of [
  "PRIVACY_DELETION_REQUESTS_ENABLED",
  "PRIVACY_DELETION_EXECUTION_ENABLED",
  "PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED",
  "PRIVACY_PROVIDER_RECONCILIATION_ENABLED",
  "PRIVACY_PROVIDER_VERCEL_BLOB_ENABLED",
  "PRIVACY_PROVIDER_VERCEL_DOMAINS_ENABLED",
  "PRIVACY_PROVIDER_STRIPE_ENABLED",
  "PRIVACY_PROVIDER_PADDLE_ENABLED",
  "PRIVACY_PROVIDER_RESEND_ENABLED",
  "PRIVACY_PROVIDER_OPENAI_ENABLED",
  "PRIVACY_PROVIDER_GOOGLE_ENABLED",
  "PRIVACY_PROVIDER_REDI_CONTROL_ENABLED",
]) {
  const value = process.env[flag]?.trim() || "false";
  if (!["true", "false"].includes(value) || (production && value === "true"))
    unsafe.push(flag);
}
const providerCleanupEnabled =
  (process.env.PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED?.trim() || "false") ===
  "true";
const privacyDeletionExecutionEnabled =
  (process.env.PRIVACY_DELETION_EXECUTION_ENABLED?.trim() || "false") ===
  "true";
const providerCleanupAdapter =
  process.env.PRIVACY_PROVIDER_CLEANUP_ADAPTER?.trim() || "fake_test";
if (!['fake_test', 'platform_v1'].includes(providerCleanupAdapter))
  unsafe.push("PRIVACY_PROVIDER_CLEANUP_ADAPTER");
if (production && providerCleanupAdapter === "fake_test")
  unsafe.push("PRIVACY_PROVIDER_CLEANUP_ADAPTER");
if (providerCleanupEnabled && !privacyDeletionExecutionEnabled)
  unsafe.push("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED requires PRIVACY_DELETION_EXECUTION_ENABLED");
if (production && providerCleanupEnabled)
  unsafe.push("PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED (staging acceptance required)");
const blobCleanupEnabled =
  (process.env.PRIVACY_PROVIDER_VERCEL_BLOB_ENABLED?.trim() || "false") === "true";
if (blobCleanupEnabled) {
  const authority = process.env.PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID?.trim() || "";
  const runtimeStore = process.env.BLOB_STORE_ID?.trim() || "";
  const tokenStore = process.env.BLOB_READ_WRITE_TOKEN?.trim().split("_")[3];
  if (!/^store_[A-Za-z0-9]{16}$/.test(authority))
    unsafe.push("PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID");
  if (process.env.VERCEL_OIDC_TOKEN?.trim() && runtimeStore !== authority)
    unsafe.push("BLOB_STORE_ID must match PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID");
  else if (!process.env.VERCEL_OIDC_TOKEN?.trim() && `store_${tokenStore || ""}` !== authority)
    unsafe.push("Vercel Blob credential/store authority mismatch");
}
const domainCleanupEnabled =
  (process.env.PRIVACY_PROVIDER_VERCEL_DOMAINS_ENABLED?.trim() || "false") === "true";
if (domainCleanupEnabled) {
  const projectId = process.env.PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID?.trim() || "";
  const teamId = process.env.PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID?.trim() || "";
  if (!/^prj_[A-Za-z0-9]{20,64}$/.test(projectId))
    unsafe.push("PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID");
  if (!/^team_[A-Za-z0-9]{20,64}$/.test(teamId))
    unsafe.push("PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID");
  if (process.env.VERCEL_PROJECT_ID?.trim() !== projectId || process.env.VERCEL_TEAM_ID?.trim() !== teamId)
    unsafe.push("Vercel Domains runtime/cleanup project authority mismatch");
}
const privacyExportEnabled =
  (process.env.PRIVACY_EXPORT_ENABLED?.trim() || "false") === "true";
if (
  !["true", "false"].includes(
    process.env.PRIVACY_EXPORT_ENABLED?.trim() || "false",
  )
)
  unsafe.push("PRIVACY_EXPORT_ENABLED");
if (privacyExportEnabled) {
  const adapter = process.env.PRIVACY_EXPORT_ARTIFACT_STORE?.trim();
  if (production && adapter !== "vercel_blob_private")
    unsafe.push("PRIVACY_EXPORT_ARTIFACT_STORE");
  if (
    adapter === "vercel_blob_private" &&
    !process.env.PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN?.trim()
  )
    missing.push("PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN");
  if (adapter === "vercel_blob_private") {
    const storeId = process.env.PRIVACY_EXPORT_BLOB_STORE_ID?.trim() || "";
    const tokenStore = process.env.PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN?.trim().split("_")[3];
    if (!/^store_[A-Za-z0-9]{16}$/.test(storeId) || `store_${tokenStore}` !== storeId)
      unsafe.push("PRIVACY_EXPORT_BLOB_STORE_ID");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(process.env.PRIVACY_EXPORT_ENVIRONMENT_ID?.trim() || ""))
    unsafe.push("PRIVACY_EXPORT_ENVIRONMENT_ID");
  try {
    const keys = JSON.parse(
      process.env.PRIVACY_EXPORT_ENCRYPTION_KEYS?.trim() || "",
    );
    const version = process.env.PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION?.trim();
    const encoded = version && keys?.[version];
    const key =
      typeof encoded === "string"
        ? Buffer.from(encoded, "base64url")
        : Buffer.alloc(0);
    if (!version || key.length !== 32 || key.toString("base64url") !== encoded)
      unsafe.push("PRIVACY_EXPORT_ENCRYPTION_KEYS");
  } catch {
    unsafe.push("PRIVACY_EXPORT_ENCRYPTION_KEYS");
  }
}
if (
  privacyPolicyManifest.status !== "active" ||
  privacyPolicyManifest.legalCertification !== false ||
  privacyPolicyManifest.rules.length !== 17 ||
  !/^[a-f0-9]{64}$/.test(privacyPolicyManifest.manifestHash)
)
  unsafe.push("PRIVACY_POLICY_MANIFEST");
if (
  privacyPolicyManifest.rules.some(
    (rule) =>
      rule.legalReviewRequired &&
      (rule.automaticDisposition || rule.disposition !== "manual_review"),
  )
)
  unsafe.push("PRIVACY_POLICY_LEGAL_REVIEW_BOUNDARY");
const privacyCoveredStores = new Set(
  privacyPolicyManifest.rules.flatMap((rule) => rule.stores),
);
for (const table of [
  "privacy_export_artifacts",
  "privacy_export_download_capabilities",
  "customer_deletion_workflows",
  "privacy_provider_cleanup_items",
  "privacy_provider_cleanup_bindings",
  "operational_monitoring_state",
  // Migration 072 maps this publication-owned store to Policy v1 media_content
  // and includes it in customer export/deletion without changing the policy hash.
  "site_information_sponsor_banners",
  // Migration 073 maps the complimentary entitlement to Policy v1
  // active_subscription and includes it in the customer export projection.
  "site_complimentary_access",
  // Migration 076 cache holds only public source-site content and model
  // output for the import pipeline (operational store, no customer PII).
  "website_import_analysis_cache",
  // Booking configuration follows site deletion; visitor identity remains in
  // site_appointments under the existing appointments retention class.
  "booking_settings",
  "booking_weekly",
  "booking_blocks",
])
  privacyCoveredStores.add(table);
for (const table of Object.values(databaseAccessManifest.tableClasses).flat())
  if (!privacyCoveredStores.has(table))
    unsafe.push(`PRIVACY_POLICY_MISSING_STORE ${table}`);
if (rlsMode === "off" && !process.env.DATABASE_URL?.trim())
  missing.push("DATABASE_URL");
if (["pilot", "enforced"].includes(rlsMode) && process.env.DATABASE_URL?.trim())
  unsafe.push(
    "DATABASE_URL (forbidden in the scoped web/release environment; compatibility is emergency-only)",
  );
if (
  (production || ["pilot", "enforced"].includes(rlsMode)) &&
  !process.env.MIGRATION_DATABASE_URL?.trim()
)
  missing.push("MIGRATION_DATABASE_URL");
if (
  ["pilot", "enforced"].includes(rlsMode) &&
  !process.env.DATABASE_RUNTIME_URL?.trim()
)
  missing.push("DATABASE_RUNTIME_URL");
if (
  ["pilot", "enforced"].includes(rlsMode) &&
  !process.env.DATABASE_SYSTEM_URL?.trim()
)
  missing.push("DATABASE_SYSTEM_URL");
if (
  ["pilot", "enforced"].includes(rlsMode) &&
  !process.env.DATABASE_OWNER_URL?.trim()
)
  missing.push("DATABASE_OWNER_URL");

if (
  ["pilot", "enforced"].includes(rlsMode) &&
  process.env.DATABASE_RUNTIME_URL?.trim() &&
  process.env.DATABASE_SYSTEM_URL?.trim() &&
  process.env.DATABASE_OWNER_URL?.trim() &&
  process.env.MIGRATION_DATABASE_URL?.trim()
) {
  const runtimePool = new pg.Pool({
    connectionString: process.env.DATABASE_RUNTIME_URL,
  });
  const systemPool = new pg.Pool({
    connectionString: process.env.DATABASE_SYSTEM_URL,
  });
  const ownerPool = new pg.Pool({
    connectionString: process.env.DATABASE_OWNER_URL,
  });
  const migrationPool = new pg.Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  try {
    const runtime = (
      await runtimePool.query(
        "select current_user as role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user",
      )
    ).rows[0];
    const migration = (await migrationPool.query("select current_user as role"))
      .rows[0];
    const system = (
      await systemPool.query(
        "select current_user as role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user",
      )
    ).rows[0];
    const ownerOps = (
      await ownerPool.query(
        "select current_user as role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user",
      )
    ).rows[0];
    const roles = databaseRoleNames();
    const migrationAuthority = (
      await migrationPool.query(
        "select current_user::text=$1 or pg_has_role(current_user,$1,'member') as allowed",
        [roles.migrator],
      )
    ).rows[0];
    if (
      !runtime ||
      runtime.role === migration.role ||
      runtime.rolsuper ||
      runtime.rolbypassrls ||
      runtime.rolcreatedb ||
      runtime.rolcreaterole
    )
      unsafe.push(
        "DATABASE_RUNTIME_ROLE (must be distinct and non-privileged)",
      );
    if (
      !(
        await migrationPool.query(
          "select ($1=$2 or pg_has_role($1,$2,'member')) as member",
          [runtime.role, roles.runtime],
        )
      ).rows[0].member
    )
      unsafe.push("DATABASE_RUNTIME_ROLE (must be configured role or member)");
    const systemMembership = (
      await migrationPool.query(
        "select ($1=$2 or pg_has_role($1,$2,'member')) as system_member,pg_has_role($1,$3,'member') as migrator_member",
        [system.role, roles.system, roles.migrator],
      )
    ).rows[0];
    if (
      !system ||
      new Set([runtime.role, system.role, ownerOps.role, migration.role])
        .size !== 4 ||
      system.rolsuper ||
      system.rolbypassrls ||
      system.rolcreatedb ||
      system.rolcreaterole ||
      !systemMembership.system_member ||
      systemMembership.migrator_member
    )
      unsafe.push(
        "DATABASE_SYSTEM_ROLE (must be distinct, non-privileged and not inherit migrator)",
      );
    const ownerMembership = (
      await migrationPool.query(
        "select ($1=$2 or pg_has_role($1,$2,'member')) owner_member,pg_has_role($1,$3,'member') migrator_member",
        [ownerOps.role, roles.owner, roles.migrator],
      )
    ).rows[0];
    if (
      !ownerOps ||
      ownerOps.rolsuper ||
      ownerOps.rolbypassrls ||
      ownerOps.rolcreatedb ||
      ownerOps.rolcreaterole ||
      !ownerMembership.owner_member ||
      ownerMembership.migrator_member
    )
      unsafe.push(
        "DATABASE_OWNER_ROLE (must be distinct, procedure-only and non-privileged)",
      );
    if (
      Number(
        (
          await migrationPool.query(
            "select count(*) count from information_schema.role_table_grants where grantee=$1",
            [roles.owner],
          )
        ).rows[0].count,
      ) !== 0
    )
      unsafe.push("DATABASE_OWNER_TABLE_GRANTS (must be zero)");
    const ownerRoutines = await migrationPool.query(
      `select p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
      has_function_privilege('public',p.oid,'execute') public_execute,has_function_privilege($1,p.oid,'execute') owner_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where n.nspname='public' and p.proname=any($2::text[])`,
      [roles.owner, ownerApplicationRoutines],
    );
    if (
      ownerRoutines.rows.length !== ownerApplicationRoutines.length ||
      ownerRoutines.rows.some(
        (row) =>
          !row.prosecdef ||
          !row.fixed_path ||
          row.owner !== roles.ownerExecutor ||
          row.public_execute ||
          !row.owner_execute,
      )
    )
      unsafe.push("DATABASE_OWNER_ROUTINES");
    const finalRoutines = await migrationPool.query(
      `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
      has_function_privilege('public',p.oid,'execute') public_execute,
      has_function_privilege($1,p.oid,'execute') runtime_execute,
      has_function_privilege($2,p.oid,'execute') system_execute
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where n.nspname='public' and p.proname=any($3::text[])`,
      [
        roles.runtime,
        roles.system,
        [...finalRuntimeRoutines, ...finalSystemRoutines],
      ],
    );
    if (
      finalRoutines.rows.length !==
        finalRuntimeRoutines.length + finalSystemRoutines.length ||
      finalRoutines.rows.some(
        (row) =>
          !row.prosecdef ||
          !row.fixed_path ||
          row.public_execute ||
          (finalRuntimeRoutines.includes(row.proname)
            ? row.owner !==
                (finalBootstrapRoutines.includes(row.proname)
                  ? roles.bootstrapExecutor
                  : roles.runtimeExecutor) ||
              !row.runtime_execute ||
              row.system_execute
            : row.owner !== roles.systemExecutor ||
              !row.system_execute ||
              row.runtime_execute),
      )
    )
      unsafe.push("FINAL_DATABASE_BOUNDARY_ROUTINES");
    if (!migrationAuthority.allowed)
      unsafe.push(
        "DATABASE_MIGRATOR_ROLE (migration identity must be the configured role or a member)",
      );
    const state = await migrationPool.query(
      `select c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname as owner,
              (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
       from pg_class c join pg_roles r on r.oid=c.relowner
       where c.relname=any($1::text[])`,
      [rlsTables],
    );
    const forceCount = state.rows.filter(
      (row) => row.relforcerowsecurity,
    ).length;
    if (
      state.rows.length !== rlsTables.length ||
      state.rows.some(
        (row) => !row.relrowsecurity || row.owner === runtime.role,
      ) ||
      (rlsMode === "enforced"
        ? forceCount !== rlsTables.length
        : ![0, rlsTables.length].includes(forceCount))
    )
      unsafe.push("DATABASE_RLS_STATE");
    const publicRoutines = await migrationPool.query(
      `select p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,r.rolname owner,
              has_function_privilege('public',p.oid,'execute') public_execute,
              has_function_privilege($1,p.oid,'execute') runtime_execute
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
    if (
      publicRoutines.rows.length !== 4 ||
      publicRoutines.rows.some(
        (row) =>
          !row.prosecdef ||
          !row.fixed_path ||
          row.owner !== roles.bootstrapExecutor ||
          row.public_execute ||
          !row.runtime_execute,
      )
    )
      unsafe.push("PUBLIC_BOOTSTRAP_ROUTINES");
    const executors = await migrationPool.query(
      `select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=any($1::text[])`,
      [
        [
          roles.runtimeExecutor,
          roles.bootstrapExecutor,
          roles.ownerExecutor,
          roles.systemExecutor,
        ],
      ],
    );
    if (
      executors.rows.length !== 4 ||
      executors.rows.some(
        (role) =>
          role.rolcanlogin ||
          role.rolsuper ||
          role.rolbypassrls ||
          role.rolcreatedb ||
          role.rolcreaterole,
      )
    )
      unsafe.push("DATABASE_EXECUTOR_ROLES");
    const forbiddenMemberships = await migrationPool.query(
      `select count(*)::int count from pg_auth_members m join pg_roles member on member.oid=m.member join pg_roles granted on granted.oid=m.roleid where member.rolname=any($1::text[]) and granted.rolname=any($2::text[])`,
      [
        [
          runtime.role,
          system.role,
          ownerOps.role,
          roles.runtime,
          roles.system,
          roles.owner,
        ],
        [
          roles.runtimeExecutor,
          roles.bootstrapExecutor,
          roles.ownerExecutor,
          roles.systemExecutor,
          roles.migrator,
        ],
      ],
    );
    if (forbiddenMemberships.rows[0].count !== 0)
      unsafe.push("DATABASE_APPLICATION_ROLE_MEMBERSHIP");
    const catalogViolations = await databaseAccessViolations(
      migrationPool,
      rlsMode,
    );
    if (catalogViolations.length)
      unsafe.push(`DATABASE_ACCESS_MANIFEST (${catalogViolations.join("; ")})`);
    const privacyPolicy = await migrationPool.query(
      "select policy_key,version,status,manifest_hash,privacy_policy_valid(id) valid from privacy_policy_versions where status='active'",
    );
    if (
      privacyPolicy.rows.length !== 1 ||
      privacyPolicy.rows[0].policy_key !== privacyPolicyManifest.policyKey ||
      privacyPolicy.rows[0].version !== privacyPolicyManifest.version ||
      privacyPolicy.rows[0].manifest_hash !==
        privacyPolicyManifest.manifestHash ||
      !privacyPolicy.rows[0].valid
    )
      unsafe.push("PRIVACY_POLICY_DATABASE_STATE");
  } catch {
    unsafe.push("DATABASE_RLS_DATABASE_CHECK");
  } finally {
    await runtimePool.end();
    await systemPool.end();
    await ownerPool.end();
    await migrationPool.end();
  }
}

if (production) {
  try {
    const publicUrl = new URL(process.env.PUBLIC_APP_URL ?? "");
    if (
      publicUrl.protocol !== "https:" ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.pathname !== "/" ||
      publicUrl.search ||
      publicUrl.hash
    )
      unsafe.push("PUBLIC_APP_URL");
  } catch {
    unsafe.push("PUBLIC_APP_URL");
  }
  const controlHost = process.env.CONTROL_PANEL_HOST?.trim();
  if (
    controlHost &&
    (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      controlHost,
    ) ||
      /[/:@\s]/.test(controlHost))
  )
    unsafe.push("CONTROL_PANEL_HOST");
  if (process.env.CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED !== "true")
    unsafe.push(
      "CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED (must be true for production)",
    );
}

if (production && (profile === "billing" || profile === "full-production")) {
  if (
    !billingProviders.length ||
    billingProviders.some(
      (provider) => !acquisitionProviders.includes(provider),
    )
  )
    unsafe.push(
      "BILLING_PROVIDERS (only catalog-active acquisition providers are allowed)",
    );
  if (billingProviders.includes("stripe"))
    missing.push(...stripe.filter((key) => !process.env[key]?.trim()));
  if (billingProviders.includes("stripe")) {
    if (process.env.STRIPE_STARTER_PRICE_CATALOG_VERIFIED !== "true")
      unsafe.push("STRIPE_STARTER_PRICE_CATALOG_VERIFIED");
    if (process.env.STRIPE_PORTAL_STARTER_ONLY_VERIFIED !== "true")
      unsafe.push("STRIPE_PORTAL_STARTER_ONLY_VERIFIED");
    if (
      !/^bpc_[A-Za-z0-9]+$/.test(
        process.env.STRIPE_PORTAL_CONFIGURATION_STARTER ?? "",
      )
    )
      missing.push("STRIPE_PORTAL_CONFIGURATION_STARTER");
  }
  if (process.env.PADDLE_LEGACY_LIFECYCLE_ENABLED === "true") {
    missing.push(
      ...["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"].filter(
        (key) => !process.env[key]?.trim(),
      ),
    );
    if (
      !["sandbox", "production"].includes(
        process.env.PADDLE_ENVIRONMENT ?? "sandbox",
      )
    )
      unsafe.push("PADDLE_ENVIRONMENT");
    if (
      process.env.PADDLE_ENVIRONMENT === "production" &&
      process.env.PADDLE_LIVE_REVIEWED !== "true"
    )
      unsafe.push("PADDLE_LIVE_REVIEWED (legacy lifecycle only)");
  }
  if (
    process.env.NEXT_PUBLIC_LAUNCH_OFFER_ENABLED === "true" &&
    !/^promo_[A-Za-z0-9]+$/.test(process.env.STRIPE_LAUNCH_PROMOTION_CODE ?? "")
  )
    unsafe.push(
      "STRIPE_LAUNCH_PROMOTION_CODE (required for visible launch offer)",
    );
}
if (production && (profile === "finder" || profile === "full-production")) {
  if (!process.env.GOOGLE_MAPS_API_KEY?.trim())
    missing.push("GOOGLE_MAPS_API_KEY");
}
if (production && profile === "full-production") {
  if (!process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.includes("@"))
    missing.push("NEXT_PUBLIC_SUPPORT_EMAIL");
  if (
    !process.env.BLOB_READ_WRITE_TOKEN?.trim() &&
    !process.env.VERCEL_OIDC_TOKEN?.trim() &&
    process.env.VERCEL !== "1"
  )
    missing.push("BLOB_READ_WRITE_TOKEN or Vercel OIDC Blob connection");
  if (!process.env.INFORMATION_BLOB_READ_WRITE_TOKEN?.trim())
    missing.push("INFORMATION_BLOB_READ_WRITE_TOKEN");
  missing.push(
    ...["VERCEL_TOKEN", "VERCEL_PROJECT_ID"].filter(
      (key) => !process.env[key]?.trim(),
    ),
  );
  missing.push(
    ...["RESEND_API_KEY", "EMAIL_FROM"].filter(
      (key) => !process.env[key]?.trim(),
    ),
  );
}
unsafe.push(
  ...["PREVIEW_TOKEN_SECRET", "CRON_SECRET"].filter((key) => {
    const value = process.env[key]?.trim() ?? "";
    return value && (value.length < 32 || value.includes("replace-"));
  }),
);
if (
  production &&
  productCatalog.capabilities.social_media.launchStatus !== "active" &&
  process.env.REDI_CONTROL_ENABLED === "true"
)
  unsafe.push("REDI_CONTROL_ENABLED (Social Media is not launch-active)");
if (production && process.env.REDI_CONTROL_INBOUND_ENABLED === "true")
  unsafe.push(
    "REDI_CONTROL_INBOUND_ENABLED (two-system acceptance is incomplete)",
  );

const ownerMfaKey = process.env.OWNER_MFA_ENCRYPTION_KEY?.trim() ?? "";
const ownerMfaKeyBytes = Buffer.from(ownerMfaKey, "base64url");
if (
  ownerMfaKeyBytes.length !== 32 ||
  ownerMfaKeyBytes.toString("base64url") !== ownerMfaKey
)
  unsafe.push("OWNER_MFA_ENCRYPTION_KEY");

const secretNames = [
  "OWNER_MFA_ENCRYPTION_KEY",
  "PREVIEW_TOKEN_SECRET",
  "CRON_SECRET",
  "REDI_CONTROL_INTEGRATION_SECRET",
  "REDI_CONTROL_INBOUND_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "INFORMATION_BLOB_READ_WRITE_TOKEN",
  "PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN",
  "CENTRAL_ERROR_REPORTING_SECRET",
];
const configuredSecrets = secretNames
  .map((key) => [key, process.env[key]?.trim()])
  .filter((entry) => Boolean(entry[1]));
for (const [key, secret] of configuredSecrets)
  if (
    configuredSecrets.some(
      ([otherKey, otherSecret]) => otherKey !== key && otherSecret === secret,
    )
  )
    unsafe.push(`${key} (must be unique)`);

const configuredPrices = [
  ...stripePrices,
  ...paddlePrices,
  "STRIPE_PRICE_SOCIAL_MEDIA_ADDON",
]
  .map((key) => [key, process.env[key]?.trim()])
  .filter((entry) => Boolean(entry[1]));
for (const [key, price] of configuredPrices)
  if (
    configuredPrices.some(
      ([otherKey, otherPrice]) => otherKey !== key && otherPrice === price,
    )
  )
    unsafe.push(`${key} (duplicate Price ID)`);

if (
  production &&
  (["pilot", "enforced"].includes(rlsMode)
    ? process.env.MIGRATION_DATABASE_URL?.trim()
    : process.env.DATABASE_URL?.trim())
) {
  const inspectionUrl = ["pilot", "enforced"].includes(rlsMode)
    ? process.env.MIGRATION_DATABASE_URL
    : process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: inspectionUrl });
  try {
    const state = await pool.query(
      `select count(*)::int as owners,
              count(*) filter (where role='owner' and status='active' and mfa_enrolled_at is not null)::int as enrolled
       from owner_accounts`,
    );
    if (!state.rows[0]?.owners)
      unsafe.push("OWNER_ACCOUNT (bootstrap is required)");
    if (!state.rows[0]?.enrolled)
      unsafe.push("OWNER_MFA (enrollment is required)");
    if (profile === "billing" || profile === "full-production") {
      const legal = await pool.query(
        `select id,currency,tax_display_mode,price_tax_label from platform_legal_config_versions
         where status='active' and legal_review_status='reviewed' and effective_from <= now()
           and btrim(legal_business_name)<>'' and btrim(street)<>'' and btrim(postal_code)<>''
           and btrim(city)<>'' and country_code ~ '^[A-Z]{2}$' and btrim(country_name)<>''
           and btrim(contact_email)<>'' and btrim(support_email)<>'' and btrim(price_tax_label)<>'' limit 1`,
      );
      if (!legal.rows[0])
        unsafe.push("PLATFORM_LEGAL_CONFIG (reviewed active version required)");
      else {
        if (
          legal.rows[0].currency !==
          (process.env.NEXT_PUBLIC_DEFAULT_BILLING_CURRENCY?.trim() || "EUR")
        )
          unsafe.push(
            "PLATFORM_LEGAL_CONFIG currency must match NEXT_PUBLIC_DEFAULT_BILLING_CURRENCY",
          );
        if (!legal.rows[0].price_tax_label?.trim())
          unsafe.push("PLATFORM_LEGAL_CONFIG price tax label");
      }
      const documents = await pool.query(
        `select document_key,locale,version,content_hash from platform_legal_document_versions
         where status='active' and reviewed_at is not null and effective_from <= now()
           and document_key in ('terms','privacy','imprint','cancellation') and locale in ('de','en')`,
      );
      const activeEvidence = new Set(
        documents.rows.map(
          (row) =>
            `${row.document_key}:${row.locale}:${row.version}:${row.content_hash}`,
        ),
      );
      for (const item of legalDocumentManifest)
        if (
          !activeEvidence.has(
            `${item.documentKey}:${item.locale}:${item.version}:${item.contentHash}`,
          )
        )
          unsafe.push(
            `LEGAL_DOCUMENT ${item.documentKey}:${item.locale}@${item.version} exact reviewed active source required`,
          );
    }
  } catch {
    unsafe.push(
      "OWNER_DATABASE_STATE (migrations through 037 and database access are required)",
    );
  } finally {
    await pool.end();
  }
}

if (missing.length || unsafe.length) {
  if (missing.length)
    console.error(
      `Missing release configuration: ${[...new Set(missing)].join(", ")}`,
    );
  if (unsafe.length)
    console.error(`Unsafe secret values: ${unsafe.join(", ")}`);
  process.exit(1);
}

console.log("Release configuration preflight passed.");
