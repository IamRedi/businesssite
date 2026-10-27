import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const enabled = Boolean(process.env.RLS_TEST_ADMIN_DATABASE_URL && process.env.RLS_TEST_RUNTIME_DATABASE_URL && process.env.RLS_TEST_SYSTEM_DATABASE_URL && process.env.RLS_TEST_OWNER_DATABASE_URL);
const admin = new pg.Pool({ connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL });
const runtime = new pg.Pool({ connectionString: process.env.RLS_TEST_RUNTIME_DATABASE_URL });
const system = new pg.Pool({ connectionString: process.env.RLS_TEST_SYSTEM_DATABASE_URL });
const owner = new pg.Pool({ connectionString: process.env.RLS_TEST_OWNER_DATABASE_URL });
const suffix = randomUUID();
const siteA = randomUUID();
const siteB = randomUUID();
const accountA = randomUUID();
const accountB = randomUUID();
const categoryA = randomUUID();
const mediaA = randomUUID();
const mediaB = randomUUID();
const articleDraft = randomUUID();
const articlePublished = randomUUID();
const articleScheduled = randomUUID();
const integrationA = randomUUID();
const integrationB = randomUUID();
const installationA = `redi-a-${suffix}`;
const installationB = `redi-b-${suffix}`;
const sessionA = createHash("sha256").update(`editor-a-${suffix}`).digest("hex");
const sessionB = createHash("sha256").update(`editor-b-${suffix}`).digest("hex");
const ownerSessions = Object.fromEntries(["owner", "admin", "operator", "viewer"].map((role) => [role, createHash("sha256").update(`${role}-${suffix}`).digest("hex")])) as Record<string,string>;

