import { NextResponse } from "next/server";
import {
  PostgresPrivacyRepository,
  PostgresSiteRepository,
} from "@platform/site-data";
import { readUrlEncodedBody } from "../../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../../lib/same-origin";
import {
  passwordMatches,
  requireSiteAdmin,
  trustedSiteAdminSessionHash,
} from "../../../../../../lib/site-admin-auth";
import {
  exportCapabilityHash,
  exportCapabilityToken,
  exportCorrelationId,
  validExportJob,
} from "../../../../../../lib/privacy-export-http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(request))
    return NextResponse.json({ error: "Capability denied." }, { status: 403 });
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session)
    return NextResponse.json({ error: "Capability denied." }, { status: 403 });
  const parsed = await readUrlEncodedBody(request, 4096);
  if (!parsed.ok)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const jobId = String(parsed.value.get("jobId") ?? "");
  const current = String(parsed.value.get("currentPassword") ?? "").slice(
    0,
    200,
  );
  if (!validExportJob(jobId))
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const sites = new PostgresSiteRepository({
    boundary: "site_admin",
    sessionHash: trustedSiteAdminSessionHash(session),
  });
  const account = await sites.getAdminByEmail(session.email);
  if (
    !account ||
    account.id !== session.accountId ||
    !(await passwordMatches(current, account.passwordHash))
  )
    return NextResponse.json(
      { error: "Fresh authentication denied." },
      { status: 403 },
    );
  const token = exportCapabilityToken();
  const result = await new PostgresPrivacyRepository({
    boundary: "runtime",
  }).issueCustomerCapability(
    trustedSiteAdminSessionHash(session),
    account.passwordHash,
    jobId,
    exportCapabilityHash(token),
    exportCorrelationId(request),
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
