import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL,
  ownerUrl = process.env.RLS_TEST_OWNER_DATABASE_URL,
  runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL,
  systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const suite =
  adminUrl && ownerUrl && runtimeUrl && systemUrl ? describe : describe.skip;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const projectId = "prj_ExampleProject0000000000";
const teamId = "team_1a2b3c4d5e6f7g8h9i0j1k2l";
const domainAuthority = `vercel-project:${teamId}:${projectId}`;
suite("controlled customer deletion FORCE boundaries", () => {
  const admin = new pg.Pool({ connectionString: adminUrl }),
    owner = new pg.Pool({ connectionString: ownerUrl }),
    runtime = new pg.Pool({ connectionString: runtimeUrl }),
    system = new pg.Pool({ connectionString: systemUrl });
  const site = `delete-${randomUUID()}`,
    other = `delete-other-${randomUUID()}`,
    account = randomUUID(),
    otherAccount = randomUUID(),
    session = hash(`session-${site}`),
    otherSession = hash(`session-${other}`),
    ownerId = randomUUID(),
    ownerSession = hash(`owner-${site}`);
  let job = "",
    planned = false,
    step = 900;
  beforeAll(async () => {
    await admin.query(
      "insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at)values($1,$1,'public','{}',now()+interval '1 day',now()+interval '1 day',now()-interval '100 days'),($2,$2,'public','{}',now()+interval '1 day',now()+interval '1 day',now()-interval '100 days')",
      [site, other],
    );
    await admin.query(
      "insert into site_admin_accounts(id,site_id,email,password_hash)values($1,$2,$3,'hash-a'),($4,$5,$6,'hash-b')",
      [
        account,
        site,
        `${site}@example.test`,
        otherAccount,
        other,
        `${other}@example.test`,
      ],
    );
    await admin.query(
      "insert into site_admin_sessions(id,account_id,token_hash,expires_at)values(gen_random_uuid(),$1,$2,now()+interval '1 day'),(gen_random_uuid(),$3,$4,now()+interval '1 day')",
      [account, session, otherAccount, otherSession],
    );
    await admin.query(
      "insert into site_features(site_id,feature_key,enabled)values($1,'media',true),($2,'media',true),($2,'custom_domain_existing',true)",
      [site, other],
    );
    await admin.query(
      "insert into site_subscriptions(site_id,status,plan_key,billing_provider,provider_subscription_id,provider_status_observed_at,latest_provider_event_at,latest_provider_event_id,suspended_at,read_only_ends_at)values($1,'canceled','starter','stripe',$2,now()-interval '70 days',now()-interval '70 days',$3,now()-interval '70 days',now()-interval '40 days'),($4,'active','starter','stripe',$5,now(),now(),$6,null,null)",
      [
        site,
        `sub-${site}`,
        `evt-${site}`,
        other,
        `sub-${other}`,
        `evt-${other}`,
      ],
    );
    await admin.query(
      "insert into site_appointments(id,site_id,customer_name,phone,email,note)values(gen_random_uuid(),$1,'Sensitive requester','123','person@example.test','secret note')",
      [site],
    );
    await admin.query(
      `insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size)
       values(gen_random_uuid(),$1,'vercel_blob',$2,'public','store_ExampleStore0001',$3,'image/webp',16)`,
      [
        site,
        `sites/${site}/synthetic.webp`,
        `https://examplestore0001.public.blob.vercel-storage.com/sites/${site}/synthetic.webp`,
      ],
    );
    await admin.query(
      "update sites set custom_domain=$2,custom_domain_status='verified',custom_domain_provider_authority=$3,custom_domain_verification=$4 where id=$1",
      [site, `${site}.example.test`, domainAuthority, {
        provider: "vercel", domain: `${site}.example.test`, projectId, teamId,
        ownershipVerified: true, dnsConfigured: true, ready: true, records: [], checkedAt: new Date().toISOString(),
      }],
    );
    await admin.query(
      "insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step)values($1,$2,'owner-hash','active','owner','v1.synthetic',now(),$3)",
      [ownerId, `${ownerId}@example.test`, step],
    );
    await admin.query(
      "insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at)values(gen_random_uuid(),$1,$2,now(),now()+interval '1 day')",
      [ownerId, ownerSession],
    );
  });
  afterAll(async () => {
    await admin.query("delete from sites where id=any($1::text[])", [
      [site, other],
    ]);
    await admin.query("delete from owner_accounts where id=$1", [ownerId]);
    await Promise.all([admin.end(), owner.end(), runtime.end(), system.end()]);
  });
  it("pins request scope, password and idempotency", async () => {
    expect(
      (
        await runtime.query(
          "select * from site_admin_request_customer_deletion($1,'wrong','business_closed',null,true,'bad')",
          [session],
        )
      ).rows[0].ok,
    ).toBe(false);
    const first = (
      await runtime.query(
        "select * from site_admin_request_customer_deletion($1,'hash-a','business_closed','bounded note',true,'first')",
        [session],
      )
    ).rows[0];
    expect(first.ok).toBe(true);
    job = first.job_id;
    const repeat = (
      await runtime.query(
        "select * from site_admin_request_customer_deletion($1,'hash-a','other',null,true,'repeat')",
        [session],
      )
    ).rows[0];
    expect(repeat.job_id).toBe(job);
    expect(
      (
        await runtime.query(
          "select site_admin_customer_deletion_status($1) value",
          [otherSession],
        )
      ).rows[0].value,
    ).toBeNull();
    await expect(
      runtime.query("select * from customer_deletion_workflows"),
    ).rejects.toThrow(/permission denied/);
  });
  it("registers only exact same-tenant public provider media through runtime", async () => {
    const key = `sites/${other}/runtime.webp`;
    expect(
      (
        await runtime.query(
          "select site_admin_register_business_provider_media($1,$2,'store_ExampleStore0001',$3,$4,'image/webp',16) id",
          [
            otherSession,
            other,
            key,
            `https://examplestore0001.public.blob.vercel-storage.com/${key}`,
          ],
        )
      ).rows[0].id,
    ).toMatch(/^[a-f0-9-]{36}$/);
    expect(
      (
        await runtime.query(
          "select site_admin_register_business_provider_media($1,$2,'store_ExampleStore0001',$3,$4,'image/webp',16) id",
          [
            otherSession,
            site,
            `sites/${site}/cross.webp`,
            `https://examplestore0001.public.blob.vercel-storage.com/sites/${site}/cross.webp`,
          ],
        )
      ).rows[0].id,
    ).toBeNull();
  });
  it("persists exact same-tenant Vercel project authority and rejects cross-tenant domain writes", async () => {
    const domain = `${other}.example.test`;
    const verification = {
      provider: "vercel", domain, projectId, teamId,
      ownershipVerified: false, dnsConfigured: false, ready: false, records: [], checkedAt: new Date().toISOString(),
    };
    expect((await runtime.query(
      "select site_admin_domain_persist($1,$2,$3,'pending_dns',$4::jsonb) ok",
      [otherSession, other, domain, JSON.stringify(verification)],
    )).rows[0].ok).toBe(true);
    expect((await admin.query(
      "select custom_domain_provider_authority authority from sites where id=$1", [other],
    )).rows[0].authority).toBe(domainAuthority);
    expect((await runtime.query(
      "select site_admin_domain_persist($1,$2,$3,'pending_dns',$4::jsonb) ok",
      [otherSession, site, `${site}.example.test`, JSON.stringify({ ...verification, domain: `${site}.example.test` })],
    )).rows[0].ok).toBe(false);
  });
  it("blocks active subscriptions without requesting cancellation", async () => {
    const requested = (
      await runtime.query(
        "select * from site_admin_request_customer_deletion($1,'hash-b','business_closed',null,true,'active')",
        [otherSession],
      )
    ).rows[0];
    let claimed = (
      await system.query(
        "select privacy_system_claim_deletion_plan('active-worker',300) id",
      )
    ).rows[0].id;
    if (claimed === job) {
      expect(
        (
          await system.query(
            "select privacy_system_plan_customer_deletion($1,'active-worker') result",
            [job],
          )
        ).rows[0].result,
      ).toBe("planned");
      planned = true;
      claimed = (
        await system.query(
          "select privacy_system_claim_deletion_plan('active-worker',300) id",
        )
      ).rows[0].id;
    }
    expect(claimed).toBe(requested.job_id);
    expect(
      (
        await system.query(
          "select privacy_system_plan_customer_deletion($1,'active-worker') result",
          [claimed],
        )
      ).rows[0].result,
    ).toBe("active_subscription");
    expect(
      (
        await admin.query(
          "select status,cancel_at_period_end from site_subscriptions where site_id=$1",
          [other],
        )
      ).rows[0],
    ).toEqual({ status: "active", cancel_at_period_end: false });
    expect(
      (
        await runtime.query(
          "select site_admin_cancel_customer_deletion($1,'hash-b',$2,'customer-cancel') ok",
          [otherSession, requested.job_id],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await runtime.query(
          "select site_admin_cancel_customer_deletion($1,'hash-b',$2,'customer-cancel-replay') ok",
          [otherSession, requested.job_id],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await runtime.query(
          "select site_admin_customer_deletion_status($1) value",
          [otherSession],
        )
      ).rows[0].value,
    ).toMatchObject({ phase: "canceled", jobStatus: "canceled" });
  });
  it("reconciles, owner-approves and anonymizes deterministically", async () => {
    if (!planned) {
      expect(
        (
          await system.query(
            "select privacy_system_claim_deletion_plan('worker',300) id",
          )
        ).rows[0].id,
      ).toBe(job);
      expect(
        (
          await system.query(
            "select privacy_system_plan_customer_deletion($1,'worker') result",
            [job],
          )
        ).rows[0].result,
      ).toBe("planned");
    }
    const providers = [] as string[];
    const interrupted = (
      await system.query(
        "select * from privacy_system_claim_provider_cleanup_work_v2('ambiguous-worker',30)",
      )
    ).rows[0];
    expect(interrupted.provider).toBe("vercel_blob");
    expect(interrupted.reconcile).toBe(false);
    providers.push(interrupted.provider);
    await admin.query(
      "update privacy_provider_cleanup_items set lease_expires_at=now()-interval '1 second' where id=$1",
      [interrupted.id],
    );
    expect(
      (
        await system.query(
          "select privacy_system_recover_customer_deletions() recovered",
        )
      ).rows[0].recovered,
    ).toBe(1);
    expect(
      (
        await admin.query(
          "select status,result_code,failure_code from privacy_provider_cleanup_items where id=$1",
          [interrupted.id],
        )
      ).rows[0],
    ).toEqual({
      status: "uncertain",
      result_code: "uncertain",
      failure_code: "provider_uncertain",
    });
    const reconciled = (
      await system.query(
        "select * from privacy_system_claim_provider_cleanup_work_v2('reconcile-worker',300)",
      )
    ).rows[0];
    expect(reconciled.id).toBe(interrupted.id);
    expect(reconciled.reconcile).toBe(true);
    expect(
      (
        await system.query(
          "select privacy_system_record_provider_cleanup_result($1,'reconcile-worker','already_absent','blob_absence_verified','receipt:reconciled',null) ok",
          [reconciled.id],
        )
      ).rows[0].ok,
    ).toBe(true);
    for (;;) {
      const item = (
        await system.query(
          "select * from privacy_system_claim_deletion_provider_item('worker',300)",
        )
      ).rows[0];
      if (!item) break;
      providers.push(item.provider);
      expect(
        (
          await system.query(
            "select privacy_system_finish_deletion_provider_item($1,'worker',true,$2) ok",
            [item.id, "b".repeat(64)],
          )
        ).rows[0].ok,
      ).toBe(true);
    }
    expect(providers.sort()).toEqual(["resend", "stripe", "vercel_blob", "vercel_domains"]);
    expect(
      (
        await admin.query(
          "select distinct provider_authority from privacy_provider_cleanup_bindings where job_id=$1 and provider='vercel_blob'",
          [job],
        )
      ).rows,
    ).toEqual([{ provider_authority: "store_ExampleStore0001" }]);
    expect(
      (
        await admin.query(
          "select provider_authority from privacy_provider_cleanup_bindings where job_id=$1 and provider='vercel_domains'",
          [job],
        )
      ).rows,
    ).toEqual([{ provider_authority: domainAuthority }]);
    await expect(
      admin.query(
        "update privacy_provider_cleanup_bindings set provider_authority='store_KZTiY4mQqmSqD0wx' where job_id=$1 and provider='vercel_blob'",
        [job],
      ),
    ).rejects.toThrow(/privacy_evidence_immutable/);
    expect(
      (
        await owner.query(
          "select owner_record_customer_deletion_legal_review($1,'owner-hash',$2,$3,'case:synthetic','legal') ok",
          [ownerSession, ++step, job],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await owner.query(
          "select owner_record_customer_deletion_legal_review($1,'owner-hash',$2,$3,'case:replay','legal-replay') ok",
          [ownerSession, step, job],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await owner.query(
          "select * from owner_review_customer_deletion($1,'owner-hash',$2,$3,'approve','eligible_approved','approve')",
          [ownerSession, ++step, job],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await system.query(
          "select privacy_system_claim_deletion_execution('worker',300) id",
        )
      ).rows[0].id,
    ).toBe(job);
    expect(
      (
        await system.query(
          "select privacy_system_execute_customer_deletion($1,'worker') ok",
          [job],
        )
      ).rows[0].ok,
    ).toBe(true);
    const closed = (
      await admin.query(
        "select visibility,publication_intent,slug from sites where id=$1",
        [site],
      )
    ).rows[0];
    expect(closed.visibility).toBe("private");
    expect(closed.slug).toMatch(/^closed-/);
    expect(
      (
        await admin.query(
          "select customer_name,email,note from site_appointments where site_id=$1",
          [site],
        )
      ).rows[0],
    ).toMatchObject({ email: null, note: null });
    expect(
      (
        await admin.query(
          "select count(*)::int count from site_admin_sessions where account_id=$1",
          [account],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await admin.query(
          "select phase from customer_deletion_workflows where job_id=$1",
          [job],
        )
      ).rows[0].phase,
    ).toBe("completed");
  });
  it("records synthetic EXPLAIN evidence for critical query paths", async () => {
    const statements: Array<[string, unknown[]]> = [
      [
        "select status,provider_status_observed_at,read_only_ends_at from site_subscriptions where site_id=$1",
        [site],
      ],
      [
        "select id from privacy_legal_holds where subject_kind='customer_site' and site_id=$1 and released_at is null",
        [site],
      ],
      [
        "select j.id from privacy_jobs j join customer_deletion_workflows w on w.job_id=j.id where j.kind='customer_deletion' and j.status in('queued','retry_wait') order by j.created_at for update of j,w skip locked limit 1",
        [],
      ],
      [
        "select data_class,datastore,status from privacy_job_items where job_id=$1 order by data_class,datastore",
        [job],
      ],
      [
        "select event_type,previous_state,next_state,details from privacy_job_events where job_id=$1 order by created_at",
        [job],
      ],
    ];
    for (const [statement, parameters] of statements) {
      const explained = await admin.query(
        `explain (format json, costs true) ${statement}`,
        parameters,
      );
      expect(explained.rows[0]["QUERY PLAN"][0].Plan).toBeTruthy();
    }
  });
});
