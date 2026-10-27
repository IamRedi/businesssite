import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "config/database-access-manifest.json"), "utf8"));
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const files = [];
function visit(path) {
  for (const name of readdirSync(path)) {
    if (["node_modules", ".next", "coverage"].includes(name)) continue;
    const full = resolve(path, name);
    if (statSync(full).isDirectory()) visit(full);
    else if ([...sourceExtensions].some((extension) => name.endsWith(extension)) && !/\.(test|spec)\./.test(name)) files.push(full);
  }
}
visit(resolve(root, "apps/web"));

const failures = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const name = relative(root, file).replaceAll("\\", "/");
  for (const env of manifest.forbiddenWebEnvironment)
    if (new RegExp(`\\b${env}\\b`).test(source)) failures.push(`${name}: forbidden ${env}`);
  if (/\bgetPostgresPool\b/.test(source)) failures.push(`${name}: generic PostgreSQL pool`);
  if (/new Postgres(?:Site|Information|Finder|Legal)Repository\(\s*\)/.test(source))
    failures.push(`${name}: repository constructor has no actor classification`);
  if (/\b(?:client|pool)\.query\s*\(/.test(source))
    failures.push(`${name}: web-reachable SQL is not repository-classified`);
  const constructsRepository = /new Postgres(?:Site|Information|Finder|Legal)Repository\s*\(/.test(source);
  if (constructsRepository) {
    const rules = manifest.webRules.filter((rule) => name === rule.path || name.startsWith(`${rule.path}/`));
    if (!rules.length) failures.push(`${name}: repository construction has no actor route rule`);
    const actors = new Set(rules.map((rule) => rule.actor));
    const allowed = new Set([...actors].flatMap((actor) => actor === "runtime" ? ["runtime","site_admin"] : [actor]));
    for (const match of source.matchAll(/boundary\s*:\s*["'](runtime|site_admin|owner|system)["']/g))
      if (!allowed.has(match[1])) failures.push(`${name}: ${match[1]} boundary conflicts with ${[...actors].join("/")} route rule`);
  }
}

const siteData = readFileSync(resolve(root, "packages/site-data/src/index.ts"), "utf8");
const finder = readFileSync(resolve(root, "packages/business-finder/src/index.ts"), "utf8");
const information = readFileSync(resolve(root, "packages/site-data/src/articles.ts"), "utf8");
for (const [name, source] of [["site-data", siteData], ["business-finder", finder], ["information", information]]) {
  if (/=\s*process\.env\.DATABASE_URL/.test(source)) failures.push(`${name}: automatic DATABASE_URL constructor fallback`);
}
if (manifest.pilotCompatibilityPaths !== 0) failures.push("manifest: pilotCompatibilityPaths must be zero");
if (manifest.version !== 2) failures.push("manifest: version 2 FORCE contract is required");
const operationIds = new Set();
const classifiedTables = Object.values(manifest.tableClasses ?? {}).flat();
if (classifiedTables.length !== 73 || new Set(classifiedTables).size !== 73)
  failures.push(`manifest: expected 73 uniquely classified tables, found ${classifiedTables.length}/${new Set(classifiedTables).size}`);
const migratedTables = new Set();
for (const migration of readdirSync(resolve(root, "db/migrations")).filter((name) => name.endsWith(".sql"))) {
  const sql = readFileSync(resolve(root, "db/migrations", migration), "utf8");
  for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi))
    migratedTables.add(match[1]);
}
for (const table of migratedTables) if (!classifiedTables.includes(table)) failures.push(`manifest: migration-created table ${table} is unclassified`);
for (const table of classifiedTables) if (!migratedTables.has(table)) failures.push(`manifest: classified table ${table} is not migration-created`);
for (const script of ["migrate.mjs","migration-status.mjs","provision-database-roles.mjs"]) {
  const source = readFileSync(resolve(root, "scripts", script), "utf8");
  if (/DATABASE_(?:RUNTIME|OWNER|SYSTEM)_URL/.test(source)) failures.push(`${script}: administrative tooling references an application credential`);
}
for (const operation of manifest.operations ?? []) {
  if (!operation.id || operationIds.has(operation.id)) failures.push(`manifest: invalid/duplicate operation ${operation.id ?? "<missing>"}`);
  operationIds.add(operation.id);
  if (!manifest.actorConnections[operation.actor]) failures.push(`manifest: ${operation.id} has unknown actor ${operation.actor}`);
  if (!['read','write'].includes(operation.mode) || !operation.repository || !operation.boundary ||
      !Array.isArray(operation.entryPoints) || !operation.entryPoints.length || !operation.authentication ||
      !operation.permission || operation.connectionIdentity !== manifest.actorConnections[operation.actor] ||
      !Array.isArray(operation.routines) || !operation.routines.length || !operation.transactionBoundary ||
      !operation.compatibilityStatus || !Array.isArray(operation.tables) || !operation.tables.length)
    failures.push(`manifest: ${operation.id} is incomplete`);
  if (operation.actor !== "migrator" && operation.compatibilityStatus !== "none")
    failures.push(`manifest: ${operation.id} retains compatibility access`);
  for (const table of operation.tables)
    if (table !== "all application tables" && !classifiedTables.includes(table))
      failures.push(`manifest: ${operation.id} references unclassified table ${table}`);
}
if (!operationIds.size) failures.push("manifest: classified operation inventory is empty");

const roleEntries = Object.entries(manifest.databaseRoles ?? {});
const expectedRoleAliases = new Set(["migrator","runtime","system","owner","runtimeExecutor","bootstrapExecutor","ownerExecutor","systemExecutor"]);
if (roleEntries.length !== expectedRoleAliases.size || roleEntries.some(([name]) => !expectedRoleAliases.has(name)))
  failures.push("manifest: exact four connection roles and four executor roles are required");
for (const [name, role] of roleEntries) {
  if (role.login || role.superuser || role.bypassRls || (name === "migrator" ? !role.ownsTables : role.ownsTables))
    failures.push(`manifest: unsafe role contract for ${name}`);
}
const tableInventory = manifest.tables ?? [];
if (tableInventory.length !== 73 || new Set(tableInventory.map((table) => table.name)).size !== 73)
  failures.push("manifest: exact 73-table catalog inventory is required");
const forceTables = tableInventory.filter((table) => table.forceRls);
if (forceTables.length !== 70 || forceTables.some((table) => !table.rls || table.owner !== "migrator"))
  failures.push(`manifest: expected 70 migrator-owned RLS+FORCE tables, found ${forceTables.length}`);
for (const table of tableInventory) {
  if (!classifiedTables.includes(table.name) || !Array.isArray(table.policies) || !Array.isArray(table.directGrants) || !Array.isArray(table.columnGrants))
    failures.push(`manifest: incomplete table contract for ${table.name ?? "<missing>"}`);
  if (table.directGrants.some((grant) => grant.grantee === "PUBLIC")) failures.push(`manifest: PUBLIC table grant on ${table.name}`);
  for (const policy of table.policies) {
    if (!policy.name || !["r","a","w","d","*"].includes(policy.command) || !Array.isArray(policy.roles) || !policy.roles.length)
      failures.push(`manifest: incomplete policy on ${table.name}`);
    if (/^\s*true\s*$/i.test(policy.using ?? "") || /^\s*true\s*$/i.test(policy.check ?? ""))
      failures.push(`manifest: broad true policy ${policy.name} on ${table.name}`);
  }
}
const routineInventory = manifest.routines ?? [];
if (!routineInventory.length || new Set(routineInventory.map((routine) => routine.signature)).size !== routineInventory.length)
  failures.push("manifest: routine signatures must be non-empty and unique");
for (const routine of routineInventory) {
  if (!routine.signature || !expectedRoleAliases.has(routine.owner) || !["invoker","definer"].includes(routine.security) ||
      !Array.isArray(routine.executableRoles) || !Array.isArray(routine.touchedTables) || !routine.actor || !routine.purpose || !routine.classification)
    failures.push(`manifest: incomplete routine ${routine.signature ?? "<missing>"}`);
  if (routine.executableRoles.includes("PUBLIC")) failures.push(`manifest: PUBLIC execute on ${routine.signature}`);
  if (routine.security === "definer" && !routine.settings.includes("search_path=pg_catalog"))
    failures.push(`manifest: SECURITY DEFINER routine lacks fixed path: ${routine.signature}`);
  for (const table of routine.touchedTables)
    if (!classifiedTables.includes(table)) failures.push(`manifest: ${routine.signature} touches unclassified ${table}`);
}
const migrationSource = readdirSync(resolve(root, "db/migrations")).filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(root, "db/migrations", name), "utf8")).join("\n");
for (const match of migrationSource.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi))
  if (!routineInventory.some((routine) => routine.signature.startsWith(`${match[1]}(`)))
    failures.push(`manifest: migration function ${match[1]} lacks an exact routine entry`);
