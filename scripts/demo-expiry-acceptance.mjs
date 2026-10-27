import { randomBytes } from "node:crypto";
import pg from "pg";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

if (process.env.ALLOW_DEMO_EXPIRY_ACCEPTANCE !== "true")
  throw new Error("Set ALLOW_DEMO_EXPIRY_ACCEPTANCE=true to run this destructive staging test.");

const baseUrl = required("ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const databaseUrl = required("DATABASE_URL");
const cronSecret = required("CRON_SECRET");
if (
  !baseUrl.startsWith("https://") &&
  !baseUrl.startsWith("http://localhost:") &&
  !baseUrl.startsWith("http://127.0.0.1:")
)
  throw new Error("ACCEPTANCE_BASE_URL must be HTTPS or an explicit local development URL.");

const pool = new pg.Pool({ connectionString: databaseUrl });
const runId = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const email = `demo-expiry-${runId}@example.test`;

async function status(url) {
  const response = await fetch(url, { redirect: "manual" });
  return response.status;
}

try {
  const trialResponse = await fetch(`${baseUrl}/api/public/trials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      businessName: `Demo Expiry QA ${runId}`,
      category: "Cleaning service",
      email,
      password: randomBytes(24).toString("base64url"),
      locale: "en",
    }),
  });
  const trialText = await trialResponse.text();
  if (!trialResponse.ok)
    throw new Error(`Trial creation failed (${trialResponse.status}): ${trialText.slice(0, 300)}`);
  const trial = JSON.parse(trialText);
  const siteResult = await pool.query(
    "select id,slug,lead_id,prepared_profile_id from sites where trial_email=$1 order by created_at desc limit 1",
    [email],
  );
  const site = siteResult.rows[0];
  if (!site) throw new Error("The technical trial was not persisted.");
  if ((await status(`${baseUrl}${trial.previewUrl}`)) !== 200)
    throw new Error("The fresh private preview was not available before expiry.");

  await pool.query(
    "update sites set demo_expires_at=now() - interval '1 minute' where id=$1 and activated_at is null",
    [site.id],
  );
  if ((await status(`${baseUrl}${trial.previewUrl}`)) !== 404)
    throw new Error("The expired private preview was not denied.");

  const recoveryCleanupResponse = await fetch(`${baseUrl}/api/internal/cleanup-expired-demos`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  if (!recoveryCleanupResponse.ok)
    throw new Error(`Recovery-window cleanup failed (${recoveryCleanupResponse.status}).`);
  const retained = await pool.query("select 1 from sites where id=$1", [site.id]);
  if (!retained.rows[0]) throw new Error("Expired trial was deleted during its recovery window.");
  await pool.query(
    "update sites set trial_recovery_ends_at=now() - interval '1 minute' where id=$1 and activated_at is null",
    [site.id],
  );

  const cleanupResponse = await fetch(`${baseUrl}/api/internal/cleanup-expired-demos`, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const cleanupText = await cleanupResponse.text();
  if (!cleanupResponse.ok)
    throw new Error(`Cleanup failed (${cleanupResponse.status}): ${cleanupText.slice(0, 300)}`);
  const cleanup = JSON.parse(cleanupText);

  const remaining = await pool.query(
    `select
      (select count(*)::int from sites where id=$1) as sites,
      (select count(*)::int from site_admin_accounts where site_id=$1) as accounts,
      (select count(*)::int from demo_sites where site_id=$1) as demos,
      (select count(*)::int from site_preview_tokens where site_id=$1) as preview_tokens,
      (select count(*)::int from prepared_business_profiles where id=$2) as profiles,
      (select count(*)::int from leads where id=$3) as leads`,
    [site.id, site.prepared_profile_id, site.lead_id],
  );
  const counts = remaining.rows[0];
  if (Object.values(counts).some((count) => Number(count) !== 0))
    throw new Error(`Expired trial data remains: ${JSON.stringify(counts)}`);

  console.log(JSON.stringify({
    runId,
    result: "passed",
    siteId: site.id,
    slug: site.slug,
    previewBeforeExpiry: 200,
    previewAfterExpiry: 404,
    cleanupDeleted: cleanup.deleted,
    remaining: counts,
  }, null, 2));
} finally {
  await pool.end();
}
