import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const runtimeUrl = process.env.RLS_TEST_RUNTIME_DATABASE_URL;
const ownerUrl = process.env.RLS_TEST_OWNER_DATABASE_URL;
const systemUrl = process.env.RLS_TEST_SYSTEM_DATABASE_URL;
const run = Boolean(adminUrl && runtimeUrl && ownerUrl && systemUrl);

describe.skipIf(!run)("operational monitoring system boundary", () => {
  const admin = new pg.Pool({ connectionString: adminUrl, allowExitOnIdle: true });
  const runtime = new pg.Pool({ connectionString: runtimeUrl, allowExitOnIdle: true });
  const owner = new pg.Pool({ connectionString: ownerUrl, allowExitOnIdle: true });
  const system = new pg.Pool({ connectionString: systemUrl, allowExitOnIdle: true });
  const jobId = randomUUID();
  const webhookId = `b6a-${randomUUID()}`;

  beforeAll(async () => {
    const policyId = (await admin.query(
      "select id from privacy_policy_versions where status='active' limit 1",
    )).rows[0].id;
    await admin.query(
      `insert into privacy_jobs(
        id,kind,subject_kind,subject_reference,policy_version_id,snapshot_at,
        requested_actor_kind,status,idempotency_hash,completed_at
      ) values($1,'retention_scan','site',$2,$3,now(),'system','failed',$4,now())`,
      [jobId, `b6a-${jobId}`, policyId, "a".repeat(64)],
    );
    await admin.query(
      `insert into payment_webhook_events(event_id,provider,event_type,disposition)
       values($1,'stripe','synthetic.b6a','ignored_invalid')`,
      [webhookId],
    );
  });

  afterAll(async () => {
    await Promise.all([admin.end(), runtime.end(), owner.end(), system.end()]);
  });

  it("allows only the system application identity to execute the aggregate routine", async () => {
    const result = await system.query(
      "select monitoring_system_snapshot(15,5,80) value",
    );
    expect(result.rows[0].value).toMatchObject({
      schema: "businesssite.operational-snapshot.v1",
      status: "alert",
    });
    expect(result.rows[0].value.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "billing_webhook_rejected", count: expect.any(Number) }),
      expect.objectContaining({ code: "privacy_job_failed", count: expect.any(Number) }),
    ]));
    await expect(runtime.query("select monitoring_system_snapshot(15,5,80)"))
      .rejects.toThrow(/permission denied/i);
    await expect(owner.query("select monitoring_system_snapshot(15,5,80)"))
      .rejects.toThrow(/permission denied/i);
  });

  it("rejects unsafe thresholds and keeps system table access procedure-only", async () => {
    await expect(system.query("select monitoring_system_snapshot(1,5,80)"))
      .rejects.toThrow(/monitoring_threshold_invalid/i);
    await expect(system.query("select count(*) from privacy_jobs"))
      .rejects.toThrow(/permission denied/i);
    await expect(system.query("select count(*) from payment_webhook_events"))
      .rejects.toThrow(/permission denied/i);
  });

  it("persists a stale-worker-safe aggregate heartbeat visible only through system routines", async () => {
    const first = (await system.query(
      "select monitoring_system_begin('operational_monitoring_scheduler') value",
    )).rows[0].value;
    const second = (await system.query(
      "select monitoring_system_begin('operational_monitoring_scheduler') value",
    )).rows[0].value;
    expect(second).toBeNull();
    expect((await system.query(
      "select monitoring_system_complete($1,'healthy',0,true) value",
      [first],
    )).rows[0].value).toBe(true);
    const heartbeat = (await system.query(
      "select monitoring_system_heartbeat(900,180) value",
    )).rows[0].value;
    expect(heartbeat).toMatchObject({
      schema: "businesssite.operational-heartbeat.v1",
      status: "healthy",
      reason: "within_threshold",
      signalCount: 0,
      deliveryHealthy: true,
    });
    await expect(runtime.query("select monitoring_system_begin('operational_monitoring_scheduler')"))
      .rejects.toThrow(/permission denied/i);
    await expect(owner.query("select monitoring_system_heartbeat(900,180)"))
      .rejects.toThrow(/permission denied/i);
    await expect(system.query("select * from operational_monitoring_state"))
      .rejects.toThrow(/permission denied/i);
  });
});