const forceMigration = readFileSync(resolve(root, "db/migrations/046_force_row_level_security.sql"), "utf8");
if (/\b(?:insert\s+into|update\s+[a-z_]|delete\s+from|truncate\s+)\b/i.test(forceMigration))
  failures.push("migration 046: FORCE activation must not mutate customer rows");
const hostedReadinessMigration = readFileSync(resolve(root, "db/migrations/053_hosted_database_readiness.sql"), "utf8");
const monitoringReadinessMigration = readFileSync(resolve(root, "db/migrations/061_operational_monitoring_readiness.sql"), "utf8");
const canonicalTrialMigration = readFileSync(resolve(root, "db/migrations/054_canonical_self_service_site_ids.sql"), "utf8");
const trialEntitlementsMigration = readFileSync(resolve(root, "db/migrations/055_self_service_trial_entitlements.sql"), "utf8");
const deletionRateLimitMigration = readFileSync(resolve(root, "db/migrations/056_customer_deletion_rate_limit_scope.sql"), "utf8");
const privacyCapabilityPublicExecuteMigration = readFileSync(resolve(root, "db/migrations/064_privacy_export_capability_public_execute.sql"), "utf8");
const privacyBindingAuthorityMigration = readFileSync(resolve(root, "db/migrations/066_privacy_export_artifact_binding_authority.sql"), "utf8");
const migrationRunner = readFileSync(resolve(root, "scripts/migrate.mjs"), "utf8");
if (!hostedReadinessMigration.startsWith("-- migrate-as-owner-of: public.database_enforced_readiness()"))
  failures.push("migration 053: post-provision routine replacement must declare its exact existing owner boundary");
