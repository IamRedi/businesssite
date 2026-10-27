// Synthetic V3 acceptance: only the explicitly created loopback disposable DB.
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {databaseAccessViolations} from './database-access-verifier.mjs';
const url=process.env.MIGRATION_DATABASE_URL;
if(process.env.RLS_TEST_DISPOSABLE_DATABASE!=='true'||url!=='postgresql://postgres@127.0.0.1:55456/p50021_custom_media_upgrade')throw new Error('Explicit disposable custom-media target required.');
const admin=new pg.Pool({connectionString:url}), suffix=randomBytes(6).toString('hex'), ownerRole=`media_owner_${suffix}`, runtimeRole=`media_runtime_${suffix}`;
await admin.query(`create role ${ownerRole} login inherit nosuperuser nocreatedb nocreaterole nobypassrls in role bsrc_owner_ops`);
await admin.query(`create role ${runtimeRole} login inherit nosuperuser nocreatedb nocreaterole nobypassrls in role bsrc_runtime`);
const owner=new pg.Pool({connectionString:url.replace('postgres@',`${ownerRole}@`)}), runtime=new pg.Pool({connectionString:url.replace('postgres@',`${runtimeRole}@`)});
const ids=[], site=`media-${randomUUID()}`, other=`media-${randomUUID()}`, session=randomBytes(32).toString('hex'), viewer=randomBytes(32).toString('hex'), noMfa=randomBytes(32).toString('hex');
const authority='store_ExampleStore0001', doc={id:site,slug:site,visibility:'private',content:{name:'Synthetic custom media'},customDesign:{video:{mode:'showcase',maxDurationSeconds:30}}};
const context=async token=>(await owner.query('select owner_custom_media_context($1,$2) v',[token,site])).rows[0].v;
const key=`sites/${site}/custom/${randomUUID()}-synthetic.webp`, publicUrl=`https://examplestore0001.public.blob.vercel-storage.com/${key}`;
const base=[session,site,authority,key,publicUrl,'image/webp',44,16,16,null];
const register=async args=>(await owner.query('select owner_custom_media_register($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) v',args)).rows[0].v;
let passed=0;
try {
 for(const [role,token,mfa] of [['owner',session,true],['viewer',viewer,true],['owner',noMfa,false]]) {
  const id=randomUUID();ids.push(id);
  await admin.query("insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,password_changed_at) values($1,$2,'unused','active',$3,case when $4 then 'synthetic' else null end,case when $4 then now() else null end,now())",[id,`${id}@example.test`,role,mfa]);
  await admin.query("insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values($1,$2,$3,now(),now()+interval '1 hour')",[randomUUID(),id,token]);
 }
 for(const id of [site,other]) {
  await admin.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$1,'private',$2,now()+interval '1 day',now()+interval '30 days')",[id,doc]);
  await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'editor',true),($1,'media',true)",[id]);
 }
 assert.deepEqual(await context(session),{siteId:site,maxDurationSeconds:30});passed++;
 for(const token of [viewer,noMfa,'invalid']) {assert.equal(await context(token),null);assert.equal(await register([token,...base.slice(1)]),null);passed++;}
 await assert.rejects(runtime.query('select owner_custom_media_context($1,$2)',[session,site]),/permission denied/);passed++;
 await assert.rejects(owner.query('select * from site_media_assets'),/permission denied/);passed++;
 for(const [index,value] of [[1,other],[2,'store_BAD'],[2,'store_KZTiY4mQqmSqD0wx'],[3,key.replace(site,other)],[4,publicUrl.replace('.public.','.private.')],[4,publicUrl+'?token=bad'],[5,'video/webm'],[5,'image/svg+xml'],[6,4194305],[7,2001],[8,0],[9,2]]) {
  const args=[...base];args[index]=value;assert.equal(await register(args),null,`reject argument ${index}`);passed++;
 }
 const id=await register(base);assert(id);assert.equal(await register(base),id);passed++;
 const modified=[...base];modified[6]=45;assert.equal(await register(modified),null);passed++;
 const videoKey=key.replace('.webp','.mp4'), video=[session,site,authority,videoKey,publicUrl.replace('.webp','.mp4'),'video/mp4',1657,16,16,2];
 assert(await register(video));passed++;
 for(const [index,value] of [[6,4000001],[7,3841],[9,0],[9,31],[9,'NaN']]) {const args=[...video];args[index]=value;assert.equal(await register(args),null);passed++;}
 const rows=(await admin.query('select site_id,storage_provider,storage_access,provider_authority,storage_key,public_url,mime_type,width,height from site_media_assets where site_id=$1 order by mime_type',[site])).rows;
 assert.equal(rows.length,2);for(const row of rows){assert.equal(row.site_id,site);assert.equal(row.storage_provider,'vercel_blob');assert.equal(row.storage_access,'public');assert.equal(row.provider_authority,authority);assert(row.storage_key.startsWith(`sites/${site}/custom/`));assert.equal(row.width,16);assert.equal(row.height,16);}passed++;
 for(const feature of ['media','editor']) {await admin.query('update site_features set enabled=false where site_id=$1 and feature_key=$2',[site,feature]);assert.equal(await context(session),null);assert.equal(await register(base),null);await admin.query('update site_features set enabled=true where site_id=$1 and feature_key=$2',[site,feature]);passed++;}
 await admin.query("update sites set site_kind='information' where id=$1",[site]);assert.equal(await context(session),null);await admin.query("update sites set site_kind='business',demo_expires_at=now()-interval '1 day' where id=$1",[site]);assert.equal(await context(session),null);await admin.query("update sites set demo_expires_at=now()+interval '1 day' where id=$1",[site]);passed++;
 await admin.query("update owner_sessions set revoked_at=now() where token_hash=$1",[session]);assert.equal(await register(base),null);passed++;
 const state=(await admin.query('select visibility,generated_document,custom_domain from sites where id=$1',[site])).rows[0];assert.equal(state.visibility,'private');assert.equal(state.custom_domain,null);assert.deepEqual(state.generated_document,doc);passed++;
 assert.deepEqual(await databaseAccessViolations(admin),[]);passed++;
 console.log(JSON.stringify({result:'PASS',checks:passed,migrationBaseline:'078',providerCleanupModel:'site_media_assets',storeAuthority:authority,customerPublication:'unchanged',rlsAcl:'PASS'}));
} finally {
 await admin.query('delete from sites where id=any($1::text[])',[[site,other]]);
 await admin.query('delete from owner_accounts where id=any($1::uuid[])',[ids]);
 await owner.end();await runtime.end();
 await admin.query(`drop role ${ownerRole}`);await admin.query(`drop role ${runtimeRole}`);await admin.end();
}
