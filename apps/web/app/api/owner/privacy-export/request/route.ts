import { NextResponse } from "next/server";
import {
  PostgresPrivacyRepository,
  privacyExportExecutionEnabled,
} from "@platform/site-data";
import {
  authorizeOwnerRequest,
  freshOwnerCredentials,
} from "../../../../../lib/owner-authorization";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
export async function POST(request: Request) {
  if (!privacyExportExecutionEnabled())
    return NextResponse.json(
      { error: "Privacy export is unavailable." },
      { status: 503 },
    );
  const auth = await authorizeOwnerRequest(request, "security.self");
  if (!auth.ok) return auth.response;
  const parsed = await readUrlEncodedBody(request, 4096);
  if (!parsed.ok)
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
  const result = await new PostgresPrivacyRepository({
    boundary: "owner",
    sessionHash: auth.owner.sessionHash,
  }).requestOwnerSelfExport({
    ...fresh,
    correlationId: auth.owner.correlationId,
  });
  return NextResponse.json(result, {
    status: result.ok ? 202 : 409,
    headers: { "cache-control": "private, no-store" },
  });
}