if (!migrationRunner.includes("classifiedRoutineOwners.has(owner)") ||
    !migrationRunner.includes("pg_has_role(current_user,$1,'member')") ||
    !migrationRunner.includes("grant usage,create on schema public") ||
    !migrationRunner.includes("set local role ${quoteIdentifier(execution.role)}") ||
    !migrationRunner.includes("let segmentCompleted = false") ||
    !migrationRunner.includes("segmentCompleted = true") ||
    !migrationRunner.includes("if (execution && segmentCompleted)") ||
    !migrationRunner.includes('await client.query("reset role")') ||
    !migrationRunner.includes("revoke create on schema public"))
  failures.push("migration runner: owner directive must be catalog-resolved, executor-allowlisted, transaction-local and failure-safe");
if (!hostedReadinessMigration.includes("d.classid='pg_proc'::regclass") ||
    !hostedReadinessMigration.includes("d.refclassid='pg_extension'::regclass") ||
    !hostedReadinessMigration.includes("d.deptype='e'"))
  failures.push("migration 053: hosted readiness may exempt only catalog-declared extension routines");
if (!hostedReadinessMigration.includes("has_function_privilege('public',p.oid,'execute')"))
  failures.push("migration 053: application routine PUBLIC-execute detection must remain fail-closed");
if (!monitoringReadinessMigration.startsWith("-- migrate-as-owner-of: public.database_enforced_readiness()") ||
    !monitoringReadinessMigration.includes("count(*)=67") ||
    !monitoringReadinessMigration.includes("count(*) filter(where c.relrowsecurity)=64") ||
    !monitoringReadinessMigration.includes("count(*) filter(where c.relforcerowsecurity)=64"))
  failures.push("migration 061: exact 67/64/64 post-monitoring readiness boundary is required");
if (!canonicalTrialMigration.startsWith("-- migrate-as-owner-of: public.public_trial_create(") ||
    !canonicalTrialMigration.includes("v_site text:=gen_random_uuid()::text") ||
    canonicalTrialMigration.includes("v_site:='site-'"))
  failures.push("migration 054: self-service site identity must be a canonical database-generated UUID");
for (const required of ["'website',true", "'editor',true", "'media',true", "'ai_rewrite',true", "'appointment_requests',true"])
  if (!trialEntitlementsMigration.includes(required))
    failures.push(`migration 055: missing active trial entitlement ${required}`);
for (const forbidden of ["'booking_calendar',true", "'custom_domain_existing',true", "'social_media',true"])
  if (trialEntitlementsMigration.includes(forbidden))
    failures.push(`migration 055: provider/planned trial entitlement must stay disabled ${forbidden}`);
