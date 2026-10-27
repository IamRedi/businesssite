import { NextResponse } from "next/server";
import {
  DeterministicFakeProviderCleanupAdapter,
  PostgresPrivacyRepository,
  privacyDeletionExecutionEnabled,
  providerCleanupWorkerEnabled,
  runProviderCleanupDeletionWorker,
} from "@platform/site-data";
import {
  PlatformProviderCleanupAdapter,
  providerCleanupAdapterConfigured,
  providerCleanupProductionTarget,
} from "../../../../lib/provider-cleanup-adapters";
const authorized = (request: Request) =>
  Boolean(
    process.env.CRON_SECRET &&
    request.headers.get("authorization") ===
      `Bearer ${process.env.CRON_SECRET}`,
  );
export async function POST(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!privacyDeletionExecutionEnabled() || !providerCleanupWorkerEnabled())
    return NextResponse.json(
      { enabled: false, action: "none" },
      { status: 503 },
    );
  if (providerCleanupProductionTarget())
    return NextResponse.json(
      { error: "No production deletion provider is configured." },
      { status: 503 },
    );
  const adapter = process.env.PRIVACY_PROVIDER_CLEANUP_ADAPTER?.trim() === "platform_v1"
    ? new PlatformProviderCleanupAdapter()
    : new DeterministicFakeProviderCleanupAdapter({}, process.env);
  if (!providerCleanupAdapterConfigured())
    return NextResponse.json({ error: "Provider cleanup adapter is not configured." }, { status: 503 });
  const result = await runProviderCleanupDeletionWorker({
    repository: new PostgresPrivacyRepository({ boundary: "system" }),
    adapter,
    workerReference: `privacy-deletion-${Date.now()}`,
  });
  return NextResponse.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
