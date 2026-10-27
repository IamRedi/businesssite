import { Pool, type PoolConfig } from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";

export type PostgresPoolSettings = {
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  queryTimeoutMillis: number;
};

type PoolRegistry = Map<string, Pool>;

const registrySymbol = Symbol.for("white-label-platform.postgres-pools");
const runtime = globalThis as typeof globalThis & {
  [registrySymbol]?: PoolRegistry;
};

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    return fallback;
  return parsed;
}

export function postgresPoolSettings(
  env: NodeJS.ProcessEnv = process.env,
): PostgresPoolSettings {
  return {
    max: boundedInteger(env.DATABASE_POOL_MAX, 3, 1, 20),
    connectionTimeoutMillis: boundedInteger(
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      10_000,
      1_000,
      60_000,
    ),
    idleTimeoutMillis: boundedInteger(
      env.DATABASE_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      300_000,
    ),
    queryTimeoutMillis: boundedInteger(
      env.DATABASE_QUERY_TIMEOUT_MS,
      15_000,
      1_000,
      120_000,
    ),
  };
}

function poolRegistry() {
  runtime[registrySymbol] ??= new Map<string, Pool>();
  return runtime[registrySymbol];
}

export function getPostgresPool(
  connectionString?: string,
): Pool {
  if (!connectionString?.trim() && databaseRlsMode() === "off")
    connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim())
    throw new Error("An explicit PostgreSQL connection string is required.");

  const settings = postgresPoolSettings();
  const key = JSON.stringify([connectionString, settings]);
  const existing = poolRegistry().get(key);
  if (existing) return existing;

  const config: PoolConfig = {
    connectionString,
    max: settings.max,
    connectionTimeoutMillis: settings.connectionTimeoutMillis,
    idleTimeoutMillis: settings.idleTimeoutMillis,
    query_timeout: settings.queryTimeoutMillis,
    statement_timeout: settings.queryTimeoutMillis,
    allowExitOnIdle: true,
    application_name: "white-label-platform",
  };
  const pool = new Pool(config);
  pool.on("error", (error) => {
    // Query callers receive their own failures. Idle-client failures have no
    // caller, so record only non-sensitive diagnostics and keep the runtime up.
    console.error("[database] unexpected idle PostgreSQL client error", {
      name: error.name,
      code: "code" in error ? error.code : undefined,
    });
  });
  poolRegistry().set(key, pool);
  return pool;
}

export function getRuntimePostgresPool(
  connectionString = process.env.DATABASE_RUNTIME_URL,
): Pool {
  if (!connectionString?.trim())
    throw new Error("DATABASE_RUNTIME_URL is required for scoped RLS operations.");
  return getPostgresPool(connectionString);
}

/** Dedicated least-privilege pool for verified provider lifecycle events. */
export function getSystemPostgresPool(
  connectionString = process.env.DATABASE_SYSTEM_URL,
): Pool {
  if (!connectionString?.trim())
    throw new Error("DATABASE_SYSTEM_URL is required for provider system operations.");
  return getPostgresPool(connectionString);
}

/** Dedicated procedure-only pool for platform-owner authentication and operations. */
export function getOwnerPostgresPool(
  connectionString = process.env.DATABASE_OWNER_URL,
): Pool {
  if (!connectionString?.trim())
    throw new Error("DATABASE_OWNER_URL is required for owner operations.");
  return getPostgresPool(connectionString);
}

export const databaseRlsModes = ["off", "pilot", "enforced"] as const;
export type DatabaseRlsMode = (typeof databaseRlsModes)[number];

