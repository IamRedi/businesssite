import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  decryptPrivacyArchive,
  privacyExportKeys,
  sha256,
  type PostgresPrivacyRepository,
} from "@platform/site-data";
import { configuredPrivacyArtifactStore } from "./privacy-artifact-store";
import { reportOperationalSignal } from "./operational-errors";

export const exportCapabilityToken = () =>
  randomBytes(32).toString("base64url");
export const exportCapabilityHash = (token: string) => sha256(token);
export const validExportToken = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
export const validExportJob = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
export const exportCorrelationId = (request: Request) =>
  request.headers.get("x-request-id")?.slice(0, 100) || randomUUID();

const safeDownloadFailureCode = (error: unknown) => {
  const code = error instanceof Error ? error.message : "unknown";
  return new Set([
    "artifact_unavailable",
    "artifact_integrity_failed",
    "artifact_key_version_mismatch",
    "artifact_key_unavailable",
    "privacy_export_authority_mismatch",
    "privacy_export_provider_identity_mismatch",
    "privacy_export_artifact_store_unconfigured",
    "privacy_export_key_config_invalid",
    "privacy_export_key_version_unavailable",
  ]).has(code)
    ? code
    : "artifact_verification_failed";
};

export async function privacyDownloadResponse(
  request: Request,
  descriptor: Awaited<
    ReturnType<PostgresPrivacyRepository["consumeCustomerCapability"]>
  >,
  recordResult: (jobId: string, success: boolean) => Promise<unknown>,
) {
  if (request.headers.has("range"))
    return new NextResponse(null, {
      status: 416,
      headers: { "cache-control": "private, no-store" },
    });
  if (!descriptor)
    return NextResponse.json(
      { error: "Export capability is unavailable." },
      { status: 403, headers: { "cache-control": "private, no-store" } },
    );
  try {
    const encrypted = await configuredPrivacyArtifactStore().read(
      descriptor,
      descriptor.encryptedBytes,
    );
    const archive = decryptPrivacyArchive(
      encrypted,
      {
        keyVersion: descriptor.keyVersion,
        ciphertextChecksum: descriptor.ciphertextChecksum,
        plaintextChecksum: descriptor.plaintextChecksum,
        archiveBytes: descriptor.archiveBytes,
      },
      privacyExportKeys(),
    );
    await recordResult(descriptor.jobId, true);
    return new NextResponse(archive, {
      headers: {
        "content-type": "application/zip",
        "content-disposition":
          'attachment; filename="businesssite-data-export.zip"',
        "content-length": String(archive.byteLength),
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        schema: "businesssite.privacy-export-download.v1",
        code: safeDownloadFailureCode(error),
      }),
    );
    try {
      await recordResult(descriptor.jobId, false);
    } catch {}
    await reportOperationalSignal({
      code:
        error instanceof Error &&
        /(authority|identity|binding)/.test(error.message)
          ? "privacy_export_security_invariant_violation"
          : "privacy_export_object_missing",
      severity: "critical",
      count: 1,
    });
    return NextResponse.json(
      { error: "Export artifact verification failed." },
      { status: 409, headers: { "cache-control": "private, no-store" } },
    );
  }
}
