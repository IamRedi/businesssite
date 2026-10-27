import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { migrationConnectionString } from "./database-role-config.mjs";
if (process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true") throw new Error("Explicit disposable target required");
const url = migrationConnectionString();
const parsed = new URL(url);
if (!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname)) throw new Error("Appointment upgrade requires a loopback disposable PostgreSQL target");
const root = resolve(import.meta.dirname,"..");
const temporary = mkdtempSync(join(tmpdir(),"bsrc-appt002-upgrade-"));
const pool = new pg.Pool({connectionString:url,application_name:"bsrc-appt002-synthetic-upgrade"});
function run(file, cwd = root, extra = {}) {
  const result = spawnSync(process.execPath,[file],{cwd,stdio:"inherit",env:{...process.env,...extra,MIGRATION_DATABASE_URL:url,DATABASE_RLS_MODE:"off",RLS_TEST_DISPOSABLE_DATABASE:"true"}});
  if (result.status !== 0) throw new Error("Appointment disposable subprocess failed: "+file);
}
try {
  if ((await pool.query("select to_regclass('public.sites') existing")).rows[0].existing) throw new Error("Use a fresh separate disposable upgrade database");
  if (Number((await pool.query("show server_version_num")).rows[0].server_version_num)<160000) throw new Error("PostgreSQL 16+ required");
  mkdirSync(join(temporary,"scripts")); mkdirSync(join(temporary,"db/migrations"),{recursive:true});
  symlinkSync(join(root,"node_modules"),join(temporary,"node_modules"),"dir");
  for (const file of ["migrate.mjs","provision-database-roles.mjs","database-role-config.mjs"])
    copyFileSync(join(root,"scripts",file),join(temporary,"scripts",file));
  for (const file of readdirSync(join(root,"db/migrations")).filter(name => /^\d+_.+\.sql$/.test(name) && Number(name.slice(0,3))<=70))
    copyFileSync(join(root,"db/migrations",file),join(temporary,"db/migrations",file));
  run(join(temporary,"scripts/migrate.mjs"),temporary);
  run(join(temporary,"scripts/provision-database-roles.mjs"),temporary,{DATABASE_CREATE_ROLES:"true",DATABASE_ROLE_PROVISIONING_ALLOW_LEGACY_SCHEMA:"true"});
  const site = randomUUID();
  await pool.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private','{}',now()+interval '14 days',now()+interval '44 days')",[site,"upgrade-"+site]);
  await pool.query("insert into site_appointments(id,site_id,customer_name,phone,service_title,preferred_date,preferred_time,customer_message,status) values(gen_random_uuid(),$1,'Synthetic legacy requested','000','Legacy civil time','2026-10-25','02:30','Synthetic historical note','requested'),(gen_random_uuid(),$1,'Synthetic legacy confirmed','001',null,null,null,null,'confirmed')",[site]);
  const before = (await pool.query("select to_jsonb(a) value from site_appointments a where site_id=$1 order by id",[site])).rows;
  const policyBefore = (await pool.query("select to_jsonb(p) value from privacy_policy_versions p order by id")).rows;
  run(join(root,"scripts/migrate.mjs"));
  const after = (await pool.query("select to_jsonb(a)-array['receipt_key_digest','request_fingerprint','fingerprint_key_version','receipt_expires_at','request_service_id','appointment_version']::text[] value from site_appointments a where site_id=$1 order by id",[site])).rows;
  if (JSON.stringify(before)!==JSON.stringify(after)) throw new Error("070->071 changed legacy appointment fields");
  if (JSON.stringify(policyBefore)!==JSON.stringify((await pool.query("select to_jsonb(p) value from privacy_policy_versions p order by id")).rows)) throw new Error("070->071 changed approved policy");
  const legacy = (await pool.query("select count(*)::int n from site_appointments where site_id=$1 and receipt_key_digest is null and receipt_expires_at is null and appointment_version=1",[site])).rows[0].n;
  if (legacy!==2) throw new Error("Legacy rows were silently assigned receipt authority");
  run(join(root,"scripts/provision-database-roles.mjs"),root,{DATABASE_CREATE_ROLES:"true"});
  console.log("070->071 affected upgrade PASS: provisioned baseline, unchanged civil-time/status/PII fixtures and policy, no receipt backfill.");
  await pool.query("delete from sites where id=$1",[site]);
  // The normal runner provides separate least-privilege login members and all
  // standard RLS assertions, including the APPT002 concurrency/failure suite.
  run(join(root,"scripts/rls-pilot-test.mjs"));
} finally { await pool.end(); rmSync(temporary,{recursive:true,force:true}); }
