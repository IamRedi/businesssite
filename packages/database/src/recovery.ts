import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const recoveryEnvironmentPattern = /^(preview|staging|test|recovery)(?:[-_][a-z0-9-]+)?$/;
export const recoveryAuthorizationPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{7,119}$/;

export type RecoveryCatalog = {
  database: string;
  serverVersion: string;
  migrationCount: number;
  latestMigration: string;
  tables: number;
  rls: number;
  forceRls: number;
  readiness: boolean;
  migrationNames?: string[];
};

export type BackupManifest = {
  schema: "businesssite.logical-backup.v1";
  createdAt: string;
  artifact: string;
  sha256: string;
  bytes: number;
  format: "postgres-custom";
  transport: "postgresql-tls" | "local-acceptance";
  source: RecoveryCatalog;
  dataIntegrity?: RecoveryDataIntegrity;
};

export type RecoveryDataIntegrity = {
  method: "postgres-jsonb-sha256-v1";
  tables: Array<{ name: string; rows: number; sha256: string }>;
};

export function assertRecoveryDataIntegrity(value: RecoveryDataIntegrity) {
  if (value?.method !== "postgres-jsonb-sha256-v1" || !Array.isArray(value.tables) || !value.tables.length ||
      new Set(value.tables.map((table) => table.name)).size !== value.tables.length ||
      value.tables.some((table) => !/^[a-z_][a-z0-9_]*$/.test(table.name) ||
        !Number.isSafeInteger(table.rows) || table.rows < 0 || !/^[a-f0-9]{64}$/.test(table.sha256)))
    throw new Error("Backup snapshot data-integrity evidence is invalid.");
}

export function compareRecoveryDataIntegrity(expected: RecoveryDataIntegrity, observed: RecoveryDataIntegrity) {
  assertRecoveryDataIntegrity(expected);
  assertRecoveryDataIntegrity(observed);
  const actual = new Map(observed.tables.map((table) => [table.name, table]));
  if (actual.size !== expected.tables.length || expected.tables.some((table) => {
    const row = actual.get(table.name);
    return !row || row.rows !== table.rows || row.sha256 !== table.sha256;
  })) throw new Error("Restored table counts or snapshot digests do not match.");
  return { tables: actual.size, rows: expected.tables.reduce((total, table) => total + table.rows, 0) };
}

export type RecoveryObjectStoreConfiguration = {
  endpoint: string;
  bucket: string;
  prefix: string;
  region: "auto";
  accessKeyId: string;
  secretAccessKey: string;
};

export function recoveryObjectStoreConfigurationFromEnvironment(
  environment: Record<string, string | undefined>,
): RecoveryObjectStoreConfiguration {
  const required = (name: string) => {
    const value = environment[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
  };
  return recoveryObjectStoreConfiguration({
    endpoint: required("RECOVERY_OBJECT_STORE_ENDPOINT"),
    allowedHosts: required("RECOVERY_OBJECT_STORE_ALLOWED_HOSTS"),
    bucket: required("RECOVERY_OBJECT_STORE_BUCKET"),
    prefix: environment.RECOVERY_OBJECT_PREFIX,
    region: environment.RECOVERY_OBJECT_STORE_REGION,
    accessKeyId: required("AWS_ACCESS_KEY_ID"),
    secretAccessKey: required("AWS_SECRET_ACCESS_KEY"),
  });
}

export function recoveryObjectStoreConfiguration(input: {
  endpoint?: string;
  allowedHosts?: string;
  bucket?: string;
  prefix?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}): RecoveryObjectStoreConfiguration {
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint?.trim() || ""); }
  catch { throw new Error("Recovery object-store endpoint is invalid."); }
  const allowedHosts = new Set((input.allowedHosts || "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" || !allowedHosts.has(endpoint.hostname.toLowerCase()))
    throw new Error("Recovery object-store endpoint is unsafe or not allowlisted.");
  const bucket = input.bucket?.trim() || "";
  if (bucket.length < 3 || bucket.length > 63 || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) || bucket.includes(".."))
    throw new Error("Recovery object-store bucket is invalid.");
  const prefix = (input.prefix?.trim() || "daily").replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.split("/").some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === ".."))
    throw new Error("Recovery object-store prefix is invalid.");
  const accessKeyId = input.accessKeyId?.trim() || "";
  const secretAccessKey = input.secretAccessKey?.trim() || "";
  if (accessKeyId.length < 16 || secretAccessKey.length < 32)
    throw new Error("Recovery object-store credentials are missing or malformed.");
  if ((input.region?.trim() || "auto") !== "auto") throw new Error("Recovery object-store region must be auto.");
  return { endpoint: endpoint.toString(), bucket, prefix, region: "auto", accessKeyId, secretAccessKey };
}

