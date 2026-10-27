import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const run = Boolean(adminUrl && runtimeUrl && systemUrl);

describe.skipIf(!run)("PostgreSQL 16 billing/legal system RLS boundaries", () => {
  const admin = new Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const runtime = new Pool({ connectionString: runtimeUrl, allowExitOnIdle: true });
  const system = new Pool({ connectionString: systemUrl, allowExitOnIdle: true });
  const siteA = randomUUID();
  const siteB = randomUUID();
  const paddleSite = randomUUID();
  const accountA = randomUUID();
  const accountB = randomUUID();
  const sessionA = randomBytes(32).toString("hex");
  const sessionB = randomBytes(32).toString("hex");
  const expiredSession = randomBytes(32).toString("hex");
  const slugA = `b3b-a-${siteA.slice(0,8)}`;
  const slugB = `b3b-b-${siteB.slice(0,8)}`;
  let intakeId = "";
  let acceptanceId = "";

  beforeAll(async () => {
    await admin.query(
      `insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at,site_kind)
       values($1,$2,'private',$3,now()+interval '14 days',now()+interval '44 days','business'),
             ($4,$5,'private',$6,now()+interval '14 days',now()+interval '44 days','business'),
             ($7,$8,'private',$9,now()+interval '14 days',now()+interval '44 days','business')`,
      [siteA,slugA,{},siteB,slugB,{},paddleSite,`b3b-paddle-${paddleSite.slice(0,8)}`,{}],
    );
    await admin.query(
      `insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale,status)
       values($1,$2,$3,'hash','en','active'),($4,$5,$6,'hash','de','active')`,
      [accountA,siteA,`a-${siteA}@example.test`,accountB,siteB,`b-${siteB}@example.test`],
    );
    await admin.query(
      `insert into site_admin_sessions(id,account_id,token_hash,expires_at) values
       (gen_random_uuid(),$1,$2,now()+interval '1 hour'),
       (gen_random_uuid(),$3,$4,now()+interval '1 hour'),
       (gen_random_uuid(),$1,$5,now()-interval '1 hour')`,
      [accountA,sessionA,accountB,sessionB,expiredSession],
    );
    await admin.query(
      `insert into platform_legal_config_versions(
        id,version,legal_business_name,street,postal_code,city,country_code,country_name,
        contact_email,support_email,tax_display_mode,currency,price_tax_label,
        legal_review_status,status,reviewed_at,effective_from
      ) values($1,900001,'Test Operator','Test Street 1','10000','Berlin','DE','Germany',
        'legal@example.test','support@example.test','net_plus_tax','EUR','plus VAT','reviewed','active',now(),now())`,
      [randomUUID()],
    );
    const documents = [
      ["terms","en","2026-08-24-b2b-draft-1","5f1c1a16bda748fdb0612c502f06bcf0a02b67a9176d9f97972cd820805ca53e"],
      ["privacy","en","2026-08-24-art13-draft-1","b6c71a5fdd85c0510f5bfe8dd25ac767a2f2ee9bf16ad08c50b9c20c465a6292"],
      ["terms","de","2026-08-24-b2b-draft-1","53fcdfebd5369277b6a3d81069bfb06cbe50782b363f89be3126259efe333943"],
      ["privacy","de","2026-08-24-art13-draft-1","c4f17112c1f3982fe25fdbd636752cc9c01f4146b90a61775d492e9554859954"],
    ];
    for (const [key,locale,version,hash] of documents)
      await admin.query(
        `insert into platform_legal_document_versions(id,document_key,locale,version,content_hash,status,effective_from,reviewed_at)
         values($1,$2,$3,$4,$5,'active',now(),now())`,
        [randomUUID(),key,locale,version,hash],
      );
    await admin.query(
      `insert into site_subscriptions(site_id,billing_provider,provider_subscription_id,provider_customer_id,provider_price_id,plan_key,status,latest_provider_event_at)
       values($1,'paddle',$2,'ctm_historical','pri_historical','starter','canceled',now()-interval '2 days')`,
      [paddleSite,`sub_paddle_${paddleSite.slice(0,8)}`],
    );
  });

  afterAll(async () => {
    await Promise.all([runtime.end(),system.end(),admin.end()]);
  });

  it("prepares one atomic exact-locale Starter acceptance for the authenticated tenant", async () => {
    const result = (await runtime.query(
      `select * from billing_prepare_starter_checkout(
        $1,$2,$3,'price_starter_test','Example Studio','DE','company',null,true,'en',
        'b2b-v1','authority-v1','renewal-v1','privacy-ack-v1',null,'EUR','plus VAT','EUR 29 / month',14
      )`, [sessionA,siteA,slugA],
    )).rows[0];
    expect(result).toMatchObject({ intake_status: "pending_payment", checkout_attempt: 1 });
    intakeId = result.intake_id;
    acceptanceId = result.contract_acceptance_id;
    const evidence = (await admin.query(
      `select i.contract_acceptance_id,a.terms_version,a.privacy_version,a.plan_key,a.billing_provider,
              s.activated_at,sa.email
       from subscriber_intakes i join contract_acceptances a on a.id=i.contract_acceptance_id
       join sites s on s.id=i.demo_site_id join site_admin_accounts sa on sa.id=i.site_admin_account_id
       where i.id=$1`, [intakeId],
    )).rows[0];
    expect(evidence).toMatchObject({ contract_acceptance_id: acceptanceId, plan_key: "starter", billing_provider: "stripe", activated_at: null, email: `a-${siteA}@example.test` });
  });

  it("denies cross-tenant, expired-session and cross-locale checkout resolution", async () => {
    const args = ["price_starter_test","Example Studio","DE","company",null,true,"en","b2b-v1","authority-v1","renewal-v1","privacy-ack-v1",null,"EUR","plus VAT","EUR 29 / month",14];
    await expect(runtime.query(`select * from billing_prepare_starter_checkout($1,$2,$3,${args.map((_,i) => `$${i+4}`).join(',')})`, [sessionA,siteB,slugB,...args])).rejects.toThrow(/ownership binding/i);
    await expect(runtime.query(`select * from billing_prepare_starter_checkout($1,$2,$3,${args.map((_,i) => `$${i+4}`).join(',')})`, [expiredSession,siteA,slugA,...args])).rejects.toThrow(/ownership binding/i);
    expect((await runtime.query("select * from billing_checkout_legal_context($1,'de','EUR')", [sessionA])).rows).toEqual([]);
  });

  it("retries deterministically and binds the provider checkout session without activation", async () => {
    const retry = (await runtime.query(
      `select * from billing_prepare_starter_checkout(
        $1,$2,$3,'price_starter_test','Example Studio','DE','company',null,true,'en',
        'b2b-v1','authority-v1','renewal-v1','privacy-ack-v1',null,'EUR','plus VAT','EUR 29 / month',14
      )`, [sessionA,siteA,slugA],
    )).rows[0];
    expect(retry).toMatchObject({ intake_id: intakeId, contract_acceptance_id: acceptanceId, checkout_attempt: 1 });
    expect((await runtime.query("select billing_attach_checkout_session($1,$2,$3) attached", [sessionA,intakeId,"cs_test_b3b"])).rows[0].attached).toBe(true);
    expect((await admin.query("select activated_at from sites where id=$1", [siteA])).rows[0].activated_at).toBeNull();
  });

  it("activates only the immutable bound Starter intake through the system routine", async () => {
    const event = {
      provider:"stripe",eventId:`evt_activate_${siteA}`,eventType:"checkout.session.completed",
      providerEventCreatedAt:new Date().toISOString(),intakeId,siteId:siteA,
      providerCustomerId:"cus_b3b",providerSubscriptionId:`sub_b3b_${siteA}`,
      providerPriceId:"price_starter_test",checkoutSessionId:"cs_test_b3b",planKey:"starter",
      status:"active",cancelAtPeriodEnd:false,paymentGraceDays:7,paidReadOnlyDays:30,
    };
    const result = (await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(event)])).rows[0].result;
    expect(result).toMatchObject({ processed:true,siteId:siteA,active:true });
    expect((await admin.query("select plan_key,status,contract_acceptance_state from site_subscriptions where site_id=$1", [siteA])).rows[0]).toEqual({ plan_key:"starter",status:"active",contract_acceptance_state:"accepted" });
    expect((await admin.query("select email from site_admin_accounts where id=$1", [accountA])).rows[0].email).toBe(`a-${siteA}@example.test`);
    expect((await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(event)])).rows[0].result).toEqual({ processed:false });
  });

  it("ignores stale/equal permissive events and preserves the canonical cancellation", async () => {
    const base = Date.now()+2000;
    const subscriptionId = `sub_b3b_${siteA}`;
    const cancelled = { provider:"stripe",eventId:`evt_cancel_${siteA}`,eventType:"customer.subscription.deleted",providerEventCreatedAt:new Date(base).toISOString(),providerSubscriptionId:subscriptionId,status:"canceled",cancelAtPeriodEnd:false,paymentGraceDays:7,paidReadOnlyDays:30 };
    expect((await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(cancelled)])).rows[0].result.active).toBe(false);
    const equalActive = { ...cancelled,eventId:`evt_equal_${siteA}`,eventType:"invoice.paid",status:"active" };
    expect((await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(equalActive)])).rows[0].result).toMatchObject({ ignored:true,stale:true });
    expect((await admin.query("select status from site_subscriptions where site_id=$1", [siteA])).rows[0].status).toBe("canceled");
  });

  it("keeps Paddle historical-only and refuses an unknown first activation", async () => {
    const unknown = { provider:"paddle",eventId:`evt_paddle_unknown_${siteA}`,eventType:"subscription.activated",providerEventCreatedAt:new Date().toISOString(),providerSubscriptionId:"sub_unknown",status:"active",paymentGraceDays:7,paidReadOnlyDays:30 };
    expect((await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(unknown)])).rows[0].result).toMatchObject({ processed:true,ignored:true });
    const existing = { ...unknown,eventId:`evt_paddle_existing_${siteA}`,providerEventCreatedAt:new Date(Date.now()+4000).toISOString(),providerSubscriptionId:`sub_paddle_${paddleSite.slice(0,8)}` };
    expect((await system.query("select billing_system_process_subscription_event($1::jsonb) result", [JSON.stringify(existing)])).rows[0].result).toMatchObject({ processed:true,siteId:paddleSite });
    expect((await admin.query("select plan_key,billing_provider,contract_acceptance_state from site_subscriptions where site_id=$1", [paddleSite])).rows[0]).toEqual({ plan_key:"starter",billing_provider:"paddle",contract_acceptance_state:"acceptance_unknown" });
  });

  it("exposes a tenant-bound minimal portal snapshot and no raw billing tables", async () => {
    expect((await runtime.query("select * from billing_customer_snapshot($1,$2)", [sessionA,siteA])).rows[0]).toMatchObject({ site_id:siteA,plan_key:"starter",billing_provider:"stripe" });
    expect((await runtime.query("select * from billing_customer_snapshot($1,$2)", [sessionA,siteB])).rows).toEqual([]);
    for (const table of ["subscriber_intakes","site_subscriptions","payment_webhook_events","contract_acceptances","platform_legal_document_versions"])
      await expect(runtime.query(`select * from ${table}`)).rejects.toThrow(/permission denied/i);
    await expect(system.query("update site_subscriptions set status='active'")).rejects.toThrow(/permission denied/i);
  });

  it("records synthetic EXPLAIN evidence for the B3B lookup boundaries", async () => {
    const plans = await Promise.all([
      runtime.query("explain (analyze,buffers) select * from billing_checkout_legal_context($1,'en','EUR')", [sessionA]),
      runtime.query("explain (analyze,buffers) select * from billing_customer_snapshot($1,$2)", [sessionA,siteA]),
      admin.query("explain (analyze,buffers) select * from site_subscriptions where billing_provider='stripe' and provider_subscription_id=$1", [`sub_b3b_${siteA}`]),
      admin.query("explain (analyze,buffers) select * from payment_webhook_events where provider='stripe' and event_id=$1", [`evt_activate_${siteA}`]),
      admin.query("explain (analyze,buffers) select * from contract_acceptances where intake_id=$1 and checkout_attempt=1 and source='site_admin_checkout'", [intakeId]),
    ]);
    const rendered = plans.map((plan) => plan.rows.map((row) => row["QUERY PLAN"]).join("\n"));
    expect(rendered.every((plan) => /Execution Time/.test(plan))).toBe(true);
    console.log("B3B EXPLAIN evidence (synthetic disposable fixture)\n"+rendered.join("\n---\n"));
  });

  it("keeps acceptance immutable and actor routine grants disjoint", async () => {
    await expect(admin.query("update contract_acceptances set locale='de' where id=$1", [acceptanceId])).rejects.toThrow(/immutable/i);
    await expect(admin.query("delete from contract_acceptances where id=$1", [acceptanceId])).rejects.toThrow(/immutable/i);
    await expect(runtime.query("select billing_system_process_subscription_event('{}'::jsonb)")).rejects.toThrow(/permission denied/i);
    await expect(system.query("select * from billing_customer_snapshot($1,$2)", [sessionA,siteA])).rejects.toThrow(/permission denied/i);
    const publicExec = (await admin.query(
      `select count(*)::int count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname like 'billing_%' and has_function_privilege('public',p.oid,'execute')`,
    )).rows[0].count;
    expect(publicExec).toBe(0);
  });
});
