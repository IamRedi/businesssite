import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { strToU8, zipSync, type Zippable } from "fflate";

export const PRIVACY_EXPORT_SCHEMA_VERSION = 1;
export const PRIVACY_EXPORT_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const PRIVACY_EXPORT_MAX_FILES = 500;
const MAGIC = Buffer.from("BSRCPX01", "ascii");
const FIXED_MTIME = new Date("1980-01-01T00:00:00.000Z");

export type PrivacyExportSnapshot = Record<string, unknown> & {
  schemaVersion: number;
  jobId: string;
  subjectKind: "customer_account" | "owner_account";
  subjectReference: string;
  dbSnapshotAt: string;
  policyVersion: number;
  policyHash: string;
};
export type PrivacyArchive = {
  bytes: Uint8Array;
  checksum: string;
  fileCount: number;
  manifest: Record<string, unknown>;
};
export type PrivacyEncryptionKeys = {
  activeVersion: string;
  keys: ReadonlyMap<string, Buffer>;
};

export type PrivacyArtifactAuthority = {
  provider: "memory_test" | "vercel_blob";
  storeAuthority: string;
  environmentIdentity: string;
};
export type PrivacyArtifactBinding = PrivacyArtifactAuthority & {
  artifactId: string;
  jobId: string;
  objectKey: string;
};

export interface PrivacyArtifactStore {
  readonly adapter: "memory_test" | "vercel_blob_private";
  readonly privateOnly: true;
  readonly authority: PrivacyArtifactAuthority;
  create(binding: PrivacyArtifactBinding, bytes: Uint8Array): Promise<void>;
  read(
    binding: PrivacyArtifactBinding,
    maximumBytes: number,
  ): Promise<Uint8Array>;
  delete(binding: PrivacyArtifactBinding): Promise<void>;
}

export class MemoryPrivacyArtifactStore implements PrivacyArtifactStore {
  readonly adapter = "memory_test" as const;
  readonly privateOnly = true as const;
  readonly authority: PrivacyArtifactAuthority;
  private readonly objects = new Map<string, Uint8Array>();
  constructor(environmentIdentity = "local") {
    this.authority = {
      provider: "memory_test",
      storeAuthority: "memory_test",
      environmentIdentity,
    };
  }
  async create(binding: PrivacyArtifactBinding, bytes: Uint8Array) {
    this.assertBinding(binding);
    if (this.objects.has(binding.objectKey))
      throw new Error("artifact_conflict");
    this.objects.set(binding.objectKey, bytes.slice());
  }
  async read(binding: PrivacyArtifactBinding, maximumBytes: number) {
    this.assertBinding(binding);
    const value = this.objects.get(binding.objectKey);
    if (!value) throw new Error("artifact_unavailable");
    if (value.byteLength > maximumBytes) throw new Error("artifact_too_large");
    return value.slice();
  }
  async delete(binding: PrivacyArtifactBinding) {
    this.assertBinding(binding);
    this.objects.delete(binding.objectKey);
  }
  has(key: string) {
    return this.objects.has(key);
  }
  private assertBinding(binding: PrivacyArtifactBinding) {
    if (!privacyArtifactBindingValid(binding, this.authority))
      throw new Error("privacy_export_authority_mismatch");
  }
}

export const sha256 = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const privacyExportEnvironmentIdentityValid = (value: string) =>
  /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
export const privacyExportObjectKey = (
  environmentIdentity = "local",
  id = randomUUID(),
) => {
  if (
    !privacyExportEnvironmentIdentityValid(environmentIdentity) ||
    !/^[0-9a-f-]{36}$/i.test(id)
  )
    throw new Error("privacy_export_binding_invalid");
  return `privacy-exports/${environmentIdentity}/${randomBytes(2).toString("hex")}/${id}.enc`;
};
export function privacyArtifactBindingValid(
  binding: PrivacyArtifactBinding,
  expected: PrivacyArtifactAuthority,
) {
  return (
    binding.provider === expected.provider &&
    binding.storeAuthority === expected.storeAuthority &&
    binding.environmentIdentity === expected.environmentIdentity &&
    privacyExportEnvironmentIdentityValid(binding.environmentIdentity) &&
    /^[0-9a-f-]{36}$/i.test(binding.artifactId) &&
    /^[0-9a-f-]{36}$/i.test(binding.jobId) &&
    new RegExp(
      `^privacy-exports/${binding.environmentIdentity}/[a-f0-9]{4}/${binding.artifactId}\\.enc$`,
    ).test(binding.objectKey)
  );
}

