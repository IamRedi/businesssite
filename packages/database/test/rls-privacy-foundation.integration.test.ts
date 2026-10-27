import { createHash,randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll,beforeAll,describe,expect,it } from "vitest";

const adminUrl=process.env.RLS_TEST_ADMIN_DATABASE_URL;
const ownerUrl=process.env.RLS_TEST_OWNER_DATABASE_URL;
const runtimeUrl=process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const systemUrl=process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const suite=adminUrl&&ownerUrl&&runtimeUrl&&systemUrl?describe:describe.skip;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

suite("privacy retention/job/hold FORCE boundary",()=>{
 const admin=new pg.Pool({connectionString:adminUrl}); const owner=new pg.Pool({connectionString:ownerUrl,max:4});
 const runtime=new pg.Pool({connectionString:runtimeUrl}); const system=new pg.Pool({connectionString:systemUrl,max:4});
 const ownerId=randomUUID(),adminId=randomUUID(),operatorId=randomUUID();
 const sessionOwner=hash("privacy-owner"),sessionAdmin=hash("privacy-admin"),sessionOperator=hash("privacy-operator");
 const siteId=`privacy-site-${randomUUID()}`,leadId=`privacy-lead-${randomUUID()}`,appointmentId=randomUUID(),accountId=randomUUID();
 let step=100;
 beforeAll(async()=>{
  await admin.query(`insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step) values
   ($1,'privacy-owner@example.test','owner-hash','active','owner','v1.owner',now(),$4),
   ($2,'privacy-admin@example.test','admin-hash','active','admin','v1.admin',now(),$4),
   ($3,'privacy-operator@example.test','operator-hash','active','operator','v1.operator',now(),$4)`,[ownerId,adminId,operatorId,step]);
  await admin.query(`insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values
   (gen_random_uuid(),$1,$2,now(),now()+interval '12 hours'),(gen_random_uuid(),$3,$4,now(),now()+interval '12 hours'),(gen_random_uuid(),$5,$6,now(),now()+interval '12 hours')`,[ownerId,sessionOwner,adminId,sessionAdmin,operatorId,sessionOperator]);
  await admin.query("insert into leads(id,name,source,payload,created_at,updated_at) values($1,'Privacy fixture','fixture','{}',now()-interval '400 days',now()-interval '400 days')",[leadId]);
  await admin.query(`insert into sites(id,slug,visibility,generated_document,lead_id,demo_expires_at,trial_recovery_ends_at,activated_at,appointment_retention_days)
   values($1,$2,'private',$3,$4,now()-interval '200 days',now()-interval '170 days',now()-interval '180 days',180)`,[siteId,siteId,{fixture:"privacy"},leadId]);
  await admin.query("insert into site_admin_accounts(id,site_id,email,password_hash) values($1,$2,'privacy-customer@example.test','fixture')",[accountId,siteId]);
  await admin.query("insert into site_appointments(id,site_id,customer_name,phone,email,created_at) values($1,$2,'Synthetic requester','000','synthetic@example.test',now()-interval '181 days')",[appointmentId,siteId]);
  await admin.query("insert into site_subscriptions(site_id,plan_key,status,current_period_end) values($1,'starter','active',now()+interval '30 days')",[siteId]);
  await admin.query("insert into ai_runs(id,actor_type,actor_id,operation,site_id,provider,model,status,created_at) values(gen_random_uuid(),'owner',$1,'website_blueprint',$2,'fixture','fixture','completed',now()-interval '91 days')",[ownerId,siteId]);
 });
 afterAll(async()=>{await admin.query("delete from sites where id=$1",[siteId]);await admin.query("delete from leads where id=$1",[leadId]);await admin.query("delete from owner_accounts where id=any($1::uuid[])",[[ownerId,adminId,operatorId]]);await Promise.all([admin.end(),owner.end(),runtime.end(),system.end()]);});

 it("seeds one deterministic active Policy v1 with complete and safe rules",async()=>{
  const policy=(await admin.query("select version,status,manifest_hash,privacy_policy_valid(id) valid from privacy_policy_versions where status='active'")).rows;
  expect(policy).toEqual([{version:1,status:"active",manifest_hash:"ecd7d93ded8744dee6b379e4f883e1f11d61909153952e2090a542575d6865af",valid:true}]);
  expect((await admin.query("select count(*)::int count from privacy_retention_rules")).rows[0].count).toBe(17);
  expect((await admin.query("select count(*)::int count from privacy_retention_rules where legal_review_required and (automatic_disposition or disposition<>'manual_review')")).rows[0].count).toBe(0);
  await expect(admin.query("update privacy_retention_rules set automatic_disposition=true where class_key='contract_billing_accounting'")).rejects.toThrow(/privacy_rule_immutable/);
 });

 it("keeps customer/runtime direct access denied and admin read-only",async()=>{
  await expect(runtime.query("select * from privacy_jobs")).rejects.toThrow(/permission denied/);
  await expect(owner.query("select * from privacy_jobs")).rejects.toThrow(/permission denied/);
  expect((await owner.query("select owner_privacy_snapshot($1) value",[sessionAdmin])).rows[0].value.policy.version).toBe(1);
  expect((await owner.query("select owner_privacy_snapshot($1) value",[sessionOperator])).rows[0].value).toBeNull();
  expect((await owner.query("select * from owner_privacy_start_dry_run($1,'admin-hash',101,'site',$2,'admin-denied')",[sessionAdmin,siteId])).rows[0]).toMatchObject({ok:false,reason:"forbidden"});
 });

 it("creates an idempotent count-only plan and blocks active/manual-review classes",async()=>{
  const before=(await admin.query("select md5(generated_document::text) site,(select count(*)::int from site_appointments where site_id=$1) appointments from sites where id=$1",[siteId])).rows[0];
  const first=(await owner.query("select * from owner_privacy_start_dry_run($1,'owner-hash',$2,'site',$3,'privacy-dry-run')",[sessionOwner,++step,siteId])).rows[0];
  const duplicate=(await owner.query("select * from owner_privacy_start_dry_run($1,'owner-hash',$2,'site',$3,'privacy-dry-run-duplicate')",[sessionOwner,++step,siteId])).rows[0];
  expect(first.ok).toBe(true); expect(duplicate.job_id).toBe(first.job_id);
  const items=await admin.query("select data_class,status,eligible_count::int count,block_reason_code,policy_version_id is not null policy_pinned,policy_rule_id is not null rule_pinned,prerequisites,provider_reconciliation_required,legal_review_required from privacy_job_items where job_id=$1",[first.job_id]);
  expect(items.rows.find((row)=>row.data_class==="appointments")).toMatchObject({status:"eligible",count:1});
  expect(items.rows.find((row)=>row.data_class==="ai_detail")).toMatchObject({status:"eligible",count:1});
  expect(items.rows.find((row)=>row.data_class==="active_subscription")).toMatchObject({status:"blocked",block_reason_code:"active_subscription",policy_pinned:true,rule_pinned:true,prerequisites:["verified_cancellation","effective_end"]});
  expect(items.rows.find((row)=>row.data_class==="contract_billing_accounting")).toMatchObject({status:"blocked",block_reason_code:"manual_legal_review",legal_review_required:true,prerequisites:["manual_legal_review"]});
  expect((await admin.query("select status from privacy_jobs where id=$1",[first.job_id])).rows[0].status).toBe("awaiting_approval");
  expect((await admin.query("select md5(generated_document::text) site,(select count(*)::int from site_appointments where site_id=$1) appointments from sites where id=$1",[siteId])).rows[0]).toEqual(before);
 });

 it("applies and releases a scoped hold without rewriting creation evidence",async()=>{
  const created=(await owner.query("select * from owner_privacy_create_hold($1,'owner-hash',$2,'site',$3,array['appointments'],'billing_dispute','CASE-4701',now()+interval '10 days','hold-create')",[sessionOwner,++step,siteId])).rows[0];
  expect(created.ok).toBe(true);
  const plan=(await owner.query("select * from owner_privacy_start_dry_run($1,'owner-hash',$2,'appointment',$3,'held-plan')",[sessionOwner,++step,appointmentId])).rows[0];
  expect((await admin.query("select status,error_code from privacy_jobs where id=$1",[plan.job_id])).rows[0]).toEqual({status:"blocked",error_code:"legal_hold"});
  expect((await admin.query("select status,eligible_count::int count,block_reason_code from privacy_job_items where job_id=$1 and data_class='appointments'",[plan.job_id])).rows[0]).toEqual({status:"blocked",count:0,block_reason_code:"legal_hold"});
  expect((await owner.query("select owner_privacy_release_hold($1,'owner-hash',$2,$3,'hold-release') ok",[sessionOwner,++step,created.hold_id])).rows[0].ok).toBe(true);
  expect((await admin.query("select status,released_at is not null released from privacy_legal_holds where id=$1",[created.hold_id])).rows[0]).toEqual({status:"released",released:true});
  await expect(admin.query("delete from privacy_legal_holds where id=$1",[created.hold_id])).rejects.toThrow(/privacy_evidence_immutable/);
 });

 it("supports version replacement transactionally without changing historical jobs",async()=>{
  const client=await owner.connect(); try{await client.query("begin");
   const cloned=(await client.query("select * from owner_privacy_clone_policy($1,'owner-hash',$2,2,'policy-clone')",[sessionOwner,++step])).rows[0]; expect(cloned.ok).toBe(true);
   expect((await client.query("select owner_privacy_activate_policy($1,'owner-hash',$2,$3,'policy-activate') ok",[sessionOwner,++step,cloned.policy_id])).rows[0].ok).toBe(true);
   expect((await client.query("select owner_privacy_snapshot($1) value",[sessionOwner])).rows[0].value.policy.version).toBe(2);
   await client.query("rollback");
  }finally{client.release();}
  expect((await admin.query("select version from privacy_policy_versions where status='active'")).rows[0].version).toBe(1);
 });

 it("lets one concurrent system worker claim and plan while all other actors remain denied",async()=>{
  const queued=(await system.query("select privacy_system_enqueue_retention_scan('lead',$1,'system-scan') id",[leadId])).rows[0].id; expect(queued).toBeTruthy();
  const [left,right]=await Promise.all([system.query("select privacy_system_claim_retention_job('worker-a',300) id"),system.query("select privacy_system_claim_retention_job('worker-b',300) id")]);
  const claims=[left.rows[0].id,right.rows[0].id].filter(Boolean); expect(claims).toEqual([queued]);
  const worker=left.rows[0].id?"worker-a":"worker-b"; expect((await system.query("select privacy_system_plan_retention_job($1,$2) ok",[queued,worker])).rows[0].ok).toBe(true);
  await expect(runtime.query("select privacy_system_claim_retention_job('attacker',300)")).rejects.toThrow(/permission denied/);
 });

 it("rejects unknown/terminal transitions and false completion",async()=>{
  const job=(await admin.query("select id from privacy_jobs where subject_kind='lead' and subject_reference=$1 order by created_at desc limit 1",[leadId])).rows[0].id;
  await expect(admin.query("update privacy_jobs set status='completed' where id=$1",[job])).rejects.toThrow(/privacy_job_transition_denied/);
  const event=(await admin.query("select id from privacy_job_events where job_id=$1 limit 1",[job])).rows[0].id;
  await expect(admin.query("delete from privacy_job_events where id=$1",[event])).rejects.toThrow(/privacy_evidence_immutable/);
 });

 it("records local query-plan evidence without PII",async()=>{
  const plans=await Promise.all([
   admin.query("explain (analyze,buffers,format text) select * from privacy_policy_versions where status='active'"),
   admin.query("explain (analyze,buffers,format text) select privacy_hold_applies('site',$1,$1,'appointments')",[siteId]),
   admin.query("explain (analyze,buffers,format text) select * from privacy_jobs where status='queued' order by created_at limit 1"),
  ]);
  expect(plans.every((plan)=>plan.rows.length>0)).toBe(true);
 });
});
