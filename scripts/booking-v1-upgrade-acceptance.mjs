// Run only against the disposable 052-upgrade fixture database on loopback.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import pg from "pg";

const raw=process.env.BOOKING_LOCAL_UPGRADE_DATABASE_URL ?? "";
const url=new URL(raw);
if (url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" || url.port!=="55480" || url.pathname!=="/booking_local_upgrade")
  throw new Error("Exact disposable booking_local_upgrade database required.");
const pool=new pg.Pool({connectionString:raw});
try {
  const before=(await pool.query("select count(*)::int n from public.site_appointments")).rows[0].n;
  assert(before>0,"upgrade fixture must contain historical appointments");
  assert.equal((await pool.query("select count(*)::int n from schema_migrations where name='079_booking_v1_local.sql'")).rows[0].n,0);
  // This synthetic 052 fixture predates the known 066 ownership repair.
  const owner=(await pool.query(`select pg_get_userbyid(proowner) owner from pg_proc
    where oid='public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)'::regprocedure`)).rows[0].owner;
  const guard=(await pool.query(`select pg_get_userbyid(proowner) owner from pg_proc
    where oid='public.privacy_export_artifact_guard()'::regprocedure`)).rows[0].owner;
  assert.equal(guard,"bsrc_owner_executor");
  if (owner === "postgres") await pool.query("alter function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) owner to bsrc_owner_executor");
  else assert.equal(owner,guard);
  const run=spawnSync(process.execPath,["scripts/migrate.mjs"],{stdio:"inherit",env:{...process.env,DATABASE_MIGRATION_URL:raw,DATABASE_URL:raw}});
  assert.equal(run.status,0,"migrations through booking apply to preserved fixture");
  const after=(await pool.query("select count(*)::int n,count(booking_start)::int booked from public.site_appointments")).rows[0];
  assert.equal(after.n,before,"historical appointments survive all migrations");
  assert.equal(after.booked,0,"historical appointments keep null booking columns");
  assert.equal((await pool.query("select count(*)::int n from schema_migrations where name='083_booking_readiness_catalog.sql'")).rows[0].n,1);
  console.log("BOOKING LOCAL UPGRADE PRESERVATION PASS",{legacyAppointments:before});
} finally {await pool.end();}