describe.runIf(enabled)("B3C2 Information and REDI RLS boundary", () => {
  beforeAll(async () => {
    await admin.query(`insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,custom_domain,custom_domain_status,site_kind)
      values($1,$2,'public','public','{}',now(),now(),now(),$3,'verified','information'),($4,$5,'public','public','{}',now(),now(),now(),$6,'verified','information')`,
      [siteA,`info-a-${suffix}`,`a-${suffix}.example.test`,siteB,`info-b-${suffix}`,`b-${suffix}.example.test`]);
    await admin.query(`insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,$3,'hash'),($4,$5,$6,'hash')`,
      [accountA,siteA,`a-${suffix}@example.test`,accountB,siteB,`b-${suffix}@example.test`]);
    await admin.query(`insert into site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,now()+interval '1 hour')`,[accountA,sessionA]);
    await admin.query(`insert into site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,now()+interval '1 hour')`,[accountB,sessionB]);
    await admin.query(`insert into site_editorial_memberships(account_id,site_id,role,granted_by) values($1,$2,'administrator','test'),($3,$4,'administrator','test')`,[accountA,siteA,accountB,siteB]);
    await admin.query(`insert into site_editorial_settings(site_id,publication_name,subcategory,locale) values($1,'A','news','en'),($2,'B','news','de')`,[siteA,siteB]);
    await admin.query(`insert into site_article_categories(id,site_id,name,slug) values($1,$2,'News','news')`,[categoryA,siteA]);
    await admin.query(`insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,width,height,byte_size)
      values($1,$2,'postgres',$3,'private',$4,'image/webp',10,10,10),($5,$6,'postgres',$7,'private',$8,'image/webp',10,10,10)`,
      [mediaA,siteA,randomUUID(),`/api/media/${mediaA}`,mediaB,siteB,randomUUID(),`/api/media/${mediaB}`]);
    const body = { version: 1, blocks: [{ type: "paragraph", text: "Verified" }] };
    await admin.query(`insert into site_articles(id,site_id,category_id,slug,title,body,status,featured_media_id,published_at,publish_at)
      values($1,$2,$3,'draft','Draft',$4,'draft',$5,null,null),
            ($6,$2,$3,'published','Published',$4,'published',$5,now(),null),
            ($7,$2,$3,'scheduled','Scheduled',$4,'published',$5,now(),now()+interval '1 day')`,
      [articleDraft,siteA,categoryA,body,mediaA,articlePublished,articleScheduled]);
    await admin.query(`insert into site_article_sources(id,site_id,article_id,label,url) values(gen_random_uuid(),$1,$2,'Source','https://example.test/source')`,[siteA,articlePublished]);
    await admin.query(`insert into site_article_media(site_id,article_id,media_id,sort_order) values($1,$2,$3,0)`,[siteA,articlePublished,mediaA]);
    await admin.query(`insert into site_information_ad_slots(site_id,slot_key,format,enabled) values($1,'article_sidebar','rectangle',true)`,[siteA]);
    await admin.query(`insert into site_external_integrations(id,site_id,provider,external_installation_id,status,inbound_enabled,inbound_permissions,inbound_approved_at,inbound_approved_by,metadata)
      values($1,$2,'redi_control',$3,'active',true,array['articles:read','articles:create','articles:update','articles:submit','articles:publish','articles:archive'],'2026-01-01','owner-a','{}'),
            ($4,$5,'redi_control',$6,'active',true,array['articles:read'],'2026-01-01','owner-b','{}')`,
      [integrationA,siteA,installationA,integrationB,siteB,installationB]);
    for (const role of ["owner","admin","operator","viewer"]) {
      const id = randomUUID();
      await admin.query(`insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at) values($1,$2,'hash','active',$3,'encrypted',now())`,[id,`${role}-${suffix}@example.test`,role]);
      await admin.query(`insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),$1,$2,now(),now()+interval '1 hour')`,[id,ownerSessions[role]]);
    }
  });

  afterAll(async () => {
    await admin.query("delete from owner_accounts where email like $1",[`%-${suffix}@example.test`]);
    await admin.query("delete from sites where id=any($1::text[])",[[siteA,siteB]]);
    await Promise.all([admin.end(),runtime.end(),system.end(),owner.end()]);
  });

  it("keeps roles procedure-only and direct Information/REDI tables denied", async () => {
    expect((await runtime.query("select * from site_articles limit 1")).rowCount).toBe(0);
    for (const pool of [system,owner]) await expect(pool.query("select * from site_articles limit 1")).rejects.toThrow(/permission denied/);
    expect(Number((await admin.query("select count(*) count from information_schema.role_table_grants where grantee=$1",[process.env.RLS_TEST_SYSTEM_ROLE])).rows[0].count)).toBe(0);
    expect(Number((await admin.query("select count(*) count from information_schema.role_table_grants where grantee=$1",[process.env.RLS_TEST_OWNER_ROLE])).rows[0].count)).toBe(0);
  });

  it("allows owner/admin Information management and denies operator/viewer", async () => {
    for (const role of ["owner","admin"]) {
      const value = (await owner.query("select owner_information_configure_ad_slots($1,$2,$3::jsonb,$4) value",[ownerSessions[role],siteA,JSON.stringify([{slotKey:"home_after_featured",format:"leaderboard",enabled:true}]),randomUUID()])).rows[0].value;
      expect(value).toEqual(expect.arrayContaining([expect.objectContaining({slotKey:"home_after_featured",enabled:true})]));
    }
    for (const role of ["operator","viewer"]) expect((await owner.query("select owner_information_configure_ad_slots($1,$2,'[]'::jsonb,$3) value",[ownerSessions[role],siteA,randomUUID()])).rows[0].value).toBeNull();
  });

  it("revalidates editorial membership and isolates tenant rows", async () => {
    const client = await runtime.connect();
    try {
      await client.query("begin");
      expect((await client.query("select * from information_editorial_install_context($1,$2)",[sessionA,siteA])).rowCount).toBe(1);
      expect((await client.query("select count(*)::int count from site_articles")).rows[0].count).toBe(3);
      expect((await client.query("select count(*)::int count from site_articles where site_id=$1",[siteB])).rows[0].count).toBe(0);
      await expect(client.query("insert into site_article_sources(id,site_id,article_id,url) values(gen_random_uuid(),$1,$2,'https://example.test')",[siteB,articlePublished])).rejects.toThrow();
      await client.query("rollback");
    } finally { client.release(); }
  });

  it("resolves private R2 authority only through publication or the exact editorial session", async () => {
    const id = randomUUID(), key = `sites/${siteB}/editorial/${randomUUID()}-fixture.webp`, authority = `r2-bucket:${"a".repeat(32)}:media-private`;
    await admin.query("insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,byte_size,provider_authority) values($1,$2,'r2',$3,'private',$4,'image/webp',12,$5)", [id, siteB, key, `/api/media/${id}`, authority]);
    const resolve = async (token: string | null) => (await runtime.query("select resolve_information_r2_authority($1,$2) authority", [id, token])).rows[0].authority;
    expect(await resolve(null)).toBeNull(); expect(await resolve(sessionA)).toBeNull(); expect(await resolve("invalid")).toBeNull(); expect(await resolve(sessionB)).toBe(authority);
    expect((await runtime.query("select * from resolve_public_r2_business_media($1)", [key])).rows).toEqual([]);
  });

  it("reserves bounded editorial media usage and leases for each same-publication writer role", async () => {
    const quotas = JSON.stringify([{ window: "day", limit: 100 }]);
    try {
      for (const role of ["editor", "publisher", "administrator"]) {
        await admin.query("update site_editorial_memberships set role=$1 where account_id=$2 and site_id=$3", [role, accountB, siteB]);
        const usage = (await runtime.query("select site_admin_reserve_usage($1,$2,'media_upload',1,$3::jsonb,0.8) value", [sessionB, siteB, quotas])).rows[0].value;
        expect(usage.allowed).toBe(true);
        const bytes = (await runtime.query("select site_admin_reserve_usage($1,$2,'media_upload_bytes',12,$3::jsonb,0.8) value", [sessionB, siteB, quotas])).rows[0].value;
        expect(bytes.allowed).toBe(true);
        const lease = (await runtime.query("select site_admin_concurrency_acquire($1,$2,'media_upload',1,60) value", [sessionB, siteB])).rows[0].value;
        expect(lease.allowed).toBe(true);
        expect((await runtime.query("select site_admin_concurrency_acquire($1,$2,'media_upload',1,60) value", [sessionB, siteB])).rows[0].value.allowed).toBe(false);
        expect((await runtime.query("select site_admin_concurrency_release($1,$2,$3) ok", [sessionA, siteB, lease.leaseId])).rows[0].ok).toBe(false);
        expect((await runtime.query("select site_admin_concurrency_release($1,$2,$3) ok", [sessionB, siteB, lease.leaseId])).rows[0].ok).toBe(true);
      }
      expect((await runtime.query("select site_admin_reserve_usage($1,$2,'media_upload',100,$3::jsonb,0.8) value", [sessionB, siteB, quotas])).rows[0].value.allowed).toBe(false);
    } finally {
      await admin.query("update site_editorial_memberships set role='administrator' where account_id=$1 and site_id=$2", [accountB, siteB]);
    }
  });

  it("denies editorial quota authority to other tenants, absent/revoked sessions and unrelated operations", async () => {
    const quotas = JSON.stringify([{ window: "day", limit: 100 }]);
    for (const [token, id, metric, operation] of [
      [sessionA, siteB, "media_upload", "media_upload"],
      ["invalid", siteB, "media_upload", "media_upload"],
      [sessionB, siteB, "client_ai_rewrite", "client_ai_rewrite"],
    ]) {
      expect((await runtime.query("select site_admin_reserve_usage($1,$2,$3,1,$4::jsonb,0.8) value", [token, id, metric, quotas])).rows[0].value.allowed).toBe(false);
      expect((await runtime.query("select site_admin_concurrency_acquire($1,$2,$3,1,60) value", [token, id, operation])).rows[0].value.allowed).toBe(false);
    }
    await admin.query("delete from site_editorial_memberships where account_id=$1 and site_id=$2", [accountB, siteB]);
    try {
      expect((await runtime.query("select site_admin_reserve_usage($1,$2,'media_upload',1,$3::jsonb,0.8) value", [sessionB, siteB, quotas])).rows[0].value.allowed).toBe(false);
      expect((await runtime.query("select site_admin_concurrency_acquire($1,$2,'media_upload',1,60) value", [sessionB, siteB])).rows[0].value.allowed).toBe(false);
    } finally {
      await admin.query("insert into site_editorial_memberships(account_id,site_id,role,granted_by) values($1,$2,'administrator','test')", [accountB, siteB]);
    }
  });

  it("returns only publication-eligible public projections", async () => {
    const site = (await runtime.query("select resolve_public_information_site('domain',$1) value",[`a-${suffix}.example.test`])).rows[0].value;
    expect(site).toMatchObject({siteId:siteA,publicationName:"A"});
    expect(JSON.stringify(site)).not.toMatch(/storage_key|actor_id|inbound_/);
    const feed = (await runtime.query("select resolve_public_information_articles('slug',$1,'{}') value",[`info-a-${suffix}`])).rows[0].value.items;
    expect(feed.map((row:{slug:string})=>row.slug)).toEqual(["published"]);
    const article = (await runtime.query("select resolve_public_information_article('slug',$1,'published') value",[`info-a-${suffix}`])).rows[0].value;
    expect(article.title).toBe("Published");
    expect(JSON.stringify(article)).not.toMatch(/storage_key|audit|integration/);
    expect((await runtime.query("select resolve_public_information_article('slug',$1,'draft') value",[`info-a-${suffix}`])).rows[0].value).toBeNull();
    expect((await runtime.query("select resolve_public_information_site('domain','unknown.example.test') value")).rows[0].value).toBeNull();
  });

  it("exposes media delivery only for published same-site attachments", async () => {
    expect((await runtime.query("select * from resolve_public_information_media($1)",[mediaA])).rowCount).toBe(1);
    expect((await runtime.query("select * from resolve_public_information_media($1)",[mediaB])).rowCount).toBe(0);
  });

  it("keeps sponsor writes tenant scoped and publishes only active cards and images", async () => {
    const image = randomUUID();
    const banner = randomUUID();
    await admin.query(`insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,width,height,byte_size)
      values($1,$2,'postgres',$3,'private',$4,'image/webp',10,10,10)`,
      [image,siteA,randomUUID(),`/api/media/${image}`]);
    expect((await runtime.query("select * from resolve_public_information_media($1)",[image])).rowCount).toBe(0);
    const client = await runtime.connect();
    try {
      await client.query("begin");
      await client.query("select * from information_editorial_install_context($1,$2)",[sessionA,siteA]);
      await expect(client.query(`insert into site_information_sponsor_banners
        (id,site_id,slot_key,sponsor_name,headline,call_to_action,destination_url,image_media_id,enabled)
        values($1,$2,'home_after_featured','Other','Wrong','Visit','https://example.test/',$3,true)`,
        [randomUUID(),siteB,mediaB])).rejects.toThrow();
      await client.query("rollback");
      await client.query("begin");
      await client.query("select * from information_editorial_install_context($1,$2)",[sessionA,siteA]);
      await client.query(`insert into site_information_sponsor_banners
        (id,site_id,slot_key,sponsor_name,headline,call_to_action,destination_url,image_media_id,enabled)
        values($1,$2,'home_after_featured','Local studio','Explore local craft','Visit','https://sponsor.example/',$3,true)`,
        [banner,siteA,image]);
      await client.query("commit");
    } finally { client.release(); }
    const publicCards = (await runtime.query("select resolve_public_information_sponsors('slug',$1) value",[`info-a-${suffix}`])).rows[0].value;
    expect(publicCards).toEqual([expect.objectContaining({id:banner,siteId:siteA,imageUrl:`/api/media/${image}`})]);
    expect((await runtime.query("select resolve_public_information_sponsors('slug',$1) value",[`info-b-${suffix}`])).rows[0].value).toEqual([]);
    expect((await runtime.query("select * from resolve_public_information_media($1)",[image])).rowCount).toBe(1);
    expect((await runtime.query("select count(*)::int count from site_information_sponsor_banners")).rows[0].count).toBe(0);
    await expect(system.query("select * from site_information_sponsor_banners")).rejects.toThrow(/permission denied/);
    await admin.query("update site_information_sponsor_banners set enabled=false where id=$1",[banner]);
    expect((await runtime.query("select resolve_public_information_sponsors('slug',$1) value",[`info-a-${suffix}`])).rows[0].value).toEqual([]);
    expect((await runtime.query("select * from resolve_public_information_media($1)",[image])).rowCount).toBe(0);
  });

  it("binds REDI bootstrap to exact installation, site and permission", async () => {
    expect((await system.query("select * from information_redi_bootstrap($1,'articles:create')",[installationA])).rows[0]).toMatchObject({integration_id:integrationA,site_id:siteA});
    expect((await system.query("select * from information_redi_bootstrap($1,'articles:create')",[installationB])).rowCount).toBe(0);
    expect((await system.query("select * from information_redi_bootstrap('unknown','articles:read')")).rowCount).toBe(0);
  });

  it("makes nonces single-use under concurrent replay", async () => {
    const nonce = `nonce-${suffix}`;
    const signedAt = new Date().toISOString();
    const attempts = await Promise.all(Array.from({length:8},()=>system.query("select information_redi_reserve_nonce($1,$2,$3,$4,300) ok",[integrationA,siteA,nonce,signedAt])));
    expect(attempts.filter((result)=>result.rows[0].ok).length).toBe(1);
    expect((await system.query("select information_redi_reserve_nonce($1,$2,$3,now()-interval '1 hour',300) ok",[integrationA,siteA,`stale-${suffix}`])).rows[0].ok).toBe(false);
  });

  it("enforces idempotency and tenant-bound REDI content writes", async () => {
    const key = `request-${suffix}`;
    const hash = createHash("sha256").update("body").digest("hex");
    expect((await system.query("select information_redi_begin_request($1,$2,$3,'articles.create',$4,3600) value",[integrationA,siteA,key,hash])).rows[0].value.outcome).toBe("claimed");
    expect((await system.query("select information_redi_begin_request($1,$2,$3,'articles.create',$4,3600) value",[integrationA,siteB,key,hash])).rows[0].value.outcome).toBe("conflict");
    const created = (await system.query("select information_redi_create_article($1,$2,$3::jsonb) value",[integrationA,siteA,JSON.stringify({externalSource:"redi_control",externalReference:`ext-${suffix}`,slug:"redi-draft",title:"REDI draft",body:{version:1,blocks:[{type:"paragraph",text:"Body"}]},status:"draft",siteId:siteB})])).rows[0].value;
    expect(created).toMatchObject({site_id:siteA,status:"draft"});
    expect((await system.query("select information_redi_create_article($1,$2,$3::jsonb) value",[integrationA,siteB,JSON.stringify({externalSource:"redi_control",slug:"cross",title:"Cross",body:{version:1,blocks:[]}})])).rows[0].value).toBeNull();
    expect((await system.query("select information_redi_finish_request($1,$2,$3,'completed',201,$4::jsonb) ok",[integrationA,key,hash,JSON.stringify({article:{id:created.id}})])).rows[0].ok).toBe(true);
    expect((await system.query("select information_redi_begin_request($1,$2,$3,'articles.create',$4,3600) value",[integrationA,siteA,key,hash])).rows[0].value.outcome).toBe("replay");
  });

  it("does not touch Social subscription state", async () => {
    expect(Number((await admin.query("select count(*) count from site_addon_subscriptions where site_id=any($1::text[])",[[siteA,siteB]])).rows[0].count)).toBe(0);
  });

  it("records synthetic resolver and REDI lookup plans", async () => {
    const plans:string[]=[];
    for (const [pool,sql,params] of [
      [runtime,"select resolve_public_information_site('domain',$1)",[`a-${suffix}.example.test`]],
      [runtime,"select resolve_public_information_article('slug',$1,'published')",[`info-a-${suffix}`]],
      [runtime,"select resolve_public_information_articles('slug',$1,$2::jsonb)",[`info-a-${suffix}`,JSON.stringify({limit:10,cursor:null})]],
      [runtime,"select resolve_public_information_articles('slug',$1,$2::jsonb)",[`info-a-${suffix}`,JSON.stringify({category:"news",query:"Published",limit:10})]],
      [runtime,"select * from resolve_public_information_media($1)",[mediaA]],
      [system,"select * from information_redi_bootstrap($1,'articles:read')",[installationA]],
      [system,"select information_redi_reserve_nonce($1,$2,$3,now(),300)",[integrationA,siteA,`plan-nonce-${suffix}`]],
      [system,"select information_redi_begin_request($1,$2,$3,'articles.create',$4,3600)",[integrationA,siteA,`plan-request-${suffix}`,createHash("sha256").update("plan").digest("hex")]],
    ] as const) plans.push((await pool.query(`explain (analyze,buffers) ${sql}`,[...params])).rows.map((row:Record<string,string>)=>row["QUERY PLAN"]).join("\n"));
    expect(plans.every((plan)=>plan.includes("Execution Time"))).toBe(true);
  });
});
