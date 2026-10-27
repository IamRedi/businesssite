import { createHash,randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll,beforeAll,beforeEach,afterEach,describe,expect,it } from "vitest";
import { currentDatabaseContext,withAuthenticatedOwnerContext } from "../src/index";

const adminUrl=process.env.RLS_TEST_ADMIN_DATABASE_URL;
const ownerUrl=process.env.RLS_TEST_OWNER_DATABASE_URL;
const runtimeUrl=process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const systemUrl=process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const enabled=Boolean(adminUrl&&ownerUrl&&runtimeUrl&&systemUrl);
const suite=enabled?describe:describe.skip;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

suite("owner procedure-only RLS boundary",()=>{
 const admin=new pg.Pool({connectionString:adminUrl});const owner=new pg.Pool({connectionString:ownerUrl});
 const runtime=new pg.Pool({connectionString:runtimeUrl});const system=new pg.Pool({connectionString:systemUrl});
 const ownerA=randomUUID(),viewer=randomUUID(),disabled=randomUUID();
 const usageSiteId=randomUUID(),siteSlug=`b3c1-usage-${usageSiteId.slice(0,8)}`;
 const sessionA=hash("b3c1-owner-a"),sessionViewer=hash("b3c1-viewer"),sessionDisabled=hash("b3c1-disabled");
 beforeAll(async()=>{
  await admin.query("insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at,site_kind) values($1,$2,'private','{}',now()+interval '1 day',now()+interval '31 days','business')",[usageSiteId,siteSlug]);
  await admin.query(`insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step) values
   ($1,'b3c1-owner@example.test','owner-hash','active','owner','v1.owner',now(),10),
   ($2,'b3c1-viewer@example.test','viewer-hash','active','viewer','v1.viewer',now(),10),
   ($3,'b3c1-disabled@example.test','disabled-hash','disabled','owner','v1.disabled',now(),10)`,[ownerA,viewer,disabled]);
  await admin.query(`insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at,revoked_at) values
   (gen_random_uuid(),$1,$2,now(),now()+interval '12 hours',null),(gen_random_uuid(),$3,$4,now(),now()+interval '12 hours',null),(gen_random_uuid(),$5,$6,now(),now()+interval '12 hours',null)`,[ownerA,sessionA,viewer,sessionViewer,disabled,sessionDisabled]);
 });
 afterAll(async()=>{await admin.query("delete from sites where id=$1",[usageSiteId]);await admin.query("delete from owner_accounts where id=any($1::uuid[])",[[ownerA,viewer,disabled]]);await Promise.all([admin.end(),owner.end(),runtime.end(),system.end()]);});

 it("uses a distinct non-privileged identity with zero table grants",async()=>{
  const role=(await owner.query("select current_user role,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=current_user")).rows[0];
  expect(new Set([role.role,(await runtime.query("select current_user role")).rows[0].role,(await system.query("select current_user role")).rows[0].role,process.env.RLS_TEST_MIGRATOR_ROLE]).size).toBe(4);
  expect([role.rolsuper,role.rolbypassrls,role.rolcreatedb,role.rolcreaterole]).toEqual([false,false,false,false]);
  expect(Number((await admin.query("select count(*) count from information_schema.role_table_grants where grantee=$1",[process.env.RLS_TEST_OWNER_ROLE])).rows[0].count)).toBe(0);
 });
 it("denies direct tables and foreign roles",async()=>{
  await expect(owner.query("select * from owner_accounts")).rejects.toThrow(/permission denied/);
  await expect(runtime.query("select * from owner_team_list($1)",[sessionA])).rejects.toThrow(/permission denied/);
  await expect(system.query("select * from owner_team_list($1)",[sessionA])).rejects.toThrow(/permission denied/);
  expect((await owner.query("select owner_auth_record_audit($1::jsonb) ok",[JSON.stringify({action:"owner.unclassified",outcome:"success"})])).rows[0].ok).toBe(false);
 });
 it("resolves only active MFA sessions and DB permissions",async()=>{
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",[sessionA,"team.manage"])).rowCount).toBe(1);
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",[sessionViewer,"team.manage"])).rowCount).toBe(0);
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",[sessionDisabled,"team.manage"])).rowCount).toBe(0);
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",["malformed","team.manage"])).rowCount).toBe(0);
 });
 it("reflects a DB role change immediately",async()=>{
  await admin.query("update owner_accounts set role='operator' where id=$1",[viewer]);
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",[sessionViewer,"finder.write"])).rowCount).toBe(1);
  expect((await owner.query("select * from owner_auth_resolve_session($1,$2)",[sessionViewer,"billing.manage"])).rowCount).toBe(0);
  await admin.query("update owner_accounts set role='viewer' where id=$1",[viewer]);
 });
 it("returns safe team and customer projections",async()=>{
  const team=await owner.query("select * from owner_team_list($1)",[sessionA]);
  expect(team.fields.map((field)=>field.name)).not.toEqual(expect.arrayContaining(["password_hash","token_hash","mfa_secret_encrypted"]));
  const customers=await owner.query("select * from owner_customer_list($1,10,0)",[sessionA]);
  expect(customers.fields.map((field)=>field.name)).not.toEqual(expect.arrayContaining(["provider_customer_id","provider_subscription_id","generated_document","metadata"]));
  const usage=await owner.query("select owner_usage_snapshot($1,$2) snapshot",[sessionA,siteSlug]);
  expect(usage.rows[0].snapshot).toMatchObject({state:"normal",counters:[],events:[]});
  expect((await owner.query("select owner_usage_snapshot($1,$2) snapshot",[sessionViewer,siteSlug])).rows[0].snapshot).toBeTruthy();
  expect((await owner.query("select owner_usage_override($1,$2,$3,$4,now()+interval '1 hour',$5) ok",[sessionViewer,siteSlug,"normal","denied",randomUUID()])).rows[0].ok).toBe(false);
  expect((await owner.query("select owner_usage_override($1,$2,$3,$4,now()+interval '1 hour',$5) ok",[sessionA,siteSlug,"normal","verified support case",randomUUID()])).rows[0].ok).toBe(true);
 });
 it("records allowlisted provider usage and returns only owner-authorized aggregates",async()=>{
  expect((await admin.query("select exists(select 1 from schema_migrations where name='069_provider_usage_public_execute_authority.sql') applied")).rows[0].applied).toBe(true);
  const routines=(await admin.query(
   `select p.proname,r.rolname owner,
           exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE') public_execute_acl,
           has_function_privilege($1,p.oid,'execute') owner_execute,
           has_function_privilege($2,p.oid,'execute') runtime_execute,
           has_function_privilege($3,p.oid,'execute') system_execute
    from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid=any(array[
      to_regprocedure('public.owner_provider_usage_record(text,text,text,bigint,text,date)'),
      to_regprocedure('public.owner_provider_usage_snapshot(text)')
    ]::oid[]) order by p.proname`,
   [process.env.RLS_TEST_OWNER_ROLE,process.env.RLS_TEST_RUNTIME_ROLE,process.env.RLS_TEST_SYSTEM_ROLE],
  )).rows;
  expect(routines).toHaveLength(2);
  expect(routines.every((routine)=>routine.owner===(process.env.DATABASE_OWNER_EXECUTOR_ROLE??"bsrc_owner_executor"))).toBe(true);
  expect(routines.every((routine)=>routine.public_execute_acl===false&&routine.owner_execute===true&&routine.runtime_execute===false&&routine.system_execute===false)).toBe(true);
  const event=(await owner.query("select owner_provider_usage_record($1,'places_text_search','places_text_search_enterprise',35000,'google-maps-global-2026-09-10','2026-09-10'::date) id",[sessionA])).rows[0].id;
  expect(event).toMatch(/^[0-9a-f-]{36}$/);
  const snapshot=(await owner.query("select owner_provider_usage_snapshot($1) snapshot",[sessionA])).rows[0].snapshot;
  expect(snapshot.month).toMatchObject({calls:expect.any(Number),estimatedCostUsdMicros:expect.any(Number)});
  expect(snapshot.providers).toEqual(expect.arrayContaining([expect.objectContaining({provider:"google_maps",service:"places_text_search",estimatedCostUsdMicros:35000})]));
  expect(JSON.stringify(snapshot)).not.toMatch(/query|address|prompt|api.?key|provider.?response/i);
  await expect(owner.query("select owner_provider_usage_record($1,'places_text_search','wrong',1,'wrong','2026-09-10'::date)",[sessionA])).rejects.toThrow(/Unsupported provider usage contract/);
  await expect(owner.query("select owner_provider_usage_snapshot($1)",[sessionDisabled])).rejects.toThrow(/authorization required/i);
  await expect(runtime.query("select owner_provider_usage_snapshot($1)",[sessionA])).rejects.toThrow(/permission denied/);
  expect((await admin.query("select has_function_privilege('public','owner_provider_usage_snapshot(text)','execute') allowed")).rows[0].allowed).toBe(false);
  expect((await admin.query("select has_function_privilege('public','owner_provider_usage_record(text,text,text,bigint,text,date)','execute') allowed")).rows[0].allowed).toBe(false);
 });
 describe("provider control center authority and admission",()=>{
  const call=async(action:string,payload:Record<string,unknown>={},session=sessionA)=>(await owner.query("select owner_provider_control($1,$2,$3::jsonb) value",[session,action,JSON.stringify(payload)])).rows[0].value;
  const saved={aiEnabled:true,aiModel:"gpt-5.6-luna",aiBudgetEur:5,googleEnabled:true,googleDailyLimit:30,googleMonthlyLimit:1000,geocodingMonthlyLimit:10000};
  const save=(patch:Record<string,unknown>={},revision=0,requestId=randomUUID())=>call("save",{requestId,revision,settings:{...saved,...patch}});
  beforeEach(async()=>{await admin.query("delete from audit_events where entity_type='provider_controls'");});
  afterEach(async()=>{await admin.query("delete from audit_events where entity_type='provider_controls'");});
  it("has canonical owner/grants without PUBLIC, runtime or system execution",async()=>{
   const value=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,has_function_privilege('public',oid,'execute') public from pg_proc where oid='owner_provider_control(text,text,jsonb)'::regprocedure")).rows[0];
   expect(value).toMatchObject({owner:process.env.RLS_TEST_OWNER_EXECUTOR_ROLE??"bsrc_owner_executor",prosecdef:true,public:false,proconfig:["search_path=pg_catalog"]});
   await expect(runtime.query("select owner_provider_control($1,'snapshot','{}')",[sessionA])).rejects.toThrow(/permission denied/);
   await expect(system.query("select owner_provider_control($1,'snapshot','{}')",[sessionA])).rejects.toThrow(/permission denied/);
   await expect(call("snapshot",{},sessionDisabled)).rejects.toThrow(/authorization required/);
   await expect(call("save",{revision:0,requestId:randomUUID(),settings:saved},sessionViewer)).rejects.toThrow(/authorization required/);
  });
  it("persists owner changes with CAS and idempotency",async()=>{
   const id=randomUUID();const first=await save({},0,id);expect(first.settings).toMatchObject({revision:1,aiBudgetEur:5});
   expect((await save({},0,id)).settings.revision).toBe(1);
   await expect(save({aiBudgetEur:10},0)).rejects.toThrow(/settings_changed/);
   expect((await save({aiBudgetEur:10},1)).settings.aiBudgetEur).toBe(10);
   expect(JSON.stringify(await call("snapshot"))).not.toMatch(/token_hash|password|mfa_secret|prompt/);
  });
  it("rejects JSON nulls, arbitrary fields and unknown actions in SQL",async()=>{
   for(const patch of [{aiModel:null},{aiEnabled:null},{aiBudgetEur:null},{googleDailyLimit:1.5},{unexpected:true}]) await expect(save(patch)).rejects.toThrow(/settings_invalid/);
   await expect(call("arbitrary")).rejects.toThrow(/control_invalid/);
  });
  it("reserves exactly one concurrent AI request and settles idempotently",async()=>{
   await save();const ids=[randomUUID(),randomUUID()];
   const results=await Promise.allSettled(ids.map(requestId=>call("reserve_ai",{requestId,revision:1,model:"gpt-5.6-luna"})));
   expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
   const id=ids[results.findIndex(r=>r.status==="fulfilled")];
   await call("settle_ai",{requestId:id,estimatedCostUsdMicros:200000});await call("settle_ai",{requestId:id,estimatedCostUsdMicros:200000});
   await expect(call("settle_ai",{requestId:id,estimatedCostUsdMicros:0})).rejects.toThrow(/settlement_conflict/);
   const snapshot=await call("snapshot");expect(snapshot).toMatchObject({aiUsedUsdMicros:200000,aiCommittedUsdMicros:200000,aiPending:0});
   await expect(call("reserve_ai",{requestId:id,revision:1,model:"gpt-5.6-luna"})).rejects.toThrow(/already_reserved/);
  });
  it("stops at budget and adds allowance without deleting spend",async()=>{
   await save({aiBudgetEur:0});await expect(call("reserve_ai",{requestId:randomUUID(),revision:1,model:"gpt-5.6-luna"})).rejects.toThrow(/ai_budget/);
   await call("add_budget",{requestId:randomUUID(),revision:1,amountEur:5});
   const id=randomUUID();await call("reserve_ai",{requestId:id,revision:2,model:"gpt-5.6-luna"});await call("settle_ai",{requestId:id,estimatedCostUsdMicros:6000000});
   await expect(call("reserve_ai",{requestId:randomUUID(),revision:2,model:"gpt-5.6-luna"})).rejects.toThrow(/ai_budget/);
   const topupId=randomUUID();const after=await call("add_budget",{requestId:topupId,revision:2,amountEur:5});expect(after.aiUsedUsdMicros).toBe(6000000);expect(after.settings.aiExtraEur).toBe(10);
   expect((await call("add_budget",{requestId:topupId,revision:2,amountEur:5})).settings.aiExtraEur).toBe(10);
  });
  it("holds unconfirmed cost after timeout instead of treating it as free",async()=>{
   await save();const id=randomUUID();await call("reserve_ai",{requestId:id,revision:1,model:"gpt-5.6-luna"});
   await admin.query("update audit_events set created_at=now()-interval '3 minutes' where id=$1",[id]);
   expect(await call("snapshot")).toMatchObject({aiUsedUsdMicros:0,aiPending:0,aiUncertain:1,aiCommittedUsdMicros:5796000});
   await expect(call("reserve_ai",{requestId:randomUUID(),revision:1,model:"gpt-5.6-luna"})).rejects.toThrow(/ai_budget/);
  });
  it("enforces pause/model changes before admission",async()=>{
   await save({aiEnabled:false});await expect(call("reserve_ai",{requestId:randomUUID(),revision:1,model:"gpt-5.6-luna"})).rejects.toThrow(/paused/);
   await save({},1);await expect(call("reserve_ai",{requestId:randomUUID(),revision:1,model:"gpt-5.6-luna"})).rejects.toThrow(/settings_changed/);
   await expect(call("reserve_ai",{requestId:randomUUID(),revision:2,model:"gpt-5.6-sol"})).rejects.toThrow(/model_invalid/);
  });
  it("checks each Google request atomically before inserting its usage event",async()=>{
   const current=await call("snapshot");await save({googleDailyLimit:500,googleMonthlyLimit:current.googleCalls+1});
   const record=()=>owner.query("select owner_provider_usage_record($1,'places_text_search','places_text_search_enterprise',35000,'google-maps-global-2026-09-10','2026-09-10')",[sessionA]);
   const results=await Promise.allSettled([record(),record()]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
   expect((await call("snapshot")).googleCalls).toBe(current.googleCalls+1);
   await save({googleEnabled:false},1);await expect(record()).rejects.toThrow(/paused/);
   expect((await call("snapshot")).googleCalls).toBe(current.googleCalls+1);
  });
  it("renews monthly allowance without erasing historic audit events",async()=>{
   await save();await call("add_budget",{requestId:randomUUID(),revision:1,amountEur:5});
   await admin.query("update audit_events set details=jsonb_set(details,'{extraMonth}',to_jsonb(to_char(now()-interval '1 month','YYYY-MM'))) where entity_type='provider_controls' and action='settings_saved'");
   const snapshot=await call("snapshot");expect(snapshot.settings.aiExtraEur).toBe(0);
   expect(Number((await admin.query("select count(*) n from audit_events where entity_type='provider_controls' and action='settings_saved'")).rows[0].n)).toBe(2);
  });
 });

 it("installs and cleans transaction-local owner context",async()=>{
  const result=await withAuthenticatedOwnerContext(owner,sessionA,"team.manage",async(client,actor)=>{
   expect(actor.ownerId).toBe(ownerA);expect(currentDatabaseContext()).toMatchObject({actorKind:"owner",ownerId:ownerA,ownerRole:"owner",ownerPermission:"team.manage"});
   return (await client.query("select current_setting('app.owner_id',true) value")).rows[0].value;
  },"b3c1-context");
  expect(result).toBe(ownerA);expect(currentDatabaseContext()).toBeUndefined();
  expect((await owner.query("select current_setting('app.owner_id',true) value")).rows[0].value).toBe("");
 });
 it("cleans context after rollback and refuses nested contexts",async()=>{
  await expect(withAuthenticatedOwnerContext(owner,sessionA,"team.manage",async()=>{
   await expect(withAuthenticatedOwnerContext(owner,sessionA,"team.manage",async()=>true)).rejects.toThrow(/Nested/);
   throw new Error("rollback-marker");
  })).rejects.toThrow("rollback-marker");
  expect(currentDatabaseContext()).toBeUndefined();
 });
 it("records synthetic owner boundary EXPLAIN evidence",async()=>{
  const plans=[] as string[];
  for(const query of [
   ["select * from owner_auth_resolve_session($1,$2)",[sessionA,"team.manage"]],
   ["select * from owner_team_list($1)",[sessionA]],
   ["select * from owner_customer_list($1,25,0)",[sessionA]],
   ["select owner_usage_snapshot($1,$2)",[sessionA,siteSlug]],
   ["select owner_provider_usage_snapshot($1)",[sessionA]],
   ["select * from owner_invitation_lookup($1)",[hash("missing-invitation")]],
   ["select * from owner_legal_configs($1)",[sessionA]],
  ] as const){const rows=(await owner.query(`explain (analyze,buffers) ${query[0]}`,[...query[1]])).rows;plans.push(rows.map((row:Record<string,string>)=>row["QUERY PLAN"]).join("\n"));}
  console.info("B3C1 EXPLAIN evidence (synthetic disposable fixture)\n"+plans.join("\n---\n"));
  expect(plans.every((plan)=>plan.includes("Execution Time"))).toBe(true);
 });
});
