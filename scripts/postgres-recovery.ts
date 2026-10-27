#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, readdirSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import pg from "pg";
import {
  assertBackupFresh,
  assertExpectedRecoveryCatalog,
  assertRecoveryMigrationLedger,
  assertRecoverySourceBinding,
  recoverySourceBindingChecks,
  verifiedRecoveryConnections,
  assertRecoveryAuthorization,
  compareRecoveryDataIntegrity,
  recoveryCatalogForProfile,
  backupArtifactName,
  recoveryObjectKey,
  recoveryObjectStoreConfigurationFromEnvironment,
  sha256,
  signS3RecoveryRequest,
  signDeletionSuppressions,
  verifyDeletionSuppressions,
  type BackupManifest,
  type DeletionSuppression,
  type RecoveryCatalog,
  type RecoveryObjectStoreConfiguration,
  type SignedDeletionSuppressions,
} from "../packages/database/src/recovery";
import { recoveryDataIntegrity } from "./recovery-data-integrity";
import { runRecoveryTool } from "./recovery-process.mjs";
import { reportOperationalSignal } from "../apps/web/lib/operational-errors";

type Environment = Record<string, string | undefined>;
type SignalCode =
  | "scheduled_backup_failed"
  | "backup_stale"
  | "backup_integrity_failed"
  | "restore_drill_failed"
  | "recovery_target_readiness_failed";

const environment: Environment = process.env;
const command = process.argv[2];
const catalogProfile = environment.RECOVERY_CATALOG_PROFILE?.trim() || "production";
let phase = "configuration";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertProfileCatalog(value: RecoveryCatalog) {
  phase = "reviewed_catalog";
  const expected = recoveryCatalogForProfile(catalogProfile);
  assertExpectedRecoveryCatalog(value, expected);
  const names = readdirSync(resolve(process.cwd(), "db/migrations"))
    .filter(name => /^\d+_.+\.sql$/.test(name) && name <= expected.latestMigration).sort();
  if (names.length !== expected.migrationCount || names.at(-1) !== expected.latestMigration)
    throw new Error("Reviewed recovery migration files are incomplete.");
  assertRecoveryMigrationLedger(value.migrationNames, names);
}

function sourceConnections() {
  phase = "source_binding";
  console.log(JSON.stringify({ status: "binding_diagnostics", profile: catalogProfile,
    checks: recoverySourceBindingChecks(environment.SOURCE_DATABASE_URL?.trim() || "",
      environment.RECOVERY_READINESS_DATABASE_URL?.trim() || "", catalogProfile) }));
  const source = required("SOURCE_DATABASE_URL");
  const readiness = required("RECOVERY_READINESS_DATABASE_URL");
  const localProfile = catalogProfile.endsWith("-local");
  if (localProfile) {
    assertRecoverySourceBinding(source, readiness, catalogProfile);
    return { source, readiness };
  }
  return verifiedRecoveryConnections(source, readiness, catalogProfile);
}

function required(name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function backupDirectory() {
  const configured = required("RECOVERY_BACKUP_DIRECTORY");
  if (!isAbsolute(configured)) throw new Error("RECOVERY_BACKUP_DIRECTORY must be absolute.");
  const path = resolve(configured);
  if (["/", "/tmp", process.cwd()].includes(path))
    throw new Error("RECOVERY_BACKUP_DIRECTORY must be a dedicated directory.");
  return path;
}

function safeUrl(value: string, purpose: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${purpose} must be a PostgreSQL URL.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1))
    throw new Error(`${purpose} must identify a PostgreSQL database.`);
  return url;
}

function transportFor(url: URL): BackupManifest["transport"] {
  const local = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(url.hostname);
  if (local) return "local-acceptance";
  if (!/^(require|verify-ca|verify-full)$/.test(url.searchParams.get("sslmode") ?? ""))
    throw new Error("Hosted PostgreSQL connections must explicitly require TLS.");
  return "postgresql-tls";
}

async function signal(code: SignalCode) {
  await reportOperationalSignal({ code, severity: "critical", count: 1 }, true, environment);
}

