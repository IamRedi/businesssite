// A fresh explicitly named disposable 077 -> 078 upgrade with complete row snapshots.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";
const url = process.env.MIGRATION_DATABASE_URL;
if (process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true" || url !== "postgresql://postgres@127.0.0.1:55456/p50021_custom_media_upgrade") throw new Error("Explicit fresh p50021_custom_media_upgrade loopback target required.");
const pool = new pg.Pool({ connectionString: url });
const dir = resolve(import.meta.dirname, "../db/migrations");
try {
  assert.equal((await pool.query("select to_regclass('public.sites') v")).rows[0].v, null);
  await pool.query("create table schema_migrations(name text primary key,applied_at timestamptz not null default now())");
  async function apply(name) { const c = await pool.connect(); try { await c.query("begin"); await c.query(readFileSync(resolve(dir,name),"utf8")); await c.query("insert into schema_migrations(name) values($1)",[name]); await c.query("commit"); } catch(e) { await c.query("rollback"); throw e; } finally { c.release(); } }
  for (const name of readdirSync(dir).filter(n=>/^\d+_.+\.sql$/.test(n)&&Number(n.slice(0,3))<=77).sort()) await apply(name);
  const provisionRoles = () => {
    const result=spawnSync(process.execPath,["scripts/provision-database-roles.mjs"],{stdio:"inherit",env:{...process.env,DATABASE_CREATE_ROLES:"true",DATABASE_RLS_MODE:"off",DATABASE_ROLE_PROVISIONING_ALLOW_LEGACY_SCHEMA:"true"}});
    assert.equal(result.status,0);
  };
  provisionRoles();
  for (const kind of ["business","information"]) { const id=randomUUID(); await pool.query("insert into sites(id,slug,visibility,site_kind,generated_document,custom_domain,custom_domain_status,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private',$3,$4,$5,'pending_dns',now()+interval '14 days',now()+interval '44 days')",[id,`upgrade-${id}`,kind,{content:{name:"Synthetic upgrade"},media:{galleryImageUrls:["/unchanged.webp"]},contact:{phone:"synthetic"},design:{version:"existing"},publicLegal:{legalBusinessName:"Synthetic legal"}},`${id}.example.test`]); }
  const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename<>'schema_migrations' order by tablename")).rows.map(r=>r.tablename);
  async function snapshot() { const result={}; for(const table of tables) { assert(/^[a-z_]+$/.test(table)); result[table]=(await pool.query(`select to_jsonb(t) v from "${table}" t order by to_jsonb(t)::text`)).rows; } return result; }
  const before=await snapshot(); await apply("078_owner_custom_media.sql"); assert.deepEqual(await snapshot(),before);
  provisionRoles();
  assert.deepEqual(await snapshot(),before);
  const hash=createHash("sha256").update(JSON.stringify(before)).digest("hex");
  console.log(JSON.stringify({result:"PASS",upgrade:"077 -> 078",unchangedTables:tables.length,allRowSnapshotSha256:hash,existingBusinessAndInformationDocumentsAndDomainsUnchanged:true}));
} finally { await pool.end(); }
