import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { migrationConnectionString } from "./database-role-config.mjs";

const connectionString = migrationConnectionString();
const directory = resolve(import.meta.dirname, "../db/migrations");
const expected = readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
const pool = new pg.Pool({ connectionString });
try {
  const table = await pool.query("select to_regclass('public.schema_migrations') as name");
  const applied = table.rows[0]?.name
    ? new Set((await pool.query("select name from schema_migrations")).rows.map((row) => row.name))
    : new Set();
  for (const name of expected) console.log(`${applied.has(name) ? "applied" : "pending"}  ${name}`);
  if (expected.some((name) => !applied.has(name))) process.exitCode = 2;
} finally {
  await pool.end();
}
