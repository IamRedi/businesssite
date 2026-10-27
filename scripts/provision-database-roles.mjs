import pg from "pg";
import {
  databaseRoleNames,
  migrationConnectionString,
  quoteIdentifier,
} from "./database-role-config.mjs";

const connectionString = migrationConnectionString();
const roles = databaseRoleNames();
const classifiedExecutorRoles = new Set([
  roles.runtimeExecutor,
  roles.bootstrapExecutor,
  roles.ownerExecutor,
  roles.systemExecutor,
]);
const createRoles = process.env.DATABASE_CREATE_ROLES === "true";
const allowLegacySchema = process.env.DATABASE_ROLE_PROVISIONING_ALLOW_LEGACY_SCHEMA === "true";
// The disposable 046->056 preservation harness predates these later tables.
// Normal provisioning still requires every current table without exception.
const laterLegacyTables = new Set(["operational_monitoring_state", "site_information_sponsor_banners", "site_complimentary_access", "website_import_analysis_cache", "booking_settings", "booking_weekly", "booking_blocks"]);
const pool = new pg.Pool({ connectionString, application_name: "bsrc-role-provisioner" });
const quoteServerIdentifier = (identifier) => `"${String(identifier).replaceAll('"', '""')}"`;

async function roleExists(client, role) {
  return Boolean((await client.query("select 1 from pg_roles where rolname=$1", [role])).rows[0]);
}