async function run(program: string, args: string[], childEnvironment: NodeJS.ProcessEnv, quiet = false) {
  // All client output is sensitive regardless of archive-list mode.
  await runRecoveryTool(program, args, childEnvironment);
}

async function postgresTool(
  tool: "pg_dump" | "pg_restore",
  args: string[],
  databaseUrl: string | undefined,
  artifactDirectory: string,
) {
  const connectionEnvironment: NodeJS.ProcessEnv = {};
  const image = environment.POSTGRES_CLIENT_IMAGE?.trim();
  let tlsCertificate: string | undefined;
  if (databaseUrl) {
    const url = safeUrl(databaseUrl, "PostgreSQL tool connection");
    connectionEnvironment.PGHOST = url.hostname;
    connectionEnvironment.PGPORT = url.port || "5432";
    connectionEnvironment.PGUSER = decodeURIComponent(url.username);
    connectionEnvironment.PGPASSWORD = decodeURIComponent(url.password);
    connectionEnvironment.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
    const sslmode = url.searchParams.get("sslmode");
    if (sslmode) connectionEnvironment.PGSSLMODE = sslmode;
    if (["verify-ca", "verify-full"].includes(sslmode || "")) {
      tlsCertificate = environment.RECOVERY_SSL_ROOT_CERT_FILE?.trim() || "/etc/ssl/certs/ca-certificates.crt";
      if (!isAbsolute(tlsCertificate) || !(await stat(tlsCertificate)).isFile())
        throw new Error("Recovery TLS requires an existing absolute CA bundle file.");
      connectionEnvironment.PGSSLROOTCERT = image ? "/recovery-ca.crt" : tlsCertificate;
    }
    const channelBinding = url.searchParams.get("channel_binding");
    if (channelBinding) connectionEnvironment.PGCHANNELBINDING = channelBinding;
  }
  if (image) {
    if (!/^postgres:(?:1[6-9]|[2-9][0-9])(?:[-.][A-Za-z0-9._-]+)?$/.test(image))
      throw new Error("POSTGRES_CLIENT_IMAGE must pin PostgreSQL 16 or newer.");
    const dockerArgs = [
      "run", "--rm", "--network", "host",
      "--cpus", "1", "--memory", "512m", "--memory-swap", "512m",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--user", `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    ];
    for (const name of Object.keys(connectionEnvironment)) dockerArgs.push("-e", name);
    if (tlsCertificate) dockerArgs.push("-v", `${tlsCertificate}:/recovery-ca.crt:ro`);
    dockerArgs.push("-v", `${artifactDirectory}:/recovery:rw`, image, tool, ...args);
    await run("docker", dockerArgs, { ...process.env, ...connectionEnvironment }, args.includes("--list"));
    return;
  }
  const executable = environment[tool === "pg_dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"]?.trim() || tool;
  await run(executable, args.map((arg) => arg.replace(/^\/recovery\//, `${artifactDirectory}/`)), {
    ...process.env,
    ...connectionEnvironment,
  }, args.includes("--list"));
}

async function ensureClassifiedRoles(databaseUrl: string) {
  if (environment.RECOVERY_CREATE_CLASSIFIED_ROLES !== "true")
    throw new Error("RECOVERY_CREATE_CLASSIFIED_ROLES=true is required when a clean target lacks the policy roles stored by pg_dump.");
  const names = [
    environment.DATABASE_MIGRATOR_ROLE || "bsrc_migrator",
    environment.DATABASE_RUNTIME_ROLE || "bsrc_runtime",
    environment.DATABASE_SYSTEM_ROLE || "bsrc_system",
    environment.DATABASE_OWNER_ROLE || "bsrc_owner_ops",
    environment.DATABASE_RUNTIME_EXECUTOR_ROLE || "bsrc_runtime_executor",
    environment.DATABASE_BOOTSTRAP_EXECUTOR_ROLE || "bsrc_bootstrap_executor",
    environment.DATABASE_OWNER_EXECUTOR_ROLE || "bsrc_owner_executor",
    environment.DATABASE_SYSTEM_EXECUTOR_ROLE || "bsrc_system_executor",
  ];
  if (new Set(names).size !== names.length || names.some((name) => !/^[a-z_][a-z0-9_]{0,62}$/.test(name)))
    throw new Error("Recovery database role names are unsafe or duplicated.");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: "bsrc-recovery-role-bootstrap" });
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const name of names) {
        const existing = (await client.query(
          "select rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=$1",
          [name],
        )).rows[0];
        if (existing) {
          if (existing.rolcanlogin || existing.rolsuper || existing.rolbypassrls || existing.rolcreatedb || existing.rolcreaterole)
            throw new Error(`Existing recovery role ${name} has unsafe attributes.`);
          continue;
        }
        await client.query(`create role "${name}" nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  } finally { await pool.end(); }
}

async function catalog(databaseUrl: string, readinessDatabaseUrl = databaseUrl): Promise<RecoveryCatalog> {
  const databaseIdentity = safeUrl(databaseUrl, "Recovery catalog database URL");
  const readinessIdentity = safeUrl(readinessDatabaseUrl, "RECOVERY_READINESS_DATABASE_URL");
  if (databaseIdentity.hostname !== readinessIdentity.hostname ||
      (databaseIdentity.port || "5432") !== (readinessIdentity.port || "5432") ||
      databaseIdentity.pathname !== readinessIdentity.pathname)
    throw new Error("RECOVERY_READINESS_DATABASE_URL must identify the same recovery database.");
  transportFor(readinessIdentity);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10000,
    statement_timeout: 10000, application_name: "bsrc-recovery-validation" });
  try {
    const runtimeRole = environment.DATABASE_RUNTIME_ROLE || "bsrc_runtime";
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(runtimeRole))
      throw new Error("DATABASE_RUNTIME_ROLE is unsafe.");
    phase = "source_authentication";
    const client = await pool.connect();
    try {
      phase = "source_catalog";
      await client.query("begin read only");
      const row = (await client.query(`
        select current_database() database,
          current_user actor,
          current_setting('server_version') server_version,
          (select count(*)::int from public.schema_migrations) migration_count,
          (select name from public.schema_migrations order by name desc limit 1) latest_migration,
          (select array_agg(name order by name) from public.schema_migrations) migration_names,
          (select rolcanlogin from pg_roles where rolname=current_user) source_login,
          count(*) filter(where not has_table_privilege(current_user,c.oid,'select'))::int missing_select,
          count(*)::int tables,
          count(*) filter(where c.relrowsecurity)::int rls,
          count(*) filter(where c.relforcerowsecurity)::int force_rls
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in('r','p')
      `)).rows[0];
      if (!row) throw new Error("Recovery catalog unavailable.");
      phase = "source_authority";
      if (!row.source_login || row.missing_select !== 0 || row.actor !== decodeURIComponent(databaseIdentity.username) ||
          row.database !== decodeURIComponent(databaseIdentity.pathname.slice(1)))
        throw new Error("Backup source lacks the approved full-table read authority.");
      const readinessPool = new pg.Pool({ connectionString: readinessDatabaseUrl, max: 1, connectionTimeoutMillis: 10000,
        statement_timeout: 10000, application_name: "bsrc-recovery-readiness" });
      try {
        phase = "readiness_authentication";
        const readinessClient = await readinessPool.connect();
        try {
        await readinessClient.query("begin read only");
        phase = "readiness_authority";
        const identity = (await readinessClient.query(
          `select current_user actor,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,
                  pg_has_role(current_user,$1,'member') runtime_member
           from pg_roles r where r.rolname=current_user`, [runtimeRole],
        )).rows[0];
        if (!identity?.rolcanlogin || identity.actor !== decodeURIComponent(readinessIdentity.username) || identity.rolsuper || identity.rolbypassrls || identity.rolcreatedb || identity.rolcreaterole || !identity.runtime_member)
          throw new Error("Recovery readiness connection is not a non-elevated runtime LOGIN member.");
        phase = "readiness_catalog";
        const readiness = (await readinessClient.query("select public.database_enforced_readiness() readiness")).rows[0]?.readiness;
        return {
          database: row.database,
          serverVersion: row.server_version,
          migrationCount: row.migration_count,
          latestMigration: row.latest_migration,
          migrationNames: row.migration_names,
          tables: row.tables,
          rls: row.rls,
          forceRls: row.force_rls,
          readiness,
        };
        } finally { await readinessClient.query("rollback").catch(() => undefined); readinessClient.release(); }
      } finally { await readinessPool.end(); }
    } finally { await client.query("rollback").catch(() => undefined); client.release(); }
  } finally { await pool.end(); }
}

async function verifyRoleSafety(databaseUrl: string, allowedReadinessLogin?: string) {
  const names = [
    environment.DATABASE_MIGRATOR_ROLE || "bsrc_migrator",
    environment.DATABASE_RUNTIME_ROLE || "bsrc_runtime",
    environment.DATABASE_OWNER_ROLE || "bsrc_owner_ops",
    environment.DATABASE_SYSTEM_ROLE || "bsrc_system",
    environment.DATABASE_RUNTIME_EXECUTOR_ROLE || "bsrc_runtime_executor",
    environment.DATABASE_BOOTSTRAP_EXECUTOR_ROLE || "bsrc_bootstrap_executor",
    environment.DATABASE_OWNER_EXECUTOR_ROLE || "bsrc_owner_executor",
    environment.DATABASE_SYSTEM_EXECUTOR_ROLE || "bsrc_system_executor",
  ];
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, application_name: "bsrc-recovery-role-validation" });
  try {
    const roles = (await pool.query(
      `select rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
       from pg_roles where rolname=any($1::text[])`, [names],
    )).rows;
    if (roles.length !== names.length || roles.some((role) => role.rolcanlogin || role.rolsuper || role.rolbypassrls || role.rolcreatedb || role.rolcreaterole))
      throw new Error("Recovery target application role attributes are unsafe or incomplete.");
    const ownership = (await pool.query(
      `select count(*)::int tables,
              count(*) filter(where r.rolname=$1)::int migrator_owned
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       join pg_roles r on r.oid=c.relowner
       where n.nspname='public' and c.relkind in('r','p')`, [names[0]],
    )).rows[0];
    const expected = recoveryCatalogForProfile(catalogProfile);
    if (ownership.tables !== expected.tables || ownership.migrator_owned !== expected.tables)
      throw new Error("Recovery target tables are not owned by the classified migrator role.");
    const temporary = (await pool.query(
      `select rolname from pg_roles
       where rolcanlogin and rolname~'^bsrc_b[0-9]+_.*_login$'
         and ($1::text is null or rolname<>$1)`, [allowedReadinessLogin ?? null],
    )).rows;
    if (temporary.length) throw new Error("Recovery target contains stale acceptance LOGIN roles.");
  } finally { await pool.end(); }
}

async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function verifyArchive(manifestPath: string) {
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as BackupManifest;
  if (parsed.schema !== "businesssite.logical-backup.v1" || !/^[a-f0-9]{64}$/.test(parsed.sha256))
    throw new Error("Backup manifest is malformed.");
  const directory = dirname(manifestPath);
  const artifactPath = resolve(directory, parsed.artifact);
  if (dirname(artifactPath) !== directory || basename(artifactPath) !== parsed.artifact)
    throw new Error("Backup artifact path escapes its manifest directory.");
  const artifactStat = await stat(artifactPath);
  if (artifactStat.size !== parsed.bytes || await hashFile(artifactPath) !== parsed.sha256)
    throw new Error("Backup size/checksum verification failed.");
  await postgresTool("pg_restore", ["--list", `/recovery/${parsed.artifact}`], undefined, directory);
  return { parsed, artifactPath };
}

function objectStoreConfiguration() {
  return recoveryObjectStoreConfigurationFromEnvironment(environment);
}

function objectStoreUrl(configuration: RecoveryObjectStoreConfiguration, key: string) {
  const endpoint = new URL(configuration.endpoint);
  endpoint.pathname = `/${encodeURIComponent(configuration.bucket)}/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
  return endpoint;
}

async function objectStoreFetch(configuration: RecoveryObjectStoreConfiguration, method: "GET" | "PUT", key: string, payloadHash: string, body?: ReturnType<typeof createReadStream>, bytes?: number) {
  const url = objectStoreUrl(configuration, key);
  const headers: Record<string, string> = { ...signS3RecoveryRequest({ method, url, payloadHash, accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey, region: configuration.region, now: new Date() }) };
  if (bytes !== undefined) headers["content-length"] = String(bytes);
  const init: RequestInit & { duplex?: "half" } = { method, headers, signal: AbortSignal.timeout(60_000) };
  if (body) { init.body = body as unknown as BodyInit; init.duplex = "half"; }
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Recovery object-store ${method} failed with status ${response.status}.`);
  return response;
}

async function verifyRemoteObject(configuration: RecoveryObjectStoreConfiguration, key: string, expectedHash: string, expectedBytes: number) {
  phase = "object_retrieval";
  const response = await objectStoreFetch(configuration, "GET", key, sha256(""));
  if (!response.body) throw new Error("Recovery object-store returned no body.");
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let bytes = 0;
  while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; hash.update(part.value); }
  if (bytes !== expectedBytes || hash.digest("hex") !== expectedHash) throw new Error("Recovery object-store retrieval checksum failed.");
}

async function upload(manifestPath = required("RECOVERY_BACKUP_MANIFEST")) {
  phase = "object_store_configuration";
  const configuration = objectStoreConfiguration();
  const { parsed, artifactPath } = await verifyArchive(manifestPath);
  const manifestName = basename(manifestPath);
  if (manifestName !== `${parsed.artifact}.manifest.json`) throw new Error("Backup manifest name does not match its artifact.");
  const manifestStat = await stat(manifestPath);
  const manifestHash = await hashFile(manifestPath);
  const artifactKey = recoveryObjectKey(configuration.prefix, parsed.artifact);
  const manifestKey = recoveryObjectKey(configuration.prefix, manifestName);
  phase = "object_upload";
  await objectStoreFetch(configuration, "PUT", artifactKey, parsed.sha256, createReadStream(artifactPath), parsed.bytes);
  await objectStoreFetch(configuration, "PUT", manifestKey, manifestHash, createReadStream(manifestPath), manifestStat.size);
  await verifyRemoteObject(configuration, artifactKey, parsed.sha256, parsed.bytes);
  await verifyRemoteObject(configuration, manifestKey, manifestHash, manifestStat.size);
  console.log(JSON.stringify({ status: "remote_verified", bucket: configuration.bucket, artifactKey, manifestKey, bytes: parsed.bytes, sha256: parsed.sha256 }));
}

async function backup() {
  const { source, readiness } = sourceConnections();
  const sourceUrl = safeUrl(source, "SOURCE_DATABASE_URL");
  const directory = backupDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const sourceCatalog = await catalog(source, readiness);
  assertProfileCatalog(sourceCatalog);
  const created = new Date();
  const artifact = backupArtifactName(created, sourceCatalog.latestMigration);
  const snapshotPool = new pg.Pool({ connectionString: source, max: 1, application_name: "bsrc-recovery-snapshot" });
  let dataIntegrity: BackupManifest["dataIntegrity"];
  const snapshotClient = await snapshotPool.connect();
  try {
    phase = "backup_snapshot";
    await snapshotClient.query("begin isolation level repeatable read read only");
    await snapshotClient.query("set local statement_timeout='60s'");
    await snapshotClient.query("set local timezone='UTC'");
    const snapshot = (await snapshotClient.query<{ snapshot: string }>("select pg_export_snapshot() snapshot")).rows[0].snapshot;
    if (!/^[A-Fa-f0-9-]+$/.test(snapshot)) throw new Error("Exported snapshot identifier is invalid.");
    phase = "postgres_dump";
    await postgresTool("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-acl", "--snapshot", snapshot, "--file", `/recovery/${artifact}`], source, directory);
    phase = "snapshot_integrity";
    dataIntegrity = await recoveryDataIntegrity(snapshotClient);
    if (dataIntegrity.tables.length !== sourceCatalog.tables) throw new Error("Snapshot table catalog changed before backup.");
  } finally {
    await snapshotClient.query("rollback").catch(() => undefined);
    snapshotClient.release();
    await snapshotPool.end();
  }
  const artifactPath = resolve(directory, artifact);
  phase = "archive_integrity";
  await chmod(artifactPath, 0o600);
  const artifactStat = await stat(artifactPath);
  if (artifactStat.size < 1024) throw new Error("Backup artifact failed minimum size sanity check.");
  const manifest: BackupManifest = {
    schema: "businesssite.logical-backup.v1",
    createdAt: created.toISOString(),
    artifact,
    sha256: await hashFile(artifactPath),
    bytes: artifactStat.size,
    format: "postgres-custom",
    transport: transportFor(sourceUrl),
    source: sourceCatalog,
    dataIntegrity,
  };
  const manifestPath = `${artifactPath}.manifest.json`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await verifyArchive(manifestPath);
  console.log(JSON.stringify({ status: "verified", manifest: manifestPath, artifact, bytes: artifactStat.size, sha256: manifest.sha256 }));
  return manifestPath;
}

async function restore() {
  const target = required("TARGET_DATABASE_URL");
  const targetUrl = safeUrl(target, "TARGET_DATABASE_URL");
  transportFor(targetUrl);
  const source = environment.SOURCE_DATABASE_URL?.trim();
  if (source) {
    const sourceUrl = safeUrl(source, "SOURCE_DATABASE_URL");
    if (sourceUrl.hostname === targetUrl.hostname && sourceUrl.port === targetUrl.port && sourceUrl.pathname === targetUrl.pathname)
      throw new Error("Source and recovery target must be different databases.");
  }
  assertRecoveryAuthorization({
    environment: environment.RECOVERY_TARGET_ENVIRONMENT,
    authorization: environment.RECOVERY_OPERATOR_AUTHORIZATION,
    targetDatabase: targetUrl.pathname.slice(1),
    confirmedDatabase: environment.RECOVERY_TARGET_CONFIRM_DATABASE,
    allowRestore: environment.ALLOW_POSTGRES_RESTORE,
  });
  const manifestPath = required("RECOVERY_BACKUP_MANIFEST");
  const { parsed } = await verifyArchive(manifestPath);
  assertProfileCatalog(parsed.source);
  const pool = new pg.Pool({ connectionString: target, max: 1, application_name: "bsrc-recovery-empty-check" });
  try {
    const count = (await pool.query("select count(*)::int count from pg_tables where schemaname='public'")).rows[0].count;
    if (count !== 0) throw new Error("Recovery target must be an empty database.");
  } finally { await pool.end(); }
  await ensureClassifiedRoles(target);
  await postgresTool("pg_restore", ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", decodeURIComponent(targetUrl.pathname.slice(1)), `/recovery/${parsed.artifact}`], target, dirname(manifestPath));
  console.log(JSON.stringify({ status: "restored", database: targetUrl.pathname.slice(1), artifact: parsed.artifact }));
}

async function validate() {
  const target = required("TARGET_DATABASE_URL");
  const readinessTarget = environment.RECOVERY_READINESS_DATABASE_URL?.trim() || target;
  const result = await catalog(target, readinessTarget);
  assertProfileCatalog(result);
  const readinessLogin = readinessTarget === target ? undefined : decodeURIComponent(safeUrl(readinessTarget, "RECOVERY_READINESS_DATABASE_URL").username);
  await verifyRoleSafety(target, readinessLogin);
  console.log(JSON.stringify({ status: "ready", catalog: result, roleSafety: true, temporaryReadinessLogin: Boolean(readinessLogin) }));
}

async function compareData() {
  const target = required("TARGET_DATABASE_URL");
  const { parsed } = await verifyArchive(required("RECOVERY_BACKUP_MANIFEST"));
  if (!parsed.dataIntegrity) throw new Error("Manifest has no snapshot row-integrity evidence.");
  const pool = new pg.Pool({ connectionString: target, max: 1, application_name: "bsrc-recovery-data-compare" });
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    await client.query("set local statement_timeout='60s'");
    await client.query("set local timezone='UTC'");
    const result = compareRecoveryDataIntegrity(parsed.dataIntegrity, await recoveryDataIntegrity(client));
    console.log(JSON.stringify({ status: "data_verified", ...result }));
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
    await pool.end();
  }
}

async function exportSuppressions() {
  const source = required("SOURCE_DATABASE_URL");
  const key = required("RECOVERY_SUPPRESSION_HMAC_KEY");
  const output = required("RECOVERY_SUPPRESSION_MANIFEST");
  const pool = new pg.Pool({ connectionString: source, max: 1, application_name: "bsrc-recovery-suppression-export" });
  try {
    const rows = (await pool.query(`
      select w.site_id,w.job_id,j.completed_at,p.manifest_hash
      from public.customer_deletion_workflows w
      join public.privacy_jobs j on j.id=w.job_id
      join public.privacy_policy_versions p on p.id=j.policy_version_id
      where w.phase='completed' and j.status='completed' and j.completed_at is not null
      order by j.completed_at,w.site_id,w.job_id
    `)).rows;
    const entries: DeletionSuppression[] = rows.map((row) => ({
      siteId: row.site_id,
      deletionJobId: row.job_id,
      completedAt: new Date(row.completed_at).toISOString(),
      evidenceHash: sha256(`${row.site_id}|${row.job_id}|${new Date(row.completed_at).toISOString()}|${row.manifest_hash}`),
    }));
    const signed = signDeletionSuppressions(new Date().toISOString(), entries, key);
    await writeFile(output, `${JSON.stringify(signed, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ status: "signed", entries: entries.length, manifest: output }));
  } finally { await pool.end(); }
}

