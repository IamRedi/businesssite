import type { PoolClient } from "pg";
import { assertRecoveryDataIntegrity, type RecoveryDataIntegrity } from "../packages/database/src/recovery";

// Server-side aggregation returns only counts/hashes, never customer row values.
// Call from the same exported read-only snapshot used by pg_dump.
export async function recoveryDataIntegrity(client: PoolClient): Promise<RecoveryDataIntegrity> {
  const deadline = Date.now() + 15 * 60_000;
  const relations = (await client.query<{ name: string }>(
    `select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in('r','p') order by c.relname`,
  )).rows;
  const tables: RecoveryDataIntegrity["tables"] = [];
  for (const { name } of relations) {
    if (Date.now() >= deadline) throw new Error("Snapshot data-integrity time budget exceeded.");
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("Snapshot table identifier is unsupported.");
    const { rows } = await client.query<{ rows: string; sha256: string }>(
      `select count(*)::text rows,
       encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text collate "C"),''),'UTF8')),'hex') sha256
       from public."${name}" t`,
    );
    tables.push({ name, rows: Number(rows[0].rows), sha256: rows[0].sha256 });
  }
  const result: RecoveryDataIntegrity = { method: "postgres-jsonb-sha256-v1", tables };
  assertRecoveryDataIntegrity(result);
  return result;
}
