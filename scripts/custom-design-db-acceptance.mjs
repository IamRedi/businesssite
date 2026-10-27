// Explicit disposable-only V3 test, including real classified database roles.
// Usage: MIGRATION_DATABASE_URL=... RLS_TEST_DISPOSABLE_DATABASE=true npx tsx scripts/custom-design-db-acceptance.mjs
import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { premiumCustomDesign } from "../packages/website-engine/src/custom-design.ts";
const url = process.env.MIGRATION_DATABASE_URL;
if (process.env.RLS_TEST_DISPOSABLE_DATABASE !== "true" || !url || !/^postgresql:\/\/postgres@127\.0\.0\.1:55452\/p5002$/.test(url)) throw new Error("Only the explicitly created p5002 disposable target is allowed.");
const admin = new pg.Pool({ connectionString: url });
const roleSuffix = randomBytes(6).toString("hex");
const ownerRole = `p5002_owner_${roleSuffix}`, runtimeRole = `p5002_runtime_${roleSuffix}`;
await admin.query(`create role ${ownerRole} login inherit nosuperuser nocreatedb nocreaterole nobypassrls in role bsrc_owner_ops`);
await admin.query(`create role ${runtimeRole} login inherit nosuperuser nocreatedb nocreaterole nobypassrls in role bsrc_runtime`);
const owner = new pg.Pool({ connectionString: url.replace("postgres@", `${ownerRole}@`) });
const runtime = new pg.Pool({ connectionString: url.replace("postgres@", `${runtimeRole}@`) });
const accountIds = [];
const suffix = randomUUID(), site = 'custom-'+suffix, slug = site, token = randomBytes(32).toString("hex"), viewerToken = randomBytes(32).toString("hex");
const doc = { id: site, slug, visibility: "private", content: { name: "Synthetic studio" }, contact: { phone: "synthetic" }, media: { logoUrl: "", heroImageUrl: "", galleryImageUrls: [], serviceImageUrls: [] }, publicLegal: { legalBusinessName: "Synthetic studio" } };
const media = { images: [], videos: [] };
let passed = 0;
try {
  for (const [role,session] of [["owner",token],["viewer",viewerToken]]) {
    const id = randomUUID(); accountIds.push(id); await admin.query("insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,password_changed_at) values($1,$2,'unused','active',$3,'synthetic',now(),now())", [id,`${id}@example.test`,role]);
    await admin.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour')", [randomUUID(),id,session]);
  }
  await admin.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'private',$3,now()+interval '1 day',now()+interval '30 days')",[site,slug,doc]);
  await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'editor',true),($1,'media',true)",[site]);
  assert.equal((await owner.query("select owner_custom_site_read($1,$2) v",[viewerToken,slug])).rows[0].v,null); passed++;
  assert.equal((await owner.query("select owner_custom_site_read($1,$2) v",["wrong",slug])).rows[0].v,null); passed++;
  assert.equal((await owner.query("select owner_custom_site_apply($1,$2,$3,$4,$5,false,'test') v",[viewerToken,slug,doc,premiumCustomDesign,media])).rows[0].v,null); passed++;
  await assert.rejects(runtime.query("select owner_custom_site_read($1,$2)",[token,slug]),/permission denied/); passed++;
  await assert.rejects(owner.query("select generated_document from sites"),/permission denied/); passed++;
  const read=(await owner.query("select owner_custom_site_read($1,$2) v",[token,slug])).rows[0].v;
  assert.deepEqual(read.document,doc); passed++;
  const publish=async expected => (await owner.query("select owner_custom_site_apply($1,$2,$3,$4,$5,false,'test') v",[token,slug,expected,premiumCustomDesign,media])).rows[0].v;
  const applied=await publish(doc); assert.deepEqual(applied._customRestore.document,doc); assert.deepEqual(applied.content,doc.content); assert.deepEqual(applied.customDesign,premiumCustomDesign); passed++;
  await assert.rejects(publish(doc),/custom_design_conflict/); passed++;
  const domain=`${suffix}.example.test`;
  const edits={...applied,content:{name:"Intervening content edit"}}; await admin.query("update sites set generated_document=$2,custom_domain=$3,custom_domain_status='pending_dns' where id=$1",[site,edits,domain]);
  const restored=(await owner.query("select owner_custom_site_apply($1,$2,$3,null,null,true,'test') v",[token,slug,edits])).rows[0].v;
  assert.equal(restored.customDesign,undefined); assert.equal(restored.content.name,"Intervening content edit"); assert.equal((await admin.query("select custom_domain from sites where id=$1",[site])).rows[0].custom_domain,domain); passed++;
  const resaved = await publish(restored), secondSave = await publish(resaved);
  assert.equal(secondSave._customRestore.document._customRestore,undefined); assert.deepEqual(secondSave._customRestore.document.customDesign,premiumCustomDesign); passed++;
  await admin.query("update sites set demo_expires_at=now()-interval '1 day' where id=$1",[site]); await assert.rejects(publish(secondSave),/custom_design_lifecycle_denied/); passed++;
  const audit=(await admin.query("select details from audit_events where entity_id=$1",[site])).rows; assert(!JSON.stringify(audit).includes('Synthetic studio')); passed++;
  assert.equal((await admin.query("select visibility from sites where id=$1",[site])).rows[0].visibility,'private'); passed++;
  console.log(JSON.stringify({result:"PASS",checks:passed,target:"local disposable PostgreSQL 16 p5002",runtimeDenied:true,ownerDirectSqlDenied:true,backupAtomic:true,staleWriteDenied:true,lifecycleDenied:true,restorePreservesContentAndDomain:true}));
} finally {
  await owner.end(); await runtime.end();
  await admin.query("delete from sites where id=$1", [site]);
  await admin.query("delete from owner_accounts where id=any($1::uuid[])", [accountIds]);
  await admin.query(`drop role ${ownerRole}; drop role ${runtimeRole}`);
  await admin.end();
}
