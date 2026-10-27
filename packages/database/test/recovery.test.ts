import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import {
  assertBackupFresh,
  assertExpectedRecoveryCatalog,
  assertRecoveryMigrationLedger,
  assertRecoverySourceBinding,
  recoverySourceBindingChecks,
  verifiedRecoveryConnections,
  recoveryCatalogForProfile,
  assertRecoveryAuthorization,
  assertRecoveryDataIntegrity,
  compareRecoveryDataIntegrity,
  backupArtifactName,
  canonicalSuppressions,
  recoveryObjectKey,
  recoveryObjectStoreConfiguration,
  recoveryObjectStoreConfigurationFromEnvironment,
  signDeletionSuppressions,
  signS3RecoveryRequest,
  verifyDeletionSuppressions,
} from "../src/recovery";

const entry = {
  siteId: "10000000-0000-4000-8000-000000000001",
  deletionJobId: "20000000-0000-4000-8000-000000000001",
  completedAt: "2026-08-29T10:00:00.000Z",
  evidenceHash: "a".repeat(64),
};

describe("PostgreSQL recovery controls", () => {
  it("strengthens existing TLS while preserving identity and rejecting foreign or plaintext sources", () => {
    const host = "ep-example-prod-a1b2c3d4.c-5.eu-central-1.aws.neon.tech";
    const source = `postgresql://neondb_owner:synthetic%40password@${host}/neondb?sslmode=require&channel_binding=require`;
    const readiness = source.replace("neondb_owner", "bsrc_runtime_prod");
    const checked = verifiedRecoveryConnections(source, readiness, "production");
    const normalized = new URL(checked.source);
    expect(normalized.searchParams.get("sslmode")).toBe("verify-full");
    expect(normalized.password).toBe(new URL(source).password);
    expect(normalized.searchParams.get("channel_binding")).toBe("require");
    expect(() => verifiedRecoveryConnections(source.replace(host, "foreign.neon.tech"), readiness, "production")).toThrow();
    expect(() => verifiedRecoveryConnections(source.replace("sslmode=require", "sslmode=disable"), readiness, "production")).toThrow();
  });
  it("reports only boolean binding diagnostics without connection values or parser errors", () => {
    const source = "postgresql://private-role:DO_NOT_DISCLOSE@private-host/secret-db?sslmode=require";
    const result = recoverySourceBindingChecks(source, "not-a-url-DO_NOT_DISCLOSE", "production");
    expect(Object.values(result).every(value => typeof value === "boolean")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_DISCLOSE|private-host|secret-db|private-role/);
    expect(result.urlsValid).toBe(false);
    const valid = recoverySourceBindingChecks(source, source, "production");
    expect(valid.sourceTlsVerifyFull).toBe(false);
    expect(valid.approvedBackupRole).toBe(false);
    expect(Object.values(valid).every(value => typeof value === "boolean")).toBe(true);
  });
  it("binds Production recovery to the verified direct source and separate non-elevated runtime", () => {
    const host = "ep-example-prod-a1b2c3d4.c-5.eu-central-1.aws.neon.tech";
    const source = `postgresql://neondb_owner:synthetic@${host}/neondb?sslmode=verify-full`;
    const runtime = `postgresql://bsrc_runtime_prod:synthetic@${host}/neondb?sslmode=verify-full`;
    expect(() => assertRecoverySourceBinding(source, runtime, "production")).not.toThrow();
    for (const bad of [source.replace(host, "other.neon.tech"), source.replace("neondb_owner", "bsrc_runtime_prod"), source.replace("verify-full", "require"), source + "&options=unsafe"])
      expect(() => assertRecoverySourceBinding(bad, runtime, "production")).toThrow();
    expect(() => assertRecoverySourceBinding(source, source, "production")).toThrow();
    expect(() => assertRecoverySourceBinding("postgresql://t02_backup:synthetic@127.0.0.1:55712/t02_source", "postgresql://t02_runtime:synthetic@127.0.0.1:55712/t02_source", "production-local")).not.toThrow();
    expect(() => assertRecoverySourceBinding(source, runtime, "production-local")).toThrow();
  });
  it("keeps reviewed Staging and Production catalogs separate and rejects unreviewed profiles", () => {
    expect(recoveryCatalogForProfile()).toMatchObject({ migrationCount: 91, tables: 73, rls: 70 });
    const staging = recoveryCatalogForProfile("staging-b6f2");
    expect(staging).toEqual({ migrationCount: 71, latestMigration: "071_durable_appointment_receipts.sql", tables: 67, rls: 64, forceRls: 64 });
    const actual = { ...staging, database: "neondb", serverVersion: "18.6", readiness: true };
    expect(() => assertExpectedRecoveryCatalog(actual, staging)).not.toThrow();
    expect(() => assertExpectedRecoveryCatalog(actual)).toThrow();
    expect(() => assertExpectedRecoveryCatalog({ ...actual, readiness: false }, staging)).toThrow();
    expect(() => recoveryCatalogForProfile("auto-detect")).toThrow(/not reviewed/);
  });

  it("rejects migration-ledger drift even when count and latest still match", () => {
    const expected = ["001_core.sql", "002_readiness.sql"];
    expect(() => assertRecoveryMigrationLedger(expected, expected)).not.toThrow();
    for (const actual of [undefined, ["001_other.sql", "002_readiness.sql"], ["001_core.sql", "001_core.sql"], expected.slice(1), [...expected].reverse()])
      expect(() => assertRecoveryMigrationLedger(actual, expected)).toThrow(/ledger differs/);
  });

  it("rejects runtime-as-backup, pooled, Production, wrong-database and weak-TLS Staging profiles without revealing credentials", () => {
    const host = "ep-example-stage-e5f6g7h8.c-2.eu-central-1.aws.neon.tech";
    const source = `postgresql://bsrc_b6f2_backup_login:synthetic-password@${host}/neondb?sslmode=verify-full`;
    const readiness = source.replace("bsrc_b6f2_backup_login", "bsrc_b6a_runtime_login");
    expect(() => assertRecoverySourceBinding(source, readiness, "staging-b6f2")).not.toThrow();
    for (const bad of [readiness, source.replace("ep-example-stage-e5f6g7h8.", "ep-example-stage-e5f6g7h8-pooler."), source.replace("ep-example-stage-e5f6g7h8", "ep-example-prod-a1b2c3d4"), source.replace("/neondb", "/other"), source.replace("verify-full", "require")]) {
      expect(() => assertRecoverySourceBinding(bad, readiness, "staging-b6f2")).toThrow();
      try { assertRecoverySourceBinding(bad, readiness, "staging-b6f2"); }
      catch (error) { expect(String(error)).not.toContain("synthetic-password"); }
    }
    const local = "postgresql://t02_backup:synthetic-password@127.0.0.1:55702/t02_source";
    expect(() => assertRecoverySourceBinding(local, local.replace("t02_backup", "t02_runtime"), "staging-b6f2-local")).not.toThrow();
    expect(() => assertRecoverySourceBinding(local.replace("55702", "55689"), local.replace("t02_backup", "t02_runtime"), "staging-b6f2-local")).toThrow();
  });

  it("compares snapshot digests without accepting missing, changed or duplicate tables", () => {
    const expected = { method: "postgres-jsonb-sha256-v1" as const, tables: [{ name: "sites", rows: 2, sha256: "a".repeat(64) }] };
    expect(compareRecoveryDataIntegrity(expected, expected)).toEqual({ tables: 1, rows: 2 });
    expect(() => compareRecoveryDataIntegrity(expected, { ...expected, tables: [{ ...expected.tables[0], rows: 1 }] })).toThrow(/do not match/);
    expect(() => compareRecoveryDataIntegrity(expected, { ...expected, tables: [{ ...expected.tables[0], sha256: "b".repeat(64) }] })).toThrow(/do not match/);
    expect(() => assertRecoveryDataIntegrity({ ...expected, tables: [...expected.tables, ...expected.tables] })).toThrow(/invalid/);
    expect(() => assertRecoveryDataIntegrity({ ...expected, tables: [{ ...expected.tables[0], name: 'sites";drop', rows: -1 }] })).toThrow(/invalid/);
  });
  it("uses deterministic, secret-free archive names", () => {
    expect(backupArtifactName(new Date("2026-08-29T10:11:12.345Z"), "061_operational_monitoring_readiness.sql"))
      .toBe("businesssite-20260829T101112Z-061_operational_monitoring_readiness.sql.dump");
  });

  it("requires explicit non-production target authorization and exact confirmation", () => {
    expect(assertRecoveryAuthorization({
      environment: "recovery-b6b",
      authorization: "B6B-operator-20260829",
      targetDatabase: "businesssite_recovery",
      confirmedDatabase: "businesssite_recovery",
      allowRestore: "true",
    })).toMatchObject({ environment: "recovery-b6b" });
    expect(() => assertRecoveryAuthorization({
      environment: "production",
      authorization: "B6B-operator-20260829",
      targetDatabase: "businesssite",
      confirmedDatabase: "businesssite",
      allowRestore: "true",
    })).toThrow(/preview\/staging\/test\/recovery/i);
    expect(() => assertRecoveryAuthorization({
      environment: "staging",
      authorization: "B6B-operator-20260829",
      targetDatabase: "target",
      confirmedDatabase: "wrong",
      allowRestore: "true",
    })).toThrow(/exactly match/i);
  });

  it("signs a canonical external deletion suppression ledger and rejects tampering", () => {
    const key = "recovery-acceptance-key-not-for-production-123456";
    const signed = signDeletionSuppressions("2026-08-29T10:01:00.000Z", [entry], key);
    expect(verifyDeletionSuppressions(signed, key)).toEqual([entry]);
    expect(canonicalSuppressions(signed.generatedAt, signed.entries)).not.toContain(signed.signature);
    expect(() => verifyDeletionSuppressions({
      ...signed,
      entries: [{ ...entry, siteId: "30000000-0000-4000-8000-000000000001" }],
    }, key)).toThrow(/signature/i);
  });

  it("fails stale/future backups and catalog drift closed", () => {
    expect(assertBackupFresh("2026-08-29T09:00:00.000Z", new Date("2026-08-29T10:00:00.000Z"), 24))
      .toBe(3_600_000);
    expect(() => assertBackupFresh("2026-08-27T09:00:00.000Z", new Date("2026-08-29T10:00:00.000Z"), 24))
      .toThrow(/stale/i);
    const catalog = {
      database: "recovery",
      serverVersion: "16.10",
      migrationCount: 91,
      latestMigration: "091_editorial_media_usage_authority.sql",
      tables: 73,
      rls: 70,
      forceRls: 70,
      readiness: true,
    };
    expect(() => assertExpectedRecoveryCatalog(catalog)).not.toThrow();
    expect(() => assertExpectedRecoveryCatalog({ ...catalog, forceRls: 63 })).toThrow(/catalog/i);
    // Bind the default gate to the shipped migration ledger, so an additive
    // migration cannot silently strand backup/restore on an older catalog.
    const migrations = readdirSync(new URL("../../../db/migrations/", import.meta.url))
      .filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    expect(migrations).toHaveLength(catalog.migrationCount);
    expect(migrations.at(-1)).toBe(catalog.latestMigration);
    for (const drift of [
      { migrationCount: 88, latestMigration: "088_complimentary_site_admin_media.sql" },
      { migrationCount: 89, latestMigration: "089_clouvider_domain_authority.sql" },
      { migrationCount: 87 }, { latestMigration: "087_complimentary_existing_domain.sql" },
      { tables: 72 }, { rls: 69 }, { forceRls: 69 }, { readiness: false },
      { migrationCount: 73, latestMigration: "073_owner_complimentary_access.sql", tables: 69, rls: 66, forceRls: 66 },
    ]) {
      expect(() => assertExpectedRecoveryCatalog({ ...catalog, ...drift })).toThrow(/catalog/i);
    }
  });

  it("allows only an exact HTTPS recovery store and bounded object keys", () => {
    const configuration = recoveryObjectStoreConfiguration({ endpoint: "https://account.eu.r2.cloudflarestorage.com", allowedHosts: "account.eu.r2.cloudflarestorage.com", bucket: "businesssite-rc-recovery-backups", prefix: "daily/postgres", region: "auto", accessKeyId: "a".repeat(32), secretAccessKey: "s".repeat(64) });
    expect(configuration).toMatchObject({ bucket: "businesssite-rc-recovery-backups", prefix: "daily/postgres", region: "auto" });
    expect(recoveryObjectKey(configuration.prefix, "businesssite-20260831T100000Z-063.dump")).toBe("daily/postgres/businesssite-20260831T100000Z-063.dump");
    expect(() => recoveryObjectStoreConfiguration({ ...configuration, endpoint: "https://other.example", allowedHosts: "account.eu.r2.cloudflarestorage.com" })).toThrow(/allowlisted/i);
    expect(() => recoveryObjectKey(configuration.prefix, "../escape.dump")).toThrow(/unsafe/i);
  });

  it("maps the workflow recovery object-store environment contract", () => {
    const configuration = recoveryObjectStoreConfigurationFromEnvironment({
      RECOVERY_OBJECT_STORE_ENDPOINT: "https://account.eu.r2.cloudflarestorage.com",
      RECOVERY_OBJECT_STORE_ALLOWED_HOSTS: "account.eu.r2.cloudflarestorage.com",
      RECOVERY_OBJECT_STORE_BUCKET: "businesssite-rc-recovery-backups",
      RECOVERY_OBJECT_PREFIX: "daily/postgres",
      RECOVERY_OBJECT_STORE_REGION: "auto",
      AWS_ACCESS_KEY_ID: "a".repeat(32),
      AWS_SECRET_ACCESS_KEY: "s".repeat(64),
    });
    expect(configuration).toMatchObject({
      endpoint: "https://account.eu.r2.cloudflarestorage.com/",
      bucket: "businesssite-rc-recovery-backups",
      prefix: "daily/postgres",
      region: "auto",
    });
    expect(() => recoveryObjectStoreConfigurationFromEnvironment({
      AWS_ENDPOINT_URL: "https://account.eu.r2.cloudflarestorage.com",
      R2_BUCKET_NAME: "businesssite-rc-recovery-backups",
    })).toThrow(/RECOVERY_OBJECT_STORE_ENDPOINT is required/);
  });

  it("signs deterministic S3 requests without exposing the secret", () => {
    const input = { method: "PUT" as const, url: new URL("https://account.eu.r2.cloudflarestorage.com/bucket/daily/archive.dump"), payloadHash: "a".repeat(64), accessKeyId: "A".repeat(32), secretAccessKey: "secret".repeat(12), region: "auto" as const, now: new Date("2026-08-31T12:34:56.000Z") };
    const first = signS3RecoveryRequest(input);
    expect(signS3RecoveryRequest(input)).toEqual(first);
    expect(first.authorization).toContain(`Credential=${input.accessKeyId}/20260831/auto/s3/aws4_request`);
    expect(first.authorization).not.toContain(input.secretAccessKey);
    expect(first["x-amz-date"]).toBe("20260831T123456Z");
  });
});
