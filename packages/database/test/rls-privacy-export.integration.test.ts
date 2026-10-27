import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL,
  ownerUrl = process.env.RLS_TEST_OWNER_DATABASE_URL,
  runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL,
  systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const suite =
  adminUrl && ownerUrl && runtimeUrl && systemUrl ? describe : describe.skip;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
suite("authenticated privacy export FORCE boundaries", () => {
  const admin = new pg.Pool({ connectionString: adminUrl }),
    owner = new pg.Pool({ connectionString: ownerUrl }),
    runtime = new pg.Pool({ connectionString: runtimeUrl }),
    system = new pg.Pool({ connectionString: systemUrl });
  const siteA = `export-a-${randomUUID()}`,
    siteB = `export-b-${randomUUID()}`,
    accountA = randomUUID(),
    accountB = randomUUID(),
    sessionA = hash("export-session-a"),
    sessionB = hash("export-session-b"),
    ownerA = randomUUID(),
    ownerB = randomUUID(),
    ownerSessionA = hash("owner-export-a"),
    ownerSessionB = hash("owner-export-b");
  let step = 500;
  beforeAll(async () => {
    await admin.query(
      "insert into sites(id,slug,visibility,generated_document,demo_expires_at,trial_recovery_ends_at)values($1,$1,'private',$3,now()+interval '14 days',now()+interval '44 days'),($2,$2,'private',$4,now()+interval '14 days',now()+interval '44 days')",
      [
        siteA,
        siteB,
        { safe: "a", password_hash: "content-not-schema" },
        { safe: "b" },
      ],
    );
    await admin.query(
      "insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale)values($1,$2,'export-a@example.test','hash-a','en'),($3,$4,'export-b@example.test','hash-b','de')",
      [accountA, siteA, accountB, siteB],
    );
    await admin.query(
      "insert into site_admin_sessions(id,account_id,token_hash,expires_at)values(gen_random_uuid(),$1,$2,now()+interval '1 hour'),(gen_random_uuid(),$3,$4,now()+interval '1 hour')",
      [accountA, sessionA, accountB, sessionB],
    );
    await admin.query(
      "insert into site_appointments(id,site_id,customer_name,phone,email)values(gen_random_uuid(),$1,'Tenant A','1','a@example.test'),(gen_random_uuid(),$2,'Tenant B','2','b@example.test')",
      [siteA, siteB],
    );
    await admin.query(
      "insert into site_media_blobs(id,site_id,filename,content_type,data)values(gen_random_uuid(),$1,'../../a.webp','image/webp','\\x0102')",
      [siteA],
    );
    await admin.query(
      "insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step)values($1,'operator-a@example.test','owner-hash-a','active','operator','v1.synthetic',now(),$3),($2,'viewer-b@example.test','owner-hash-b','active','viewer','v1.synthetic',now(),$3)",
      [ownerA, ownerB, step],
    );
    await admin.query(
      "insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at)values(gen_random_uuid(),$1,$2,now(),now()+interval '1 hour'),(gen_random_uuid(),$3,$4,now(),now()+interval '1 hour')",
      [ownerA, ownerSessionA, ownerB, ownerSessionB],
    );
  });
  afterAll(async () => {
    await admin.query("delete from sites where id=any($1::text[])", [
      [siteA, siteB],
    ]);
    await admin.query("delete from owner_accounts where id=any($1::uuid[])", [
      [ownerA, ownerB],
    ]);
    await Promise.all([admin.end(), owner.end(), runtime.end(), system.end()]);
  });
  it("derives the exact customer, ignores legal holds, and produces a secret-free tenant snapshot", async () => {
    expect(
      (
        await runtime.query(
          "select * from site_admin_request_privacy_export($1,'wrong','x')",
          [sessionA],
        )
      ).rows[0].ok,
    ).toBe(false);
    const requested = (
      await runtime.query(
        "select * from site_admin_request_privacy_export($1,'hash-a','customer-export')",
        [sessionA],
      )
    ).rows[0];
    expect(requested.ok).toBe(true);
    await admin.query(
      "insert into privacy_legal_holds(id,subject_kind,subject_reference,site_id,site_admin_account_id,data_classes,reason_category,status)values(gen_random_uuid(),'customer_account',$1,$2,$3,'{}','data_subject_dispute','active')",
      [accountA, siteA, accountA],
    );
    expect(
      (
        await runtime.query(
          "select (site_admin_privacy_export_status($1)->>'jobId')::uuid id",
          [sessionB],
        )
      ).rows[0].id,
    ).toBeNull();
    const job = (
      await system.query(
        "select privacy_system_claim_export('worker-a',300) id",
      )
    ).rows[0].id;
    expect(job).toBe(requested.job_id);
    const data = (
      await system.query(
        "select privacy_system_export_snapshot($1,'worker-a') value",
        [job],
      )
    ).rows[0].value;
    expect(data.account.id).toBe(accountA);
    expect(data.site.id).toBe(siteA);
    expect(
      data.appointments.map(
        (row: { customerName: string }) => row.customerName,
      ),
    ).toEqual(["Tenant A"]);
    const serialized = JSON.stringify(data);
    for (const forbidden of [
      "hash-a",
      sessionA,
      "hash-b",
      sessionB,
      "mfa_secret",
      "token_hash",
      "provider_response_id",
    ])
      expect(serialized).not.toContain(forbidden);
    expect(data.media.databaseFiles[0].dataBase64).toBeTruthy();
  });
  it("requires an artifact for completion and atomically consumes one capability once", async () => {
    const job = (
      await admin.query(
        "select id from privacy_jobs where site_admin_account_id=$1 order by created_at desc limit 1",
        [accountA],
      )
    ).rows[0].id;
    await expect(
      admin.query("update privacy_jobs set status='completed' where id=$1", [
        job,
      ]),
    ).rejects.toThrow(/privacy_export_artifact_required/);
    const artifact = randomUUID(),
      objectKey = `privacy-exports/test/aaaa/${artifact}.enc`;
    expect(
      (
        await system.query(
          "select privacy_system_reserve_export($1,'worker-a',$2,'memory_test','memory_test','memory_test','test',$3,'v1',$4,$5,100,140,12) ok",
          [job, artifact, objectKey, "a".repeat(64), "b".repeat(64)],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await system.query(
          "select privacy_system_complete_export($1,'worker-a',$2,'memory_test',$3,'v1',$4,$5,100,140,12) ok",
          [job, artifact, objectKey, "a".repeat(64), "b".repeat(64)],
        )
      ).rows[0].ok,
    ).toBe(true);
    const token = hash("single-use");
    expect(
      (
        await runtime.query(
          "select * from site_admin_issue_export_capability($1,'hash-a',$2,$3,'issue')",
          [sessionA, job, token],
        )
      ).rows[0].ok,
    ).toBe(true);
    const [left, right] = await Promise.all([
      runtime.query(
        "select * from site_admin_consume_export_capability($1,$2)",
        [sessionA, token],
      ),
      runtime.query(
        "select * from site_admin_consume_export_capability($1,$2)",
        [sessionA, token],
      ),
    ]);
    expect([left.rowCount, right.rowCount].sort()).toEqual([0, 1]);
    expect(
      (
        await runtime.query(
          "select site_admin_record_export_download($1,$2,true) ok",
          [sessionA, job],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await admin.query(
          "select count(*)::int count from privacy_job_events where job_id=$1 and event_type='download_completed'",
          [job],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await runtime.query(
          "select * from site_admin_consume_export_capability($1,$2)",
          [sessionB, token],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await admin.query(
          "select token_hash from privacy_export_download_capabilities where artifact_id=$1",
          [artifact],
        )
      ).rows[0].token_hash,
    ).toBe(token);
  });
  it("lets operator/viewer request only self-export and rejects replayed fresh MFA", async () => {
    const first = (
      await owner.query(
        "select * from owner_request_self_privacy_export($1,'owner-hash-a',$2,'owner-a')",
        [ownerSessionA, ++step],
      )
    ).rows[0];
    expect(first.ok).toBe(true);
    expect(
      (
        await owner.query(
          "select * from owner_request_self_privacy_export($1,'owner-hash-a',$2,'replay')",
          [ownerSessionA, step],
        )
      ).rows[0].ok,
    ).toBe(false);
    const second = (
      await owner.query(
        "select * from owner_request_self_privacy_export($1,'owner-hash-b',$2,'owner-b')",
        [ownerSessionB, ++step],
      )
    ).rows[0];
    expect(second.ok).toBe(true);
    const claimed = (
      await system.query(
        "select privacy_system_claim_export('worker-owner',300) id",
      )
    ).rows[0].id;
    const data = (
      await system.query(
        "select privacy_system_export_snapshot($1,'worker-owner') value",
        [claimed],
      )
    ).rows[0].value;
    expect([ownerA, ownerB]).toContain(data.owner.id);
    expect(JSON.stringify(data)).not.toContain("customer datasets");
    expect(JSON.stringify(data)).not.toContain("owner-hash");
  });
  it("keeps tables procedure-only with FORCE RLS and no PUBLIC access", async () => {
    for (const table of [
      "privacy_export_artifacts",
      "privacy_export_download_capabilities",
    ]) {
      await expect(runtime.query(`select * from ${table}`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(owner.query(`select * from ${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
    expect(
      (
        await admin.query(
          "select count(*)::int count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relforcerowsecurity",
        )
      ).rows[0].count,
    ).toBe(70);
    expect(
      (
        await admin.query(
          "select count(*)::int count from information_schema.role_table_grants where grantee='PUBLIC' and table_schema='public'",
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
