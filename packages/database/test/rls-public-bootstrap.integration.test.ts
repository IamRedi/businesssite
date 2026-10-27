import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const run = Boolean(runtimeUrl && adminUrl);

describe.skipIf(!run)("PostgreSQL 16 public bootstrap RLS boundaries", () => {
  const runtime = new Pool({ connectionString: runtimeUrl, max: 4, allowExitOnIdle: true });
  const admin = new Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const ids = Array.from({ length: 9 }, () => randomUUID());
  const [publicA, publicB, privateA, graceA, readOnlyA, noFeatureA, cancelledA, expiredPreviewSite, revokedPreviewSite] = ids;
  const tokenValid = randomUUID();
  const tokenExpired = randomUUID();
  const tokenRevoked = randomUUID();
  const slug = (label: string, id: string) => `b3a-${label}-${id.slice(0, 8)}`;

  beforeAll(async () => {
    const values = [
      [publicA,"public-a","public","a.example.test"],
      [publicB,"public-b","public","b.example.test"],
      [privateA,"private-a","private",null],
      [graceA,"grace-a","public","grace.example.test"],
      [readOnlyA,"readonly-a","public",null],
      [noFeatureA,"nofeature-a","public",null],
      [cancelledA,"cancelled-a","public",null],
      [expiredPreviewSite,"expired-preview","private",null],
      [revokedPreviewSite,"revoked-preview","private",null],
    ] as const;
    for (const [id,label,visibility,domain] of values) {
      await admin.query(
        `insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,custom_domain,custom_domain_status)
         values($1,$2,$3,'public',$4,now()+interval '14 days',now()+interval '44 days',case when $3='public' then now() else null end,$5::text,case when $5::text is null then 'not_requested' else 'verified' end)`,
        [id,slug(label,id),visibility,{ id,slug: slug(label,id),business:{ name: label } },domain],
      );
    }
    for (const id of [publicA,publicB,privateA,graceA,readOnlyA,cancelledA])
      await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'appointment_requests',true)", [id]);
    for (const id of [publicA,publicB,noFeatureA])
      await admin.query("insert into site_subscriptions(site_id,status,plan_key) values($1,'active','starter')", [id]);
    await admin.query(`insert into site_subscriptions(site_id,status,plan_key,first_past_due_at,payment_grace_ends_at,suspended_at,read_only_ends_at)
      values($1,'past_due','starter',now()-interval '1 day',now()+interval '6 days',now()+interval '6 days',now()+interval '36 days'),
            ($2,'past_due','starter',now()-interval '10 days',now()-interval '3 days',now()-interval '3 days',now()+interval '27 days')`, [graceA,readOnlyA]);
    await admin.query("insert into site_subscriptions(site_id,status,plan_key,suspended_at,read_only_ends_at) values($1,'canceled','starter',now()-interval '40 days',now()-interval '10 days')", [cancelledA]);
    await admin.query(`insert into site_preview_tokens(token_id,site_id,expires_at,revoked_at) values
      ($1,$2,now()+interval '1 day',null),($3,$4,now()-interval '1 day',null),($5,$6,now()+interval '1 day',now())`,
      [tokenValid,privateA,tokenExpired,expiredPreviewSite,tokenRevoked,revokedPreviewSite]);
  });

  afterAll(async () => {
    await admin.query("delete from sites where id=any($1::text[])", [ids]);
    await runtime.end();
    await admin.end();
  });

  it("resolves one exact public slug and never a neighboring tenant", async () => {
    expect((await runtime.query("select * from resolve_public_site_by_slug($1)", [slug("public-a",publicA)])).rows[0]?.site_id).toBe(publicA);
    expect((await runtime.query("select * from resolve_public_site_by_slug($1)", [slug("public-b",publicB)])).rows[0]?.site_id).toBe(publicB);
    for (const value of ["", "../tenant", slug("public-a",publicA)+"-suffix", "UNKNOWN"])
      expect((await runtime.query("select * from resolve_public_site_by_slug($1)", [value])).rows).toEqual([]);
  });

  it("fails closed for private, read-only, locked and missing-entitlement sites", async () => {
    for (const [label,id] of [["private-a",privateA],["readonly-a",readOnlyA],["cancelled-a",cancelledA],["nofeature-a",noFeatureA]] as const)
      expect((await runtime.query("select * from resolve_public_site_by_slug($1)", [slug(label,id)])).rows).toEqual([]);
    expect((await runtime.query("select * from resolve_public_site_by_slug($1)", [slug("grace-a",graceA)])).rows[0]?.site_id).toBe(graceA);
  });

  it("resolves only an exact normalized verified custom domain", async () => {
    expect((await runtime.query("select * from resolve_public_site_by_domain('a.example.test')")).rows[0]?.site_id).toBe(publicA);
    for (const value of ["A.EXAMPLE.TEST","www.a.example.test","a.example.test.","a.example.test:443","example.test","evil-a.example.test"])
      expect((await runtime.query("select * from resolve_public_site_by_domain($1)", [value])).rows).toEqual([]);
  });

  it("resolves only a live exact preview token", async () => {
    expect((await runtime.query("select * from resolve_private_preview($1)", [tokenValid])).rows[0]?.site_id).toBe(privateA);
    for (const value of [tokenExpired,tokenRevoked,randomUUID()])
      expect((await runtime.query("select * from resolve_private_preview($1)", [value])).rows).toEqual([]);
  });

  it("creates one server-owned request without accepting tenant or status authority", async () => {
    const result = (await runtime.query(
      "select * from create_public_appointment_request($1,$2,$3,$4,$5,$6,$7,$8)",
      [slug("public-a",publicA),"Ada","123",null,"Consultation","2026-09-01","10:00","Public message"],
    )).rows[0];
    expect(result).toMatchObject({ site_id: publicA, status: "requested", message: "Public message" });
    expect((await admin.query("select customer_message,note,status from site_appointments where id=$1", [result.appointment_id])).rows[0]).toEqual({ customer_message: "Public message", note: null, status: "requested" });
  });

  it("denies private, locked and missing-entitlement appointment targets", async () => {
    for (const [label,id] of [["private-a",privateA],["cancelled-a",cancelledA],["nofeature-a",noFeatureA]] as const)
      expect((await runtime.query("select * from create_public_appointment_request($1,'Ada','123')", [slug(label,id)])).rows).toEqual([]);
  });

  it("exposes routines, not raw public data tables", async () => {
    for (const table of ["site_preview_tokens","site_subscriptions"])
      await expect(runtime.query(`select * from ${table}`)).rejects.toThrow(/permission denied/i);
    await expect(runtime.query("insert into site_appointments(id,site_id,customer_name,phone) values(gen_random_uuid(),$1,'x','1')", [publicA])).rejects.toThrow(/permission denied/i);
  });

  it("locks the four public routines to bootstrap-executor ownership and fixed paths", async () => {
    const names = ["resolve_public_site_by_slug","resolve_public_site_by_domain","resolve_private_preview","create_public_appointment_request"];
    const rows = (await admin.query(
      `select p.proname,r.rolname owner,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,
              has_function_privilege('public',p.oid,'execute') public_execute,pg_get_functiondef(p.oid) definition
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
       where n.nspname='public' and p.proname=any($1::text[])`, [names],
    )).rows;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatchObject({ owner: process.env.RLS_TEST_BOOTSTRAP_EXECUTOR_ROLE, prosecdef: true, fixed_path: true, public_execute: false });
      expect(row.definition).not.toMatch(/\bexecute\b/i);
    }
  });

  it("leaves runtime with only the approved application-routine allowlist", async () => {
    const runtimeRole = (await runtime.query("select current_user as role")).rows[0].role;
    const rows = (await admin.query(
      `select p.proname,has_function_privilege($1,p.oid,'execute') runtime_execute,
              has_function_privilege('public',p.oid,'execute') public_execute
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public'
         and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')`,
      [runtimeRole],
    )).rows;
    expect(rows.every((row) => !row.public_execute)).toBe(true);
    const executable = new Set(rows.filter((row) => row.runtime_execute).map((row) => row.proname));
    expect(executable).toEqual(new Set([
      "app_context_actor_kind","app_context_site_id","app_context_is_valid_site_admin",
      "site_admin_login_lookup","site_admin_resolve_session","site_admin_create_session",
      "site_admin_revoke_session","site_admin_create_password_reset","site_admin_consume_password_reset",
      "site_admin_change_password","site_admin_site_available","site_admin_access_snapshot",
      "resolve_public_site_by_slug","resolve_public_site_by_domain","resolve_private_preview",
      "create_public_appointment_request",
      "booking_public_config","booking_public_slots","booking_request",
      "booking_transition","booking_confirm_proposed","booking_configure","booking_admin_snapshot",
      "public_appointment_create_v1", "public_appointment_receipt_v1",
      "information_editorial_allowed","information_editorial_install_context","information_editorial_role",
      "resolve_editor_information_media","resolve_information_media_blob",
      "resolve_public_information_article","resolve_public_information_articles",
      "resolve_public_information_media","resolve_public_information_site","resolve_public_information_sponsors",
      "billing_checkout_legal_context","billing_customer_snapshot",
      "billing_prepare_starter_checkout","billing_attach_checkout_session",
      "database_enforced_readiness",
      "consume_api_rate_limit","public_trial_create","site_admin_preview_issue",
      "website_import_cache_read","website_import_cache_write",
      "site_admin_site_projection","site_admin_capability_allowed","site_admin_site_plan","site_admin_cache_identities",
      "site_admin_reserve_usage","site_admin_concurrency_acquire","site_admin_concurrency_release",
      "site_admin_ai_start","site_admin_ai_finish","site_admin_domain_preflight","site_admin_domain_persist",
      "site_admin_register_business_provider_media", "resolve_public_r2_business_media", "resolve_information_r2_authority",
      // Exact existing migration086/manifest boundary, not a dynamic allowlist.
      "site_admin_custom_context", "site_admin_custom_media_register", "site_admin_custom_apply",
      "site_admin_request_privacy_export","site_admin_privacy_export_status",
      "site_admin_issue_export_capability","site_admin_consume_export_capability",
      "site_admin_record_export_download",
      "site_admin_request_customer_deletion","site_admin_customer_deletion_status",
      "site_admin_cancel_customer_deletion",
      "resolve_public_business_media_blob","resolve_public_legal_config","resolve_public_legal_documents",
    ]));
  });

  it("keeps pooled and concurrent resolver results tenant-exact", async () => {
    for (let round=0; round<5; round+=1) {
      const [a,b,p] = await Promise.all([
        runtime.query("select * from resolve_public_site_by_slug($1)", [slug("public-a",publicA)]),
        runtime.query("select * from resolve_public_site_by_domain('b.example.test')"),
        runtime.query("select * from resolve_private_preview($1)", [tokenValid]),
      ]);
      expect([a.rows[0].site_id,b.rows[0].site_id,p.rows[0].site_id]).toEqual([publicA,publicB,privateA]);
    }
  });

  it("records synthetic EXPLAIN evidence for all four boundaries", async () => {
    const plans = [];
    for (const [sql,args] of [
      ["select * from resolve_public_site_by_slug($1)",[slug("public-a",publicA)]],
      ["select * from resolve_public_site_by_domain($1)",["a.example.test"]],
      ["select * from resolve_private_preview($1)",[tokenValid]],
      ["select * from create_public_appointment_request($1,'Plan','1')",[slug("public-b",publicB)]],
    ] as const) plans.push(await runtime.query("explain (analyze,buffers,format text) "+sql,[...args]));
    const evidence = plans.flatMap((plan) => plan.rows.map((row: Record<string, string>) => row["QUERY PLAN"])).join("\n");
    expect(evidence).toContain("Function Scan");
    console.log("B3A EXPLAIN evidence (synthetic disposable fixture)\n"+evidence);
  });
});
