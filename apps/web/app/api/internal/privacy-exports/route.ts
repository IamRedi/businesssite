import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  cleanupPrivacyExportArtifacts,
  PostgresPrivacyRepository,
  privacyExportExecutionEnabled,
  runPrivacyExportWorker,
} from "@platform/site-data";
import { configuredPrivacyArtifactStore } from "../../../../lib/privacy-artifact-store";
import { reportOperationalSignal } from "../../../../lib/operational-errors";
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!privacyExportExecutionEnabled())
    return NextResponse.json({
      enabled: false,
      cleanup: null,
      exportJob: null,
    });
  try {
    const repository = new PostgresPrivacyRepository({ boundary: "system" });
    const store = configuredPrivacyArtifactStore();
    const cleanup = await cleanupPrivacyExportArtifacts({
      repository,
      store,
      limit: 25,
    });
    const exportJob = await runPrivacyExportWorker({
      repository,
      store,
      workerReference: `export-${randomUUID()}`,
      environment: process.env,
    });
    if (cleanup.failed > 0)
      await reportOperationalSignal({
        code: "privacy_export_cleanup_failed",
        severity: "critical",
        count: cleanup.failed,
      });
    if (cleanup.securityFailed > 0)
      await reportOperationalSignal({
        code: "privacy_export_security_invariant_violation",
        severity: "critical",
        count: cleanup.securityFailed,
      });
    if ((exportJob.recoveredStuck ?? 0) > 0)
      await reportOperationalSignal({
        code: "privacy_export_stuck",
        severity: "critical",
        count: exportJob.recoveredStuck ?? 0,
      });
    if (exportJob.errorCode)
      await reportOperationalSignal({
        code:
          exportJob.errorCode === "artifact_store_failed"
            ? "privacy_export_storage_failed"
            : exportJob.errorCode === "artifact_persistence_uncertain"
              ? "privacy_export_persistence_uncertain"
              : "privacy_export_generation_failed",
        severity: "critical",
        count: 1,
      });
    if (exportJob.cleanupFailed)
      await reportOperationalSignal({
        code: "privacy_export_cleanup_failed",
        severity: "critical",
        count: 1,
      });
    return NextResponse.json({ cleanup, exportJob });
  } catch {
    await reportOperationalSignal({
      code: "privacy_export_generation_failed",
      severity: "critical",
      count: 1,
    });
    return NextResponse.json(
      { error: "Privacy export worker is not configured." },
      { status: 503 },
    );
  }
}
