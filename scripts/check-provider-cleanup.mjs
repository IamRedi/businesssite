import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const migration = ["050_provider_cleanup_reconciliation.sql","051_vercel_blob_store_authority.sql","052_vercel_domain_project_authority.sql"]
  .map((name)=>readFileSync(resolve(root,"db/migrations",name),"utf8")).join("\n");
const contract = readFileSync(resolve(root, "packages/site-data/src/provider-cleanup.ts"), "utf8");
const adapter = readFileSync(resolve(root, "apps/web/lib/provider-cleanup-adapters.ts"), "utf8");
const route = readFileSync(resolve(root, "apps/web/app/api/internal/privacy-deletions/route.ts"), "utf8");
const failures = [];
for (const value of ["privacy_provider_cleanup_bindings", "privacy_system_claim_provider_cleanup_work", "privacy_system_record_provider_cleanup_result", "force row level security", "skip locked", "provider_reference", "privacy_provider_cleanup_item_approved"])
  if (!migration.includes(value)) failures.push(`migration missing ${value}`);
for (const value of ["uncertain", "manual_review_required", "retained_by_policy", "providerCleanupWorkerEnabled", "DeterministicFakeProviderCleanupAdapter"])
  if (!contract.includes(value)) failures.push(`contract missing ${value}`);
for (const value of ["provider_authority","privacy_system_claim_provider_cleanup_work_v2","site_admin_register_business_provider_media"])
  if (!migration.includes(value)) failures.push(`store-authority migration missing ${value}`);
for (const value of ["provider_binding_invalid","provider_cleanup_result_not_recorded"])
  if (!(migration + contract).includes(value)) failures.push(`fail-closed cleanup boundary missing ${value}`);
for (const unsafe of ["list(", "customer.delete", "subscriptions.cancel", "delete account"])
  if (adapter.toLowerCase().includes(unsafe.toLowerCase())) failures.push(`unsafe provider operation ${unsafe}`);
if (!adapter.includes("safeBlobKey") || !adapter.includes("project_domain_attachment")) failures.push("adapter lacks exact Blob/domain binding guards");
for (const value of ["vercel-project:","PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID","PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID","/v9/projects/"])
  if (!(migration + adapter).includes(value)) failures.push(`domain project-authority boundary missing ${value}`);
if (adapter.includes("/v6/domains/")) failures.push("adapter contains forbidden account-level domain deletion endpoint");
if (!route.includes("CRON_SECRET") || !route.includes("providerCleanupWorkerEnabled")) failures.push("internal worker boundary incomplete");
if (/providerReference.*request\./s.test(route)) failures.push("browser/provider reference authority in route");
if (failures.length) {
  console.error(`Provider cleanup static boundary failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("Provider cleanup static boundary passed (trusted bindings, fail-closed flags, no broad provider operations).");