export function databaseRlsMode(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseRlsMode {
  const mode = env.DATABASE_RLS_MODE?.trim() || "off";
  if (!databaseRlsModes.includes(mode as DatabaseRlsMode))
    throw new Error("DATABASE_RLS_MODE must be off, pilot, or enforced.");
  return mode as DatabaseRlsMode;
}

export const databaseActorKinds = [
  "site_admin",
  "owner",
  "public_resolver",
  "system",
] as const;
export type DatabaseActorKind = (typeof databaseActorKinds)[number];

export type DatabaseContext = {
  actorKind: DatabaseActorKind;
  siteId?: string;
  ownerId?: string;
  requestId?: string;
  systemPurpose?: string;
  ownerRole?: "owner" | "admin" | "operator" | "viewer";
  ownerPermission?: string;
};

export type DatabaseContextClient = Pick<
  PoolClient,
  "query"
> & {
  query<R extends QueryResultRow = QueryResultRow>(
    queryTextOrConfig: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
};

export type AuthenticatedSiteAdmin = {
  accountId: string;
  siteId: string;
  email: string;
  preferredLocale: "en" | "de";
};

export type AuthenticatedOwner = {
  sessionId: string;
  ownerId: string;
  email: string;
  role: "owner" | "admin" | "operator" | "viewer";
  mfaCompletedAt: string;
  expiresAt: string;
  lastUsedAt: string;
};

const activeDatabaseContext = new AsyncLocalStorage<{
  client: PoolClient;
  context: Readonly<DatabaseContext>;
}>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const purposePattern = /^[a-z][a-z0-9_.:-]{0,63}$/;

function validatedContext(context: DatabaseContext): Readonly<DatabaseContext> {
  if (!databaseActorKinds.includes(context.actorKind))
    throw new Error("Invalid database actor kind.");
  for (const [name, value] of [["siteId", context.siteId], ["ownerId", context.ownerId]] as const)
    if (value !== undefined && !uuidPattern.test(value))
      throw new Error(`${name} must be a canonical UUID.`);
  if (context.actorKind === "site_admin" && !context.siteId)
    throw new Error("site_admin database context requires siteId.");
  if (context.requestId !== undefined && !requestIdPattern.test(context.requestId))
    throw new Error("Invalid database requestId.");
  if (context.systemPurpose !== undefined && !purposePattern.test(context.systemPurpose))
    throw new Error("Invalid database systemPurpose.");
  return Object.freeze({ ...context });
}

/**
 * Runs one callback on one acquired client with transaction-local app context.
 * Authorization inputs must already have been derived from trusted server state.
 */
export async function withDatabaseContext<T>(
  pool: Pool,
  context: DatabaseContext,
  callback: (client: DatabaseContextClient) => Promise<T>,
): Promise<T> {
  if (activeDatabaseContext.getStore())
    throw new Error("Nested database context transactions are not supported; pass the existing scoped client explicitly.");
  const checked = validatedContext(context);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `select
         set_config('app.actor_kind', $1, true),
         set_config('app.site_id', $2, true),
         set_config('app.owner_id', $3, true),
         set_config('app.request_id', $4, true),
         set_config('app.system_purpose', $5, true),
         set_config('app.owner_role', '', true),
         set_config('app.owner_permission', '', true)`,
      [
        checked.actorKind,
        checked.siteId ?? "",
        checked.ownerId ?? "",
        checked.requestId ?? "",
        checked.systemPurpose ?? "",
      ],
    );
    const result = await activeDatabaseContext.run(
      { client, context: checked },
      () => callback(client),
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    try {
      await client.query(
        "reset app.actor_kind; reset app.site_id; reset app.owner_id; reset app.request_id; reset app.system_purpose; reset app.owner_role; reset app.owner_permission",
      );
      client.release();
    } catch (cleanupError) {
      client.release(cleanupError as Error);
    }
  }
}

/**
 * Resolves an opaque owner-session hash and a typed application permission in
 * PostgreSQL, then installs only DB-derived owner identity for one transaction.
 */
export async function withAuthenticatedOwnerContext<T>(
  pool: Pool,
  tokenHash: string,
  permission: string,
  callback: (client: DatabaseContextClient, owner: AuthenticatedOwner) => Promise<T>,
  requestId?: string,
): Promise<T | null> {
  if (!sessionHashPattern.test(tokenHash) || !/^[a-z]+(?:[.][a-z]+)$/.test(permission)) return null;
  if (activeDatabaseContext.getStore())
    throw new Error("Nested database context transactions are not supported; pass the existing scoped client explicitly.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const resolved = await client.query<{
      session_id: string; owner_id: string; email: string;
      role: AuthenticatedOwner["role"]; mfa_completed_at: Date;
      expires_at: Date; last_used_at: Date;
    }>("select * from owner_auth_resolve_session($1,$2)", [tokenHash, permission]);
    const row = resolved.rows[0];
    if (!row) { await client.query("rollback"); return null; }
    const context = validatedContext({
      actorKind: "owner", ownerId: row.owner_id, requestId,
      ownerRole: row.role, ownerPermission: permission,
    });
    await client.query(
      `select set_config('app.actor_kind','owner',true),set_config('app.site_id','',true),
              set_config('app.owner_id',$1,true),set_config('app.request_id',$2,true),
              set_config('app.system_purpose','',true),set_config('app.owner_role',$3,true),
              set_config('app.owner_permission',$4,true),set_config('app.session_hash','',true)`,
      [row.owner_id, requestId ?? "", row.role, permission],
    );
    const owner: AuthenticatedOwner = {
      sessionId: row.session_id, ownerId: row.owner_id, email: row.email, role: row.role,
      mfaCompletedAt: row.mfa_completed_at.toISOString(), expiresAt: row.expires_at.toISOString(),
      lastUsedAt: row.last_used_at.toISOString(),
    };
    const result = await activeDatabaseContext.run({ client, context }, () => callback(client, owner));
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    try {
      await client.query("reset app.actor_kind; reset app.site_id; reset app.owner_id; reset app.request_id; reset app.system_purpose; reset app.owner_role; reset app.owner_permission; reset app.session_hash");
      client.release();
    } catch (cleanupError) { client.release(cleanupError as Error); }
  }
}