async function applySuppressions() {
  const target = required("TARGET_DATABASE_URL");
  const targetUrl = safeUrl(target, "TARGET_DATABASE_URL");
  transportFor(targetUrl);
  const authorization = assertRecoveryAuthorization({
    environment: environment.RECOVERY_TARGET_ENVIRONMENT,
    authorization: environment.RECOVERY_OPERATOR_AUTHORIZATION,
    targetDatabase: targetUrl.pathname.slice(1),
    confirmedDatabase: environment.RECOVERY_TARGET_CONFIRM_DATABASE,
    allowRestore: environment.ALLOW_POSTGRES_RESTORE,
  });
  const manifestPath = required("RECOVERY_SUPPRESSION_MANIFEST");
  const key = required("RECOVERY_SUPPRESSION_HMAC_KEY");
  const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as SignedDeletionSuppressions;
  const entries = verifyDeletionSuppressions(parsed, key);
  const pool = new pg.Pool({ connectionString: target, max: 1, application_name: "bsrc-recovery-suppression-apply" });
  let applied = 0;
  try {
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const entry of entries) {
        if (!uuidPattern.test(entry.siteId) || !uuidPattern.test(entry.deletionJobId) || !/^[a-f0-9]{64}$/.test(entry.evidenceHash))
          throw new Error("Deletion suppression entry is malformed.");
        const account = (await client.query("select id from public.site_admin_accounts where site_id=$1 for update", [entry.siteId])).rows[0]?.id;
        const token = sha256(`${entry.siteId}|${entry.deletionJobId}|${entry.evidenceHash}`);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,6201))", [`recovery-suppression:${entry.siteId}`]);
        if (account) {
          await client.query("delete from public.site_admin_sessions where account_id=$1", [account]);
          await client.query("delete from public.site_admin_password_resets where account_id=$1", [account]);
          await client.query(`update public.site_admin_accounts set email=$2,password_hash=$3,status='disabled',updated_at=statement_timestamp() where id=$1`, [account, `closed+${token.slice(0,24)}@invalid.example`, `closed$${token}`]);
          await client.query(`update public.subscriber_intakes set email=$2,business_name='Closed customer',updated_at=statement_timestamp() where site_admin_account_id=$1`, [account, `closed+${token.slice(24,48)}@invalid.example`]);
        }
        await client.query(`update public.sites set visibility='private',publication_intent='private',generated_document=jsonb_build_object('schemaVersion',1,'status','closed'),slug=$2,trial_email=null,custom_domain=null,custom_domain_status='not_requested',custom_domain_verification='{}',custom_domain_checked_at=null,lead_id=null,prepared_profile_id=null where id=$1`, [entry.siteId, `closed-${token.slice(0,24)}`]);
        await client.query(`update public.site_appointments set customer_name='Deleted requester '||left(replace(id::text,'-',''),12),phone='deleted',email=null,service_title=null,preferred_date=null,preferred_time=null,note=null,customer_message=null,status='cancelled',updated_at=statement_timestamp() where site_id=$1`, [entry.siteId]);
        for (const table of ["site_article_media", "site_article_sources"])
          await client.query(`delete from public.${table} where article_id in(select id from public.site_articles where site_id=$1)`, [entry.siteId]);
        for (const table of ["site_articles","site_article_categories","site_editorial_memberships","site_editorial_settings","site_information_ad_slots","site_media_assets","site_media_blobs","site_media","site_preview_tokens","site_features","integration_api_requests","integration_nonces","site_external_integrations","tenant_concurrency_leases","tenant_usage_events","tenant_usage_counters","tenant_usage_states"])
          await client.query(`delete from public.${table} where site_id=$1`, [entry.siteId]);
        await client.query("delete from public.ai_runs where site_id=$1 or applied_site_id=$1", [entry.siteId]);
        applied += 1;
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  } finally { await pool.end(); }
  console.log(JSON.stringify({ status: "suppressed", entries: applied, authorization: sha256(authorization.authorization).slice(0,16) }));
}

