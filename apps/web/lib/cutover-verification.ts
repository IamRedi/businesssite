import { createHash, timingSafeEqual } from "node:crypto";
import type { RuntimeDatabaseTarget } from "@platform/database";

type Environment = Record<string, string | undefined>;
export const canonicalAuthority = Object.freeze({
  project: "example-project-00000000", branch: "br-example-main-00000000",
  endpoint: "ep-example-prod-a1b2c3d4", database: "neondb",
});
const memberships = ["bsrc_runtime", "bsrc_system", "bsrc_owner_ops"];
const privileged = ["bsrc_migrator", "bsrc_runtime_executor", "bsrc_bootstrap_executor", "bsrc_owner_executor", "bsrc_system_executor",
  "neon_superuser", "pg_read_all_data", "pg_write_all_data", "pg_execute_server_program", "pg_read_server_files", "pg_write_server_files"];
export const canonicalRuntimeTarget: RuntimeDatabaseTarget = {
  database: canonicalAuthority.database,
  hosts: ["ep-example-prod-a1b2c3d4.c-5.eu-central-1.aws.neon.tech", "ep-example-prod-a1b2c3d4-pooler.c-5.eu-central-1.aws.neon.tech"],
  actors: ["runtime", "system", "owner"].map((actor, index) => ({
    key: `DATABASE_${actor.toUpperCase()}_URL`, role: `bsrc_${actor}_prod`, membership: memberships[index],
    forbiddenMemberships: [...memberships.filter(name => name !== memberships[index]), ...privileged],
    readiness: actor === "runtime",
  })),
};
export function canonicalRuntimeFingerprint() {
  const { project, branch, endpoint, database } = canonicalAuthority;
  return createHash("sha256").update(JSON.stringify(["neon-authority-v1", project, branch, endpoint, database])).digest("hex");
}

export function cutoverRequestAuthorized(request: Request, env: Environment = process.env, now = Date.now()) {
  const digest = env.CUTOVER_VERIFICATION_TOKEN_SHA256 ?? "";
  const start = Date.parse(env.CUTOVER_VERIFICATION_NOT_BEFORE ?? "");
  const end = Date.parse(env.CUTOVER_VERIFICATION_EXPIRES_AT ?? "");
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!/^[a-f0-9]{64}$/.test(digest) || !bearer || !Number.isFinite(start) || !Number.isFinite(end) ||
      end <= start || end - start > 60 * 60 * 1000 || now < start || now >= end ||
      env.VERCEL_ENV !== "production" || !env.VERCEL_URL?.endsWith(".vercel.app") ||
      new URL(request.url).hostname !== env.VERCEL_URL) return false;
  return timingSafeEqual(createHash("sha256").update(bearer).digest(), Buffer.from(digest, "hex"));
}

export function cutoverSafeFlags(env: Environment = process.env) {
  const masters = ["BILLING_EXECUTION_ENABLED", "AI_EXECUTION_ENABLED", "DEMO_CLEANUP_EXECUTION_ENABLED"];
  const optional = ["PRIVACY_RETENTION_EXECUTION_ENABLED", "PRIVACY_DELETION_EXECUTION_ENABLED", "PRIVACY_DELETION_REQUESTS_ENABLED",
    "PRIVACY_EXPORT_ENABLED", "PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED", "PRIVACY_PROVIDER_RECONCILIATION_ENABLED",
    "PADDLE_ENABLED", "REDI_CONTROL_ENABLED", "REDI_IMPORT_ENABLED"];
  if (masters.some(key => env[key] !== "false") || optional.some(key => env[key]?.trim() === "true") ||
      (env.PRIVACY_SCHEDULER_ENABLED?.trim() === "true" && env.PRIVACY_SCHEDULER_NOOP?.trim() !== "true") ||
      env.DATABASE_RLS_MODE !== "enforced" || env.RELEASE_TARGET !== "production")
    throw new Error("Runtime safety configuration mismatch");
  return { billing: "off", ai: "off", demoCleanup: "off", destructivePrivacy: "off", paddle: "off", redi: "off",
    privacyScheduler: env.PRIVACY_SCHEDULER_ENABLED?.trim() === "true" ? "noop" : "off", rls: "enforced" };
}