const sessionHashPattern = /^[a-f0-9]{64}$/;

/**
 * Resolves the opaque-session hash through the constrained database function,
 * installs the resulting site context, and executes on that same transaction.
 * Neither a browser site id nor a URL slug is accepted as authority.
 */
export async function withAuthenticatedSiteAdminContext<T>(
  pool: Pool,
  tokenHash: string,
  callback: (client: DatabaseContextClient, admin: AuthenticatedSiteAdmin) => Promise<T>,
  options: { expectedSiteId?: string; requestId?: string } = {},
): Promise<T | null> {
  if (!sessionHashPattern.test(tokenHash)) return null;
  if (activeDatabaseContext.getStore())
    throw new Error("Nested database context transactions are not supported; pass the existing scoped client explicitly.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    const resolved = await client.query<{
      account_id: string; site_id: string; email: string; preferred_locale: "en" | "de";
    }>("select * from site_admin_resolve_session($1)", [tokenHash]);
    const row = resolved.rows[0];
    if (!row || (options.expectedSiteId && row.site_id !== options.expectedSiteId)) {
      await client.query("rollback");
      return null;
    }
    const context = validatedContext({
      actorKind: "site_admin",
      siteId: row.site_id,
      requestId: options.requestId,
    });
    await client.query(
      `select set_config('app.actor_kind','site_admin',true),
              set_config('app.site_id',$1,true),
              set_config('app.owner_id','',true),
              set_config('app.request_id',$2,true),
              set_config('app.system_purpose','',true),
              set_config('app.owner_role','',true),
              set_config('app.owner_permission','',true),
              set_config('app.session_hash',$3,true)`,
      [row.site_id, options.requestId ?? "", tokenHash],
    );
    const admin: AuthenticatedSiteAdmin = {
      accountId: row.account_id,
      siteId: row.site_id,
      email: row.email,
      preferredLocale: row.preferred_locale,
    };
    const result = await activeDatabaseContext.run(
      { client, context },
      () => callback(client, admin),
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    try {
      await client.query(
        "reset app.actor_kind; reset app.site_id; reset app.owner_id; reset app.request_id; reset app.system_purpose; reset app.owner_role; reset app.owner_permission; reset app.session_hash",
      );
      client.release();
    } catch (cleanupError) {
      client.release(cleanupError as Error);
    }
  }
}

export function withSiteContext<T>(
  pool: Pool,
  siteId: string,
  callback: (client: DatabaseContextClient) => Promise<T>,
  requestId?: string,
) {
  if (databaseRlsMode() !== "off")
    throw new Error("A database-backed authenticated session is required for scoped RLS operations.");
  return withDatabaseContext(pool, { actorKind: "site_admin", siteId, requestId }, callback);
}

/** Test/diagnostic reader; requestId is audit-only and never authorization data. */
export function currentDatabaseContext() {
  return activeDatabaseContext.getStore()?.context;
}

export type { Pool, PoolClient } from "pg";
export * from "./recovery";
export { attestRuntimeDatabase, type RuntimeDatabaseTarget } from "./runtime-attestation";
