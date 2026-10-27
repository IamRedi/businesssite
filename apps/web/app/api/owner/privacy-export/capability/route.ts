import { NextResponse } from "next/server";
import { PostgresPrivacyRepository } from "@platform/site-data";
import {
  authorizeOwnerRequest,
  freshOwnerCredentials,
} from "../../../../../lib/owner-authorization";
import {
  exportCapabilityHash,
  exportCapabilityToken,
  validExportJob,
} from "../../../../../lib/privacy-export-http";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
export async function POST(request: Request) {
  const auth = await authorizeOwnerRequest(request, "security.self");
  if (!auth.ok) return auth.response;
  const parsed = await readUrlEncodedBody(request, 4096);
  if (!parsed.ok)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const jobId = String(parsed.value.get("jobId") ?? "");
  if (!validExportJob(jobId))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const fresh = await freshOwnerCredentials(
    auth.owner,
    String(parsed.value.get("currentPassword") ?? "").slice(0, 200),
    String(parsed.value.get("code") ?? ""),
  );
  if (!fresh)
    return NextResponse.json(
      { error: "Fresh authentication denied." },
      { status: 403 },
    );
  const token = exportCapabilityToken();
  const result = await new PostgresPrivacyRepository({
    boundary: "owner",
    sessionHash: auth.owner.sessionHash,
  }).issueOwnerCapability(
    { ...fresh, correlationId: auth.owner.correlationId },
    jobId,
    exportCapabilityHash(token),
  );
  return result.ok
    ? NextResponse.json(
        { token },
        { headers: { "cache-control": "private, no-store" } },
      )
    : NextResponse.json(
        { error: "Capability unavailable." },
        { status: 409, headers: { "cache-control": "private, no-store" } },
      );
}
