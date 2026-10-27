import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(readFileSync(resolve(root, "config/privacy-retention-policy-v1.json"), "utf8"));
const access = JSON.parse(readFileSync(resolve(root, "config/database-access-manifest.json"), "utf8"));
const failures = [];
const pgArray = (values = []) => `{${values.join(",")}}`;
const normalizedRule = (rule) => {
  const duration = rule.durationHours !== undefined ? [rule.durationHours, "hours"] :
    rule.durationDays !== undefined ? [rule.durationDays, "days"] :
    rule.durationMonths !== undefined ? [rule.durationMonths, "months"] : ["", ""];
  return [
    rule.classKey, rule.triggerKey, String(duration[0]), duration[1],
    rule.coolingDays === undefined ? "" : String(rule.coolingDays),
    pgArray(rule.tenantOptionsDays), rule.disposition,
    String(rule.automaticDisposition), String(rule.legalReviewRequired),
    String(rule.exportEligible), String(rule.holdEligible),
    String(rule.providerReconciliationRequired), rule.technicalOwner,
    pgArray(rule.stores), String(rule.ruleVersion ?? 1),
  ].join("|");
};
const calculatedHash = createHash("sha256").update(
  [...policy.rules].sort((a,b) => a.classKey.localeCompare(b.classKey)).map(normalizedRule).join("\n"),
).digest("hex");
if (calculatedHash !== policy.manifestHash)
  failures.push(`manifest hash mismatch: expected ${calculatedHash}, found ${policy.manifestHash}`);
if (policy.policyKey !== "businesssite_privacy_retention" || policy.version !== 1 || policy.status !== "active" || policy.technicalBaseline !== true || policy.legalCertification !== false)
  failures.push("Policy v1 identity/status boundary differs");
if (policy.rules.length !== 17 || new Set(policy.rules.map((rule) => rule.classKey)).size !== 17)
  failures.push("Policy v1 must contain exactly 17 unique data classes");
for (const rule of policy.rules) {
  if (rule.legalReviewRequired && (rule.automaticDisposition || rule.disposition !== "manual_review"))
    failures.push(`${rule.classKey}: legal-review data cannot be automatic`);
  if (!Array.isArray(rule.stores)) failures.push(`${rule.classKey}: stores must be an array`);
}
const covered = new Set(policy.rules.flatMap((rule) => rule.stores));
// B2 tables are the database ledger for the already-versioned
// `export_artifacts` class. This mapping extends physical coverage without
// mutating or silently re-hashing approved Policy v1.
for (const table of ["privacy_export_artifacts","privacy_export_download_capabilities","customer_deletion_workflows","privacy_provider_cleanup_items","privacy_provider_cleanup_bindings","operational_monitoring_state","website_import_analysis_cache"]) covered.add(table);
// The sponsor row is publication-owned media/content under the approved
// `media_content` class. Keep Policy v1 immutable; the physical store is
// included in the existing customer export and deletion paths by migration 072.
const sponsorMigration = readFileSync(resolve(root, "db/migrations/072_information_sponsor_banners.sql"), "utf8");
if (!policy.rules.find((rule) => rule.classKey === "media_content") ||
    !sponsorMigration.includes("public.information_sponsors_export(v.site_id)") ||
    !sponsorMigration.includes("public.information_sponsors_delete(v.site_id)"))
  failures.push("sponsor table lacks reviewed media_content/export coverage");
else covered.add("site_information_sponsor_banners");
// The owner complimentary entitlement is billing-lifecycle customer data
// under the approved `active_subscription` class. Keep Policy v1 immutable;
// migration 073 includes the entitlement in the customer export projection.
const compMigration = readFileSync(resolve(root, "db/migrations/073_owner_complimentary_access.sql"), "utf8");
if (!policy.rules.find((rule) => rule.classKey === "active_subscription") ||
    !compMigration.includes("public.complimentary_access_export(v.site_id)") ||
    !compMigration.includes("references public.sites(id) on delete cascade"))
  failures.push("complimentary table lacks reviewed active_subscription/export coverage");
else covered.add("site_complimentary_access");
// Booking availability settings contain business schedule, not visitor PII.
// They are site-owned and cascade on the existing canceled-customer lifecycle;
// booking contacts remain in site_appointments under the appointments class.
const bookingMigration = readFileSync(resolve(root, "db/migrations/079_booking_v1_local.sql"), "utf8");
const bookingPrivacy = readFileSync(resolve(root, "db/migrations/080_booking_privacy_projection.sql"), "utf8");
const bookingExport = readFileSync(resolve(root, "db/migrations/081_booking_export_projection.sql"), "utf8");
if (!policy.rules.find((rule) => rule.classKey === "canceled_customer") ||
    !policy.rules.find((rule) => rule.classKey === "appointments") ||
    (bookingMigration.match(/on delete cascade/g) ?? []).length < 3 ||
    !bookingPrivacy.includes("new.booking_start:=null") || !bookingExport.includes("'bookingStart'"))
  failures.push("booking stores lack site-deletion and appointment privacy/export coverage");
else for (const table of ["booking_settings","booking_weekly","booking_blocks"]) covered.add(table);
for (const table of Object.values(access.tableClasses).flat()) if (!covered.has(table)) failures.push(`missing table coverage: ${table}`);
for (const provider of ["stripe","paddle","resend","vercel_domains","vercel_blob","openai","google_finder","redi_control","hosting_logs","postgres_backups"])
  if (!covered.has(provider)) failures.push(`missing provider coverage: ${provider}`);

const sourceFiles = [];
for (const directory of ["apps/web/app/api", "apps/web/lib", "packages/site-data/src"]) {
  const visit = (path) => { for (const name of readdirSync(path)) { const full=resolve(path,name); if (statSync(full).isDirectory()) visit(full); else if (/\.(?:ts|tsx)$/.test(name) && !/\.test\./.test(name)) sourceFiles.push(full); } };
  visit(resolve(root,directory));
}
for (const file of sourceFiles) {
  const name = relative(root,file); const source = readFileSync(file,"utf8");
  if (/privacy/i.test(name) && /\bdelete\s+from\s+(?:sites|site_appointments|leads|ai_runs|contract_acceptances)\b/i.test(source))
    failures.push(`${name}: B1 web/repository code contains a destructive customer-data query`);
}
if (failures.length) {
  console.error(`Privacy policy check failed:\n${failures.map((failure)=>`- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Privacy Policy v1 passed (${policy.rules.length} classes; hash ${calculatedHash}).`);