if (!deletionRateLimitMigration.includes("'privacy_deletion_customer'") ||
    !deletionRateLimitMigration.includes("p_scope<>all"))
  failures.push("migration 056: customer deletion rate-limit scope must be explicit while unknown scopes remain fail-closed");
for (const signature of [
  "site_admin_consume_export_capability(text,text)",
  "owner_consume_self_export_capability(text,text)",
])
  if (!privacyCapabilityPublicExecuteMigration.includes(`revoke all on function public.${signature} from public`))
    failures.push(`migration 064: ${signature} must revoke PUBLIC execute after replacement`);
if (!privacyBindingAuthorityMigration.startsWith("-- migrate-as-owner-of: public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)") ||
    !privacyBindingAuthorityMigration.includes("v_binding_owner<>v_guard_owner") ||
    !privacyBindingAuthorityMigration.includes("privacy_export_artifact_binding_owner_drift") ||
    !privacyBindingAuthorityMigration.includes("aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))") ||
    !privacyBindingAuthorityMigration.includes("x.grantee<>p.proowner") ||
    !privacyBindingAuthorityMigration.includes("revoke all on function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) from public"))
  failures.push("migration 066: privacy-export binding helper must fail closed on owner drift and revoke PUBLIC execute");
const roleProvisioning = readFileSync(resolve(root, "scripts/provision-database-roles.mjs"), "utf8");
const migratorSchemaGrant = roleProvisioning.indexOf("grant usage,create on schema public");
const firstOwnershipTransfer = roleProvisioning.indexOf("alter ${relationKinds[relation.relkind]} public.");
if (migratorSchemaGrant < 0 || firstOwnershipTransfer < 0 || migratorSchemaGrant > firstOwnershipTransfer)
  failures.push("role provisioning: migrator schema CREATE must precede relation ownership transfer");
const executorSchemaGrant = roleProvisioning.indexOf("grant usage,create on schema public to ${quoteIdentifier(executor)}");
const executorOwnershipTransfer = roleProvisioning.indexOf("alter function ${fn} owner to ${quoteIdentifier(executor)}");
const executorSchemaRevoke = roleProvisioning.indexOf("revoke create on schema public from ${quoteIdentifier(executor)}");
if (executorSchemaGrant < 0 || executorOwnershipTransfer < executorSchemaGrant || executorSchemaRevoke < executorOwnershipTransfer)
  failures.push("role provisioning: executor schema CREATE must be bounded to the routine ownership transfer");
const executorPublicRevoke = roleProvisioning.indexOf("revoke all on function ${fn} from public");
if (executorPublicRevoke < 0 || executorPublicRevoke > executorOwnershipTransfer)
  failures.push("role provisioning: PUBLIC routine access must be revoked before executor ownership transfer");
if (!roleProvisioning.includes("set local role ${quoteIdentifier(owner)}") ||
    !roleProvisioning.includes('await client.query("reset role")'))
  failures.push("role provisioning: post-transfer routine grants must run as the classified executor owner");
if (!roleProvisioning.includes('grantRoutineExecute("issue_preview_for_site(text,boolean)", [roles.runtimeExecutor])'))
  failures.push("role provisioning: site-admin preview executor must receive the exact nested helper grant");
const provisionedRlsList = roleProvisioning.match(/const rlsTables = \[([\s\S]*?)\n    \];/)?.[1]
  ?.match(/"[a-z0-9_]+"/g)?.map((name) => name.slice(1,-1)) ?? [];
if (JSON.stringify([...provisionedRlsList].sort()) !== JSON.stringify(forceTables.map((table) => table.name).sort()))
  failures.push("role provisioning: FORCE allowlist must exactly match the 70-table manifest");
if (!roleProvisioning.includes('for (const table of rlsTables) {') ||
    !roleProvisioning.includes('throw new Error(`Required FORCE RLS table ${table} is missing.`)') ||
    !roleProvisioning.includes('await client.query(`alter table ${quoteServerIdentifier(table)} force row level security`)'))
  failures.push("role provisioning: FORCE activation must run over the exact allowlist after executor setup");
for (const table of tableInventory.filter((table) => !table.forceRls))
  if (forceMigration.includes(`alter table ${table.name} force row level security`))
    failures.push(`migration 046: global/migrator table ${table.name} must not be forced`);

if (failures.length) {
  console.error(`Database boundary check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`Database boundary manifest passed (${files.length} web source files; zero compatibility constructors).`);
