export const databaseIdentifierPattern = /^[a-z_][a-z0-9_]{0,62}$/;

export function databaseRoleNames(env = process.env) {
  const roles = {
    migrator: env.DATABASE_MIGRATOR_ROLE?.trim() || "bsrc_migrator",
    runtime: env.DATABASE_RUNTIME_ROLE?.trim() || "bsrc_runtime",
    system: env.DATABASE_SYSTEM_ROLE?.trim() || "bsrc_system",
    owner: env.DATABASE_OWNER_ROLE?.trim() || "bsrc_owner_ops",
    runtimeExecutor: env.DATABASE_RUNTIME_EXECUTOR_ROLE?.trim() || "bsrc_runtime_executor",
    bootstrapExecutor: env.DATABASE_BOOTSTRAP_EXECUTOR_ROLE?.trim() || "bsrc_bootstrap_executor",
    ownerExecutor: env.DATABASE_OWNER_EXECUTOR_ROLE?.trim() || "bsrc_owner_executor",
    systemExecutor: env.DATABASE_SYSTEM_EXECUTOR_ROLE?.trim() || "bsrc_system_executor",
  };
  for (const [purpose, role] of Object.entries(roles)) {
    if (!databaseIdentifierPattern.test(role))
      throw new Error(`Invalid ${purpose} database role identifier.`);
  }
  if (new Set(Object.values(roles)).size !== Object.values(roles).length)
    throw new Error("Database role identifiers must be distinct.");
  return roles;
}

export function quoteIdentifier(identifier) {
  if (!databaseIdentifierPattern.test(identifier))
    throw new Error("Invalid database identifier.");
  return `"${identifier}"`;
}

export function migrationConnectionString(env = process.env) {
  if (env.MIGRATION_DATABASE_URL?.trim()) return env.MIGRATION_DATABASE_URL.trim();
  const production = env.NODE_ENV === "production" || env.RELEASE_TARGET === "production";
  if (production || ["pilot", "enforced"].includes(env.DATABASE_RLS_MODE?.trim()))
    throw new Error("MIGRATION_DATABASE_URL is required in pilot/enforced or production mode.");
  if (!env.DATABASE_URL?.trim()) throw new Error("MIGRATION_DATABASE_URL is required.");
  console.warn("Using DATABASE_URL as the explicit local/test migration compatibility fallback.");
  return env.DATABASE_URL.trim();
}