try {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const role of Object.values(roles)) {
      if (!(await roleExists(client, role))) {
        if (!createRoles)
          throw new Error(`Database role ${role} is missing; have the provider create it or set DATABASE_CREATE_ROLES=true with an authorized admin connection.`);
        await client.query(`create role ${quoteIdentifier(role)} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
      }
    }

    const currentRole = (await client.query("select current_user as role")).rows[0].role;
    if (createRoles && currentRole !== roles.migrator)
      await client.query(`grant ${quoteIdentifier(roles.migrator)} to ${quoteServerIdentifier(currentRole)}`);
    // PostgreSQL 15+ and hosted providers commonly grant CREATE on `public`
    // only to pg_database_owner. The destination role must be able to create
    // in the schema before PostgreSQL permits ALTER ... OWNER TO that role.
    await client.query(`grant usage,create on schema public to ${quoteIdentifier(roles.migrator)}`);
    const relations = (await client.query(
      `select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind in ('r','p','S','v','m')
         and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')`,
    )).rows;
    const relationKinds = { r: "table", p: "table", S: "sequence", v: "view", m: "materialized view" };
    for (const relation of relations)
      await client.query(`alter ${relationKinds[relation.relkind]} public.${quoteServerIdentifier(relation.relname)} owner to ${quoteIdentifier(roles.migrator)}`);
    const routines = (await client.query(
      `select p.oid::regprocedure::text as identity,p.prokind,pg_get_userbyid(p.proowner) as owner
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind in ('f','p')
         and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')`,
    )).rows;
    for (const routine of routines) {
      // A repeat provisioning pass must preserve already-classified executor
      // ownership. Those routines are handled under their exact owner below.
      if (classifiedExecutorRoles.has(routine.owner)) continue;
      await client.query(`alter ${routine.prokind === "p" ? "procedure" : "function"} ${routine.identity} owner to ${quoteIdentifier(roles.migrator)}`);
      await client.query(`revoke all on ${routine.prokind === "p" ? "procedure" : "function"} ${routine.identity} from public`);
    }
    const grantRoutineExecute = async (fn, grantees, { revokePublic = false } = {}) => {
      const owner = (await client.query(
        "select pg_get_userbyid(p.proowner) owner from pg_proc p where p.oid=to_regprocedure($1)",
        [fn],
      )).rows[0]?.owner;
      if (!owner && allowLegacySchema) return;
      const allowedOwners = new Set([roles.migrator, ...classifiedExecutorRoles]);
      if (!owner || !allowedOwners.has(owner))
        throw new Error(`Routine ${fn} does not have a classified migrator/executor owner.`);
      const activeRole = (await client.query("select current_user role")).rows[0].role;
      if (owner !== activeRole) {
        const canSetRole = (await client.query(
          "select pg_has_role(current_user,$1,'member') allowed",
          [owner],
        )).rows[0]?.allowed;
        if (!canSetRole) throw new Error(`Cannot assume classified routine owner ${owner}.`);
        await client.query(`set local role ${quoteIdentifier(owner)}`);
      }
      try {
        if (revokePublic) await client.query(`revoke all on function ${fn} from public`);
        await client.query(`grant execute on function ${fn} to ${grantees.map(quoteIdentifier).join(", ")}`);
      } finally {
        if (owner !== activeRole) await client.query("reset role");
      }
    };

    await client.query("revoke create on schema public from public");
    const rlsTables = [
      "site_features", "site_information_ad_slots", "site_information_sponsor_banners", "sites", "site_media",
      "site_media_blobs", "site_appointments", "booking_settings", "booking_weekly", "booking_blocks", "ai_runs",
      "tenant_usage_counters", "tenant_usage_states", "tenant_usage_events",
      "tenant_concurrency_leases", "site_external_integrations",
      "site_integration_events", "site_admin_accounts", "site_admin_sessions",
      "site_admin_password_resets",
      "subscriber_intakes", "site_subscriptions", "site_addon_subscriptions",
      "site_complimentary_access",
      "subscription_lifecycle_events", "payment_webhook_events",
      "customer_business_identities", "contract_acceptances",
      "platform_legal_config_versions", "platform_legal_document_versions",
      "owner_accounts", "owner_sessions", "owner_auth_challenges",
      "owner_mfa_recovery_codes", "owner_invitations", "owner_auth_audit_events",
      "site_editorial_settings", "site_editorial_memberships",
      "site_article_categories", "site_articles", "site_article_sources",
      "site_article_media", "site_media_assets", "site_content_audit_events",
      "integration_nonces", "integration_api_requests",
      "leads", "lead_scores", "lead_pipeline_events", "lead_website_history",
      "prepared_business_profiles", "finder_searches", "finder_search_cache",
      "demo_sites", "site_preview_tokens", "api_rate_limits", "audit_events",
      "privacy_policy_versions", "privacy_retention_rules", "privacy_jobs",
      "privacy_job_items", "privacy_job_events", "privacy_legal_holds",
      "privacy_export_artifacts", "privacy_export_download_capabilities",
      "customer_deletion_workflows", "privacy_provider_cleanup_items", "privacy_provider_cleanup_bindings",
      "operational_monitoring_state", "website_import_analysis_cache",
    ];
    const existingRlsTables = new Set((await client.query(
      "select tablename from pg_tables where schemaname='public' and tablename=any($1::text[])",
      [rlsTables],
    )).rows.map((row) => row.tablename));
    for (const table of rlsTables) {
      if (!existingRlsTables.has(table)) {
        if (allowLegacySchema && laterLegacyTables.has(table)) continue;
        throw new Error(`Required RLS table ${table} is missing.`);
      }
      await client.query(`revoke all on table ${quoteServerIdentifier(table)} from public`);
      await client.query(`revoke all on table ${quoteServerIdentifier(table)} from ${quoteIdentifier(roles.runtime)}`);
      await client.query(`revoke all on table ${quoteServerIdentifier(table)} from ${quoteIdentifier(roles.system)}`);
      await client.query(`revoke all on table ${quoteServerIdentifier(table)} from ${quoteIdentifier(roles.owner)}`);
    }
    for (const [policy, table] of [
      ["site_features_site_admin_select", "site_features"],
      ["site_features_site_admin_insert", "site_features"],
      ["site_features_site_admin_update", "site_features"],
      ["site_information_ad_slots_site_admin_select", "site_information_ad_slots"],
      ["sites_site_admin_select", "sites"],
      ["sites_site_admin_update", "sites"],
      ["site_media_site_admin_select", "site_media"],
      ["site_media_site_admin_insert", "site_media"],
      ["site_media_site_admin_update", "site_media"],
      ["site_media_site_admin_delete", "site_media"],
      ["site_media_blobs_site_admin_select", "site_media_blobs"],
      ["site_media_blobs_site_admin_insert", "site_media_blobs"],
      ["site_media_blobs_site_admin_delete", "site_media_blobs"],
      ["site_appointments_site_admin_select", "site_appointments"],
      ["site_appointments_site_admin_update", "site_appointments"],
      ["ai_runs_site_admin_select", "ai_runs"],
      ["tenant_usage_counters_site_admin_select", "tenant_usage_counters"],
      ["tenant_usage_states_site_admin_select", "tenant_usage_states"],
      ["tenant_usage_events_site_admin_select", "tenant_usage_events"],
      ["tenant_concurrency_leases_site_admin_select", "tenant_concurrency_leases"],
      ["site_external_integrations_site_admin_select", "site_external_integrations"],
      ["site_integration_events_site_admin_select", "site_integration_events"],
      ["information_categories_editorial_delete", "site_article_categories"],
      ["information_categories_editorial_insert", "site_article_categories"],
      ["information_categories_editorial_select", "site_article_categories"],
      ["information_categories_editorial_update", "site_article_categories"],
      ["information_article_media_editorial_all", "site_article_media"],
      ["information_sources_editorial_all", "site_article_sources"],
      ["information_articles_editorial_all", "site_articles"],
      ["information_audit_editorial_insert", "site_content_audit_events"],
      ["information_audit_editorial_select", "site_content_audit_events"],
      ["information_memberships_editorial_select", "site_editorial_memberships"],
      ["information_settings_editorial_select", "site_editorial_settings"],
      ["information_settings_editorial_update", "site_editorial_settings"],
      ["information_media_editorial_all", "site_media_assets"],
      ["information_sponsors_editorial_select", "site_information_sponsor_banners"],
      ["information_sponsors_editorial_insert", "site_information_sponsor_banners"],
      ["information_sponsors_editorial_update", "site_information_sponsor_banners"],
    ]) {
      if (allowLegacySchema && !existingRlsTables.has(table) && table === "site_information_sponsor_banners") continue;
      await client.query(`alter policy ${quoteIdentifier(policy)} on ${quoteIdentifier(table)} to ${quoteIdentifier(roles.runtime)}`);
    }
    await client.query(`grant connect on database ${quoteServerIdentifier((await client.query("select current_database() as name")).rows[0].name)} to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant connect on database ${quoteServerIdentifier((await client.query("select current_database() as name")).rows[0].name)} to ${quoteIdentifier(roles.migrator)}`);
    await client.query(`grant connect on database ${quoteServerIdentifier((await client.query("select current_database() as name")).rows[0].name)} to ${quoteIdentifier(roles.system)}`);
    await client.query(`grant connect on database ${quoteServerIdentifier((await client.query("select current_database() as name")).rows[0].name)} to ${quoteIdentifier(roles.owner)}`);
    await client.query(`grant usage on schema public to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant usage on schema public to ${quoteIdentifier(roles.system)}`);
    await client.query(`grant usage on schema public to ${quoteIdentifier(roles.owner)}`);
    await grantRoutineExecute("app_context_actor_kind()", [roles.runtime]);
    await grantRoutineExecute("app_context_site_id()", [roles.runtime]);
    await grantRoutineExecute("app_context_is_valid_site_admin()", [roles.runtime]);
    await client.query(`grant select,insert,update on table site_features to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`revoke delete on table site_features from ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select on table site_information_ad_slots to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`revoke insert,update,delete on table site_information_ad_slots from ${quoteIdentifier(roles.runtime)}`);
    if (existingRlsTables.has("site_information_sponsor_banners")) {
      await client.query(`grant select,insert,update on table site_information_sponsor_banners to ${quoteIdentifier(roles.runtime)}`);
      await client.query(`revoke delete on table site_information_sponsor_banners from ${quoteIdentifier(roles.runtime)}`);
    }
    await client.query(`grant select,update on table site_editorial_settings to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select on table site_editorial_memberships to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on table site_article_categories to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on table site_articles to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on table site_article_sources to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on table site_article_media to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on table site_media_assets to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert on table site_content_audit_events to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,custom_domain,custom_domain_status,custom_domain_verification,custom_domain_checked_at,site_kind) on sites to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant update(generated_document,publication_intent) on sites to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select,insert,update,delete on site_media to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,site_id,filename,content_type,created_at),insert(id,site_id,filename,content_type,data),delete on site_media_blobs to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,note,customer_message,status,created_at,updated_at),update(status,note,updated_at) on site_appointments to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,actor_type,actor_id,operation,site_id,provider,model,status,usage,error,created_at,completed_at,applied_at) on ai_runs to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(site_id,metric,window_type,window_start,quantity,updated_at) on tenant_usage_counters to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(site_id,state,reason_code,state_until,updated_at) on tenant_usage_states to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,site_id,metric,decision,reason_code,window_type,quantity,limit_value,created_at) on tenant_usage_events to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,site_id,operation,expires_at,created_at) on tenant_concurrency_leases to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(site_id,provider,external_installation_id,external_tenant_id,external_workspace_id,status,last_synced_at,last_error_code,created_at,updated_at) on site_external_integrations to ${quoteIdentifier(roles.runtime)}`);
    await client.query(`grant select(id,site_id,provider,action,created_at) on site_integration_events to ${quoteIdentifier(roles.runtime)}`);
    const authFunctions = [
      "site_admin_login_lookup(text)",
      "site_admin_resolve_session(text)",
      "site_admin_create_session(uuid,text,text,timestamp with time zone)",
      "site_admin_revoke_session(text)",
      "site_admin_create_password_reset(uuid,text,timestamp with time zone)",
      "site_admin_consume_password_reset(text,text)",
      "site_admin_change_password(text,uuid,text,text)",
      "site_admin_site_available()",
      "site_admin_access_snapshot()",
    ];
    for (const fn of authFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    const publicBootstrapFunctions = [
      "resolve_public_site_by_slug(text)",
      "resolve_public_site_by_domain(text)",
      "resolve_private_preview(uuid)",
      "create_public_appointment_request(text,text,text,text,text,date,time without time zone,text)",
    ];
    for (const fn of publicBootstrapFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    // Booking routines own their three new RLS stores as migrator-owned,
    // procedure-only surfaces. The runtime role receives no table access.
    const bookingFunctions = [
      "booking_public_config(text)",
      "booking_public_slots(text,date)",
      "booking_request(text,timestamp with time zone,text,text,text,text)",
      "booking_transition(text,uuid,text,integer,timestamp with time zone)",
      "booking_confirm_proposed(text,uuid,integer)",
      "booking_configure(text,integer,text,integer,jsonb,jsonb,boolean)",
      "booking_admin_snapshot(text)",
    ];
    for (const fn of bookingFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    const finderRuntimeFunctions = [
      "public_appointment_create_v1(text,text,text,jsonb,text,jsonb,jsonb)",
      "public_appointment_receipt_v1(text,text,text,text[])",
      "consume_api_rate_limit(text,text,integer,integer)",
      "website_import_cache_read(text)",
      "website_import_cache_write(text,text,text,jsonb)",
      "public_trial_create(jsonb,text,text,text,timestamp with time zone,integer,integer)",
      "site_admin_preview_issue(text,boolean)",
      "site_admin_site_projection(text,text)",
      "site_admin_capability_allowed(text,text,text)",
      "site_admin_site_plan(text,text)",
      "site_admin_cache_identities(text,text)",
      "site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric)",
      "site_admin_concurrency_acquire(text,text,text,integer,integer)",
      "site_admin_concurrency_release(text,text,uuid)",
      "site_admin_ai_start(text,text,text,text,jsonb)",
      "site_admin_ai_finish(text,uuid,text,jsonb)",
      "site_admin_domain_preflight(text,text)",
      "site_admin_domain_persist(text,text,text,text,jsonb)",
      "site_admin_register_business_provider_media(text,text,text,text,text,text,integer)",
      "site_admin_custom_context(text,text,boolean)",
      "site_admin_custom_media_register(text,text,text,text,text,text,integer,integer,integer,double precision)",
      "site_admin_custom_apply(text,text,text,jsonb,jsonb,jsonb)",
      "resolve_public_business_media_blob(uuid)",
      "resolve_public_legal_config()",
      "resolve_public_legal_documents()",
      "database_enforced_readiness()",
      "site_admin_request_privacy_export(text,text,text)",
      "site_admin_privacy_export_status(text)",
      "site_admin_issue_export_capability(text,text,uuid,text,text)",
      "site_admin_consume_export_capability(text,text)",
      "site_admin_record_export_download(text,uuid,boolean)",
      "site_admin_request_customer_deletion(text,text,text,text,boolean,text)",
      "site_admin_customer_deletion_status(text)",
      "site_admin_cancel_customer_deletion(text,text,uuid,text)",
    ];
    for (const fn of finderRuntimeFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    const informationPublicFunctions = [
      "resolve_public_information_site(text,text)",
      "resolve_public_information_sponsors(text,text)",
      "resolve_public_information_articles(text,text,jsonb)",
      "resolve_public_information_article(text,text,text)",
      "resolve_public_r2_business_media(text)",
      "resolve_information_r2_authority(uuid,text)",
      "resolve_public_information_media(uuid)",
      "resolve_editor_information_media(text,uuid)",
      "resolve_information_media_blob(uuid,text)",
    ];
    for (const fn of informationPublicFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    for (const fn of ["information_editorial_role()", "information_editorial_allowed(text)", "information_editorial_install_context(text,text)"])
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    const billingCustomerFunctions = [
      "billing_checkout_legal_context(text,text,text)",
      "billing_customer_snapshot(text,text)",
      "billing_prepare_starter_checkout(text,text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text,integer)",
      "billing_attach_checkout_session(text,uuid,text)",
    ];
    for (const fn of billingCustomerFunctions)
      await grantRoutineExecute(fn, [roles.runtime], { revokePublic: true });
    const billingSystemFunctions = [
      "billing_system_is_addon_subscription(text)",
      "billing_system_cache_identities(text)",
      "billing_system_process_subscription_event(jsonb)",
    ];
    for (const fn of billingSystemFunctions)
      await grantRoutineExecute(fn, [roles.system], { revokePublic: true });
    const informationSystemFunctions = [
      "information_redi_bootstrap(text,text)",
      "information_redi_reserve_nonce(uuid,text,text,timestamp with time zone,integer)",
      "information_redi_begin_request(uuid,text,text,text,text,integer)",
      "information_redi_finish_request(uuid,text,text,text,integer,jsonb)",
      "information_redi_allowed(uuid,text,text)",
      "information_redi_article_json(uuid,text,uuid,text)",
      "information_redi_list_articles(uuid,text,jsonb)",
      "information_redi_external_article(uuid,text,text)",
      "information_redi_create_article(uuid,text,jsonb)",
      "information_redi_update_article(uuid,text,uuid,integer,jsonb)",
      "information_redi_transition_article(uuid,text,uuid,integer,text)",
      "information_redi_list_media(uuid,text,jsonb)",
      "information_redi_register_media(uuid,text,jsonb)",
      "information_redi_media_blob_insert(uuid,text,text,bytea)",
      "information_redi_usage_reserve(uuid,text,text,bigint,jsonb,numeric)",
      "information_redi_concurrency_acquire(uuid,text,integer,integer)",
      "information_redi_concurrency_release(uuid,text,uuid)",
      "information_redi_site_plan(uuid,text)",
    ];
    for (const fn of informationSystemFunctions)
      await grantRoutineExecute(fn, [roles.system], { revokePublic: true });
    await grantRoutineExecute("cleanup_expired_demo_batch(text,integer)", [roles.system], { revokePublic: true });
    const ownerFunctions = [
      "owner_custom_media_context(text,text)",
      "owner_custom_media_register(text,text,text,text,text,text,integer,integer,integer,double precision)",
      "owner_custom_site_read(text,text)",
      "owner_custom_site_apply(text,text,jsonb,jsonb,jsonb,boolean,text)",
      "owner_auth_resolve_session(text,text)", "owner_auth_login_lookup(text)",
      "owner_auth_challenge_lookup(text)", "owner_auth_record_audit(jsonb)",
      "owner_auth_create_challenge(jsonb)", "owner_auth_complete_enrollment(jsonb)",
      "owner_auth_complete_verification(jsonb)", "owner_auth_complete_recovery(jsonb)",
      "owner_auth_revoke_session(text)", "owner_auth_change_password(text,text,text,bigint)",
      "owner_auth_regenerate_recovery_codes(text,text,bigint,text[])", "owner_team_list(text)",
      "owner_invitation_list(text)", "owner_invitation_lookup(text)",
      "owner_invitation_create(text,text,bigint,text,text,text,timestamp with time zone,text,text)",
      "owner_invitation_resend(text,text,bigint,uuid,text,timestamp with time zone,text)",
      "owner_invitation_revoke(text,text,bigint,uuid,text)", "owner_invitation_delivery(text,uuid,text)",
      "owner_invitation_accept(jsonb)", "owner_team_change(text,text,bigint,uuid,text,text,text)",
      "owner_customer_list(text,integer,integer)", "owner_usage_snapshot(text,text)", "owner_provider_usage_snapshot(text)", "owner_provider_control(text,text,jsonb)",
      "owner_usage_override(text,text,text,text,timestamp with time zone,text)", "owner_legal_configs(text)",
      "owner_legal_documents(text)", "owner_legal_acceptances(text)",
      "owner_legal_create_config(text,text,bigint,jsonb,text)",
      "owner_legal_activate_config(text,text,bigint,uuid,text)",
      "owner_legal_register_document(text,text,bigint,text,text,text,text,text)",
      "owner_legal_activate_document(text,text,bigint,uuid,text,text)",
      "owner_legal_verify_business(text,text,bigint,uuid,text,text,text)",
      "owner_information_create_publication(text,jsonb,text,text)",
      "owner_information_configure_redi(text,text,boolean,text[],text)",
      "owner_information_configure_ad_slots(text,text,jsonb,text)",
      "owner_finder_list_leads(text,integer,integer)",
      "owner_finder_get_lead(text,text)",
      "owner_finder_list_workspace(text,integer,integer)",
      "owner_finder_create_search(text,jsonb,text,text)",
      "owner_finder_complete_search(text,uuid,jsonb,boolean)",
      "owner_finder_fail_search(text,uuid)",
      "owner_finder_list_searches(text,integer)",
      "owner_finder_get_cache(text,text)",
      "owner_finder_save_cache(text,text,jsonb)",
      "owner_finder_upsert_lead(text,jsonb,text)",
      "owner_finder_add_pipeline(text,text,text,text,text)",
      "owner_finder_list_pipeline(text,text)",
      "owner_finder_create_profile(text,text,jsonb,text,text)",
      "owner_finder_list_profiles(text,text)",
      "owner_finder_append_audit(text,text,text,text,jsonb,text)", "owner_provider_usage_record(text,text,text,bigint,text,date)",
      "owner_finder_list_audit(text,text)",
      "owner_demo_create(text,text,jsonb,integer,integer,text)",
      "owner_preview_issue(text,text,boolean,text)",
      "owner_demo_site_by_lead(text,text)",
      "owner_demo_site_identity(text,text)",
      "owner_demo_site_identity_by_slug(text,text)",
      "owner_demo_configure_admin(text,text,text,text,text,text)",
      "owner_demo_invitation_prepare(text,text,text,timestamp with time zone,text)",
      "owner_comp_create_customer(text,jsonb,text,timestamp with time zone,text)",
      "owner_comp_revoke(text,text,text,text)",
      "owner_comp_list(text)",
      "owner_ai_start(text,text,text,text,jsonb)",
      "owner_ai_finish(text,uuid,text,jsonb)",
      "owner_ai_get(text,uuid)",
      "owner_ai_apply(text,uuid,text)",
      "owner_privacy_snapshot(text)",
      "owner_privacy_job_items(text,uuid)",
      "owner_privacy_start_dry_run(text,text,bigint,text,text,text)",
      "owner_privacy_create_hold(text,text,bigint,text,text,text[],text,text,timestamp with time zone,text)",
      "owner_privacy_release_hold(text,text,bigint,uuid,text)",
      "owner_privacy_clone_policy(text,text,bigint,integer,text)",
      "owner_privacy_activate_policy(text,text,bigint,uuid,text)",
      "owner_privacy_control_job(text,text,bigint,uuid,text,text)",
      "owner_request_self_privacy_export(text,text,bigint,text)",
      "owner_self_privacy_export_status(text)",
      "owner_issue_self_export_capability(text,text,bigint,uuid,text,text)",
      "owner_consume_self_export_capability(text,text)",
      "owner_record_self_export_download(text,uuid,boolean)",
      "owner_review_customer_deletion(text,text,bigint,uuid,text,text,text)",
      "owner_record_customer_deletion_legal_review(text,text,bigint,uuid,text,text)",
    ];
    for (const fn of ownerFunctions)
      await grantRoutineExecute(fn, [roles.owner], { revokePublic: true });

    // FORCE RLS uses non-login, non-bypass routine owners. Application roles
    // can execute the allowlisted routines but cannot become their owners.
    const bootstrapExecutorFunctions = [
      ...authFunctions,
      ...publicBootstrapFunctions,
      ...informationPublicFunctions,
      "information_sponsor_media_active(uuid)",
      "consume_api_rate_limit(text,text,integer,integer)",
      "website_import_cache_read(text)",
      "website_import_cache_write(text,text,text,jsonb)",
      "public_trial_create(jsonb,text,text,text,timestamp with time zone,integer,integer)",
      "resolve_public_business_media_blob(uuid)",
      "resolve_public_legal_config()",
      "resolve_public_legal_documents()",
      "public_site_lifecycle_allows(text)",
      "database_enforced_readiness()",
    ];
    const runtimeExecutorFunctions = [
      "appointment_receipt_projection(site_appointments,boolean)",
      "booking_available_slots(text,date,timestamp with time zone)",
      "booking_available_slots_for(text,date,timestamp with time zone,uuid)",
      ...bookingFunctions,
      ...finderRuntimeFunctions.filter((fn) => !bootstrapExecutorFunctions.includes(fn)),
      ...billingCustomerFunctions,
      "information_editorial_role()",
      "information_editorial_allowed(text)",
      "information_editorial_install_context(text,text)",
      "database_site_admin_mutation_allowed(text,text,text)",
      "site_admin_register_business_provider_media(text,text,text,text,text,text,integer)",
      "site_admin_custom_context(text,text,boolean)",
      "site_admin_custom_media_register(text,text,text,text,text,text,integer,integer,integer,double precision)",
      "site_admin_custom_apply(text,text,text,jsonb,jsonb,jsonb)",
      "privacy_export_status_json(privacy_jobs,privacy_export_artifacts)",
    ];
    const systemExecutorFunctions = [
      ...billingSystemFunctions,
      ...informationSystemFunctions,
      "information_sponsors_export(text)",
      "complimentary_access_export(text)",
      "information_sponsors_delete(text)",
      "cleanup_expired_demo_batch(text,integer)",
      "privacy_system_enqueue_retention_scan(text,text,text)",
      "privacy_system_claim_retention_job(text,integer)",
      "privacy_system_plan_retention_job(uuid,text)",
      "privacy_system_transition_retention_job(uuid,text,text,text)",
      "privacy_system_recover_stuck_jobs()",
      "privacy_system_claim_export(text,integer)",
      "privacy_system_export_snapshot(uuid,text)",
      "privacy_system_reserve_export(uuid,text,uuid,text,text,text,text,text,text,text,text,bigint,bigint,integer)",
      "privacy_system_complete_export(uuid,text,uuid,text,text,text,text,text,bigint,bigint,integer)",
      "privacy_system_fail_export(uuid,text,text)",
      "privacy_system_recover_stuck_exports()",
      "privacy_system_expired_artifacts(integer)",
      "privacy_system_mark_artifact_deleted(uuid,boolean)",
      "privacy_system_claim_deletion_plan(text,integer)",
      "privacy_system_plan_customer_deletion(uuid,text)",
      "privacy_system_record_deletion_legal_review(uuid,text)",
      "privacy_system_claim_deletion_provider_item(text,integer)",
      "privacy_system_finish_deletion_provider_item(uuid,text,boolean,text)",
      "privacy_system_claim_provider_cleanup_work(text,integer)",
      "privacy_system_claim_provider_cleanup_work_v2(text,integer)",
      "privacy_system_record_provider_cleanup_result(uuid,text,text,text,text,integer)",
      "privacy_provider_cleanup_item_approved(text,boolean)",
      "privacy_provider_cleanup_add_binding(uuid,text,uuid,text,text,text,text,text,boolean)",
      "privacy_provider_cleanup_add_authorized_binding(uuid,text,uuid,text,text,text,text,text,text,boolean)",
      "privacy_system_expand_provider_cleanup(uuid)",
      "privacy_system_claim_deletion_execution(text,integer)",
      "privacy_system_execute_customer_deletion(uuid,text)",
      "privacy_system_fail_customer_deletion(uuid,text,text)",
      "privacy_system_recover_customer_deletions()",
      "monitoring_system_snapshot(integer,integer,integer)",
      "monitoring_system_begin(text)",
      "monitoring_system_complete(uuid,text,integer,boolean)",
      "monitoring_system_heartbeat(integer,integer)",
      "customer_deletion_lifecycle_reason(text,timestamp with time zone)",
      "privacy_deletion_insert_plan_item(uuid,text,text,text,text,bigint,text)",
      "privacy_deletion_add_provider_item(uuid,text,text,text)",
    ];
    for (const fn of [
      "privacy_system_enqueue_retention_scan(text,text,text)",
      "privacy_system_claim_retention_job(text,integer)",
      "privacy_system_plan_retention_job(uuid,text)",
      "privacy_system_transition_retention_job(uuid,text,text,text)",
      "privacy_system_recover_stuck_jobs()",
      "privacy_system_claim_export(text,integer)",
      "privacy_system_export_snapshot(uuid,text)",
      "privacy_system_reserve_export(uuid,text,uuid,text,text,text,text,text,text,text,text,bigint,bigint,integer)",
      "privacy_system_complete_export(uuid,text,uuid,text,text,text,text,text,bigint,bigint,integer)",
      "privacy_system_fail_export(uuid,text,text)",
      "privacy_system_recover_stuck_exports()",
      "privacy_system_expired_artifacts(integer)",
      "privacy_system_mark_artifact_deleted(uuid,boolean)",
      "privacy_system_claim_deletion_plan(text,integer)",
      "privacy_system_plan_customer_deletion(uuid,text)",
      "privacy_system_record_deletion_legal_review(uuid,text)",
      "privacy_system_claim_deletion_provider_item(text,integer)",
      "privacy_system_finish_deletion_provider_item(uuid,text,boolean,text)",
      "privacy_system_claim_provider_cleanup_work(text,integer)",
      "privacy_system_claim_provider_cleanup_work_v2(text,integer)",
      "privacy_system_record_provider_cleanup_result(uuid,text,text,text,text,integer)",
      "privacy_system_claim_deletion_execution(text,integer)",
      "privacy_system_execute_customer_deletion(uuid,text)",
      "privacy_system_fail_customer_deletion(uuid,text,text)",
      "privacy_system_recover_customer_deletions()",
      "monitoring_system_snapshot(integer,integer,integer)",
      "monitoring_system_begin(text)",
      "monitoring_system_complete(uuid,text,integer,boolean)",
      "monitoring_system_heartbeat(integer,integer)",
    ]) await grantRoutineExecute(fn, [roles.system], { revokePublic: true });
    const ownerOperationalFunctions = [
      "issue_preview_for_site(text,boolean)",
      "owner_fresh_actor(text,text,bigint,text)",
      "owner_permission_allowed(text,text)",
      "finder_audit_json(audit_events)",
      "finder_lead_json(leads)",
      "finder_pipeline_json(lead_pipeline_events)",
      "finder_profile_json(prepared_business_profiles)",
      "owner_auth_administrative_recovery(text,text,text)",
      "owner_auth_bootstrap_first(text,text,text)",
      "owner_auth_cleanup_sessions()",
      "owner_auth_count()",
      "owner_auth_revoke_all_sessions(text,uuid,text)",
      "owner_auth_set_status(uuid,text)",
      "privacy_safe_details(jsonb)",
      "privacy_policy_hash(uuid)",
      "privacy_policy_valid(uuid)",
      "privacy_active_policy_valid()",
      "privacy_immutable_evidence()",
      "privacy_policy_guard()",
      "privacy_rule_guard()",
      "privacy_hold_guard()",
      "privacy_job_guard()",
      "privacy_export_artifact_guard()",
      "privacy_export_artifact_binding_valid(privacy_export_artifacts)",
      "privacy_export_active_policy()",
      "owner_export_fresh_actor(text,text,bigint)",
      "privacy_resolve_subject(text,text)",
      "privacy_hold_applies(text,text,text,text)",
      "privacy_eligible_count(text,text,text,text,timestamp with time zone)",
      "privacy_plan_job(uuid,text,uuid,text)",
    ];
    const executorFunctions = new Map([
      [roles.bootstrapExecutor, bootstrapExecutorFunctions],
      [roles.runtimeExecutor, runtimeExecutorFunctions],
      [roles.ownerExecutor, [...ownerFunctions, ...ownerOperationalFunctions]],
      [roles.systemExecutor, systemExecutorFunctions],
    ]);
    for (const [executor, functions] of executorFunctions) {
      // ALTER FUNCTION OWNER requires the destination owner to have CREATE on
      // the containing schema. Keep it only for the ownership transfer window;
      // executor roles are NOLOGIN and finish with USAGE-only schema access.
      await client.query(`grant usage,create on schema public to ${quoteIdentifier(executor)}`);
      await client.query(`grant ${quoteIdentifier(executor)} to ${quoteIdentifier(roles.migrator)}`);
      for (const applicationRole of [roles.runtime, roles.owner, roles.system])
        await client.query(`revoke ${quoteIdentifier(executor)} from ${quoteIdentifier(applicationRole)}`);
      for (const fn of [...new Set(functions)]) {
        const currentOwner = (await client.query(
          "select pg_get_userbyid(p.proowner) owner from pg_proc p where p.oid=to_regprocedure($1)",
          [fn],
        )).rows[0]?.owner;
        if (!currentOwner && allowLegacySchema) continue;
        if (currentOwner === roles.migrator) {
          // Revoke while the migrator still owns the routine. Hosted admin
          // roles need not inherit the destination executor's privileges.
          await client.query(`revoke all on function ${fn} from public`);
          await client.query(`alter function ${fn} owner to ${quoteIdentifier(executor)}`);
        } else if (currentOwner === executor) {
          await client.query(`set local role ${quoteIdentifier(executor)}`);
          try {
            await client.query(`revoke all on function ${fn} from public`);
          } finally {
            await client.query("reset role");
          }
        } else {
          throw new Error(`Routine ${fn} has unexpected owner ${currentOwner ?? "<missing>"}; refusing cross-executor reassignment.`);
        }
      }
      await client.query(`revoke create on schema public from ${quoteIdentifier(executor)}`);
    }
    for (const fn of ownerOperationalFunctions)
      await grantRoutineExecute(fn, [roles.migrator]);
    for (const fn of [
      "privacy_policy_valid(uuid)", "privacy_resolve_subject(text,text)",
      "privacy_safe_details(jsonb)",
      "privacy_hold_applies(text,text,text,text)",
      "privacy_eligible_count(text,text,text,text,timestamp with time zone)",
      "privacy_plan_job(uuid,text,uuid,text)",
    ]) await grantRoutineExecute(fn, [roles.systemExecutor]);
    await grantRoutineExecute("privacy_policy_valid(uuid)", [roles.bootstrapExecutor]);
    await grantRoutineExecute("privacy_active_policy_valid()", [roles.bootstrapExecutor]);
    await client.query(`grant execute on function public.digest(bytea,text) to ${quoteIdentifier(roles.runtimeExecutor)}, ${quoteIdentifier(roles.ownerExecutor)}, ${quoteIdentifier(roles.systemExecutor)}`);
    await grantRoutineExecute("privacy_export_active_policy()", [roles.runtimeExecutor]);
    for (const executor of [roles.runtimeExecutor, roles.systemExecutor])
      await grantRoutineExecute("privacy_export_artifact_binding_valid(privacy_export_artifacts)", [executor]);
    await grantRoutineExecute("privacy_export_status_json(privacy_jobs,privacy_export_artifacts)", [roles.ownerExecutor]);
    await grantRoutineExecute("privacy_safe_details(jsonb)", [roles.runtimeExecutor]);
    for (const executor of [roles.runtimeExecutor, roles.ownerExecutor, roles.systemExecutor]) {
      await grantRoutineExecute("privacy_hold_applies(text,text,text,text)", [executor]);
      await grantRoutineExecute("privacy_policy_hash(uuid)", [executor]);
      await grantRoutineExecute("privacy_policy_valid(uuid)", [executor]);
      await grantRoutineExecute("customer_deletion_lifecycle_reason(text,timestamp with time zone)", [executor]);
    }
    for (const fn of ["app_context_actor_kind()", "app_context_site_id()", "app_context_is_valid_site_admin()"])
      for (const executor of [roles.runtimeExecutor, roles.bootstrapExecutor, roles.ownerExecutor, roles.systemExecutor])
        await grantRoutineExecute(fn, [executor]);
    await grantRoutineExecute("site_admin_resolve_session(text)", [roles.runtimeExecutor]);
    await grantRoutineExecute("information_editorial_allowed(text)", [roles.bootstrapExecutor]);
    await grantRoutineExecute("information_editorial_allowed(text)", [roles.systemExecutor]);
    await grantRoutineExecute("information_sponsor_media_active(uuid)", [roles.bootstrapExecutor]);
    await grantRoutineExecute("information_sponsors_export(text)", [roles.systemExecutor]);
    await grantRoutineExecute("information_sponsors_delete(text)", [roles.systemExecutor]);
    await grantRoutineExecute("issue_preview_for_site(text,boolean)", [roles.runtimeExecutor]);
    await grantRoutineExecute("resolve_public_site_by_slug(text)", [roles.runtimeExecutor]);

    const executorTables = new Map([
      [roles.bootstrapExecutor, [
        "sites", "site_features", "site_media", "site_media_blobs",
        "site_appointments", "site_admin_accounts", "site_admin_sessions",
        "site_admin_password_resets", "subscriber_intakes", "site_subscriptions",
        "site_addon_subscriptions", "contract_acceptances",
        "site_complimentary_access",
        "platform_legal_config_versions", "platform_legal_document_versions",
        "site_preview_tokens", "api_rate_limits", "website_import_analysis_cache", "site_editorial_settings",
        "site_information_ad_slots", "site_information_sponsor_banners",
        "site_article_categories", "site_articles", "site_article_sources", "site_article_media",
        "site_media_assets", "leads", "prepared_business_profiles",
        "demo_sites", "audit_events",
      ]],
      [roles.runtimeExecutor, [
        "sites", "site_features", "site_media", "site_media_blobs",
        "booking_settings", "booking_weekly", "booking_blocks",
        "site_appointments", "ai_runs", "tenant_usage_counters",
        "tenant_usage_states", "tenant_usage_events", "tenant_concurrency_leases",
        "site_external_integrations", "site_integration_events",
        "site_admin_accounts", "site_admin_sessions", "site_admin_password_resets",
        "subscriber_intakes", "site_subscriptions", "site_addon_subscriptions",
        "site_complimentary_access",
        "subscription_lifecycle_events", "payment_webhook_events",
        "customer_business_identities", "contract_acceptances",
        "platform_legal_config_versions", "platform_legal_document_versions",
        "site_editorial_settings", "site_editorial_memberships",
        "site_article_categories", "site_articles", "site_article_sources",
        "site_article_media", "site_media_assets", "site_content_audit_events",
        "site_preview_tokens",
        "privacy_policy_versions", "privacy_jobs", "privacy_job_events",
        "privacy_export_artifacts", "privacy_export_download_capabilities",
        "customer_deletion_workflows", "privacy_provider_cleanup_items",
      ]],
      [roles.ownerExecutor, [
        "sites", "site_features", "site_admin_accounts", "site_admin_sessions",
        "site_admin_password_resets", "ai_runs", "tenant_usage_counters",
        "tenant_usage_states", "tenant_usage_events", "tenant_concurrency_leases",
        "site_external_integrations", "site_integration_events",
        "subscriber_intakes", "site_subscriptions", "site_addon_subscriptions",
        "site_complimentary_access",
        "subscription_lifecycle_events", "customer_business_identities",
        "contract_acceptances", "platform_legal_config_versions",
        "platform_legal_document_versions", "owner_accounts", "owner_sessions",
        "owner_auth_challenges", "owner_mfa_recovery_codes", "owner_invitations",
        "owner_auth_audit_events", "site_information_ad_slots",
        "site_editorial_settings", "site_editorial_memberships",
        "site_content_audit_events",
        "leads", "lead_scores", "lead_pipeline_events", "lead_website_history",
        "prepared_business_profiles", "finder_searches", "finder_search_cache",
        "demo_sites", "site_preview_tokens", "audit_events",
        "site_appointments", "site_media", "site_media_blobs", "site_media_assets",
        "payment_webhook_events", "integration_nonces", "integration_api_requests",
        "privacy_policy_versions", "privacy_retention_rules", "privacy_jobs",
        "privacy_job_items", "privacy_job_events", "privacy_legal_holds",
        "privacy_export_artifacts", "privacy_export_download_capabilities",
        "customer_deletion_workflows", "privacy_provider_cleanup_items",
      ]],
      [roles.systemExecutor, [
        "sites", "site_features", "site_media", "site_media_blobs", "site_appointments", "ai_runs", "site_admin_accounts", "site_admin_sessions", "site_admin_password_resets",
        "subscriber_intakes", "site_subscriptions", "site_addon_subscriptions",
        "website_import_analysis_cache",
        "site_complimentary_access",
        "subscription_lifecycle_events", "payment_webhook_events",
        "contract_acceptances", "customer_business_identities", "platform_legal_config_versions", "platform_legal_document_versions", "site_external_integrations",
        "site_integration_events", "site_articles", "site_article_categories",
        "site_article_sources", "site_article_media", "site_media_assets",
        "site_content_audit_events", "integration_nonces",
        "integration_api_requests", "tenant_usage_counters", "tenant_usage_states",
        "tenant_usage_events", "tenant_concurrency_leases", "demo_sites",
        "site_preview_tokens", "api_rate_limits", "website_import_analysis_cache", "audit_events", "leads",
        "prepared_business_profiles",
        "finder_search_cache",
        "site_information_ad_slots", "site_information_sponsor_banners", "site_editorial_settings", "site_editorial_memberships", "owner_accounts", "owner_sessions", "owner_invitations", "owner_auth_audit_events",
        "privacy_policy_versions", "privacy_retention_rules", "privacy_jobs",
        "privacy_job_items", "privacy_job_events", "privacy_legal_holds",
        "privacy_export_artifacts", "privacy_export_download_capabilities",
        "customer_deletion_workflows", "privacy_provider_cleanup_items", "privacy_provider_cleanup_bindings",
        "operational_monitoring_state",
      ]],
    ]);
    const executorPolicyPrefixes = new Map([
      [roles.bootstrapExecutor, "bootstrap_executor"],
      [roles.runtimeExecutor, "runtime_executor"],
      [roles.ownerExecutor, "owner_executor"],
      [roles.systemExecutor, "system_executor"],
    ]);
    for (const [executor, tables] of executorTables) {
      for (const table of tables) {
        if (!existingRlsTables.has(table)) {
          if (allowLegacySchema && laterLegacyTables.has(table)) continue;
          throw new Error(`Required executor table ${table} is missing.`);
        }
        const policy = `force_${executorPolicyPrefixes.get(executor)}_${table}`;
        await client.query(`grant select,insert,update,delete on table ${quoteServerIdentifier(table)} to ${quoteIdentifier(executor)}`);
        await client.query(`drop policy if exists ${quoteServerIdentifier(policy)} on ${quoteServerIdentifier(table)}`);
        await client.query(
          `create policy ${quoteServerIdentifier(policy)} on ${quoteServerIdentifier(table)} as permissive for all to ${quoteIdentifier(executor)} using (current_user = '${executor}') with check (current_user = '${executor}')`,
        );
      }
    }
    // The existing private editorial delivery resolver reads membership before
    // returning an asset. Its NOLOGIN bootstrap executor needs SELECT only;
    // granting CRUD here would unnecessarily widen its authority.
    await client.query(`grant select on table site_editorial_memberships to ${quoteIdentifier(roles.bootstrapExecutor)}`);
    await client.query("drop policy if exists force_bootstrap_executor_editorial_membership_read on site_editorial_memberships");
    await client.query(`create policy force_bootstrap_executor_editorial_membership_read on site_editorial_memberships as permissive for select to ${quoteIdentifier(roles.bootstrapExecutor)} using (current_user = '${roles.bootstrapExecutor}')`);
    // FORCE is the last boundary mutation: every executor owner, grant and
    // role-bound policy above is already installed in this same transaction.
    // The three global/migrator-only tables are intentionally excluded.
    for (const table of rlsTables) {
      if (!existingRlsTables.has(table)) {
        if (allowLegacySchema && laterLegacyTables.has(table)) continue;
        throw new Error(`Required FORCE RLS table ${table} is missing.`);
      }
      await client.query(`alter table ${quoteServerIdentifier(table)} force row level security`);
    }

    const forbiddenTables = (await client.query(
      `select table_name, privilege_type
       from information_schema.role_table_grants
       where grantee=$1`,
      [roles.system],
    )).rows;
    if (forbiddenTables.length)
      throw new Error(`${roles.system} already has table privileges; Task Group 3-B1 refuses blanket system access.`);
    const ownerTables = (await client.query(
      `select table_name,privilege_type from information_schema.role_table_grants where grantee=$1`,
      [roles.owner],
    )).rows;
    if (ownerTables.length) throw new Error(`${roles.owner} must remain procedure-only.`);

    const runtime = (await client.query(
      "select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=$1",
      [roles.runtime],
    )).rows[0];
    if (!runtime || runtime.rolsuper || runtime.rolbypassrls || runtime.rolcreatedb || runtime.rolcreaterole)
      throw new Error("Runtime database role properties are unsafe.");
    const system = (await client.query(
      "select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=$1",
      [roles.system],
    )).rows[0];
    if (!system || system.rolsuper || system.rolbypassrls || system.rolcreatedb || system.rolcreaterole)
      throw new Error("System database role properties are unsafe.");
    const ownerRole = (await client.query(
      "select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=$1",
      [roles.owner],
    )).rows[0];
    if (!ownerRole || ownerRole.rolsuper || ownerRole.rolbypassrls || ownerRole.rolcreatedb || ownerRole.rolcreaterole)
      throw new Error("Owner operations database role properties are unsafe.");
    const systemMigratorMembership = (await client.query(
      "select pg_has_role($1,$2,'member') as member",
      [roles.system, roles.migrator],
    )).rows[0]?.member;
    if (systemMigratorMembership) throw new Error("System database role must not inherit the migrator role.");
    if ((await client.query("select pg_has_role($1,$2,'member') as member", [roles.owner,roles.migrator])).rows[0]?.member)
      throw new Error("Owner operations role must not inherit the migrator role.");
    const owned = (await client.query(
      `select c.relname from pg_class c join pg_roles r on r.oid=c.relowner
       where r.rolname=$1 and c.relkind in ('r','p')`,
      [roles.runtime],
    )).rows;
    if (owned.length) throw new Error("Runtime database role owns tables.");
    const systemOwned = (await client.query(
      `select c.relname from pg_class c join pg_roles r on r.oid=c.relowner
       where r.rolname=$1 and c.relkind in ('r','p')`,
      [roles.system],
    )).rows;
    if (systemOwned.length) throw new Error("System database role owns tables.");
    const ownerOwned = (await client.query(
      `select c.relname from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname=$1 and c.relkind in ('r','p')`,
      [roles.owner],
    )).rows;
    if (ownerOwned.length) throw new Error("Owner operations role owns tables.");
    const foreignOwned = (await client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
       where n.nspname='public' and c.relkind in ('r','p','S','v','m') and r.rolname<>$1
         and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')`,
      [roles.migrator],
    )).rows;
    if (foreignOwned.length) throw new Error("Migration role does not own every public schema relation.");
    const foreignRoutines = (await client.query(
      `select p.oid::regprocedure::text as identity
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
       where n.nspname='public' and p.prokind in ('f','p') and r.rolname<>all($1::text[])
         and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')`,
      [[roles.migrator, roles.runtimeExecutor, roles.bootstrapExecutor, roles.ownerExecutor, roles.systemExecutor]],
    )).rows;
    if (foreignRoutines.length) throw new Error("An application routine has an unclassified owner.");
    await client.query("commit");
    console.log("Database application/executor roles and least-privilege grants verified.", {
      migratorRole: roles.migrator,
      runtimeRole: roles.runtime,
      systemRole: roles.system,
      ownerRole: roles.owner,
      runtimeSuperuser: false,
      runtimeBypassRls: false,
      runtimeOwnsTables: false,
    });
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
