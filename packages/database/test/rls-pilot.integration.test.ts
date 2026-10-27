import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withAuthenticatedSiteAdminContext, type DatabaseContextClient } from "../src/index";

const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const run = Boolean(runtimeUrl && adminUrl);

describe.skipIf(!run)("PostgreSQL 16 pilot RLS", () => {
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2, allowExitOnIdle: true });
  const admin = new Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const siteA = process.env.RLS_TEST_SITE_A!;
  const siteB = process.env.RLS_TEST_SITE_B!;
  const sessionA = process.env.RLS_TEST_SESSION_A!;
  const sessionB = process.env.RLS_TEST_SESSION_B!;
  const migratorRole = process.env.RLS_TEST_MIGRATOR_ROLE!;
  const systemRole = process.env.RLS_TEST_SYSTEM_ROLE!;
  async function withTrustedSiteContext<T>(pool: Pool, siteId: string, callback: (client: DatabaseContextClient) => Promise<T>) {
    const value = await withAuthenticatedSiteAdminContext(pool, siteId === siteA ? sessionA : sessionB, (client) => callback(client), { expectedSiteId: siteId });
    if (value === null) throw new Error("trusted fixture session was denied");
    return value;
  }

  beforeAll(async () => {
    expect(siteA).toMatch(/^[0-9a-f-]{36}$/);
    expect(siteB).toMatch(/^[0-9a-f-]{36}$/);
    expect(migratorRole).toMatch(/^[a-z_][a-z0-9_]{0,62}$/);
    expect(systemRole).toMatch(/^[a-z_][a-z0-9_]{0,62}$/);
  });
  afterAll(async () => {
    await runtime.end();
    await admin.end();
  });

  it("denies rows when context is missing or malformed", async () => {
    expect((await runtime.query("select * from site_features")).rows).toEqual([]);
    const client = await runtime.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('app.actor_kind','site_admin',true),set_config('app.site_id','malformed',true)");
      expect((await client.query("select * from site_features")).rows).toEqual([]);
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("isolates tenant A and B reads", async () => {
    const a = await withTrustedSiteContext(runtime, siteA, (client) => client.query("select site_id from site_features order by site_id"));
    const b = await withTrustedSiteContext(runtime, siteB, (client) => client.query("select site_id from site_features order by site_id"));
    expect(new Set(a.rows.map((row) => row.site_id))).toEqual(new Set([siteA]));
    expect(new Set(b.rows.map((row) => row.site_id))).toEqual(new Set([siteB]));
  });

  it("blocks cross-tenant update, delete, insert, and A-to-B reassignment", async () => {
    const update = await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update site_features set enabled=false where site_id=$1", [siteB]));
    expect(update.rowCount).toBe(0);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("delete from site_features where site_id=$1", [siteB]))).rejects.toThrow(/permission denied/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("insert into site_features(site_id,feature_key,enabled) values($1,'media',true)", [siteB]))).rejects.toThrow(/row-level security/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update site_features set site_id=$2 where site_id=$1 and feature_key='website'", [siteA, siteB]))).rejects.toThrow(/row-level security/i);
  });

  it("does not leak context across commit, rollback, reused pooled clients, or direct queries", async () => {
    const singleClientPool = new Pool({ connectionString: runtimeUrl, max: 1, allowExitOnIdle: true });
    try {
      const first = await withTrustedSiteContext(singleClientPool, siteA, (client) =>
        client.query("select pg_backend_pid() as pid,array_agg(distinct site_id) as sites from site_features"));
      expect(first.rows[0].sites).toEqual([siteA]);
      expect((await singleClientPool.query("select * from site_features")).rows).toEqual([]);
      await expect(withTrustedSiteContext(singleClientPool, siteB, async (client) => {
        await client.query("select * from site_features");
        throw new Error("forced rollback");
      })).rejects.toThrow("forced rollback");
      expect((await singleClientPool.query("select * from site_features")).rows).toEqual([]);
      const second = await withTrustedSiteContext(singleClientPool, siteB, (client) =>
        client.query("select pg_backend_pid() as pid,array_agg(distinct site_id) as sites from site_features"));
      expect(second.rows[0].pid).toBe(first.rows[0].pid);
      expect(second.rows[0].sites).toEqual([siteB]);
    } finally { await singleClientPool.end(); }
  });

  it("keeps concurrent tenant operations separate", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const siteId = index % 2 ? siteB : siteA;
      const result = await withTrustedSiteContext(runtime, siteId, (client) =>
        client.query("select distinct site_id from site_features"));
      return { siteId, seen: result.rows.map((row) => row.site_id) };
    }));
    for (const result of results) expect(result.seen).toEqual([result.siteId]);
  });

  it("cleans a pre-existing session setting instead of relying on it", async () => {
    const singleClientPool = new Pool({ connectionString: runtimeUrl, max: 1, allowExitOnIdle: true });
    try {
      const client = await singleClientPool.connect();
      try {
        await client.query("select set_config('app.actor_kind','site_admin',false),set_config('app.site_id',$1,false)", [siteA]);
      } finally { client.release(); }
      await withTrustedSiteContext(singleClientPool, siteB, async (scoped) => {
        expect((await scoped.query("select distinct site_id from site_features")).rows).toEqual([{ site_id: siteB }]);
      });
      expect((await singleClientPool.query("select * from site_features")).rows).toEqual([]);
    } finally { await singleClientPool.end(); }
  });

  it("allows ad-slot reads only for the scoped tenant and denies customer mutation", async () => {
    const a = await withTrustedSiteContext(runtime, siteA, (client) => client.query("select site_id from site_information_ad_slots"));
    expect(a.rows).toEqual([{ site_id: siteA }]);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update site_information_ad_slots set enabled=false where site_id=$1", [siteA]))).rejects.toThrow(/permission denied/i);
    expect((await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("select * from site_information_ad_slots where site_id=$1", [siteB]))).rows).toEqual([]);
  });

  it("cannot perform DDL, alter policies, or SET ROLE into privileged roles", async () => {
    await expect(runtime.query(`create table rls_escape_${randomUUID().replaceAll("-", "")} (id int)`)).rejects.toThrow(/permission denied/i);
    await expect(runtime.query("alter table site_features disable row level security")).rejects.toThrow(/must be owner|permission denied/i);
    await expect(runtime.query(`set role "${migratorRole}"`)).rejects.toThrow(/permission denied/i);
    await expect(runtime.query(`set role "${systemRole}"`)).rejects.toThrow(/permission denied/i);
  });

  it("uses existing site_id indexes in the pilot query plans", async () => {
    await admin.query("analyze site_features");
    await admin.query("analyze site_information_ad_slots");
    const featurePlan = await withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "explain (analyze, buffers, format text) select enabled from site_features where site_id=$1 and feature_key='website'", [siteA]));
    const updatePlan = await withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "explain (analyze, buffers, format text) update site_features set enabled=enabled where site_id=$1 and feature_key='website'", [siteA]));
    const adSlotPlan = await withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "explain (analyze, buffers, format text) select slot_key from site_information_ad_slots where site_id=$1 and enabled", [siteA]));
    const plans = [...featurePlan.rows, ...updatePlan.rows, ...adSlotPlan.rows].map((row) => row["QUERY PLAN"]).join("\n");
    expect(plans).toMatch(/site_features_pkey|Index Scan|Index Only Scan/);
    expect(plans).toMatch(/site_information_ad_slots_enabled_idx/);
    console.log("Pilot EXPLAIN evidence\n" + plans);
  });
});
