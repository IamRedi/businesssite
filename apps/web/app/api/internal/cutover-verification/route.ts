import { NextResponse } from "next/server";
import { attestRuntimeDatabase } from "@platform/database";
import { canonicalRuntimeTarget, canonicalRuntimeFingerprint, cutoverRequestAuthorized, cutoverSafeFlags } from "../../../../lib/cutover-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
let inFlight = false;

export async function POST(request: Request) {
  if (!cutoverRequestAuthorized(request)) return NextResponse.json({ error: "Not found." }, { status: 404, headers });
  if (inFlight) return NextResponse.json({ error: "Verification busy." }, { status: 409, headers });
  inFlight = true;
  try {
    const flags = cutoverSafeFlags();
    const actors = await attestRuntimeDatabase(canonicalRuntimeTarget);
    return NextResponse.json({ status: "verified", scope: "deployed_process", deploymentHost: process.env.VERCEL_URL,
      fingerprint: canonicalRuntimeFingerprint(), actors, flags }, { headers });
  } catch {
    // Errors can contain DB passwords, hostnames or provider diagnostics. None
    // are reflected in responses, console output, telemetry, or audit records.
    return NextResponse.json({ error: "Runtime verification failed." }, { status: 503, headers });
  } finally { inFlight = false; }
}
