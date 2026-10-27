import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { databaseRoleNames, migrationConnectionString, quoteIdentifier } from "./database-role-config.mjs";

const adminUrl = migrationConnectionString();
if (process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true")
  throw new Error("RLS_TEST_DISPOSABLE_DATABASE=true is required; never run this harness against shared, staging, or production data.");
const roles = databaseRoleNames();
const testRole = `bsrc_rls_test_${randomBytes(5).toString("hex")}`;
const systemTestRole = `bsrc_system_test_${randomBytes(5).toString("hex")}`;
const ownerTestRole = `bsrc_owner_test_${randomBytes(5).toString("hex")}`;
const password = randomBytes(24).toString("base64url");
const systemPassword = randomBytes(24).toString("base64url");
const ownerPassword = randomBytes(24).toString("base64url");
const setupOwnerId = randomUUID();
const setupMfaKey = randomBytes(32).toString("base64url");
const siteA = randomUUID();
const siteB = randomUUID();
const siteDisabled = randomUUID();
const accountA = randomUUID();
const accountB = randomUUID();
const accountDisabled = randomUUID();
const sessionA = randomBytes(32).toString("hex");
const sessionB = randomBytes(32).toString("hex");
const expiredSession = randomBytes(32).toString("hex");
const revokedSession = randomBytes(32).toString("hex");
const disabledSession = randomBytes(32).toString("hex");
const admin = new pg.Pool({ connectionString: adminUrl, application_name: "bsrc-rls-harness" });
const fixtureSiteIds = [siteA, siteB, siteDisabled];

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

try {
  const server = (await admin.query("show server_version_num")).rows[0]?.server_version_num;
  if (Number(server) < 160000) throw new Error("The dedicated RLS harness requires PostgreSQL 16 or newer.");
  run(process.execPath, ["scripts/migrate.mjs"], { MIGRATION_DATABASE_URL: adminUrl, DATABASE_RLS_MODE: "off" });
  run(process.execPath, ["scripts/provision-database-roles.mjs"], {
    MIGRATION_DATABASE_URL: adminUrl,
    DATABASE_CREATE_ROLES: "true",
    DATABASE_RLS_MODE: "off",
  });
  const client = await admin.connect();
  try {
    await client.query(`create role ${quoteIdentifier(testRole)} login password '${password}' inherit nosuperuser nocreatedb nocreaterole nobypassrls in role ${quoteIdentifier(roles.runtime)}`);
    await client.query(`create role ${quoteIdentifier(systemTestRole)} login password '${systemPassword}' inherit nosuperuser nocreatedb nocreaterole nobypassrls in role ${quoteIdentifier(roles.system)}`);
    await client.query(`create role ${quoteIdentifier(ownerTestRole)} login password '${ownerPassword}' inherit nosuperuser nocreatedb nocreaterole nobypassrls in role ${quoteIdentifier(roles.owner)}`);
    const state = (await client.query(
      `select r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
              exists(select 1 from pg_class c where c.relowner=r.oid and c.relkind in ('r','p')) as owns_tables
       from pg_roles r where r.rolname=$1`, [testRole])).rows[0];
    if (!state || state.rolsuper || state.rolbypassrls || state.rolcreatedb || state.rolcreaterole || state.owns_tables)
      throw new Error("Test runtime member has unsafe role properties.");
    await client.query(
      `insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at,site_kind)
       values($1,$2,'private',$3,now() + interval '14 days',now() + interval '44 days','information'),
             ($4,$5,'private',$6,now() + interval '14 days',now() + interval '44 days','information'),
             ($7,$8,'private',$9,now() + interval '14 days',now() + interval '44 days','business')`,
      [siteA, `rls-a-${siteA.slice(0, 8)}`, {}, siteB, `rls-b-${siteB.slice(0, 8)}`, {}, siteDisabled, `rls-disabled-${siteDisabled.slice(0, 8)}`, {}]);
    await client.query(
      `insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale,status)
       values($1,$2,$3,'hash-a','en','active'),($4,$5,$6,'hash-b','de','active'),($7,$8,$9,'hash-disabled','en','disabled')`,
      [accountA,siteA,`a-${siteA}@example.test`,accountB,siteB,`b-${siteB}@example.test`,accountDisabled,siteDisabled,`disabled-${siteDisabled}@example.test`]);
    await client.query(
      `insert into site_admin_sessions(id,account_id,token_hash,expires_at)
       values(gen_random_uuid(),$1,$2,now()+interval '1 hour'),
             (gen_random_uuid(),$3,$4,now()+interval '1 hour'),
             (gen_random_uuid(),$1,$5,now()-interval '1 hour'),
             (gen_random_uuid(),$6,$7,now()+interval '1 hour')`,
      [accountA,sessionA,accountB,sessionB,expiredSession,accountDisabled,disabledSession]);
    await client.query(`insert into site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,now()+interval '1 hour')`, [accountA,revokedSession]);
    await client.query("delete from site_admin_sessions where token_hash=$1", [revokedSession]);
    await client.query(
      `insert into site_features(site_id,feature_key,enabled)
       values($1,'website',true),($1,'editor',true),($2,'website',true),($2,'editor',true)`,
      [siteA, siteB]);
    await client.query(
      `insert into site_media(id,site_id,slot,url,alt_text) values
       (gen_random_uuid(),$1,'logo','https://example.test/a.webp','a'),
       (gen_random_uuid(),$2,'logo','https://example.test/b.webp','b')`, [siteA,siteB]);
    await client.query(`insert into site_media_blobs(id,site_id,filename,content_type,data) values
       (gen_random_uuid(),$1,'a.webp','image/webp','\\x01'),
       (gen_random_uuid(),$2,'b.webp','image/webp','\\x02')`, [siteA,siteB]);
    await client.query(`insert into site_appointments(id,site_id,customer_name,phone) values
       (gen_random_uuid(),$1,'A','1'),(gen_random_uuid(),$2,'B','2')`, [siteA,siteB]);
    await client.query(`insert into ai_runs(id,actor_type,actor_id,operation,site_id,provider,model) values
       (gen_random_uuid(),'site_admin',$3,'text_rewrite',$1,'test','test'),
       (gen_random_uuid(),'site_admin',$4,'text_rewrite',$2,'test','test')`, [siteA,siteB,accountA,accountB]);
    await client.query(`insert into tenant_usage_counters(site_id,metric,window_type,window_start,quantity) values
       ($1,'ai','month',date_trunc('month',now()),1),($2,'ai','month',date_trunc('month',now()),2)`, [siteA,siteB]);
    await client.query(`insert into tenant_usage_states(site_id,state) values($1,'normal'),($2,'warning')`, [siteA,siteB]);
    await client.query(`insert into tenant_usage_events(id,site_id,metric,decision,reason_code) values
       (gen_random_uuid(),$1,'ai','warning','a'),(gen_random_uuid(),$2,'ai','warning','b')`, [siteA,siteB]);
    await client.query(`insert into tenant_concurrency_leases(id,site_id,operation,expires_at) values
       (gen_random_uuid(),$1,'ai',now()+interval '1 hour'),(gen_random_uuid(),$2,'ai',now()+interval '1 hour')`, [siteA,siteB]);
    await client.query(`insert into site_external_integrations(id,site_id,provider,status,metadata) values
       (gen_random_uuid(),$1,'redi_control','active','{"secret":"a"}'),
       (gen_random_uuid(),$2,'redi_control','active','{"secret":"b"}')`, [siteA,siteB]);
    await client.query(`insert into site_integration_events(id,site_id,provider,action,details) values
       (gen_random_uuid(),$1,'redi_control','session_created','{"secret":"a"}'),
       (gen_random_uuid(),$2,'redi_control','session_created','{"secret":"b"}')`, [siteA,siteB]);
    await client.query(
      `insert into site_information_ad_slots(site_id,slot_key,format,enabled)
       values($1,'article_sidebar','rectangle',true),($2,'article_sidebar','rectangle',true)`,
      [siteA, siteB]);
    for (let index = 0; index < 300; index += 1) {
      const id = randomUUID();
      fixtureSiteIds.push(id);
      await client.query(
        `insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at)
         values($1,$2,'private',$3,now() + interval '1 day',now() + interval '31 days')`,
        [id, `rls-plan-${index}-${id.slice(0, 8)}`, {}]);
      await client.query("insert into site_features(site_id,feature_key,enabled) values($1,'website',true)", [id]);
      await client.query("insert into site_information_ad_slots(site_id,slot_key,format,enabled) values($1,'article_sidebar','rectangle',true)", [id]);
    }
  } finally { client.release(); }

  const runtime = new URL(adminUrl);
  runtime.username = testRole;
  runtime.password = password;
  const system = new URL(adminUrl);
  system.username = systemTestRole;
  system.password = systemPassword;
  const ownerConnection = new URL(adminUrl);
  ownerConnection.username = ownerTestRole;
  ownerConnection.password = ownerPassword;
  run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--no-file-parallelism", "packages/database/test/rls-pilot.integration.test.ts", "packages/database/test/rls-core-customer.integration.test.ts", "packages/database/test/rls-public-bootstrap.integration.test.ts", "packages/database/test/rls-appointments.integration.test.ts", "packages/database/test/rls-billing-system.integration.test.ts", "packages/database/test/rls-owner-security.integration.test.ts", "packages/database/test/rls-information-redi.integration.test.ts", "packages/database/test/rls-finder-demo-cleanup.integration.test.ts", "packages/database/test/rls-database-boundary-completion.integration.test.ts", "packages/database/test/rls-force-enforced.integration.test.ts", "packages/database/test/rls-privacy-foundation.integration.test.ts", "packages/database/test/rls-privacy-export.integration.test.ts", "packages/database/test/rls-customer-deletion.integration.test.ts", "packages/database/test/rls-operational-monitoring.integration.test.ts"], {
    RLS_TEST_ADMIN_DATABASE_URL: adminUrl,
    RLS_TEST_RUNTIME_DATABASE_URL: runtime.toString(),
    RLS_TEST_SYSTEM_DATABASE_URL: system.toString(),
    RLS_TEST_OWNER_DATABASE_URL: ownerConnection.toString(),
    RLS_TEST_SITE_A: siteA,
    RLS_TEST_SITE_B: siteB,
    RLS_TEST_SITE_DISABLED: siteDisabled,
    RLS_TEST_ACCOUNT_A: accountA,
    RLS_TEST_SESSION_A: sessionA,
    RLS_TEST_SESSION_B: sessionB,
    RLS_TEST_EXPIRED_SESSION: expiredSession,
    RLS_TEST_REVOKED_SESSION: revokedSession,
    RLS_TEST_DISABLED_SESSION: disabledSession,
    RLS_TEST_MIGRATOR_ROLE: roles.migrator,
    RLS_TEST_BOOTSTRAP_EXECUTOR_ROLE: roles.bootstrapExecutor,
    RLS_TEST_RUNTIME_EXECUTOR_ROLE: roles.runtimeExecutor,
    RLS_TEST_OWNER_EXECUTOR_ROLE: roles.ownerExecutor,
    RLS_TEST_SYSTEM_EXECUTOR_ROLE: roles.systemExecutor,
    RLS_TEST_SYSTEM_ROLE: roles.system,
    RLS_TEST_OWNER_ROLE: roles.owner,
    RLS_TEST_RUNTIME_ROLE: roles.runtime,
    DATABASE_RLS_MODE: "enforced",
  });
  await admin.query(
    `insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at)
     values($1,$2,'synthetic-local-hash','active','owner','synthetic-local-ciphertext',now())`,
    [setupOwnerId, `setup-${setupOwnerId}@example.test`],
  );
  const gateEnvironment = {
    DATABASE_RLS_MODE: "enforced",
    DATABASE_URL: "",
    MIGRATION_DATABASE_URL: adminUrl,
    DATABASE_RUNTIME_URL: runtime.toString(),
    DATABASE_SYSTEM_URL: system.toString(),
    DATABASE_OWNER_URL: ownerConnection.toString(),
    PLATFORM_PROFILE: "core",
    PUBLIC_APP_URL: "http://localhost:3000",
    OWNER_MFA_ENCRYPTION_KEY: setupMfaKey,
    PREVIEW_TOKEN_SECRET: randomBytes(32).toString("base64url"),
    CRON_SECRET: randomBytes(32).toString("base64url"),
  };
  run(process.execPath, ["scripts/setup-check.mjs"], gateEnvironment);
  run(process.execPath, ["scripts/release-preflight.mjs"], gateEnvironment);
  console.log("Dedicated PostgreSQL 16 enforced RLS suite passed.", {
    runtimeSuperuser: false,
    runtimeBypassRls: false,
    runtimeOwnsTables: false,
    forceRlsExpected: true,
  });
} finally {
  const client = await admin.connect();
  try {
    const sitesExist = (await client.query("select to_regclass('public.sites') as table_name")).rows[0]?.table_name;
    if (sitesExist) await client.query("delete from sites where id=any($1::text[])", [fixtureSiteIds]);
    if (sitesExist) await client.query("delete from owner_accounts where id=$1", [setupOwnerId]);
    await client.query(`drop role if exists ${quoteIdentifier(testRole)}`);
    await client.query(`drop role if exists ${quoteIdentifier(systemTestRole)}`);
    await client.query(`drop role if exists ${quoteIdentifier(ownerTestRole)}`);
  } finally {
    client.release();
    await admin.end();
  }
}
