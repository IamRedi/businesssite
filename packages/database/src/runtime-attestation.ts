import pg, { type ClientConfig } from "pg";

export type RuntimeActorTarget = {
  key: string;
  role: string;
  membership: string;
  forbiddenMemberships: readonly string[];
  readiness: boolean;
};
export type RuntimeDatabaseTarget = {
  database: string;
  hosts: readonly string[];
  actors: readonly RuntimeActorTarget[];
};

export function attestationConnection(value: string | undefined, target: RuntimeDatabaseTarget, actor: RuntimeActorTarget): ClientConfig & { enableChannelBinding: boolean } {
  try {
    const url = new URL(value ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !target.hosts.includes(url.hostname) || url.pathname !== `/${target.database}` ||
      (url.port && url.port !== "5432") || decodeURIComponent(url.username) !== actor.role ||
      !url.password || url.hash ||
      [...url.searchParams.keys()].some(key => !["sslmode", "channel_binding"].includes(key)) ||
      (url.searchParams.has("sslmode") && !["require", "verify-full"].includes(url.searchParams.get("sslmode")!)) ||
      (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding") !== "require"))
      throw new Error("Invalid binding");
    return {
      host: url.hostname, port: 5432, database: target.database,
      user: actor.role, password: decodeURIComponent(url.password),
      ssl: { rejectUnauthorized: true, servername: url.hostname },
      enableChannelBinding: true,
      connectionTimeoutMillis: 6000, statement_timeout: 6000, query_timeout: 7000,
      application_name: "runtime-authority-readonly",
    };
  } catch { throw new Error("Runtime binding authority mismatch"); }
}

type SessionRow = Record<string, unknown>;
export function assertAttestationSession(row: SessionRow | undefined, target: RuntimeDatabaseTarget, actor: RuntimeActorTarget) {
  if (!row || row.database !== target.database || row.actor !== actor.role || row.session_actor !== actor.role ||
      row.rolsuper !== false || row.rolbypassrls !== false || row.rolcreatedb !== false ||
      row.rolcreaterole !== false || row.rolcanlogin !== true || row.expected_membership !== true ||
      row.forbidden_membership !== false || row.schema_usage !== true || row.read_only !== true)
    throw new Error("Runtime actor authority mismatch");
}

export async function attestRuntimeDatabase(target: RuntimeDatabaseTarget, environment: Record<string, string | undefined> = process.env) {
  const configs = target.actors.map(actor => attestationConnection(environment[actor.key], target, actor));
  const actors: { role: string; authenticated: true; grants: true; readOnly: true; readiness: true | "not_granted_by_design" }[] = [];
  for (let index = 0; index < target.actors.length; index += 1) {
    const actor = target.actors[index];
    const client = new pg.Client(configs[index]);
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      const result = await client.query(`SELECT current_database() AS database,
        current_user AS actor, session_user AS session_actor,
        rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin,
        pg_has_role(current_user, $1, 'member') AS expected_membership,
        EXISTS (SELECT 1 FROM pg_roles forbidden WHERE forbidden.rolname = ANY($2::text[])
          AND pg_has_role(current_user, forbidden.oid, 'member')) AS forbidden_membership,
        has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
        current_setting('transaction_read_only') = 'on' AS read_only
        FROM pg_roles WHERE rolname = current_user`, [actor.membership, actor.forbiddenMemberships]);
      assertAttestationSession(result.rows[0], target, actor);
      if (actor.readiness) {
        const ready = await client.query("SELECT public.database_enforced_readiness() AS ready");
        if (ready.rows[0]?.ready !== true) throw new Error("Runtime readiness failed");
      }
      await client.query("ROLLBACK");
      actors.push({ role: actor.role, authenticated: true, grants: true, readOnly: true,
        readiness: actor.readiness ? true : "not_granted_by_design" });
    } finally { await client.end(); }
  }
  return actors;
}
