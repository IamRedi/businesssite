import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import {
  databaseRoleNames,
  migrationConnectionString,
  quoteIdentifier,
} from "./database-role-config.mjs";

const connectionString = migrationConnectionString();

const migrationsDirectory = resolve(import.meta.dirname, "../db/migrations");
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort();
const pool = new pg.Pool({ connectionString });
const roles = databaseRoleNames();
const classifiedRoutineOwners = new Set([
  roles.migrator,
  roles.runtimeExecutor,
  roles.bootstrapExecutor,
  roles.ownerExecutor,
  roles.systemExecutor,
]);

async function migrationExecutionRole(client, source) {
  const directive = source.match(/^-- migrate-as-owner-of: (public\.[a-z_][a-z0-9_]*\([^\r\n]*\))$/m)?.[1];
  if (!directive) return undefined;
  const currentRole = (await client.query("select current_user role")).rows[0].role;
  const owner = (await client.query(
    "select pg_get_userbyid(p.proowner) owner from pg_proc p where p.oid=to_regprocedure($1)",
    [directive],
  )).rows[0]?.owner;
  if (!owner) throw new Error(`Migration owner directive cannot resolve ${directive}.`);
  if (owner === currentRole) return undefined;
  if (!classifiedRoutineOwners.has(owner))
    throw new Error(`Migration owner directive refused unclassified owner ${owner}.`);
  const canSetRole = (await client.query(
    "select pg_has_role(current_user,$1,'member') allowed",
    [owner],
  )).rows[0]?.allowed;
  if (!canSetRole) throw new Error(`Migration connection cannot assume classified owner ${owner}.`);
  const hadSchemaCreate = (await client.query(
    "select has_schema_privilege($1,'public','create') allowed",
    [owner],
  )).rows[0]?.allowed;
  if (!hadSchemaCreate)
    await client.query(`grant usage,create on schema public to ${quoteIdentifier(owner)}`);
  return { role: owner, revokeSchemaCreate: !hadSchemaCreate };
}

async function executeSegmentedMigration(client, source) {
  const marker = /^-- migrate-(as-migrator|as-owner-of: (public\.[a-z_][a-z0-9_]*\([^\r\n]*\)))$/gm;
  const segments = [];
  let anchor;
  let cursor = 0;
  for (const match of source.matchAll(marker)) {
    segments.push({ anchor, sql: source.slice(cursor, match.index) });
    anchor = match[1] === "as-migrator" ? undefined : match[2];
    cursor = match.index + match[0].length;
  }
  segments.push({ anchor, sql: source.slice(cursor) });

  for (const segment of segments) {
    if (!segment.sql.trim()) continue;
    const execution = segment.anchor
      ? await migrationExecutionRole(
          client,
          `-- migrate-as-owner-of: ${segment.anchor}\n${segment.sql}`,
        )
      : undefined;
    if (execution) await client.query(`set local role ${quoteIdentifier(execution.role)}`);
    let segmentCompleted = false;
    try {
      await client.query(segment.sql);
      segmentCompleted = true;
    } finally {
      // A failed statement leaves the transaction aborted. Let the outer
      // rollback restore SET LOCAL and transactional grants instead of masking
      // the original error with a cleanup query that PostgreSQL must reject.
      if (execution && segmentCompleted) {
        await client.query("reset role");
        if (execution.revokeSchemaCreate)
          await client.query(`revoke create on schema public from ${quoteIdentifier(execution.role)}`);
      }
    }
  }
}

try {
  await pool.query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await pool.query("select name from schema_migrations")).rows.map((row) => row.name),
  );
  const legacyMigrations = migrations.filter((name) => Number(name.slice(0, 3)) < 10);
  if (applied.size === 0 && legacyMigrations.length) {
    const requiredTables = [
      "leads",
      "prepared_business_profiles",
      "sites",
      "demo_sites",
      "site_admin_accounts",
      "site_media_blobs",
      "subscriber_intakes",
      "payment_webhook_events",
    ];
    const existing = new Set(
      (await pool.query("select tablename from pg_tables where schemaname='public'")).rows.map((row) => row.tablename),
    );
    if (requiredTables.every((table) => existing.has(table))) {
      for (const name of legacyMigrations) {
        await pool.query("insert into schema_migrations(name) values($1) on conflict do nothing", [name]);
        applied.add(name);
      }
      console.log("Baselined verified legacy migrations 001-009.");
    }
  }

  for (const name of migrations) {
    if (applied.has(name)) continue;
    const source = readFileSync(join(migrationsDirectory, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (source.includes("-- migrate-as-migrator")) {
        await executeSegmentedMigration(client, source);
      } else {
        const execution = await migrationExecutionRole(client, source);
        if (execution)
          await client.query(`set local role ${quoteIdentifier(execution.role)}`);
        await client.query(source);
        if (execution) {
          await client.query("reset role");
          if (execution.revokeSchemaCreate)
            await client.query(`revoke create on schema public from ${quoteIdentifier(execution.role)}`);
        }
      }
      await client.query("insert into schema_migrations(name) values($1)", [name]);
      await client.query("commit");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
