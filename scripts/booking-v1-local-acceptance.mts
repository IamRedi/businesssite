/** Disposable local booking acceptance only; never points at a hosted database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { generateSiteDocument, type PreparedBusinessProfile } from "@platform/website-engine";

const url = process.env.BOOKING_LOCAL_DATABASE_URL ?? "";
const parsed = new URL(url);
if (parsed.protocol !== "postgresql:" || parsed.hostname !== "127.0.0.1" || parsed.port !== "55480" || parsed.pathname !== "/booking_local")
  throw new Error("Booking acceptance requires exact disposable 127.0.0.1:55480/booking_local target.");
const pool = new Pool({ connectionString: url, max: 5 });
const site = "79000000-0000-4000-8000-000000000001";
const otherSite = "79000000-0000-4000-8000-000000000002";
const account = "79000000-0000-4000-8000-000000000003";
export const localSessionToken = "b".repeat(64);
const sessionHash = createHash("sha256").update(localSessionToken).digest("hex");
const slug = "mustafa-booking-local";
const service = "Haarschnitt";
const profile: PreparedBusinessProfile = { id: "local-profile", version: 1, sourceLeadId: "local-lead", locale: "de",
  business: { name: "Barber Demo · Lokale Vorschau", category: "barbershop", openingHours: [
    ...(["monday","tuesday","wednesday","thursday"] as const).map(day => ({ day, open: "08:30", close: "18:30" })),
    { day: "friday", open: "08:00", close: "12:30", intervals: [{ open: "14:00", close: "19:00" }] },
    { day: "saturday", open: "08:30", close: "16:30" }, { day: "sunday", closed: true },
  ] }, services: [{ title: service }] };
const document = { ...generateSiteDocument(profile), id: site, slug };
const weekly = [
  ...[1,2,3,4].map(weekday => ({ weekday, starts: "08:30", ends: "18:30", kind: "work" })),
  { weekday: 5, starts: "08:00", ends: "12:30", kind: "work" },
  { weekday: 5, starts: "14:00", ends: "19:00", kind: "work" },
  { weekday: 6, starts: "08:30", ends: "16:30", kind: "work" },
] as const;
const owner = async (id: string, action: string, version: number, newStart?: string) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role bsrc_runtime");
    await client.query("select set_config('app.actor_kind','site_admin',true),set_config('app.site_id',$1,true),set_config('app.session_hash',$2,true)", [site,sessionHash]);
    const result = action === "confirm_proposed"
      ? await client.query("select public.booking_confirm_proposed($1,$2,$3) value", [site,id,version])
      : await client.query("select public.booking_transition($1,$2,$3,$4,$5::timestamptz) value", [site,id,action,version,newStart ?? null]);
    await client.query("commit");
    return result.rows[0].value;
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
};
try {
  assert.equal((await pool.query("select count(*)::int n from schema_migrations where name='079_booking_v1_local.sql'")).rows[0].n,1);
  assert.equal((await pool.query("select count(*)::int n from schema_migrations where name='084_booking_review_blockers.sql'")).rows[0].n,1);
  assert.equal((await pool.query("select count(*)::int n from schema_migrations where name='085_booking_dst_and_confirm_guard.sql'")).rows[0].n,1);
  // These exact IDs exist only in this guarded disposable fixture database.
  await pool.query("delete from public.sites where id=any($1::text[])",[[site,otherSite]]);
  for (const [id,name] of [[site,"Barber Demo · Lokale Vorschau"],[otherSite,"Other Synthetic Business"]]) {
    await pool.query(`insert into public.sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at)
      values($1,$2,'public',$3,now()+interval '1 year',now()+interval '1 year',now())`,
      [id,id===site ? slug : "other-booking-local",JSON.stringify(id===site ? document : { ...document,id,slug:"other-booking-local",content:{...document.content,name} })]);
    await pool.query("insert into public.site_subscriptions(site_id,plan_key,status,current_period_end) values($1,'professional','trialing',now()+interval '1 year')",[id]);
    await pool.query("insert into public.site_features(site_id,feature_key,enabled) values($1,'website',true),($1,'appointment_requests',true)",[id]);
  }
  await pool.query("insert into public.site_admin_accounts(id,site_id,email,password_hash) values($1,$2,'local-owner@example.invalid','synthetic')",[account,site]);
  await pool.query("insert into public.site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),$1,$2,now()+interval '1 day')",[account,sessionHash]);
  await pool.query("insert into public.booking_settings(site_id,timezone,slot_minutes,hold_minutes,enabled) values($1,'Europe/Berlin',30,15,true)",[site]);
  for (const item of weekly) await pool.query("insert into public.booking_weekly(site_id,weekday,kind,starts_at,ends_at) values($1,$2,$3,$4,$5)",
    [site,item.weekday,item.kind,item.starts,item.ends]);
  const day = "2026-10-05";
  const runtime = await pool.connect();
  try {
    await runtime.query("begin");
    await runtime.query("set local role bsrc_runtime");
    assert.equal((await runtime.query("select count(*)::int n from public.booking_public_slots($1,$2)",[slug,day])).rows[0].n>0,true,"runtime can read public slots through routine");
    await assert.rejects(runtime.query("select * from public.booking_settings"), (error: unknown) => (error as { code?: string }).code==="42501", "runtime cannot read booking settings table");
    await runtime.query("rollback");
  } finally { runtime.release(); }
  const friday = (await pool.query("select local_time from public.booking_public_slots($1,'2026-10-09')",[slug])).rows.map(row => row.local_time.slice(0,5));
  assert.equal(friday.includes("12:30"),false,"Friday break starts at 12:30");
  assert.equal(friday.includes("13:30"),false,"Friday break hides slots");
  assert.equal(friday.includes("14:00"),true,"Friday afternoon resumes");
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,'2026-10-11')",[slug])).rows[0].n,0,"Sunday closed");
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2)",["other-booking-local",day])).rows[0].n,0,"tenant without booking config isolated");
  const mondayBlock = await pool.query("insert into public.booking_blocks(site_id,kind,starts_at,ends_at) values($1,'manual','2026-10-05T07:30:00Z','2026-10-05T08:30:00Z') returning id",[site]);
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at='2026-10-05T07:30:00Z'",[slug,day])).rows[0].n,0,"manual block");
  await pool.query("delete from public.booking_blocks where id=$1",[mondayBlock.rows[0].id]);
  await pool.query("insert into public.booking_weekly(site_id,weekday,kind,starts_at,ends_at) values($1,7,'work','01:00','04:00')",[site]);
  const spring = (await pool.query("select local_time from public.booking_available_slots($1,'2027-03-28','2027-03-01T00:00:00Z')",[site])).rows.map(row => row.local_time);
  const autumn = (await pool.query("select starts_at,local_time from public.booking_available_slots($1,'2027-10-31','2027-10-01T00:00:00Z')",[site])).rows;
  assert.equal(spring.some(time => time.startsWith("02:")),false,"DST spring gap never generated");
  assert.equal(autumn.some(row => row.local_time.startsWith("02:")),false,"repeated fall-back hour is never selectable");
  assert.equal(autumn.some(row => row.local_time.startsWith("03:00")),true,"unambiguous fall-back hour remains open");
  await pool.query("insert into public.booking_weekly(site_id,weekday,kind,starts_at,ends_at) values($1,7,'break','02:30','03:00')",[site]);
  assert.equal((await pool.query("select count(*)::int n from public.booking_available_slots($1,'2027-10-31','2027-10-01T00:00:00Z') where starts_at='2027-10-31T00:30:00Z'",[site])).rows[0].n,0,"fall-back slot crossing 02:30 break is unavailable");
  await pool.query("delete from public.booking_weekly where site_id=$1 and weekday=7 and kind='break'",[site]);
  await pool.query("delete from public.booking_weekly where site_id=$1 and weekday=7",[site]);
  const slots = (await pool.query("select * from public.booking_public_slots($1,$2)",[slug,day])).rows;
  assert.equal(slots[0]?.local_time.startsWith("08:30"),true,"Demo opening slot");
  assert.equal(slots.length,20,"normal Monday keeps all twenty 30-minute slots");
  assert.equal(slots.some(row => row.local_time.startsWith("18:30")),false,"closing time excluded");
  const start = slots[0].starts_at.toISOString();
  const request = (name: string) => pool.query("select public.booking_request($1,$2,$3,$4,$5,$6) value",[slug,start,service,name,"+4917612345678",null]);
  assert.equal((await pool.query("select public.booking_request($1,$2,'Invalid service','Nobody','+4917612345678',null) value",[slug,start])).rows[0].value.errorCode,"invalid_service");
  const [one,two] = await Promise.all([request("Synthetic A"),request("Synthetic B")]);
  const results = [one.rows[0].value,two.rows[0].value];
  assert.equal(results.filter(value => value.ok).length,1,"one active hold wins");
  assert.equal(results.filter(value => value.errorCode==="slot_unavailable").length,1);
  const id = results.find(value => value.ok).id;
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,0,"hold hides slot");
  const [confirmed,stale] = await Promise.all([owner(id,"confirm",1),owner(id,"confirm",1)]);
  assert.equal([confirmed,stale].filter(value => value.ok).length,1,"one confirmation wins");
  assert.equal((await pool.query("select count(*)::int n from public.site_appointments where site_id=$1 and status='confirmed' and booking_start=$2",[site,start])).rows[0].n,1);
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,0,"confirmed slot hidden");
  const version = (await pool.query("select appointment_version from public.site_appointments where id=$1",[id])).rows[0].appointment_version;
  assert.equal((await owner(id,"cancel",version)).ok,true);
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,1,"cancel reopens");
  const declinedRequest = (await request("Synthetic C")).rows[0].value;
  assert.equal(declinedRequest.ok,true);
  assert.equal((await owner(declinedRequest.id,"decline",1)).ok,true);
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,1,"decline reopens");
  const expired = (await request("Synthetic D")).rows[0].value;
  await pool.query("update public.site_appointments set booking_hold_expires_at=now()-interval '1 second' where id=$1",[expired.id]);
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,1,"expired hold reopens");
  assert.equal((await owner(expired.id,"confirm",2)).ok,true,"expired hold confirms when slot remains free");
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,start])).rows[0].n,0,"expired confirmation occupies slot");
  assert.equal((await owner(expired.id,"cancel",3)).ok,true);
  const expiredTaken = (await request("Synthetic Expired Taken")).rows[0].value;
  await pool.query("update public.site_appointments set booking_hold_expires_at=now()-interval '1 second' where id=$1",[expiredTaken.id]);
  const taken = (await request("Synthetic Replacement")).rows[0].value;
  assert.equal(taken.ok,true);
  assert.equal((await owner(expiredTaken.id,"confirm",2)).errorCode,"slot_unavailable","expired hold rejects newly taken slot");
  assert.equal((await owner(taken.id,"decline",1)).ok,true);
  const past = (await pool.query("insert into public.site_appointments(id,site_id,customer_name,phone,status,booking_start,booking_end,booking_hold_expires_at) values(gen_random_uuid(),$1,'Synthetic Past Hold','+4917612345678','requested','2026-10-03T06:30:00Z','2026-10-03T07:00:00Z',now()+interval '10 minutes') returning id",[site])).rows[0].id;
  assert.equal((await owner(past,"confirm",1)).errorCode,"slot_unavailable","active hold never confirms a past slot");
  assert.equal((await pool.query("select status from public.site_appointments where id=$1",[past])).rows[0].status,"requested");
  const proposed = (await request("Synthetic Proposed")).rows[0].value;
  assert.equal(proposed.ok,true);
  const alternate = slots[1].starts_at.toISOString();
  assert.equal((await owner(proposed.id,"propose",1,"2026-10-05T06:00:00Z")).errorCode,"slot_unavailable","outside-hours proposal rejected");
  assert.equal((await owner(proposed.id,"propose",1,"2026-10-09T10:30:00Z")).errorCode,"slot_unavailable","break proposal rejected");
  const proposalBlock = await pool.query("insert into public.booking_blocks(site_id,kind,starts_at,ends_at) values($1,'manual',$2::timestamptz,$2::timestamptz+interval '30 minutes') returning id",[site,alternate]);
  assert.equal((await owner(proposed.id,"propose",1,alternate)).errorCode,"slot_unavailable","blocked proposal rejected");
  await pool.query("delete from public.booking_blocks where id=$1",[proposalBlock.rows[0].id]);
  const competingProposal = (await pool.query("select public.booking_request($1,$2,$3,$4,$5,$6) value",[slug,alternate,service,"Synthetic Competing Proposal","+4917612345678",null])).rows[0].value;
  assert.equal(competingProposal.ok,true);
  assert.equal((await owner(proposed.id,"propose",1,alternate)).errorCode,"slot_unavailable","occupied proposal rejected");
  assert.equal((await owner(competingProposal.id,"decline",1)).ok,true);
  assert.equal((await owner(proposed.id,"propose",1,alternate)).status,"proposed");
  assert.equal((await owner(proposed.id,"confirm",2)).errorCode,"invalid_transition","proposal cannot be directly confirmed");
  assert.equal((await owner(proposed.id,"confirm_proposed",2)).errorCode,"invalid_transition","proposal needs recorded customer acceptance");
  assert.equal((await owner(proposed.id,"accept_proposed",2)).status,"accepted");
  const acceptedCompetitor = (await pool.query("select public.booking_request($1,$2,$3,$4,$5,$6) value",[slug,alternate,service,"Synthetic Accepted Competitor","+4917612345678",null])).rows[0].value;
  assert.equal(acceptedCompetitor.ok,true);
  assert.equal((await owner(proposed.id,"confirm_proposed",3)).errorCode,"slot_unavailable","accepted proposal rechecks competing hold");
  assert.equal((await owner(acceptedCompetitor.id,"decline",1)).ok,true);
  await pool.query("update public.site_appointments set booking_proposed_start='2026-10-03T06:30:00Z' where id=$1",[proposed.id]);
  assert.equal((await owner(proposed.id,"confirm_proposed",4)).errorCode,"slot_unavailable","accepted proposal cannot confirm after its time has passed");
  await pool.query("update public.site_appointments set booking_proposed_start=$2 where id=$1",[proposed.id,alternate]);
  assert.equal((await owner(proposed.id,"confirm_proposed",5)).ok,true,"accepted proposed slot can be confirmed atomically");
  assert.equal((await pool.query("select count(*)::int n from public.booking_public_slots($1,$2) where starts_at=$3",[slug,day,alternate])).rows[0].n,0,"proposed confirmed slot disappears");
  const foreign = await pool.connect();
  try {
    await foreign.query("begin");
    await foreign.query("select set_config('app.actor_kind','site_admin',true),set_config('app.site_id',$1,true),set_config('app.session_hash',$2,true)",[site,sessionHash]);
    assert.equal((await foreign.query("select public.booking_transition($1,$2,'cancel',1,null) value",[otherSite,id])).rows[0].value.errorCode,"forbidden","tenant action isolated");
    await foreign.query("rollback");
  } finally { foreign.release(); }
  await pool.query("insert into public.site_appointments(id,site_id,customer_name,phone,status) values(gen_random_uuid(),$1,'Legacy synthetic','+491700000000','requested')",[site]);
  assert.equal((await pool.query("select count(*)::int n from public.site_appointments where site_id=$1 and customer_name='Legacy synthetic' and booking_start is null",[site])).rows[0].n,1,"legacy request retained");
  const raceIds = (await pool.query(`insert into public.site_appointments(id,site_id,customer_name,phone,status,booking_start,booking_end)
    values(gen_random_uuid(),$1,'Race A','+491700000000','requested','2026-10-05T09:00:00Z','2026-10-05T09:30:00Z'),
      (gen_random_uuid(),$1,'Race B','+491700000000','requested','2026-10-05T09:00:00Z','2026-10-05T09:30:00Z') returning id`,[site])).rows.map(row => row.id);
  const race = await Promise.allSettled(raceIds.map(raceId => pool.query("update public.site_appointments set status='confirmed' where id=$1",[raceId])));
  console.log("race outcomes",race.map(result => result.status === "fulfilled" ? "confirmed" : { code: (result.reason as { code?: string }).code, message: (result.reason as Error).message }));
  assert.equal(race.filter(result => result.status==="fulfilled").length,1,"DB exclusion permits exactly one overlapping confirmation");
  assert.equal(race.filter(result => result.status==="rejected" && (result.reason as { code?: string }).code==="23P01").length,1,"loser receives exclusion violation");
  console.log("BOOKING LOCAL DB ACCEPTANCE PASS");
} finally { await pool.end(); }
