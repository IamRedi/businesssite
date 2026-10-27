import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appointmentsCsv,
  buildPrivacyArchive,
  decryptPrivacyArchive,
  encryptPrivacyArchive,
  MemoryPrivacyArtifactStore,
  privacyArtifactBindingValid,
  privacyExportKeys,
  privacyExportObjectKey,
  sha256,
} from "../src/privacy-export";
import {
  cleanupPrivacyExportArtifacts,
  runPrivacyExportWorker,
} from "../src/privacy";

const binding = (environmentIdentity = "local") => {
  const artifactId = randomUUID();
  return {
    artifactId,
    jobId: randomUUID(),
    provider: "memory_test" as const,
    storeAuthority: "memory_test",
    environmentIdentity,
    objectKey: privacyExportObjectKey(environmentIdentity, artifactId),
  };
};

const keys = () =>
  privacyExportKeys({
    PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION: "v1",
    PRIVACY_EXPORT_ENCRYPTION_KEYS: JSON.stringify({
      v1: randomBytes(32).toString("base64url"),
    }),
  });
const snapshot = () => ({
  schemaVersion: 1,
  jobId: randomUUID(),
  subjectKind: "customer_account" as const,
  subjectReference: randomUUID(),
  dbSnapshotAt: "2026-08-26T10:00:00.000Z",
  policyVersion: 1,
  policyHash: "a".repeat(64),
  account: { preferredLocale: "de", email: "safe@example.test" },
  site: { id: "site-a" },
  businessIdentity: [],
  appointments: [{ id: "one", customerName: "=2+2", note: "../unsafe" }],
  subscription: null,
  contractAcceptances: [],
  usage: {},
  aiRuns: [],
  audit: [],
  editorial: {},
  integrations: [],
  domains: {},
  media: {
    databaseFiles: [
      {
        id: "media",
        filename: "../../escape.webp",
        contentType: "image/webp",
        dataBase64: Buffer.from("safe").toString("base64"),
      },
    ],
    editorial: [],
  },
});

