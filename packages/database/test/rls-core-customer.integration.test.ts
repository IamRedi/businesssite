import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { withAuthenticatedSiteAdminContext, type DatabaseContextClient } from "../src/index";

const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const run = Boolean(runtimeUrl && adminUrl);

describe.skipIf(!run)("PostgreSQL 16 core customer RLS", () => {
  const runtime = new Pool({ connectionString: runtimeUrl, max: 4, allowExitOnIdle: true });
  const admin = new Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const siteA = process.env.RLS_TEST_SITE_A!;
  const siteB = process.env.RLS_TEST_SITE_B!;
  const sessionA = process.env.RLS_TEST_SESSION_A!;
  const sessionB = process.env.RLS_TEST_SESSION_B!;
  async function withTrustedSiteContext<T>(pool: Pool, siteId: string, callback: (client: DatabaseContextClient) => Promise<T>) {
    const value = await withAuthenticatedSiteAdminContext(pool, siteId === siteA ? sessionA : sessionB, (client) => callback(client), { expectedSiteId: siteId });
    if (value === null) throw new Error("trusted fixture session was denied");
    return value;
  }

  afterAll(async () => { await runtime.end(); await admin.end(); });

  const tenantQueries = [
    ["sites", "select id as site_id from sites"],
    ["site_media", "select site_id from site_media"],
    ["site_media_blobs", "select site_id from site_media_blobs"],
    ["site_appointments", "select site_id from site_appointments"],
    ["ai_runs", "select site_id from ai_runs"],
    ["tenant_usage_counters", "select site_id from tenant_usage_counters"],
    ["tenant_usage_states", "select site_id from tenant_usage_states"],
    ["tenant_usage_events", "select site_id from tenant_usage_events"],
    ["tenant_concurrency_leases", "select site_id from tenant_concurrency_leases"],
    ["site_external_integrations", "select site_id from site_external_integrations"],
    ["site_integration_events", "select site_id from site_integration_events"],
  ] as const;

  it.each(tenantQueries)("isolates %s reads to the current site", async (_table, sql) => {
    const a = await withTrustedSiteContext(runtime, siteA, (client) => client.query(sql));
    const b = await withTrustedSiteContext(runtime, siteB, (client) => client.query(sql));
    expect(new Set(a.rows.map((row) => row.site_id))).toEqual(new Set([siteA]));
    expect(new Set(b.rows.map((row) => row.site_id))).toEqual(new Set([siteB]));
  });

  it.each(tenantQueries)("returns no %s rows without transaction context", async (_table, sql) => {
    expect((await runtime.query(sql)).rows).toEqual([]);
  });

  it.each(["site_admin_accounts", "site_admin_sessions", "site_admin_password_resets"])(
    "denies direct runtime access to auth table %s", async (table) => {
      await expect(runtime.query(`select * from ${table}`)).rejects.toThrow(/permission denied/i);
    },
  );

  it.each([
    ["unknown", "f".repeat(64)],
    ["expired", process.env.RLS_TEST_EXPIRED_SESSION!],
    ["revoked", process.env.RLS_TEST_REVOKED_SESSION!],
    ["disabled", process.env.RLS_TEST_DISABLED_SESSION!],
  ])("rejects %s sessions before context creation", async (_kind, hash) => {
    const result = await withAuthenticatedSiteAdminContext(runtime, hash, async () => "unexpected");
    expect(result).toBeNull();
  });

  it("resolves an active hash and scopes the same transaction", async () => {
    const resolved = await withAuthenticatedSiteAdminContext(runtime, sessionA, async (client, account) => ({
      account,
      rows: (await client.query("select id from sites")).rows,
    }));
    expect(resolved?.account).toMatchObject({ siteId: siteA, preferredLocale: "en" });
    expect(resolved?.rows).toEqual([{ id: siteA }]);
    expect(JSON.stringify(resolved)).not.toContain(sessionA);
  });

  it("rejects an authenticated A session when B is expected", async () => {
    expect(await withAuthenticatedSiteAdminContext(runtime, sessionA, async () => true, { expectedSiteId: siteB })).toBeNull();
  });

  it("keeps session rotation, password change and reset atomic behind auth routines", async () => {
    const authSite = randomUUID();
    const authAccount = randomUUID();
    const email = `auth-${authSite}@example.test`;
    await admin.query(
      "insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$1,'private','{}',now()+interval '1 day',now()+interval '31 days')",
      [authSite],
    );
    await admin.query(
      "insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,$3,'auth-hash')",
      [authAccount, authSite, email],
    );
    try {
      const account = (await runtime.query("select * from site_admin_login_lookup($1)", [email])).rows[0];
      expect(account).toMatchObject({ site_id: authSite, password_hash: "auth-hash" });
      const session = "c".repeat(64);
      expect((await runtime.query("select site_admin_create_session($1,$2,$3,now()+interval '1 hour') as ok", [account.account_id,"wrong",session])).rows[0].ok).toBe(false);
      expect((await runtime.query("select site_admin_create_session($1,$2,$3,now()+interval '1 hour') as ok", [account.account_id,"auth-hash",session])).rows[0].ok).toBe(true);
      expect((await runtime.query("select site_admin_change_password($1,$2,$3,$4) as ok", [session,account.account_id,"auth-hash","auth-hash-new"])).rows[0].ok).toBe(true);
      expect((await runtime.query("select * from site_admin_resolve_session($1)", [session])).rows).toEqual([]);
      const reset = "d".repeat(64);
      expect((await runtime.query("select site_admin_create_password_reset($1,$2,now()+interval '1 hour') as ok", [account.account_id,reset])).rows[0].ok).toBe(true);
      expect((await runtime.query("select site_admin_consume_password_reset($1,$2) as ok", [reset,"auth-hash-reset"])).rows[0].ok).toBe(true);
      expect((await runtime.query("select site_admin_consume_password_reset($1,$2) as ok", [reset,"replay"])).rows[0].ok).toBe(false);
      expect(await withAuthenticatedSiteAdminContext(runtime, sessionB, async (_client, canonical) => canonical.siteId, { expectedSiteId: siteB })).toBe(siteB);
    } finally {
      await admin.query("delete from sites where id=$1", [authSite]);
    }
  });

  it("prevents protected site-column updates and raw insert/delete", async () => {
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update sites set activated_at=now() where id=$1", [siteA]))).rejects.toThrow(/permission denied/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update sites set id=$2 where id=$1", [siteA, siteB]))).rejects.toThrow(/permission denied/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private','{}',now(),now())", [randomUUID(), randomUUID()]))).rejects.toThrow(/permission denied/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("delete from sites where id=$1", [siteA]))).rejects.toThrow(/permission denied/i);
  });

  it("allows only own-site editable site columns", async () => {
    const own = await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update sites set generated_document=$2 where id=$1 returning id", [siteA, { title: "A" }]));
    expect(own.rows).toEqual([{ id: siteA }]);
    const cross = await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update sites set generated_document=$2 where id=$1 returning id", [siteB, { title: "B" }]));
    expect(cross.rows).toEqual([]);
  });

  it("blocks cross-site media/blob creation", async () => {
    await expect(withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "insert into site_media(id,site_id,slot,url) values(gen_random_uuid(),$1,'gallery','https://example.test/x')", [siteB],
    ))).rejects.toThrow(/row-level security/i);
    await expect(withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "insert into site_media_blobs(id,site_id,filename,content_type,data) values(gen_random_uuid(),$1,'x.webp','image/webp','\\x01')", [siteB],
    ))).rejects.toThrow(/row-level security/i);
  });

  it("allows appointment status changes only for own rows and denies public insert", async () => {
    expect((await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update site_appointments set status='confirmed' where site_id=$1", [siteB]))).rowCount).toBe(0);
    expect((await withTrustedSiteContext(runtime, siteA, (client) =>
      client.query("update site_appointments set status='confirmed' where site_id=$1", [siteA]))).rowCount).toBe(1);
    await expect(withTrustedSiteContext(runtime, siteA, (client) => client.query(
      "insert into site_appointments(id,site_id,customer_name,phone) values(gen_random_uuid(),$1,'x','1')", [siteA],
    ))).rejects.toThrow(/permission denied/i);
  });

  it("denies arbitrary AI, usage, lease and integration mutations", async () => {
    for (const sql of [
      "insert into ai_runs(id,actor_type,actor_id,operation,site_id,provider,model) values(gen_random_uuid(),'site_admin','x','text_rewrite',$1,'x','x')",
      "update tenant_usage_counters set quantity=999 where site_id=$1",
      "insert into tenant_concurrency_leases(id,site_id,operation,expires_at) values(gen_random_uuid(),$1,'x',now())",
      "update site_external_integrations set status='active' where site_id=$1",
      "insert into site_integration_events(id,site_id,provider,action) values(gen_random_uuid(),$1,'redi_control','session_created')",
    ]) await expect(withTrustedSiteContext(runtime, siteA, (client) => client.query(sql, [siteA]))).rejects.toThrow(/permission denied/i);
  });

  it("does not expose blob bytes, integration metadata, or event details", async () => {
    for (const sql of [
      "select data from site_media_blobs",
      "select metadata from site_external_integrations",
      "select details from site_integration_events",
    ]) await expect(withTrustedSiteContext(runtime, siteA, (client) => client.query(sql))).rejects.toThrow(/permission denied/i);
  });

  it("locks auth routines to runtime and the FORCE-aware bootstrap executor", async () => {
    const rows = (await admin.query(
      `select p.proname,r.rolname as owner,p.prosecdef,
              p.proconfig @> array['search_path=pg_catalog'] as fixed_path,
              has_function_privilege('public',p.oid,'execute') as public_execute
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
       where n.nspname='public' and p.proname like 'site_admin_%' and p.proname in
         ('site_admin_login_lookup','site_admin_resolve_session','site_admin_create_session','site_admin_revoke_session','site_admin_create_password_reset','site_admin_consume_password_reset','site_admin_change_password','site_admin_site_available','site_admin_access_snapshot')`,
    )).rows;
    expect(rows).toHaveLength(9);
    for (const row of rows) expect(row).toMatchObject({ prosecdef: true, fixed_path: true, public_execute: false });
    expect(new Set(rows.map((row) => row.owner))).toEqual(new Set([process.env.RLS_TEST_BOOTSTRAP_EXECUTOR_ROLE]));
  });

  it("resists malicious search_path and temporary-object shadowing", async () => {
    const client = await runtime.connect();
    try {
      await client.query("create temporary table site_admin_sessions(token_hash text)");
      await client.query("set search_path=pg_temp,public");
      expect((await client.query("select * from public.site_admin_resolve_session($1)", [sessionA])).rows[0]).toMatchObject({ site_id: siteA });
    } finally { client.release(); }
  });

  it("has FORCE RLS and runtime owns no protected relation", async () => {
    const rows = (await admin.query(
      `select c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname as owner
       from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner
       where n.nspname='public' and c.relname=any($1::text[])`, [tenantQueries.map(([table]) => table)],
    )).rows;
    expect(rows).toHaveLength(tenantQueries.length);
    for (const row of rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
      expect(row.owner).not.toBe("bsrc_runtime");
    }
  });

  it("uses tenant indexes in representative B2 plans", async () => {
    const plans = await withTrustedSiteContext(runtime, siteA, async (client) => {
      const sql = [
        "select generated_document from sites where id=$1",
        "select id from site_media where site_id=$1 order by slot,sort_order",
        "select id from site_appointments where site_id=$1 order by created_at desc",
        "select id from ai_runs where site_id=$1 order by created_at desc",
        "select quantity from tenant_usage_counters where site_id=$1 and metric='ai'",
        "select status from site_external_integrations where site_id=$1 and provider='redi_control'",
      ];
      const results = [];
      for (const query of sql)
        results.push(await client.query("explain (analyze,buffers,format text) " + query, [siteA]));
      return results;
    });
    const text = plans.flatMap((result) => result.rows.map((row) => row["QUERY PLAN"])).join("\n");
    expect(text).toMatch(/sites_pkey|site_media_site_idx|site_appointments_site_idx|ai_runs_site_idx|tenant_usage_counters_pkey|site_external_integrations_site_id_provider_key|Index Scan|Bitmap/);
    console.log("B2 EXPLAIN evidence (303 sites; synthetic local fixture)\n" + text);
  });
});
