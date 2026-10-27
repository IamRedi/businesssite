import { NextResponse } from "next/server";
import { PostgresPrivacyRepository } from "@platform/site-data";
import { authorizeOwnerRequest } from "../../../../../lib/owner-authorization";
import {
  exportCapabilityHash,
  privacyDownloadResponse,
  validExportToken,
} from "../../../../../lib/privacy-export-http";
import { readUrlEncodedBody } from "../../../../../lib/request-body";
export async function POST(request: Request) {
  const auth = await authorizeOwnerRequest(request, "security.self");
  if (!auth.ok) return auth.response;
  if (request.headers.has("range"))
    return new NextResponse(null, {
      status: 416,
      headers: { "cache-control": "private, no-store" },
    });
  const parsed = await readUrlEncodedBody(request, 1024);
  const token = parsed.ok ? parsed.value.get("token") : null;
  if (!validExportToken(token))
    return NextResponse.json({ error: "Download denied." }, { status: 403 });
  const repository = new PostgresPrivacyRepository({
    boundary: "owner",
    sessionHash: auth.owner.sessionHash,
  });
  const descriptor = await repository.consumeOwnerCapability(
    exportCapabilityHash(token),
  );
  return privacyDownloadResponse(request, descriptor, (jobId, success) =>
    repository.recordOwnerDownload(jobId, success),
  );
}
