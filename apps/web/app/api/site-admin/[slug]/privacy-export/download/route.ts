import { NextResponse } from "next/server";
import { PostgresPrivacyRepository } from "@platform/site-data";
import { readUrlEncodedBody } from "../../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../../lib/same-origin";
import {
  requireSiteAdmin,
  trustedSiteAdminSessionHash,
} from "../../../../../../lib/site-admin-auth";
import {
  exportCapabilityHash,
  privacyDownloadResponse,
  validExportToken,
} from "../../../../../../lib/privacy-export-http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Download denied." }, { status: 403 });
  if (request.headers.has("range"))
    return new NextResponse(null, {
      status: 416,
      headers: { "cache-control": "private, no-store" },
    });
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session)
    return NextResponse.json({ error: "Download denied." }, { status: 403 });
  const parsed = await readUrlEncodedBody(request, 1024);
  const token = parsed.ok ? parsed.value.get("token") : null;
  if (!validExportToken(token))
    return NextResponse.json({ error: "Download denied." }, { status: 403 });
  const repository = new PostgresPrivacyRepository({
    boundary: "runtime",
  });
  const sessionHash = trustedSiteAdminSessionHash(session);
  const descriptor = await repository.consumeCustomerCapability(
    sessionHash,
    exportCapabilityHash(token),
  );
  return privacyDownloadResponse(request, descriptor, (jobId, success) =>
    repository.recordCustomerDownload(sessionHash, jobId, success),
  );
}
