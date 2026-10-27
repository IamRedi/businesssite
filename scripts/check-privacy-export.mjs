import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const migration = readFileSync(
  resolve(root, "db/migrations/048_authenticated_privacy_exports.sql"),
  "utf8",
);
const authorityMigration = readFileSync(
  resolve(root, "db/migrations/062_private_privacy_export_store.sql"),
  "utf8",
);
const rateLimitMigration = readFileSync(
  resolve(root, "db/migrations/063_privacy_export_rate_limit_scope.sql"),
  "utf8",
);
const authorityRepairMigration = readFileSync(
  resolve(root, "db/migrations/066_privacy_export_artifact_binding_authority.sql"),
  "utf8",
);
const storeAdapter = readFileSync(
  resolve(root, "apps/web/lib/privacy-artifact-store.ts"),
  "utf8",
);
const archive = readFileSync(
  resolve(root, "packages/site-data/src/privacy-export.ts"),
  "utf8",
);
const routes = [
  "apps/web/app/api/site-admin/[slug]/privacy-export/download/route.ts",
  "apps/web/app/api/owner/privacy-export/download/route.ts",
]
  .map((path) => readFileSync(resolve(root, path), "utf8"))
  .join("\n");
const failures = [];
for (const required of [
  "privacy_export_artifacts",
  "privacy_export_download_capabilities",
  "force row level security",
  "site_admin_request_privacy_export",
  "owner_request_self_privacy_export",
  "privacy_export_artifact_required",
  "AES-256-GCM",
])
  if (!migration.includes(required))
    failures.push(`missing contract: ${required}`);
for (const required of [
  "privacy_system_reserve_export",
  "privacy_system_recover_stuck_exports",
  "privacy_export_artifact_binding_valid",
  "-- migrate-as-migrator",
  "-- migrate-as-owner-of: public.privacy_export_artifact_guard()",
  "artifact_persistence_uncertain",
  "environment_identity",
  "store_authority",
])
  if (!authorityMigration.includes(required))
    failures.push(`missing private authority/lifecycle contract: ${required}`);
if (!rateLimitMigration.includes("privacy_export_customer"))
  failures.push("missing authenticated privacy-export rate-limit scope");
for (const required of [
  "-- migrate-as-owner-of: public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)",
  "privacy_export_artifact_binding_owner_drift",
  "v_binding_owner<>v_guard_owner",
  "aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))",
  "x.grantee<>p.proowner",
  "revoke all on function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) from public",
])
  if (!authorityRepairMigration.includes(required))
    failures.push(`missing privacy-export binding authority repair guard: ${required}`);
for (const required of [
  "PRIVACY_EXPORT_BLOB_STORE_ID",
  "tokenStoreAuthority(token) !== storeAuthority",
  ".private.blob.vercel-storage.com",
  "useCache: false",
  "ifMatch: current.etag",
])
  if (!storeAdapter.includes(required))
    failures.push(`missing private provider guard: ${required}`);
for (const forbidden of [
  "'passwordHash'",
  "'tokenHash'",
  "'mfaSecret'",
  "'recoveryCode'",
  "'storageKey'",
  "'providerResponseId'",
  "'integrationMetadata'",
])
  if (migration.includes(forbidden))
    failures.push(`unsafe export projection marker: ${forbidden}`);
if (
  !archive.includes("privateOnly: true") ||
  !archive.includes("archive_path_invalid") ||
  !archive.includes("appointmentsCsv")
)
  failures.push("archive/store safety contract missing");
if (
  /(?:nextUrl|new URL\(request\.url\))\.searchParams[\s\S]{0,120}token/.test(
    routes,
  ) ||
  !routes.includes("readUrlEncodedBody")
)
  failures.push("download token may be accepted outside the bounded POST body");
if (
  !migration.includes("expires_at<=created_at+interval '24 hours'") ||
  !migration.includes("expires_at<=issued_at+interval '10 minutes'")
)
  failures.push("expiry bounds missing");
if (failures.length) {
  console.error(
    `Privacy export check failed:\n${failures.map((value) => `- ${value}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  "Privacy export static boundary passed (allowlisted projections, private store, encryption, one-time POST capability).",
);