describe("privacy export archive, encryption and store", () => {
  it("builds a deterministic bounded ZIP with fixed paths and formula-safe CSV", () => {
    const input = snapshot();
    const first = buildPrivacyArchive(input),
      second = buildPrivacyArchive(input);
    expect(first.fileCount).toBeGreaterThan(10);
    expect(first.bytes).toEqual(second.bytes);
    expect(appointmentsCsv([{ customerName: "=cmd", note: "@sum" }])).toContain(
      '"\'=cmd"',
    );
    expect(
      Buffer.from(first.bytes).includes(Buffer.from("../../escape.webp")),
    ).toBe(false);
  });
  it("uses random nonces and rejects ciphertext, tag, key-version and key tampering", () => {
    const config = keys(),
      plain = buildPrivacyArchive(snapshot()).bytes;
    const left = encryptPrivacyArchive(plain, config),
      right = encryptPrivacyArchive(plain, config);
    expect(left.bytes).not.toEqual(right.bytes);
    expect(
      decryptPrivacyArchive(
        left.bytes,
        {
          keyVersion: left.keyVersion,
          ciphertextChecksum: left.ciphertextChecksum,
          plaintextChecksum: left.plaintextChecksum,
          archiveBytes: plain.byteLength,
        },
        config,
      ),
    ).toEqual(plain);
    const tampered = left.bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    expect(() =>
      decryptPrivacyArchive(
        tampered,
        {
          keyVersion: left.keyVersion,
          ciphertextChecksum: sha256(tampered),
          plaintextChecksum: left.plaintextChecksum,
          archiveBytes: plain.byteLength,
        },
        config,
      ),
    ).toThrow("artifact_integrity_failed");
    expect(() =>
      decryptPrivacyArchive(
        left.bytes,
        {
          keyVersion: "v2",
          ciphertextChecksum: left.ciphertextChecksum,
          plaintextChecksum: left.plaintextChecksum,
          archiveBytes: plain.byteLength,
        },
        config,
      ),
    ).toThrow("artifact_key_version_mismatch");
  });
  it("validates keys strictly and keeps the memory adapter private and delete-idempotent", async () => {
    expect(() =>
      privacyExportKeys({
        PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION: "v1",
        PRIVACY_EXPORT_ENCRYPTION_KEYS: '{"v1":"short"}',
      }),
    ).toThrow();
    const store = new MemoryPrivacyArtifactStore(),
      target = binding();
    await store.create(target, new Uint8Array([1, 2]));
    expect(store.privateOnly).toBe(true);
    expect(await store.read(target, 2)).toEqual(new Uint8Array([1, 2]));
    await expect(store.create(target, new Uint8Array())).rejects.toThrow(
      "artifact_conflict",
    );
    await store.delete(target);
    await store.delete(target);
    await expect(store.read(target, 2)).rejects.toThrow("artifact_unavailable");
    expect(privacyArtifactBindingValid(target, store.authority)).toBe(true);
    await expect(
      store.read({ ...target, environmentIdentity: "other" }, 2),
    ).rejects.toThrow("authority_mismatch");
  });
  it("completes only after private storage and fails closed on storage errors", async () => {
    const data = snapshot(),
      config = keys(),
      environment = {
        PRIVACY_EXPORT_ENABLED: "true",
        PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION: config.activeVersion,
        PRIVACY_EXPORT_ENCRYPTION_KEYS: JSON.stringify({
          [config.activeVersion]: config.keys
            .get(config.activeVersion)!
            .toString("base64url"),
        }),
      };
    let completed = 0,
      failed = "";
    const repository = {
      claimExport: async () => data.jobId,
      exportSnapshot: async () => data,
      completeExport: async () => {
        completed++;
        return true;
      },
      reserveExport: async () => true,
      recoverStuckExports: async () => 0,
      markArtifactDeleted: async () => true,
      failExport: async (_job: string, _worker: string, code: string) => {
        failed = code;
        return true;
      },
    };
    expect(
      (
        await runPrivacyExportWorker({
          repository,
          store: new MemoryPrivacyArtifactStore(),
          workerReference: "test-worker",
          environment,
        })
      ).completed,
    ).toBe(true);
    expect(completed).toBe(1);
    const broken = {
      adapter: "memory_test" as const,
      privateOnly: true as const,
      authority: new MemoryPrivacyArtifactStore().authority,
      create: async () => {
        throw new Error("store down");
      },
      read: async () => new Uint8Array(),
      delete: async () => {},
    };
    completed = 0;
    expect(
      (
        await runPrivacyExportWorker({
          repository,
          store: broken,
          workerReference: "test-worker",
          environment,
        })
      ).completed,
    ).toBe(false);
    expect(completed).toBe(0);
    expect(failed).toBe("artifact_store_failed");
  });
  it("keeps a durable reservation discoverable when provider cleanup is uncertain", async () => {
    const data = snapshot(),
      config = keys();
    let reservedArtifact = "",
      deleteFailures = 0;
    const result = await runPrivacyExportWorker({
      repository: {
        claimExport: async () => data.jobId,
        exportSnapshot: async () => data,
        reserveExport: async (input) => {
          reservedArtifact = input.artifactId;
          return true;
        },
        completeExport: async () => false,
        failExport: async () => true,
        recoverStuckExports: async () => 0,
        markArtifactDeleted: async (_id, deleted) => {
          if (!deleted) deleteFailures++;
          return true;
        },
      },
      store: {
        adapter: "memory_test",
        privateOnly: true,
        authority: new MemoryPrivacyArtifactStore().authority,
        create: async () => undefined,
        read: async () => new Uint8Array(),
        delete: async () => {
          throw new Error("provider transport uncertain");
        },
      },
      workerReference: "test-worker",
      environment: {
        PRIVACY_EXPORT_ENABLED: "true",
        PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION: config.activeVersion,
        PRIVACY_EXPORT_ENCRYPTION_KEYS: JSON.stringify({
          [config.activeVersion]: config.keys
            .get(config.activeVersion)!
            .toString("base64url"),
        }),
      },
    });
    expect(reservedArtifact).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toMatchObject({
      completed: false,
      errorCode: "artifact_persistence_uncertain",
      cleanupFailed: true,
    });
    expect(deleteFailures).toBe(1);
  });
  it("records cleanup only after idempotent object deletion", async () => {
    const calls: Array<[string, boolean]> = [],
      store = new MemoryPrivacyArtifactStore(),
      target = binding();
    await store.create(target, new Uint8Array([1]));
    const result = await cleanupPrivacyExportArtifacts({
      repository: {
        expiredArtifacts: async () => [target],
        markArtifactDeleted: async (id, deleted) => {
          calls.push([id, deleted]);
          return true;
        },
      },
      store,
    });
    expect(result).toEqual({
      scanned: 1,
      deleted: 1,
      failed: 0,
      securityFailed: 0,
    });
    expect(calls).toEqual([[target.artifactId, true]]);
  });
  it("records bounded synthetic archive/encryption throughput", () => {
    const input = snapshot();
    input.media.databaseFiles = [
      {
        id: "large",
        filename: "synthetic.bin",
        contentType: "application/octet-stream",
        dataBase64: Buffer.alloc(5 * 1024 * 1024, 7).toString("base64"),
      },
    ];
    const before = process.memoryUsage().rss,
      start = performance.now(),
      archive = buildPrivacyArchive(input),
      config = keys(),
      encrypted = encryptPrivacyArchive(archive.bytes, config),
      plain = decryptPrivacyArchive(
        encrypted.bytes,
        {
          keyVersion: encrypted.keyVersion,
          ciphertextChecksum: encrypted.ciphertextChecksum,
          plaintextChecksum: encrypted.plaintextChecksum,
          archiveBytes: archive.bytes.byteLength,
        },
        config,
      ),
      elapsed = performance.now() - start,
      rssDelta = Math.max(0, process.memoryUsage().rss - before);
    expect(plain.byteLength).toBe(archive.bytes.byteLength);
    expect(archive.bytes.byteLength).toBeLessThanOrEqual(100 * 1024 * 1024);
    console.log("B2 synthetic 5 MiB archive/encryption evidence", {
      elapsedMs: Number(elapsed.toFixed(2)),
      archiveBytes: archive.bytes.byteLength,
      encryptedBytes: encrypted.bytes.byteLength,
      rssDeltaBytes: rssDelta,
    });
  });
});
