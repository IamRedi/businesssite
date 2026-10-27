import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const enabled = process.env.RLS_TEST_DISPOSABLE_DATABASE === "true" && Boolean(process.env.RLS_TEST_ADMIN_DATABASE_URL && process.env.RLS_TEST_RUNTIME_DATABASE_URL);
const admin = new Pool({ connectionString: process.env.RLS_TEST_ADMIN_DATABASE_URL });
const runtime = new Pool({ connectionString: process.env.RLS_TEST_RUNTIME_DATABASE_URL, max: 8 });
const a = randomUUID(), b = randomUUID();
const slug = (id: string) => "appt-" + id;
const fingerprint = "a".repeat(64), changed = "b".repeat(64), digest = "c".repeat(64);
const quotas = Object.fromEntries(["starter","professional","premium"].map(p => [p,[{window:"minute",limit:20},{window:"day",limit:30},{window:"month",limit:300}]]));
const input = (id: string = a) => ({ contractVersion:1, slug:slug(id),customerName:"Synthetic Visitor",phone:"123",serviceTitle:"Consultation",preferredDate:"2028-02-29",preferredTime:"09:30:00" });
async function create(options: {site?:string;key?:string;payload?:unknown;active?:string;fingerprints?:Record<string,string>;quota?:unknown} = {}) {
  const site = options.site ?? a;
  return (await runtime.query("select public_appointment_create_v1($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7::jsonb) value",
    [slug(site),site,options.key ?? digest,JSON.stringify(options.payload ?? input(site)),options.active ?? "v1",
      JSON.stringify(options.fingerprints ?? {v1:fingerprint}),JSON.stringify(options.quota ?? quotas)])).rows[0].value;
}
async function receipt(site = a, key = digest, versions = ["v1"]) {
  return (await runtime.query("select public_appointment_receipt_v1($1,$2,$3,$4::text[]) value", [slug(site),site,key,versions])).rows[0].value;
}
async function counts() {
  return (await admin.query("select (select count(*)::int from site_appointments where site_id=$1) appointments,(select coalesce(sum(quantity),0)::int from tenant_usage_counters where site_id=$1 and metric='appointment_submission') charges",[a])).rows[0];
}
describe.skipIf(!enabled)("APPT002 disposable concurrency, privacy and authority", () => {
  beforeAll(async () => {
    for (const id of [a,b]) {
      await admin.query("insert into sites(id,slug,visibility,publication_intent,activated_at,generated_document,demo_expires_at,trial_recovery_ends_at) values($1,$2,'public','public',now(),$3,now()+interval '14 days',now()+interval '44 days')",
        [id,slug(id),{ id,slug:slug(id),services:[{id:"synthetic-service",title:"Consultation",description:"Synthetic"}] }]);
      await admin.query("insert into site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'appointment_requests',true)",[id]);
      await admin.query("insert into site_subscriptions(site_id,status,plan_key) values($1,'active','starter')",[id]);
    }
  });
  beforeEach(async () => {
    await admin.query("delete from site_appointments where site_id=any($1::text[])",[[a,b]]);
    await admin.query("delete from tenant_usage_counters where site_id=any($1::text[])",[[a,b]]);
    await admin.query("delete from tenant_usage_states where site_id=any($1::text[])",[[a,b]]);
  });
  afterAll(async () => {
    await admin.query("delete from sites where id=any($1::text[])",[[a,b]]);
    await Promise.all([admin.end(),runtime.end()]);
  });
  it("parallel identical retries commit one appointment and one charge per window", async () => {
    const results = await Promise.all(Array.from({length:8},() => create()));
    expect(results.every(r => r.ok)).toBe(true);
    expect(results.filter(r => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map(r => r.receipt.appointmentId)).size).toBe(1);
    expect(await counts()).toEqual({appointments:1,charges:3});
  });
  it("denies changed payload and wrong tenant; separate intentions sharing contact/time remain distinct",async () => {
    await create();
    expect(await create({payload:{...input(),phone:"different"},fingerprints:{v1:changed}})).toEqual({errorCode:"idempotency_conflict"});
    expect(await receipt(b)).toEqual({errorCode:"not_found"});
    expect((await create({key:"d".repeat(64)})).replayed).toBe(false);
    expect(await counts()).toEqual({appointments:2,charges:6});
  });
  it("recovers a lost post-commit response and projects current status without creating",async () => {
    const saved = await create();
    await admin.query("update site_appointments set status='confirmed' where id=$1",[saved.receipt.appointmentId]);
    const recovered = await create();
    expect(recovered.receipt).toEqual(saved.receipt);
    expect(recovered).toMatchObject({replayed:true,appointment:{status:"confirmed",version:2}});
    expect(await receipt()).toEqual(recovered); expect(await counts()).toEqual({appointments:1,charges:3});
    for (const field of ["phone","email","customerName","note","receipt_key_digest","request_fingerprint"])
      expect(JSON.stringify(recovered)).not.toContain('"'+field+'"');
  });
  it("rotation uses the stored version; missing stored keys cannot create or recover",async () => {
    await create();
    expect((await create({active:"v2",fingerprints:{v1:fingerprint,v2:changed}})).replayed).toBe(true);
    expect(await create({active:"v2",fingerprints:{v2:changed}})).toEqual({errorCode:"temporarily_unavailable"});
    expect(await receipt(a,digest,["v2"])).toEqual({errorCode:"temporarily_unavailable"});
    expect(await counts()).toEqual({appointments:1,charges:3});
  });
  it("known expired keys return 410 semantics; purged receipts give no replay guarantee",async () => {
    const saved = await create();
    await admin.query("update site_appointments set created_at=now()-interval '25 hours',receipt_expires_at=now()-interval '1 hour' where id=$1",[saved.receipt.appointmentId]);
    expect(await create()).toEqual({errorCode:"capability_expired"});
    expect(await receipt()).toEqual({errorCode:"capability_expired"});
    await admin.query("delete from site_appointments where id=$1",[saved.receipt.appointmentId]);
    expect(await receipt()).toEqual({errorCode:"not_found"});
  });
  it("quota failure never charges earlier windows or inserts a receipt",async () => {
    await admin.query("insert into tenant_usage_counters(site_id,metric,window_type,window_start,quantity) values($1,'appointment_submission','day',date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',30)",[a]);
    const denied = await create(); expect(denied.errorCode).toBe("quota_reached"); expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(await counts()).toEqual({appointments:0,charges:30});
    expect(await receipt()).toEqual({errorCode:"not_found"});
  });
  it("failure after appointment insert rolls back the appointment and all quota counters",async () => {
    const name = "appt_fault_" + a.replaceAll("-","");
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("create function public."+name+"() returns trigger language plpgsql as $$ begin if new.site_id='"+a+"' and new.metric='appointment_submission' then raise exception 'synthetic quota write failure'; end if; return new; end $$");
      await client.query("revoke all on function public."+name+"() from public");
      await client.query("create trigger "+name+" before insert on tenant_usage_counters for each row execute function public."+name+"()");
      await client.query("commit");
      await expect(create()).rejects.toThrow("synthetic quota write failure");
      expect(await counts()).toEqual({appointments:0,charges:0});
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.query("drop trigger if exists "+name+" on tenant_usage_counters");
      await client.query("drop function if exists public."+name+"()"); client.release();
    }
    expect((await create()).replayed).toBe(false);
  });
  it("outer transaction rollback also leaves no receipt or charges",async () => {
    const client = await runtime.connect();
    try {
      await client.query("begin");
      await client.query("select public_appointment_create_v1($1,$2,$3,$4::jsonb,'v1',$5::jsonb,$6::jsonb)",[slug(a),a,digest,JSON.stringify(input()),JSON.stringify({v1:fingerprint}),JSON.stringify(quotas)]);
      await client.query("rollback");
    } finally { client.release(); }
    expect(await counts()).toEqual({appointments:0,charges:0});
  });
  it("rejects malformed service/time/authority before quota and snapshots a unique site service",async () => {
    expect(await create({payload:{...input(),siteId:b}})).toEqual({errorCode:"invalid_request"});
    expect(await create({payload:{...input(),preferredDate:"2027-02-29"}})).toEqual({errorCode:"invalid_request"});
    expect(await create({payload:{...input(),serviceTitle:"Other tenant"}})).toEqual({errorCode:"service_selection_required"});
    expect(await counts()).toEqual({appointments:0,charges:0});
    const {serviceTitle: omitted,...byId} = input(); void omitted;
    expect((await create({payload:{...byId,serviceId:"synthetic-service"}})).appointment.serviceTitle).toBe("Consultation");
  });
  it("reauthorizes current lifecycle for creation and receipts",async () => {
    await create();
    try {
      await admin.query("update site_features set enabled=false where site_id=$1 and feature_key='appointment_requests'",[a]);
      expect(await create()).toEqual({errorCode:"capability_disabled"}); expect(await receipt()).toEqual({errorCode:"not_found"});
    } finally { await admin.query("update site_features set enabled=true where site_id=$1 and feature_key='appointment_requests'",[a]); }
  });
  it("existing anonymization clears all new identity fields without changing policy",async () => {
    const before = (await admin.query("select manifest_hash from privacy_policy_versions where status='active'")).rows;
    await create();
    await admin.query("update site_appointments set customer_name='Deleted requester '||left(replace(id::text,'-',''),12),phone='deleted',email=null,service_title=null,preferred_date=null,preferred_time=null,note=null,customer_message=null,status='cancelled' where site_id=$1",[a]);
    expect((await admin.query("select receipt_key_digest,request_fingerprint,fingerprint_key_version,receipt_expires_at,request_service_id from site_appointments where site_id=$1",[a])).rows[0]).toEqual({receipt_key_digest:null,request_fingerprint:null,fingerprint_key_version:null,receipt_expires_at:null,request_service_id:null});
    expect((await admin.query("select manifest_hash from privacy_policy_versions where status='active'")).rows).toEqual(before);
    expect(await receipt()).toEqual({errorCode:"not_found"});
  });
  it("keeps runtime column reads, PUBLIC, function owners and application role grants least privileged",async () => {
    for (const column of ["receipt_key_digest","request_fingerprint","fingerprint_key_version"])
      await expect(runtime.query("select "+column+" from site_appointments")).rejects.toThrow(/permission denied/i);
    const rows = (await admin.query("select p.proname,r.rolname owner,p.prosecdef,has_function_privilege('public',p.oid,'execute') public_execute,has_function_privilege($1,p.oid,'execute') owner_execute,has_function_privilege($2,p.oid,'execute') system_execute from pg_proc p join pg_roles r on r.oid=p.proowner where p.proname in('public_appointment_create_v1','public_appointment_receipt_v1')",[process.env.RLS_TEST_OWNER_ROLE,process.env.RLS_TEST_SYSTEM_ROLE])).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({owner:process.env.RLS_TEST_RUNTIME_EXECUTOR_ROLE,prosecdef:true,public_execute:false,owner_execute:false,system_execute:false});
    const state = (await admin.query("select c.relrowsecurity,c.relforcerowsecurity,r.rolname owner from pg_class c join pg_roles r on r.oid=c.relowner where c.oid='public.site_appointments'::regclass")).rows[0];
    expect(state).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:process.env.RLS_TEST_MIGRATOR_ROLE});
  });
});