export function privacyExportKeys(
  environment: Record<string, string | undefined> = process.env,
): PrivacyEncryptionKeys {
  const activeVersion =
    environment.PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION?.trim() ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(environment.PRIVACY_EXPORT_ENCRYPTION_KEYS?.trim() ?? "");
  } catch {
    throw new Error("privacy_export_key_config_invalid");
  }
  if (
    !activeVersion ||
    !/^[A-Za-z0-9._-]{1,40}$/.test(activeVersion) ||
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  )
    throw new Error("privacy_export_key_config_invalid");
  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(version) || typeof encoded !== "string")
      throw new Error("privacy_export_key_config_invalid");
    const key = Buffer.from(encoded, "base64url");
    if (
      key.byteLength !== 32 ||
      key.toString("base64url") !== encoded.replace(/=+$/, "")
    )
      throw new Error("privacy_export_key_config_invalid");
    keys.set(version, key);
  }
  if (!keys.has(activeVersion))
    throw new Error("privacy_export_key_version_unavailable");
  return { activeVersion, keys };
}

function json(value: unknown) {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}
function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function appointmentsCsv(rows: unknown) {
  const values = Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> =>
        Boolean(row && typeof row === "object" && !Array.isArray(row)),
      )
    : [];
  const columns = [
    "id",
    "customerName",
    "phone",
    "email",
    "serviceTitle",
    "serviceId",
    "version",
    "preferredDate",
    "preferredTime",
    "note",
    "customerMessage",
    "status",
    "createdAt",
    "updatedAt",
  ];
  return `${columns.join(",")}\r\n${values.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}\r\n`;
}

export function buildPrivacyArchive(
  snapshot: PrivacyExportSnapshot,
): PrivacyArchive {
  if (
    snapshot.schemaVersion !== PRIVACY_EXPORT_SCHEMA_VERSION ||
    !/^[0-9a-f-]{36}$/i.test(snapshot.jobId)
  )
    throw new Error("archive_snapshot_invalid");
  const files = new Map<string, Uint8Array>();
  const add = (path: string, value: unknown) => {
    if (
      !/^[a-z0-9][a-z0-9._/-]{0,159}$/i.test(path) ||
      path.includes("..") ||
      path.startsWith("/") ||
      files.has(path)
    )
      throw new Error("archive_path_invalid");
    files.set(path, value instanceof Uint8Array ? value : json(value));
  };
  const customer = snapshot.subjectKind === "customer_account";
  const included: string[] = [];
  if (customer) {
    for (const [path, key] of [
      ["account.json", "account"],
      ["site.json", "site"],
      ["business-identity.json", "businessIdentity"],
      ["appointments.json", "appointments"],
      ["subscription.json", "subscription"],
      ["contract-acceptances.json", "contractAcceptances"],
      ["usage.json", "usage"],
      ["ai-runs.json", "aiRuns"],
      ["audit.json", "audit"],
      ["editorial.json", "editorial"],
      ["integrations.json", "integrations"],
      ["domains.json", "domains"],
    ] as const) {
      add(path, snapshot[key]);
      included.push(key);
    }
    add("appointments.csv", strToU8(appointmentsCsv(snapshot.appointments)));
    const media = (
      snapshot.media && typeof snapshot.media === "object" ? snapshot.media : {}
    ) as Record<string, unknown>;
    const databaseFiles = Array.isArray(media.databaseFiles)
      ? media.databaseFiles
      : [];
    const safeMedia = databaseFiles.map((entry, index) => {
      const row =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      const encoded = typeof row.dataBase64 === "string" ? row.dataBase64 : "";
      const bytes = Buffer.from(encoded, "base64");
      const path = `media/files/${String(index + 1).padStart(4, "0")}.bin`;
      add(path, bytes);
      const {
        dataBase64: _removed,
        filename: _untrustedFilename,
        ...metadata
      } = row;
      return {
        ...metadata,
        filename: `media-${String(index + 1).padStart(4, "0")}.bin`,
        archivePath: path,
        checksum: sha256(bytes),
      };
    });
    add("media/manifest.json", {
      ...(media as object),
      databaseFiles: safeMedia,
    });
    included.push("media");
  } else {
    for (const [path, key] of [
      ["owner/account.json", "owner"],
      ["owner/sessions.json", "sessions"],
      ["owner/invitations.json", "invitations"],
      ["owner/auth-audit.json", "authAudit"],
      ["owner/legal-actions.json", "legalActions"],
      ["owner/privacy-receipts.json", "privacyReceipts"],
    ] as const) {
      add(path, snapshot[key]);
      included.push(key);
    }
  }
  const checksums =
    [...files]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, bytes]) => `${sha256(bytes)}  ${path}`)
      .join("\n") + "\n";
  add("checksums.sha256", strToU8(checksums));
  const manifest = {
    schemaVersion: 1,
    jobId: snapshot.jobId,
    policyVersion: snapshot.policyVersion,
    policyHash: snapshot.policyHash,
    subject: {
      kind: snapshot.subjectKind,
      reference: snapshot.subjectReference,
    },
    generatedAt: snapshot.dbSnapshotAt,
    dbSnapshotAt: snapshot.dbSnapshotAt,
    locale: customer
      ? ((snapshot.account as Record<string, unknown> | undefined)
          ?.preferredLocale ?? "en")
      : "en",
    includedClasses: included,
    omittedClasses: customer
      ? [
          {
            class: "external_provider_media_files",
            reasonCode: "provider_copy_unavailable",
          },
        ]
      : [{ class: "customer_datasets", reasonCode: "owner_self_export_only" }],
    artifactExpiresAfterHours: 24,
    fileCount: files.size + 1,
  };
  add("manifest.json", manifest);
  if (files.size > PRIVACY_EXPORT_MAX_FILES)
    throw new Error("archive_file_limit");
  const totalInput = [...files.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  if (totalInput > PRIVACY_EXPORT_MAX_ARCHIVE_BYTES)
    throw new Error("archive_byte_limit");
  const zippable: Zippable = {};
  for (const [path, bytes] of [...files].sort(([left], [right]) =>
    left.localeCompare(right),
  ))
    zippable[path] = [bytes, { level: 0, mtime: FIXED_MTIME }];
  const bytes = zipSync(zippable);
  if (bytes.byteLength > PRIVACY_EXPORT_MAX_ARCHIVE_BYTES)
    throw new Error("archive_byte_limit");
  return { bytes, checksum: sha256(bytes), fileCount: files.size, manifest };
}

