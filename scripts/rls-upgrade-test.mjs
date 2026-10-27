import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { migrationConnectionString } from "./database-role-config.mjs";

if (process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true")
  throw new Error(
    "RLS_TEST_DISPOSABLE_DATABASE=true is required for the upgrade fixture.",
  );
const url = migrationConnectionString();
const pool = new pg.Pool({
  connectionString: url,
  application_name: "bsrc-b4a-upgrade",
});
const directory = resolve(import.meta.dirname, "../db/migrations");
const migrations = readdirSync(directory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
const through046 = migrations.filter((name) => Number(name.slice(0, 3)) <= 46);

async function apply(name) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(readFileSync(join(directory, name), "utf8"));
    await client.query("insert into schema_migrations(name) values($1)", [
      name,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function snapshot(onlyTables) {
  const tables =
    onlyTables ??
    (
      await pool.query(
        "select tablename from pg_tables where schemaname='public' order by tablename",
      )
    ).rows.map((row) => row.tablename);
  const result = {};
  for (const table of tables) {
    if (table === "schema_migrations") continue;
    const safe = `"${table.replaceAll('"', '""')}"`;
    result[table] = (
      await pool.query(
        `select count(*)::int count,md5(coalesce(string_agg((to_jsonb(t)-'appointment_retention_days'-'custom_domain_provider_authority')::text,E'\\n' order by (to_jsonb(t)-'appointment_retention_days'-'custom_domain_provider_authority')::text),'')) checksum from ${safe} t`,
      )
    ).rows[0];
  }
  return result;
}

try {
  await pool.query(
    "create table schema_migrations(name text primary key,applied_at timestamptz not null default now())",
  );
  for (const name of through046) await apply(name);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [id, status, activated] of [
      ["upgrade-trial", null, null],
      ["upgrade-active", "active", new Date()],
      ["upgrade-grace", "past_due", new Date()],
      ["upgrade-read-only", "canceled", new Date()],
      ["upgrade-canceled", "canceled", new Date()],
    ]) {
      await client.query(
        `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,site_kind,custom_domain,custom_domain_status)
         values($1,$2,'private','public',$3,now()+interval '14 days',now()+interval '44 days',$4,'business',$5,'not_requested')`,
        [id, id, { fixture: id }, activated, `${id}.example.test`],
      );
      await client.query(
        "insert into site_features(site_id,feature_key,enabled) values($1,'website',true)",
        [id],
      );
      if (status)
        await client.query(
          `insert into site_subscriptions(site_id,plan_key,status,current_period_end,first_past_due_at,payment_grace_ends_at,suspended_at,read_only_ends_at)
         values($1,'starter',$2,now()+interval '30 days',case when $2='past_due' then now() else null end,
           case when $2='past_due' then now()+interval '7 days' else null end,
           case when $2='canceled' then now() else null end,
           case when $2='canceled' then now()+interval '30 days' else null end)`,
          [id, status],
        );
    }
    await client.query(
      "insert into site_admin_accounts(id,site_id,email,password_hash,status) values('46000000-0000-4000-8000-000000000001','upgrade-active','upgrade@example.test','fixture-hash','active')",
    );
    await client.query(
      "insert into owner_accounts(id,email,password_hash,status,role) values('46000000-0000-4000-8000-000000000002','upgrade-owner@example.test','fixture-hash','active','owner')",
    );
    await client.query(
      "insert into owner_auth_audit_events(id,owner_id,action,outcome,source,details) values(gen_random_uuid(),'46000000-0000-4000-8000-000000000002','fixture_upgrade','success','cli','{}')",
    );
    await client.query(
      "insert into site_media(id,site_id,slot,url,alt_text) values(gen_random_uuid(),'upgrade-active','logo','https://example.test/logo.webp','logo')",
    );
    await client.query(
      "insert into site_media_blobs(id,site_id,filename,content_type,data) values(gen_random_uuid(),'upgrade-active','logo.webp','image/webp','\\x0102')",
    );
    await client.query(
      "insert into site_appointments(id,site_id,customer_name,phone,created_at) values(gen_random_uuid(),'upgrade-active','Old fixture','000',now()-interval '200 days'),(gen_random_uuid(),'upgrade-active','New fixture','000',now()-interval '20 days')",
    );
    await client.query(
      "insert into tenant_usage_counters(site_id,metric,window_type,window_start,quantity) values('upgrade-active','ai','month',date_trunc('month',now()),7)",
    );
    await client.query(
      "insert into ai_runs(id,actor_type,actor_id,operation,site_id,provider,model,status) values(gen_random_uuid(),'owner','upgrade','website_blueprint','upgrade-active','fixture','fixture','completed')",
    );
    await client.query(
      "insert into site_external_integrations(id,site_id,provider,status,metadata) values(gen_random_uuid(),'upgrade-active','redi_control','disconnected','{}')",
    );
    await client.query(
      "insert into leads(id,name,source,payload,score,score_reasons,signals) values('upgrade-lead','Upgrade lead','fixture','{}',10,'[]','{}')",
    );
    await client.query(
      "insert into finder_searches(id,query,filters,cache_key,result_count,lead_ids,cached,status,completed_at,created_by_owner_id) values(gen_random_uuid(),'upgrade fixture','{}','upgrade-cache',1,'[\"upgrade-lead\"]',false,'completed',now(),'46000000-0000-4000-8000-000000000002')",
    );
    await client.query(
      "insert into finder_search_cache(cache_key,lead_ids,expires_at,updated_by_owner_id) values('upgrade-cache','[\"upgrade-lead\"]',now()-interval '1 day','46000000-0000-4000-8000-000000000002')",
    );
    await client.query(
      "insert into prepared_business_profiles(id,lead_id,version,profile,status) values('upgrade-profile','upgrade-lead',1,'{}','ready_for_handoff')",
    );
    await client.query(
      "insert into demo_sites(site_id,prepared_profile_id) values('upgrade-trial','upgrade-profile')",
    );
    await client.query(
      "insert into site_preview_tokens(token_id,site_id,expires_at) values(gen_random_uuid(),'upgrade-trial',now()+interval '1 day')",
    );
    await client.query(
      "insert into customer_business_identities(id,site_id,version,legal_business_name,country_code,business_type) values('46000000-0000-4000-8000-000000000003','upgrade-active',1,'Upgrade Fixture GmbH','DE','company')",
    );
    await client.query(
      "insert into subscriber_intakes(id,email,business_name,demo_site_id,plan_key,status,billing_provider,site_admin_account_id,checkout_price_id,checkout_attempt,business_identity_id) values('46000000-0000-4000-8000-000000000004','upgrade@example.test','Upgrade Fixture GmbH','upgrade-active','starter','pending_payment','stripe','46000000-0000-4000-8000-000000000001','price_fixture',1,'46000000-0000-4000-8000-000000000003')",
    );
    await client.query(`insert into contract_acceptances(id,intake_id,checkout_attempt,site_id,actor_account_id,business_identity_id,terms_document_key,terms_version,terms_content_hash,privacy_document_key,privacy_version,privacy_content_hash,b2b_attestation_version,authority_attestation_version,automatic_renewal_version,privacy_acknowledgement_version,platform_legal_config_version,plan_key,billing_provider,checkout_price_id,currency,tax_display_mode,price_tax_label_snapshot,normal_price_display_snapshot,trial_duration_days,billing_interval,locale,source)
      values('46000000-0000-4000-8000-000000000005','46000000-0000-4000-8000-000000000004',1,'upgrade-active','46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000003','terms','fixture','${"a".repeat(64)}','privacy','fixture','${"b".repeat(64)}','fixture','fixture','fixture','fixture',0,'starter','stripe','price_fixture','EUR','gross_inclusive','fixture','fixture',14,'month','en','site_admin_checkout')`);
    await client.query(
      "update subscriber_intakes set contract_acceptance_id='46000000-0000-4000-8000-000000000005' where id='46000000-0000-4000-8000-000000000004'",
    );
    await client.query(
      "insert into payment_webhook_events(event_id,provider,event_type,site_id,disposition,processed_at) values('evt_upgrade_fixture','stripe','customer.subscription.updated','upgrade-active','accepted',now()-interval '100 days')",
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  const before = await snapshot();
  const existingTables = Object.keys(before);
  await apply("047_privacy_retention_job_foundation.sql");
  const after047 = await snapshot();
  const tables047 = Object.keys(after047);
  if (JSON.stringify(before) !== JSON.stringify(await snapshot(existingTables)))
    throw new Error("046->047 changed an existing fixture row");
  await apply("048_authenticated_privacy_exports.sql");
  await pool.query(`insert into privacy_jobs(id,kind,subject_kind,subject_reference,site_id,site_admin_account_id,policy_version_id,snapshot_at,requested_actor_kind,requested_actor_reference,status,idempotency_hash,attempts,max_attempts,completed_at)
    select '46000000-0000-4000-8000-000000000006','export','customer_account','46000000-0000-4000-8000-000000000001','upgrade-active','46000000-0000-4000-8000-000000000001',id,now(),'site_admin','46000000-0000-4000-8000-000000000001','completed','${"c".repeat(64)}',1,3,now()
    from privacy_policy_versions where status='active'`);
  await pool.query(`insert into privacy_export_artifacts(id,job_id,subject_kind,subject_reference,storage_adapter,object_key,encryption_algorithm,key_version,ciphertext_checksum,plaintext_checksum,archive_bytes,encrypted_bytes,file_count,schema_version,status,expires_at)
    values('46000000-0000-4000-8000-000000000007','46000000-0000-4000-8000-000000000006','customer_account','46000000-0000-4000-8000-000000000001','memory_test','privacy-exports/46/46000000-0000-4000-8000-000000000006.enc','AES-256-GCM','v1','${"d".repeat(64)}','${"e".repeat(64)}',128,156,2,1,'ready',now()+interval '12 hours')`);
  const after048 = await snapshot();
  const tables048 = Object.keys(after048);
  await apply("049_customer_deletion_workflow.sql");
  await apply("050_provider_cleanup_reconciliation.sql");
  await apply("051_vercel_blob_store_authority.sql");
  await apply("052_vercel_domain_project_authority.sql");
  await apply("053_hosted_database_readiness.sql");
  await apply("054_canonical_self_service_site_ids.sql");
  await apply("055_self_service_trial_entitlements.sql");
  await apply("056_customer_deletion_rate_limit_scope.sql");
  const provision = spawnSync(
    process.execPath,
    ["scripts/provision-database-roles.mjs"],
    {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: url,
        DATABASE_CREATE_ROLES: "true",
        DATABASE_RLS_MODE: "off",
        DATABASE_ROLE_PROVISIONING_ALLOW_LEGACY_SCHEMA: "true",
      },
    },
  );
  if (provision.status !== 0) throw new Error("role provisioning failed");
  const after = await snapshot(tables048);
  if (JSON.stringify(after048) !== JSON.stringify(after))
    throw new Error(
      "048->049 changed an existing source, privacy-foundation or export row",
    );
  const appointmentRetention = (
    await pool.query(
      "select array_agg(distinct appointment_retention_days order by appointment_retention_days) values from sites",
    )
  ).rows[0].values;
  if (JSON.stringify(appointmentRetention) !== JSON.stringify([180]))
    throw new Error(
      `unexpected appointment retention backfill ${JSON.stringify(appointmentRetention)}`,
    );
  const legacyDomainAuthorities = (
    await pool.query(
      "select count(*) filter(where custom_domain_provider_authority is not null)::int non_null from sites",
    )
  ).rows[0].non_null;
  if (legacyDomainAuthorities !== 0)
    throw new Error("052 guessed or backfilled a legacy domain authority");
  const state = (
    await pool.query(
      "select count(*) filter(where relrowsecurity)::int rls,count(*) filter(where relforcerowsecurity)::int force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')",
    )
  ).rows[0];
  if (state.rls !== 63 || state.force !== 63)
    throw new Error(`unexpected RLS/FORCE state ${state.rls}/${state.force}`);
  const privacySeed = (
    await pool.query(
      "select (select count(*)::int from privacy_policy_versions) policies,(select count(*)::int from privacy_retention_rules) rules,(select count(*)::int from privacy_jobs) jobs,(select count(*)::int from privacy_legal_holds) holds",
    )
  ).rows[0];
  if (
    JSON.stringify(privacySeed) !==
    JSON.stringify({ policies: 1, rules: 17, jobs: 1, holds: 0 })
  )
    throw new Error(`unexpected privacy seed ${JSON.stringify(privacySeed)}`);
  const b2Seed = (
    await pool.query(
      "select (select count(*)::int from privacy_export_artifacts) artifacts,(select count(*)::int from privacy_export_download_capabilities) capabilities",
    )
  ).rows[0];
  if (
    JSON.stringify(b2Seed) !== JSON.stringify({ artifacts: 1, capabilities: 0 })
  )
    throw new Error(`unexpected B2 seed ${JSON.stringify(b2Seed)}`);
  const b3Seed = (
    await pool.query(
      "select (select count(*)::int from customer_deletion_workflows) workflows,(select count(*)::int from privacy_provider_cleanup_items) provider_items,(select count(*)::int from privacy_provider_cleanup_bindings) provider_bindings",
    )
  ).rows[0];
  if (
    JSON.stringify(b3Seed) !==
    JSON.stringify({ workflows: 0, provider_items: 0, provider_bindings: 0 })
  )
    throw new Error(`unexpected B3 seed ${JSON.stringify(b3Seed)}`);
  await pool.query(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../db/admin/rollback-customer-deletion-workflow.sql",
      ),
      "utf8",
    ),
  );
  if (JSON.stringify(after) !== JSON.stringify(await snapshot(tables048)))
    throw new Error("B3 rollback changed source or privacy data");
  const rollbackClient = await pool.connect();
  try {
    await rollbackClient.query("begin");
    await rollbackClient.query(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../db/admin/rollback-authenticated-privacy-exports.sql",
        ),
        "utf8",
      ),
    );
    await rollbackClient.query("commit");
  } catch (error) {
    await rollbackClient.query("rollback");
    throw error;
  } finally {
    rollbackClient.release();
  }
  const rolledBack = await snapshot(tables048);
  const rollbackForce = (
    await pool.query(
      "select count(*) filter(where relforcerowsecurity)::int force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')",
    )
  ).rows[0].force;
  if (
    rollbackForce !== 63 ||
    JSON.stringify(after048) !== JSON.stringify(rolledBack)
  )
    throw new Error("B2 rollback changed source/B1 data or FORCE coverage");
  const reprovision = spawnSync(
    process.execPath,
    ["scripts/provision-database-roles.mjs"],
    {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: url,
        DATABASE_CREATE_ROLES: "true",
        DATABASE_RLS_MODE: "off",
        DATABASE_ROLE_PROVISIONING_ALLOW_LEGACY_SCHEMA: "true",
      },
    },
  );
  if (reprovision.status !== 0)
    throw new Error("role reprovisioning after FORCE rollback failed");
  const restoredForce = (
    await pool.query(
      "select count(*) filter(where relforcerowsecurity)::int force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')",
    )
  ).rows[0].force;
  if (
    restoredForce !== 63 ||
    JSON.stringify(before) !== JSON.stringify(await snapshot(existingTables))
  )
    throw new Error(
      "B2 reprovision changed fixture data or did not restore exact coverage",
    );
  console.log(
    "049->052 provider cleanup/exact-authority upgrade and non-destructive rollback preservation passed.",
    {
      existingTables: tables048.length,
      rls: state.rls,
      force: state.force,
      rollbackForce,
      privacySeed,
      b2Seed,
      b3Seed,
    },
  );
} finally {
  await pool.end();
}