async function checkStale() {
  const directory = backupDirectory();
  const manifests = (await readdir(directory)).filter((name) => name.endsWith(".dump.manifest.json"));
  if (!manifests.length) throw new Error("No logical backup manifest exists.");
  const candidates = await Promise.all(manifests.map(async (name) => ({
    name,
    manifest: JSON.parse(await readFile(resolve(directory, name), "utf8")) as BackupManifest,
  })));
  candidates.sort((left, right) => Date.parse(left.manifest.createdAt) - Date.parse(right.manifest.createdAt));
  const latest = candidates.at(-1)!;
  const parsed = (await verifyArchive(resolve(directory, latest.name))).parsed;
  const maximum = Number.parseFloat(environment.RECOVERY_BACKUP_MAX_AGE_HOURS || "24");
  const ageMs = assertBackupFresh(parsed.createdAt, new Date(), maximum);
  console.log(JSON.stringify({ status: "fresh", ageSeconds: Math.round(ageMs / 1000), maximumAgeHours: maximum }));
}

async function main() {
  switch (command) {
    case "preflight": {
      const { source, readiness } = sourceConnections();
      const result = await catalog(source, readiness);
      phase = "reviewed_catalog";
      assertProfileCatalog(result);
      console.log(JSON.stringify({ status: "preflight_verified", profile: catalogProfile,
        migrationCount: result.migrationCount, latestMigration: result.latestMigration,
        tables: result.tables, rls: result.rls, forceRls: result.forceRls,
        sourceAndReadinessRolesDistinct: safeUrl(source, "source").username !== safeUrl(readiness, "readiness").username,
        readOnly: true }));
      break;
    }
    case "backup": await backup(); break;
    case "backup-upload": await upload(await backup()); break;
    case "upload": await upload(); break;
    case "verify": await verifyArchive(required("RECOVERY_BACKUP_MANIFEST")); console.log(JSON.stringify({ status: "verified" })); break;
    case "restore": await restore(); break;
    case "validate": await validate(); break;
    case "compare-data": await compareData(); break;
    case "export-suppressions": await exportSuppressions(); break;
    case "apply-suppressions": await applySuppressions(); break;
    case "check-stale": await checkStale(); break;
    default: throw new Error("Usage: postgres-recovery <preflight|backup|backup-upload|upload|verify|restore|validate|compare-data|export-suppressions|apply-suppressions|check-stale>");
  }
}

main().catch(async (error) => {
  const code: SignalCode = ["preflight", "backup", "backup-upload", "upload"].includes(command) ? "scheduled_backup_failed"
    : command === "verify" ? "backup_integrity_failed"
    : command === "check-stale" ? "backup_stale"
    : command === "validate" ? "recovery_target_readiness_failed"
    : "restore_drill_failed";
  await signal(code).catch(() => undefined);
  const state = error && typeof error === "object" && "code" in error && /^[A-Z0-9]{5}$/.test(String(error.code)) ? String(error.code) : undefined;
  console.error(JSON.stringify({ status: "failed_closed", phase, sqlstate: state ?? null, rawDetailsWithheld: true }));
  process.exitCode = 1;
});