export function encryptPrivacyArchive(
  plain: Uint8Array,
  config: PrivacyEncryptionKeys,
) {
  const key = config.keys.get(config.activeVersion);
  if (!key) throw new Error("privacy_export_key_version_unavailable");
  const nonce = randomBytes(12);
  const version = Buffer.from(config.activeVersion, "utf8");
  if (version.byteLength > 40)
    throw new Error("privacy_export_key_config_invalid");
  const aad = Buffer.concat([
    MAGIC,
    Buffer.from([version.byteLength]),
    version,
  ]);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const bytes = Buffer.concat([aad, nonce, tag, encrypted]);
  return {
    bytes: new Uint8Array(bytes),
    keyVersion: config.activeVersion,
    ciphertextChecksum: sha256(bytes),
    plaintextChecksum: sha256(plain),
  };
}
export function decryptPrivacyArchive(
  encrypted: Uint8Array,
  expected: {
    keyVersion: string;
    ciphertextChecksum: string;
    plaintextChecksum: string;
    archiveBytes: number;
  },
  config: PrivacyEncryptionKeys,
) {
  const bytes = Buffer.from(encrypted);
  if (
    bytes.byteLength < 37 ||
    !timingSafeEqual(bytes.subarray(0, 8), MAGIC) ||
    sha256(bytes) !== expected.ciphertextChecksum
  )
    throw new Error("artifact_integrity_failed");
  const length = bytes[8];
  const version = bytes.subarray(9, 9 + length).toString("utf8");
  if (version !== expected.keyVersion)
    throw new Error("artifact_key_version_mismatch");
  const key = config.keys.get(version);
  if (!key) throw new Error("artifact_key_unavailable");
  const aad = bytes.subarray(0, 9 + length),
    nonce = bytes.subarray(9 + length, 21 + length),
    tag = bytes.subarray(21 + length, 37 + length),
    body = bytes.subarray(37 + length);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    if (
      plain.byteLength !== expected.archiveBytes ||
      sha256(plain) !== expected.plaintextChecksum
    )
      throw new Error("artifact_integrity_failed");
    return new Uint8Array(plain);
  } catch (error) {
    if (error instanceof Error && error.message === "artifact_integrity_failed")
      throw error;
    throw new Error("artifact_integrity_failed");
  }
}
