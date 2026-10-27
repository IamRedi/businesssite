import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const ownerUrl = process.env.RLS_TEST_OWNER_DATABASE_URL;
const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const run = Boolean(adminUrl && ownerUrl && runtimeUrl && systemUrl);
const suite = run ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

suite("Finder, demo/trial, preview and cleanup procedure boundaries", () => {
  const admin = new pg.Pool({ connectionString: adminUrl });
  const owner = new pg.Pool({ connectionString: ownerUrl, max: 4 });
  const runtime = new pg.Pool({ connectionString: runtimeUrl, max: 4 });
  const system = new pg.Pool({ connectionString: systemUrl, max: 4 });
  const ownerId = randomUUID();
  const viewerId = randomUUID();
  const disabledId = randomUUID();
  const session = hash(`b3c3-owner-${ownerId}`);
  const viewerSession = hash(`b3c3-viewer-${viewerId}`);
  const disabledSession = hash(`b3c3-disabled-${disabledId}`);
  const revokedSession = hash(`b3c3-revoked-${ownerId}`);
  const leadId = `google-b3c3-${randomUUID()}`;
  const externalId = `place-${randomUUID()}`;
  const createdSites: string[] = [];
  const createdLeads: string[] = [];
  let profileId = "";
  let demoSlug = "";

  const lead = (website?: string) => ({
    id: leadId,
    externalId,
    name: "B3C3 Locksmith",
    category: "Locksmith",
    address: "Test Street 1",
    phone: "+49 000 000",
    website,
    rating: 4.7,
    reviewCount: 123,
    source: "google-places",
    score: website ? 60 : 95,
    reasons: website ? ["website appears weak"] : ["no website detected"],
    signals: { hasWebsite: Boolean(website), websiteQuality: website ? "poor" : "missing", hasEmail: false, hasPhone: true, reviewCount: 123, rating: 4.7, isActive: true, hasSocialProof: true },
  });

  const createTrial = async (label: string) => {
    const slug = `b3c3-trial-${label}-${randomUUID().slice(0, 8)}`;
    const email = `b3c3-${label}-${randomUUID()}@example.test`;
    const result = (await runtime.query(
      "select public_trial_create($1::jsonb,$2,$3,$4,now()+interval '14 days',14,30) value",
      [JSON.stringify({ email, preferredLocale: "de", profile: { version: 1, business: { name: `Trial ${label}`, category: "Test" } }, site: { id: "browser-site", profileId: "browser-profile", slug, visibility: "public", business: { name: `Trial ${label}` } } }), "scrypt-test-hash", hash(`session-${label}`), null],
    )).rows[0].value;
    createdSites.push(result.site.id);
    createdLeads.push((await admin.query("select lead_id from sites where id=$1", [result.site.id])).rows[0].lead_id);
    return result as { site: { id: string; slug: string; visibility: string }; accountId: string; expiresAt: string; previewTokenId: string };
  };

  beforeAll(async () => {
    await admin.query(
      `insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step) values
       ($1,$2,'hash','active','owner','v1.owner',now(),10),
       ($3,$4,'hash','active','viewer','v1.viewer',now(),10),
       ($5,$6,'hash','disabled','operator','v1.disabled',now(),10)`,
      [ownerId, `b3c3-owner-${ownerId}@example.test`, viewerId, `b3c3-viewer-${viewerId}@example.test`, disabledId, `b3c3-disabled-${disabledId}@example.test`],
    );
    await admin.query(
      `insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at,revoked_at) values
       (gen_random_uuid(),$1,$2,now(),now()+interval '12 hours',null),
       (gen_random_uuid(),$3,$4,now(),now()+interval '12 hours',null),
       (gen_random_uuid(),$5,$6,now(),now()+interval '12 hours',null),
       (gen_random_uuid(),$1,$7,now(),now()+interval '12 hours',now())`,
      [ownerId, session, viewerId, viewerSession, disabledId, disabledSession, revokedSession],
    );
  });

  afterAll(async () => {
    if (createdSites.length) await admin.query("delete from sites where id=any($1::text[])", [createdSites]);
    if (createdLeads.length) await admin.query("delete from leads where id=any($1::text[])", [createdLeads]);
    await admin.query("delete from leads where id=$1", [leadId]);
    await admin.query("delete from owner_accounts where id=any($1::uuid[])", [[ownerId, viewerId, disabledId]]);
    await Promise.all([admin.end(), owner.end(), runtime.end(), system.end()]);
  });

  it("keeps all B3C3 and legacy/global tables direct-access denied", async () => {
    const tables = ["leads","lead_scores","lead_pipeline_events","lead_website_history","prepared_business_profiles","finder_searches","finder_search_cache","demo_sites","site_preview_tokens","api_rate_limits","audit_events","platform_users","platform_roles","schema_migrations"];
    for (const pool of [owner, runtime, system])
      for (const table of tables) await expect(pool.query(`select * from ${table} limit 1`)).rejects.toThrow(/permission denied/i);
  }, 15_000);

  it("enforces current owner role, status and session state in the database", async () => {
    expect(Array.isArray((await owner.query("select owner_finder_list_leads($1,10,0) value", [session])).rows[0].value)).toBe(true);
    expect(Array.isArray((await owner.query("select owner_finder_list_leads($1,10,0) value", [viewerSession])).rows[0].value)).toBe(true);
    expect((await owner.query("select owner_finder_create_search($1,$2::jsonb,$3,$4) id", [viewerSession, JSON.stringify({ query: "x", filters: {} }), hash("viewer-cache"), "browser-role-owner"])).rows[0].id).toBeNull();
    expect((await owner.query("select owner_finder_list_leads($1,10,0) value", [disabledSession])).rows[0].value).toBeNull();
    expect((await owner.query("select owner_finder_list_leads($1,10,0) value", [revokedSession])).rows[0].value).toBeNull();
    await expect(runtime.query("select owner_finder_list_leads($1,10,0)", [session])).rejects.toThrow(/permission denied/i);
    await expect(system.query("select owner_finder_list_leads($1,10,0)", [session])).rejects.toThrow(/permission denied/i);
  });

  it("normalizes a concurrent lead upsert and derives actor/history server-side", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => owner.query("select owner_finder_upsert_lead($1,$2::jsonb,$3) value", [session, JSON.stringify(lead()), "b3c3-upsert"])));
    expect(results.every((result) => result.rows[0].value.id === leadId)).toBe(true);
    expect(Number((await admin.query("select count(*) count from leads where external_id=$1", [externalId])).rows[0].count)).toBe(1);
    expect(Number((await admin.query("select count(*) count from lead_website_history where lead_id=$1 and change_type='first_seen'", [leadId])).rows[0].count)).toBe(1);
    await owner.query("select owner_finder_upsert_lead($1,$2::jsonb,$3)", [session, JSON.stringify(lead("https://example.test")), "b3c3-website"]);
    expect((await admin.query("select updated_by_owner_id from leads where id=$1", [leadId])).rows[0].updated_by_owner_id).toBe(ownerId);
  });

  it("returns the owner business workspace without leaking composite aliases", async () => {
    const workspace = (await owner.query(
      "select owner_finder_list_workspace($1,250,0) value",
      [session],
    )).rows[0].value as Array<{
      lead: { id: string };
      latestProfile: unknown;
      profileCount: number;
    }>;
    const record = workspace.find((item) => item.lead.id === leadId);
    expect(record).toMatchObject({
      lead: { id: leadId },
      latestProfile: null,
      profileCount: 0,
    });
  });

  it("allows only forward, allowlisted, idempotent pipeline transitions", async () => {
    const first = (await owner.query("select owner_finder_add_pipeline($1,$2,'discovered','ok',$3) value", [session, leadId, "b3c3-pipeline"])).rows[0].value;
    const same = (await owner.query("select owner_finder_add_pipeline($1,$2,'discovered','browser replacement',$3) value", [session, leadId, "b3c3-pipeline"])).rows[0].value;
    expect(same.id).toBe(first.id);
    expect((await owner.query("select owner_finder_add_pipeline($1,$2,'qualified','ok',$3) value", [session, leadId, "b3c3-pipeline"])).rows[0].value.status).toBe("qualified");
    expect((await owner.query("select owner_finder_add_pipeline($1,$2,'analyzed','backward',$3) value", [session, leadId, "b3c3-pipeline"])).rows[0].value).toBeNull();
    expect((await owner.query("select owner_finder_add_pipeline($1,$2,'paid','invalid',$3) value", [session, leadId, "b3c3-pipeline"])).rows[0].value).toBeNull();
  });

  it("uses an exact versioned cache with bounded results and server expiry", async () => {
    const key = hash("schema-v1:query:berlin:10km");
    expect((await owner.query("select owner_finder_save_cache($1,$2,$3::jsonb) ok", [session, key, JSON.stringify([leadId])])).rows[0].ok).toBe(true);
    expect((await owner.query("select owner_finder_get_cache($1,$2) value", [session, key])).rows[0].value).toEqual([leadId]);
    await admin.query("update finder_search_cache set expires_at=now()-interval '1 second' where cache_key=$1", [key]);
    expect((await owner.query("select owner_finder_get_cache($1,$2) value", [session, key])).rows[0].value).toBeNull();
    expect((await owner.query("select owner_finder_save_cache($1,$2,$3::jsonb) ok", [session, key, JSON.stringify(Array(21).fill(leadId))])).rows[0].ok).toBe(false);
    expect(JSON.stringify((await admin.query("select lead_ids from finder_search_cache where cache_key=$1", [key])).rows[0])).not.toContain("secret");
  });

  it("creates one canonical profile and private demo regardless of browser IDs", async () => {
    const profile = { id: "browser-profile", version: 1, sourceLeadId: leadId, locale: "en", business: { name: "B3C3 Locksmith" } };
    const first = (await owner.query("select owner_finder_create_profile($1,$2,$3::jsonb,'ready_for_handoff',$4) value", [session, leadId, JSON.stringify(profile), "b3c3-profile"])).rows[0].value;
    const second = (await owner.query("select owner_finder_create_profile($1,$2,$3::jsonb,'ready_for_handoff',$4) value", [session, leadId, JSON.stringify(profile), "b3c3-profile"])).rows[0].value;
    expect(second.id).toBe(first.id);
    profileId = first.id;
    const document = { id: "browser-site", profileId: "unrelated", slug: `b3c3-demo-${randomUUID().slice(0, 8)}`, visibility: "public", templateKey: "classic", themeKey: "blue", business: { name: "B3C3 Locksmith" } };
    const demos = await Promise.all(Array.from({ length: 4 }, () => owner.query("select owner_demo_create($1,$2,$3::jsonb,14,30,$4) value", [session, profileId, JSON.stringify(document), "b3c3-demo"])));
    const ids = new Set(demos.map((result) => result.rows[0].value.siteId));
    expect(ids.size).toBe(1);
    const value = demos[0].rows[0].value;
    createdSites.push(value.siteId);
    demoSlug = value.slug;
    expect(value.site).toMatchObject({ id: value.siteId, profileId, slug: value.slug, visibility: "private" });
    expect((await admin.query("select visibility,activated_at from sites where id=$1", [value.siteId])).rows[0]).toEqual({ visibility: "private", activated_at: null });
    expect(Number((await admin.query("select count(*) count from site_subscriptions where site_id=$1", [value.siteId])).rows[0].count)).toBe(0);
  });

  it("issues, resolves, rotates and revokes site-exact preview capabilities", async () => {
    const first = (await owner.query("select owner_preview_issue($1,$2,false,$3) value", [session, demoSlug, "b3c3-preview"])).rows[0].value;
    expect((await runtime.query("select * from resolve_private_preview($1)", [first.previewTokenId])).rows[0].site_id).toBe(first.siteId);
    const rotated = (await owner.query("select owner_preview_issue($1,$2,true,$3) value", [session, demoSlug, "b3c3-preview"])).rows[0].value;
    expect(rotated.previewTokenId).not.toBe(first.previewTokenId);
    expect((await runtime.query("select * from resolve_private_preview($1)", [first.previewTokenId])).rows).toEqual([]);
    expect((await runtime.query("select * from resolve_private_preview($1)", [rotated.previewTokenId])).rows[0].site_id).toBe(first.siteId);
    const audit = await admin.query("select details from audit_events where entity_id=$1 and action like 'preview_%'", [first.siteId]);
    expect(JSON.stringify(audit.rows)).not.toContain(rotated.previewTokenId);
  });

  it("atomically creates Starter-only private trial identity and hash-only session", async () => {
    const trial = await createTrial("atomic");
    expect(trial.site).toMatchObject({ visibility: "private" });
    expect(trial.site.id).not.toBe("browser-site");
    expect(trial.site.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const state = (await admin.query(
      `select s.onboarding_source,s.activated_at,a.preferred_locale,ss.token_hash,
              exists(select 1 from site_subscriptions sub where sub.site_id=s.id) subscribed
       from sites s join site_admin_accounts a on a.site_id=s.id join site_admin_sessions ss on ss.account_id=a.id where s.id=$1`, [trial.site.id],
    )).rows[0];
    expect(state).toMatchObject({ onboarding_source: "self_service", activated_at: null, preferred_locale: "de", token_hash: hash("session-atomic"), subscribed: false });
    const siteAdminPreview = (await runtime.query(
      "select site_admin_preview_issue($1,false) token_id",
      [hash("session-atomic")],
    )).rows[0].token_id;
    expect(siteAdminPreview).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect((await runtime.query("select site_id from resolve_private_preview($1)", [siteAdminPreview])).rows[0].site_id).toBe(trial.site.id);
    expect((await runtime.query(
      "select site_admin_capability_allowed($1,$2,'media') media,site_admin_capability_allowed($1,$2,'custom_domain_existing') domain",
      [hash("session-atomic"), trial.site.id],
    )).rows[0]).toEqual({ media: true, domain: false });
    expect(JSON.stringify((await admin.query("select details from audit_events where entity_id=$1", [trial.site.id])).rows)).not.toContain("@example.test");
  });

  it("fails malformed or duplicate trial identity without partial rows", async () => {
    expect((await runtime.query("select public_trial_create('{}'::jsonb,'hash',$1,null,now()+interval '1 day',14,30) value", [hash("bad")])).rows[0].value).toBeNull();
    expect(Number((await admin.query("select count(*) count from site_admin_sessions where token_hash=$1", [hash("bad")])).rows[0].count)).toBe(0);
    const first = await createTrial("duplicate");
    const email = (await admin.query("select email from site_admin_accounts where id=$1", [first.accountId])).rows[0].email;
    await expect(runtime.query("select public_trial_create($1::jsonb,'hash',$2,null,now()+interval '1 day',14,30)", [JSON.stringify({ email, preferredLocale: "en", profile: { business: { name: "Duplicate" } }, site: { slug: `duplicate-${randomUUID().slice(0,8)}` } }), hash("duplicate-session")])).rejects.toThrow(/trial_conflict/);
    expect(Number((await admin.query("select count(*) count from site_admin_accounts where email=$1", [email])).rows[0].count)).toBe(1);
  });

  it("atomically limits hashed global subjects and exposes no counter reads", async () => {
    const subject = hash(randomUUID());
    const results = await Promise.all(Array.from({ length: 8 }, () => runtime.query("select consume_api_rate_limit('public-trial',$1,5,60) value", [subject])));
    expect(results.filter((result) => result.rows[0].value.allowed).length).toBe(5);
    const deletionSubject = hash(randomUUID());
    const deletionResults = await Promise.all(Array.from({ length: 3 }, () => runtime.query("select consume_api_rate_limit('privacy_deletion_customer',$1,2,86400) value", [deletionSubject])));
    expect(deletionResults.filter((result) => result.rows[0].value.allowed).length).toBe(2);
    const exportSubject = hash(randomUUID());
    expect((await runtime.query("select consume_api_rate_limit('privacy_export_customer',$1,3,3600) value", [exportSubject])).rows[0].value.allowed).toBe(true);
    expect((await runtime.query("select consume_api_rate_limit('unknown',$1,5,60) value", [subject])).rows[0].value).toBeNull();
    await expect(runtime.query("select * from api_rate_limits")).rejects.toThrow(/permission denied/i);
  });

  it("deletes only bounded expired unactivated demos and preserves paid history", async () => {
    const eligible = await createTrial("cleanup-eligible");
    const paid = await createTrial("cleanup-paid");
    await admin.query("update sites set demo_expires_at=now()-interval '40 days',trial_recovery_ends_at=now()-interval '1 day' where id=any($1::text[])", [[eligible.site.id, paid.site.id]]);
    await admin.query("update site_preview_tokens set revoked_at=now() where site_id=any($1::text[])", [[eligible.site.id, paid.site.id]]);
    await admin.query("insert into site_subscriptions(site_id,status,plan_key) values($1,'canceled','starter')", [paid.site.id]);
    const result = (await system.query("select cleanup_expired_demo_batch('expired_demo_maintenance',1) value")).rows[0].value;
    expect(result.deletedSites).toBe(1);
    expect((await admin.query("select id from sites where id=$1", [eligible.site.id])).rows).toEqual([]);
    expect((await admin.query("select id from sites where id=$1", [paid.site.id])).rows[0].id).toBe(paid.site.id);
    expect((await system.query("select cleanup_expired_demo_batch('arbitrary',200) value")).rows[0].value).toBeNull();
    expect((await system.query("select cleanup_expired_demo_batch('expired_demo_maintenance',200) value")).rows[0].value.deletedSites).toBe(0);
  });

  it("has exact actor grants, fixed paths and no PUBLIC execute", async () => {
    const names = ["owner_finder_upsert_lead","owner_finder_list_workspace","owner_demo_create","owner_preview_issue","public_trial_create","site_admin_preview_issue","consume_api_rate_limit","cleanup_expired_demo_batch"];
    const rows = (await admin.query(
      `select p.proname,p.prosecdef,p.proconfig @> array['search_path=pg_catalog'] fixed_path,
              has_function_privilege('public',p.oid,'execute') public_execute,
              has_function_privilege($1,p.oid,'execute') owner_execute,
              has_function_privilege($2,p.oid,'execute') runtime_execute,
              has_function_privilege($3,p.oid,'execute') system_execute
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($4::text[])`,
      [process.env.RLS_TEST_OWNER_ROLE, process.env.RLS_TEST_RUNTIME_ROLE ?? "bsrc_runtime", process.env.RLS_TEST_SYSTEM_ROLE, names],
    )).rows;
    expect(rows).toHaveLength(names.length);
    for (const row of rows) {
      expect(row).toMatchObject({ prosecdef: true, fixed_path: true, public_execute: false });
      if (row.proname.startsWith("owner_")) expect([row.owner_execute,row.runtime_execute,row.system_execute]).toEqual([true,false,false]);
      else if (row.proname === "cleanup_expired_demo_batch") expect([row.owner_execute,row.runtime_execute,row.system_execute]).toEqual([false,false,true]);
      else expect([row.owner_execute,row.runtime_execute,row.system_execute]).toEqual([false,true,false]);
    }
  });

  it("records disposable EXPLAIN evidence for required lookup shapes", async () => {
    const plans: string[] = [];
    for (const [sql, args] of [
      ["select owner_finder_get_cache($1,$2)", [session, hash("explain-cache")]],
      ["select owner_finder_list_leads($1,25,0)", [session]],
      ["select owner_finder_get_lead($1,$2)", [session, leadId]],
      ["select owner_demo_site_identity_by_slug($1,$2)", [session, demoSlug]],
      ["select owner_preview_issue($1,$2,false,$3)", [session, demoSlug, "explain"]],
      ["select consume_api_rate_limit('public-trial',$1,100,60)", [hash("explain-rate")]],
      ["select cleanup_expired_demo_batch('expired_demo_maintenance',1)", []],
    ] as Array<[string, string[]]>) {
      const pool = sql.includes("cleanup_") ? system : sql.includes("consume_") ? runtime : owner;
      plans.push((await pool.query(`explain (analyze,buffers) ${sql}`, args)).rows.map((row) => row["QUERY PLAN"]).join("\n"));
    }
    console.info("B3C3 EXPLAIN evidence (synthetic disposable fixtures)\n" + plans.join("\n---\n"));
    expect(plans.every((plan) => plan.includes("Execution Time") && plan.includes("Buffers"))).toBe(true);
  });
});
