import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const ownerUrl = process.env.RLS_TEST_OWNER_DATABASE_URL;
const systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const run = Boolean(adminUrl && runtimeUrl && ownerUrl && systemUrl);

describe.skipIf(!run)("final pilot database boundary completion", () => {
  const admin = new Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const runtime = new Pool({ connectionString: runtimeUrl, allowExitOnIdle: true });
  const owner = new Pool({ connectionString: ownerUrl, allowExitOnIdle: true });
  const system = new Pool({ connectionString: systemUrl, allowExitOnIdle: true });
  const siteA = randomUUID(); const siteB = randomUUID(); const informationSite = randomUUID();
  const accountA = randomUUID(); const accountB = randomUUID();
  const sessionA = randomBytes(32).toString("hex"); const sessionB = randomBytes(32).toString("hex");
  const ownerA = randomUUID(); const ownerB = randomUUID();
  const ownerSessionA = randomBytes(32).toString("hex"); const ownerSessionB = randomBytes(32).toString("hex");
  const leadA = `b3c4-lead-${randomUUID()}`; const integrationA = randomUUID();
  const slugA = `b3c4-a-${siteA.slice(0,8)}`; const slugB = `b3c4-b-${siteB.slice(0,8)}`;

  beforeAll(async () => {
    for (const [site,slug] of [[siteA,slugA],[siteB,slugB]]) {
      await admin.query(`insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,site_kind)
        values($1,$2,'public','public',$3,now()+interval '14 days',now()+interval '44 days',now(),'business')`, [site,slug,{id:site,slug,locale:"en"}]);
      await admin.query("insert into site_subscriptions(site_id,status,plan_key) values($1,'active','starter')", [site]);
      await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'media',true),($1,'ai_rewrite',true),($1,'custom_domain_existing',true)", [site]);
    }
    await admin.query(`insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,site_kind)
      values($1,$2,'public','public',$3,now()+interval '14 days',now()+interval '44 days',now(),'information')`, [informationSite,`b3c4-info-${informationSite.slice(0,8)}`,{}]);
    await admin.query("insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,$3,'hash'),($4,$5,$6,'hash')", [accountA,siteA,`b3c4-a-${siteA}@example.test`,accountB,siteB,`b3c4-b-${siteB}@example.test`]);
    await admin.query("insert into site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,now()+interval '1 hour'),(gen_random_uuid(),$3,$4,now()+interval '1 hour')", [accountA,sessionA,accountB,sessionB]);
    await admin.query("insert into leads(id,name,source,payload,external_id,category,address) values($1,'B3C4 Lead','test','{}',$2,'Test','Address')", [leadA,randomUUID()]);
    await admin.query("insert into owner_accounts(id,email,password_hash,role,mfa_secret_encrypted,mfa_enrolled_at) values($1,$2,'hash','owner','encrypted',now()),($3,$4,'hash','owner','encrypted',now())", [ownerA,`b3c4-owner-a-${ownerA}@example.test`,ownerB,`b3c4-owner-b-${ownerB}@example.test`]);
    await admin.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),$1,$2,now(),now()+interval '1 hour'),(gen_random_uuid(),$3,$4,now(),now()+interval '1 hour')", [ownerA,ownerSessionA,ownerB,ownerSessionB]);
    await admin.query(`insert into site_external_integrations(id,site_id,provider,external_installation_id,status,inbound_enabled,inbound_permissions,inbound_approved_at,inbound_approved_by)
      values($1,$2,'redi_control',$3,'active',true,array['media:write'],now(),$4)`, [integrationA,informationSite,`b3c4-${integrationA}`,ownerA]);
  });

  afterAll(async () => {
    await admin.query("delete from owner_accounts where id=any($1::uuid[])", [[ownerA,ownerB]]);
    await admin.query("delete from leads where id=$1", [leadA]);
    await admin.query("delete from sites where id=any($1::text[])", [[siteA,siteB,informationSite]]);
    await Promise.all([admin.end(),runtime.end(),owner.end(),system.end()]);
  });

  it("reserves quota atomically and denies cross-tenant session binding", async () => {
    expect((await runtime.query("select site_admin_capability_allowed($1,$2,'ai_rewrite') allowed", [sessionA,siteA])).rows[0].allowed).toBe(true);
    expect((await runtime.query("select site_admin_capability_allowed($1,$2,'ai_rewrite') allowed", [sessionA,siteB])).rows[0].allowed).toBe(false);
    const quotas = [{window:"minute",limit:2}];
    const [first,second] = await Promise.all([
      runtime.query("select site_admin_reserve_usage($1,$2,'client_ai_rewrite',1,$3::jsonb,0.8) value", [sessionA,siteA,JSON.stringify(quotas)]),
      runtime.query("select site_admin_reserve_usage($1,$2,'client_ai_rewrite',1,$3::jsonb,0.8) value", [sessionA,siteA,JSON.stringify(quotas)]),
    ]);
    expect(first.rows[0].value.allowed).toBe(true); expect(second.rows[0].value.allowed).toBe(true);
    expect((await runtime.query("select site_admin_reserve_usage($1,$2,'client_ai_rewrite',1,$3::jsonb,0.8) value", [sessionA,siteA,JSON.stringify(quotas)])).rows[0].value.allowed).toBe(false);
    expect((await runtime.query("select site_admin_reserve_usage($1,$2,'client_ai_rewrite',1,$3::jsonb,0.8) value", [sessionA,siteB,JSON.stringify(quotas)])).rows[0].value.reasonCode).toBe("authorization_denied");
  });

  it("enforces bounded concurrency and idempotent release", async () => {
    const lease = (await runtime.query("select site_admin_concurrency_acquire($1,$2,'client_ai_rewrite',1,60) value", [sessionA,siteA])).rows[0].value;
    expect(lease.allowed).toBe(true);
    expect((await runtime.query("select site_admin_concurrency_acquire($1,$2,'client_ai_rewrite',1,60) value", [sessionA,siteA])).rows[0].value.allowed).toBe(false);
    expect((await runtime.query("select site_admin_concurrency_release($1,$2,$3) ok", [sessionA,siteA,lease.leaseId])).rows[0].ok).toBe(true);
    expect((await runtime.query("select site_admin_concurrency_release($1,$2,$3) ok", [sessionA,siteA,lease.leaseId])).rows[0].ok).toBe(false);
  });

  it("binds customer AI runs to the resolved account and exact site", async () => {
    const id = (await runtime.query("select site_admin_ai_start($1,$2,'test','model','{}') id", [sessionA,siteA])).rows[0].id;
    expect(id).toBeTruthy();
    expect((await runtime.query("select site_admin_ai_finish($1,$2,'completed',$3) ok", [sessionB,id,{output:{text:"bad"}}])).rows[0].ok).toBe(false);
    expect((await runtime.query("select site_admin_ai_finish($1,$2,'failed',$3) ok", [sessionA,id,{error:"provider failed"}])).rows[0].ok).toBe(true);
  });

  it("binds owner AI runs to the canonical owner session", async () => {
    const id = (await owner.query("select owner_ai_start($1,$2,'test','model','{}') id", [ownerSessionA,leadA])).rows[0].id;
    expect(id).toBeTruthy();
    expect((await owner.query("select owner_ai_get($1,$2) value", [ownerSessionB,id])).rows[0].value).toBeNull();
    expect((await owner.query("select owner_ai_finish($1,$2,'completed',$3) ok", [ownerSessionA,id,{output:{templateKey:"x"}}])).rows[0].ok).toBe(true);
  });

  it("persists only the session-bound domain and rejects reassignment", async () => {
    const setup = {provider:"vercel",domain:"b3c4.example.test",projectId:"prj_ExampleProject0000000000",teamId:"team_1a2b3c4d5e6f7g8h9i0j1k2l",ownershipVerified:true,dnsConfigured:true,ready:true,records:[],checkedAt:new Date().toISOString()};
    expect((await runtime.query("select * from site_admin_domain_preflight($1,$2)", [sessionA,slugA])).rows[0].site_id).toBe(siteA);
    expect((await runtime.query("select site_admin_domain_persist($1,$2,'b3c4.example.test','pending_dns',$3) ok", [sessionA,siteB,setup])).rows[0].ok).toBe(false);
    expect((await runtime.query("select site_admin_domain_persist($1,$2,'b3c4.example.test','verified','{}') ok", [sessionA,siteA])).rows[0].ok).toBe(false);
    expect((await runtime.query("select site_admin_domain_persist($1,$2,'b3c4.example.test','verified',$3) ok", [sessionA,siteA,{...setup,token:"must-not-persist"}])).rows[0].ok).toBe(false);
    expect((await runtime.query("select site_admin_domain_persist($1,$2,'b3c4.example.test','verified',$3) ok", [sessionA,siteA,setup])).rows[0].ok).toBe(true);
  });

  it("keeps Clouvider domain authority distinct and session/site bound", async () => {
    const domain = `clouvider-${siteA}.example.test`;
    const setup = { provider: "clouvider", domain, serviceId: "10001", siteId: siteA, ownershipVerified: true, dnsConfigured: true, ready: true, records: [], checkedAt: new Date().toISOString(), attestationFingerprint: "a".repeat(64) };
    const persist = async (value: unknown, id = siteA, token = sessionA) => (await runtime.query("select site_admin_domain_persist($1,$2,$3,'verified',$4) ok", [token, id, domain, value])).rows[0].ok;
    for (const invalid of [{ ...setup, siteId: siteB }, { ...setup, serviceId: "vercel-project:fake" }, { ...setup, ownershipVerified: false }, { ...setup, dnsConfigured: false }, { ...setup, attestationFingerprint: null }, { ...setup, token: "never-persist" }]) expect(await persist(invalid)).toBe(false);
    expect(await persist(setup, siteB)).toBe(false);
    expect(await persist(setup, siteA, sessionB)).toBe(false);
    expect(await persist(setup)).toBe(true);
    expect((await admin.query("select custom_domain_provider_authority from sites where id=$1", [siteA])).rows[0].custom_domain_provider_authority).toBe("clouvider-service:10001");
  });

  it("registers and resolves only exact public R2 business assets", async () => {
    const authority = `r2-bucket:${"a".repeat(32)}:media-public`;
    const key = `sites/${siteA}/${randomUUID()}-fixture.webp`, url = `/api/media/r2/${key}`;
    const base = [sessionA, slugA, authority, key, url, "image/webp", 12];
    const register = async (values: unknown[]) => (await runtime.query("select site_admin_register_business_provider_media($1,$2,$3,$4,$5,$6,$7) id", values)).rows[0].id;
    for (const [index, value] of [[0, sessionB], [2, authority.replace("media-public", "recovery-backups")], [3, key.replace(siteA, siteB)], [4, "https://attacker.example/file.webp"], [6, 4_194_305]] as const) { const values = [...base]; values[index] = value; expect(await register(values)).toBeNull(); }
    const id = await register(base); expect(id).toBeTruthy(); expect(await register(base)).toBe(id);
    expect((await runtime.query("select * from resolve_public_r2_business_media($1)", [key])).rows[0]).toMatchObject({ site_id: siteA, provider_authority: authority, storage_key: key, byte_size: 12 });
    expect((await runtime.query("select * from resolve_public_r2_business_media($1)", [key.replace(siteA, siteB)])).rows).toEqual([]);
    expect((await runtime.query("select provider_authority from site_media_assets where id=$1", [id])).rows).toEqual([]);
  });

  it("serves public business blob bytes only while the site is eligible", async () => {
    const blob = randomUUID();
    await admin.query("insert into site_media_blobs(id,site_id,filename,content_type,data) values($1,$2,'x.webp','image/webp',$3)", [blob,siteA,Buffer.from([1,2,3])]);
    expect((await runtime.query("select * from resolve_public_business_media_blob($1)", [blob])).rows[0].data).toEqual(Buffer.from([1,2,3]));
    await admin.query("update sites set visibility='private' where id=$1", [siteA]);
    expect((await runtime.query("select * from resolve_public_business_media_blob($1)", [blob])).rows).toEqual([]);
    await admin.query("update sites set visibility='public' where id=$1", [siteA]);
  });

  it("allows REDI media persistence only for the exact approved integration", async () => {
    const id = (await system.query("select information_redi_media_blob_insert($1,$2,'redi.webp',$3) id", [integrationA,informationSite,Buffer.from([7])])).rows[0].id;
    expect(id).toBeTruthy();
    expect((await system.query("select information_redi_media_blob_insert($1,$2,'redi.webp',$3) id", [integrationA,siteB,Buffer.from([7])])).rows[0].id).toBeNull();
    const quota = JSON.stringify([{window:"minute",limit:1}]);
    expect((await system.query("select information_redi_usage_reserve($1,$2,'media_upload',1,$3,0.8) value", [integrationA,informationSite,quota])).rows[0].value.allowed).toBe(true);
    expect((await system.query("select information_redi_usage_reserve($1,$2,'media_upload',1,$3,0.8) value", [integrationA,informationSite,quota])).rows[0].value.state).toBe("throttled");
  });

  it("keeps application roles table-owner free, PUBLIC denied and FORCE on", async () => {
    const roles = [process.env.RLS_TEST_RUNTIME_ROLE,process.env.RLS_TEST_OWNER_ROLE,process.env.RLS_TEST_SYSTEM_ROLE];
    const owned = await admin.query("select count(*)::int count from pg_class c join pg_roles r on r.oid=c.relowner where r.rolname=any($1::text[]) and c.relkind in('r','p')", [roles]);
    expect(owned.rows[0].count).toBe(0);
    expect((await admin.query("select count(*)::int count from information_schema.role_table_grants where grantee='PUBLIC' and table_schema='public'")).rows[0].count).toBe(0);
    expect((await admin.query("select count(*)::int count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relforcerowsecurity")).rows[0].count).toBe(70);
    const publicConfig = await runtime.query("select * from resolve_public_legal_config() limit 0");
    const publicDocuments = await runtime.query("select * from resolve_public_legal_documents() limit 0");
    expect(publicConfig.fields.map((field) => field.name)).not.toContain("dispute_metadata");
    expect(publicDocuments.fields.map((field) => field.name)).not.toEqual(expect.arrayContaining(["reviewed_by","reviewer_reference","created_by"]));
  });

  it("records representative local EXPLAIN evidence", async () => {
    const plan = await runtime.query("explain (analyze,buffers,format text) select * from site_admin_domain_preflight($1,$2)", [sessionA,slugA]);
    expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain("Function Scan");
  });
});