export function recoveryObjectKey(prefix: string, filename: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,239}$/.test(filename)) throw new Error("Recovery object filename is unsafe.");
  return `${prefix}/${filename}`;
}

const recoveryHmac = (key: string | Uint8Array, value: string) => createHmac("sha256", key).update(value).digest();

export function signS3RecoveryRequest(input: {
  method: "GET" | "PUT";
  url: URL;
  payloadHash: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: "auto";
  now: Date;
}) {
  if (input.url.protocol !== "https:" || input.url.username || input.url.password || input.url.search || input.url.hash || !/^[a-f0-9]{64}$/.test(input.payloadHash) || !Number.isFinite(input.now.getTime()))
    throw new Error("Recovery object-store signing input is invalid.");
  const amzDate = input.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const canonicalHeaders = `host:${input.url.host.toLowerCase()}\n` + `x-amz-content-sha256:${input.payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [input.method, input.url.pathname, "", canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const dateKey = recoveryHmac(`AWS4${input.secretAccessKey}`, date);
  const regionKey = recoveryHmac(dateKey, input.region);
  const serviceKey = recoveryHmac(regionKey, "s3");
  const signingKey = recoveryHmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
  };
}

export type DeletionSuppression = {
  siteId: string;
  deletionJobId: string;
  completedAt: string;
  evidenceHash: string;
};

export type SignedDeletionSuppressions = {
  schema: "businesssite.deletion-suppressions.v1";
  generatedAt: string;
  entries: DeletionSuppression[];
  signature: string;
};

export function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalSuppressions(
  generatedAt: string,
  entries: DeletionSuppression[],
) {
  const canonicalEntries = [...entries]
    .map((entry) => ({
      siteId: entry.siteId,
      deletionJobId: entry.deletionJobId,
      completedAt: entry.completedAt,
      evidenceHash: entry.evidenceHash,
    }))
    .sort((left, right) =>
      `${left.completedAt}:${left.siteId}:${left.deletionJobId}`.localeCompare(
        `${right.completedAt}:${right.siteId}:${right.deletionJobId}`,
      ),
    );
  return JSON.stringify({
    schema: "businesssite.deletion-suppressions.v1",
    generatedAt,
    entries: canonicalEntries,
  });
}

export function signDeletionSuppressions(
  generatedAt: string,
  entries: DeletionSuppression[],
  key: string,
): SignedDeletionSuppressions {
  if (Buffer.byteLength(key, "utf8") < 32)
    throw new Error("Recovery suppression signing key must contain at least 32 bytes.");
  const canonical = canonicalSuppressions(generatedAt, entries);
  return {
    ...JSON.parse(canonical),
    signature: createHmac("sha256", key).update(canonical).digest("hex"),
  } as SignedDeletionSuppressions;
}

export function verifyDeletionSuppressions(
  manifest: SignedDeletionSuppressions,
  key: string,
) {
  if (
    manifest.schema !== "businesssite.deletion-suppressions.v1" ||
    !Array.isArray(manifest.entries) ||
    !/^[a-f0-9]{64}$/.test(manifest.signature)
  )
    throw new Error("Deletion suppression manifest is malformed.");
  const canonical = canonicalSuppressions(manifest.generatedAt, manifest.entries);
  const expected = Buffer.from(
    createHmac("sha256", key).update(canonical).digest("hex"),
    "hex",
  );
  const received = Buffer.from(manifest.signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    throw new Error("Deletion suppression signature is invalid.");
  return manifest.entries;
}

export function assertRecoveryAuthorization(input: {
  environment?: string;
  authorization?: string;
  targetDatabase?: string;
  confirmedDatabase?: string;
  allowRestore?: string;
}) {
  const environment = input.environment?.trim().toLowerCase() ?? "";
  const authorization = input.authorization?.trim() ?? "";
  if (!recoveryEnvironmentPattern.test(environment))
    throw new Error("Recovery target must be explicitly classified as preview/staging/test/recovery.");
  if (!recoveryAuthorizationPattern.test(authorization))
    throw new Error("A bounded recovery operator authorization reference is required.");
  if (input.allowRestore !== "true")
    throw new Error("ALLOW_POSTGRES_RESTORE=true is required for target mutation.");
  if (!input.targetDatabase || input.confirmedDatabase !== input.targetDatabase)
    throw new Error("RECOVERY_TARGET_CONFIRM_DATABASE must exactly match the target database.");
  return { environment, authorization };
}

export function backupArtifactName(createdAt: Date, latestMigration: string) {
  if (!Number.isFinite(createdAt.getTime())) throw new Error("Backup timestamp is invalid.");
  const timestamp = createdAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const migration = latestMigration.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
  return `businesssite-${timestamp}-${migration || "unmigrated"}.dump`;
}

export function assertBackupFresh(createdAt: string, now: Date, maximumAgeHours: number) {
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(maximumAgeHours) || maximumAgeHours <= 0)
    throw new Error("Backup freshness input is invalid.");
  const ageMs = now.getTime() - created.getTime();
  if (ageMs < -5 * 60_000 || ageMs > maximumAgeHours * 3_600_000)
    throw new Error("Backup is stale or has an invalid future timestamp.");
  return ageMs;
}

export const expectedRecoveryCatalog = {
  migrationCount: 91,
  latestMigration: "091_editorial_media_usage_authority.sql",
  tables: 73,
  rls: 70,
  forceRls: 70,
};

export const stagingRecoveryCatalog = {
  migrationCount: 71,
  latestMigration: "071_durable_appointment_receipts.sql",
  tables: 67,
  rls: 64,
  forceRls: 64,
};

export type RecoveryCatalogProfile = "production" | "staging-b6f2" | "staging-b6f2-local";

export function recoveryCatalogForProfile(profile = "production") {
  if (profile === "production" || profile === "production-local") return expectedRecoveryCatalog;
  if (profile === "staging-b6f2" || profile === "staging-b6f2-local") return stagingRecoveryCatalog;
  throw new Error("Recovery catalog profile is not reviewed.");
}

export function assertRecoveryMigrationLedger(actual: string[] | undefined, expected: string[]) {
  if (!Array.isArray(actual) || !expected.length || actual.length !== expected.length ||
      new Set(actual).size !== actual.length || actual.some((name, index) => name !== expected[index]))
    throw new Error("Recovery migration ledger differs from the reviewed source files.");
}

/** Boolean diagnostics only: never return connection strings, users or passwords. */
export function recoverySourceBindingChecks(source: string, readiness: string, profile: string) {
  const checks: Record<string, boolean> = {
    sourcePresent: !!source.trim(), readinessPresent: !!readiness.trim(), urlsValid: false,
  };
  try {
    const a = new URL(source), b = new URL(readiness);
    checks.urlsValid = true;
    checks.postgresqlProtocol = a.protocol === "postgresql:" && b.protocol === "postgresql:";
    checks.sameHost = a.hostname === b.hostname;
    checks.samePort = (a.port || "5432") === (b.port || "5432");
    checks.sameDatabase = a.pathname === b.pathname;
    checks.passwordsPresent = !!a.password && !!b.password;
    checks.noFragments = !a.hash && !b.hash;
    const production = profile === "production";
    checks.approvedSourceHost = production
      ? a.hostname === "ep-example-prod-a1b2c3d4.c-5.eu-central-1.aws.neon.tech"
      : a.hostname.startsWith("ep-example-stage-e5f6g7h8.") && a.hostname.endsWith(".neon.tech");
    checks.approvedPort = !a.port || a.port === "5432";
    checks.approvedDatabase = a.pathname === "/neondb";
    checks.approvedBackupRole = a.username === (production ? "neondb_owner" : "bsrc_b6f2_backup_login");
    checks.approvedReadinessRole = b.username === (production ? "bsrc_runtime_prod" : "bsrc_b6a_runtime_login");
    checks.sourceTlsVerifyFull = a.searchParams.get("sslmode") === "verify-full";
    checks.readinessTlsVerifyFull = b.searchParams.get("sslmode") === "verify-full";
    checks.approvedQueryParameters = [a, b].every(url =>
      [...url.searchParams.keys()].every(key => ["sslmode", "channel_binding"].includes(key)));
  } catch { /* Values and parser errors are deliberately withheld. */ }
  return checks;
}

/** Strengthen existing TLS without changing identity, password or hosted settings. */
export function verifiedRecoveryConnections(source: string, readiness: string, profile: string) {
  const strengthen = (value: string) => {
    const url = new URL(value);
    if (!["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") || ""))
      throw new Error("Recovery connection must already explicitly require TLS.");
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  };
  const connections = { source: strengthen(source), readiness: strengthen(readiness) };
  assertRecoverySourceBinding(connections.source, connections.readiness, profile);
  return connections;
}

export function assertRecoverySourceBinding(source: string, readiness: string, profile: string) {
  recoveryCatalogForProfile(profile);
  let sourceUrl: URL;
  let readinessUrl: URL;
  try { sourceUrl = new URL(source); readinessUrl = new URL(readiness); }
  catch { throw new Error("Staging recovery connection profile is malformed."); }
  if (sourceUrl.protocol !== "postgresql:" || readinessUrl.protocol !== "postgresql:" ||
      sourceUrl.hostname !== readinessUrl.hostname || (sourceUrl.port || "5432") !== (readinessUrl.port || "5432") ||
      sourceUrl.pathname !== readinessUrl.pathname || !sourceUrl.password || !readinessUrl.password || sourceUrl.hash || readinessUrl.hash)
    throw new Error("Staging source and readiness must use distinct approved roles on the same database.");
  if (profile === "staging-b6f2-local") {
    if (sourceUrl.hostname !== "127.0.0.1" || sourceUrl.port !== "55702" || sourceUrl.pathname !== "/t02_source" ||
        sourceUrl.username !== "t02_backup" || readinessUrl.username !== "t02_runtime")
      throw new Error("Local Staging recovery fixture identity is not approved.");
    return;
  }
  if (profile === "production-local") {
    if (sourceUrl.hostname !== "127.0.0.1" || sourceUrl.port !== "55712" || sourceUrl.pathname !== "/t02_source" ||
        sourceUrl.username !== "t02_backup" || readinessUrl.username !== "t02_runtime")
      throw new Error("Local Production recovery fixture identity is not approved.");
    return;
  }
  if (profile === "production") {
    if (sourceUrl.hostname !== "ep-example-prod-a1b2c3d4.c-5.eu-central-1.aws.neon.tech" ||
        (sourceUrl.port && sourceUrl.port !== "5432") || sourceUrl.pathname !== "/neondb" ||
        sourceUrl.username !== "neondb_owner" || readinessUrl.username !== "bsrc_runtime_prod" ||
        sourceUrl.searchParams.get("sslmode") !== "verify-full" || readinessUrl.searchParams.get("sslmode") !== "verify-full" ||
        [sourceUrl, readinessUrl].some(url => [...url.searchParams.keys()].some(key => !["sslmode", "channel_binding"].includes(key))))
      throw new Error("Hosted Production recovery source/readiness binding is not approved.");
    return;
  }
  // Compute ID is the provider-observed Staging binding. Pooler and Production
  // endpoints cannot match this exact direct-compute prefix.
  if (!sourceUrl.hostname.startsWith("ep-example-stage-e5f6g7h8.") || !sourceUrl.hostname.endsWith(".neon.tech") ||
      (sourceUrl.port && sourceUrl.port !== "5432") || sourceUrl.pathname !== "/neondb" ||
      sourceUrl.username !== "bsrc_b6f2_backup_login" || readinessUrl.username !== "bsrc_b6a_runtime_login" ||
      sourceUrl.searchParams.get("sslmode") !== "verify-full" || readinessUrl.searchParams.get("sslmode") !== "verify-full" ||
      [sourceUrl, readinessUrl].some(url => [...url.searchParams.keys()].some(key => !["sslmode", "channel_binding"].includes(key))))
    throw new Error("Hosted Staging recovery source/readiness binding is not approved.");
}

export function assertExpectedRecoveryCatalog(
  catalog: RecoveryCatalog,
  expected = expectedRecoveryCatalog,
) {
  if (
    catalog.migrationCount !== expected.migrationCount ||
    catalog.latestMigration !== expected.latestMigration ||
    catalog.tables !== expected.tables ||
    catalog.rls !== expected.rls ||
    catalog.forceRls !== expected.forceRls ||
    catalog.readiness !== true
  )
    throw new Error("Recovery target does not satisfy the expected migration/RLS/readiness catalog.");
}
