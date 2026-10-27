import { NextResponse } from "next/server";
import {
  PostgresPrivacyRepository,
  PostgresSiteRepository,
  privacyExportExecutionEnabled,
} from "@platform/site-data";
import { enforceSubjectRateLimit } from "../../../../../../lib/rate-limit";
import { readUrlEncodedBody } from "../../../../../../lib/request-body";
import { isSameOriginRequest } from "../../../../../../lib/same-origin";
import {
  passwordMatches,
  requireSiteAdmin,
  trustedSiteAdminSessionHash,
} from "../../../../../../lib/site-admin-auth";
import { exportCorrelationId } from "../../../../../../lib/privacy-export-http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!privacyExportExecutionEnabled())
    return NextResponse.json(
      { error: "Privacy export is unavailable." },
      { status: 503 },
    );
  if (!isSameOriginRequest(request))
    return NextResponse.json(
      { error: "Export request denied." },
      { status: 403 },
    );
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session)
    return NextResponse.json(
      { error: "Export request denied." },
      { status: 403 },
    );
  const parsed = await readUrlEncodedBody(request, 4096);
  if (!parsed.ok)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const current = String(parsed.value.get("currentPassword") ?? "").slice(
    0,
    200,
  );
  const limit = await enforceSubjectRateLimit(
    "privacy_export_customer",
    session.accountId,
    3,
    3600,
  );
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Export request cooldown is active." },
      { status: 429 },
    );
  const site = new PostgresSiteRepository({
    boundary: "site_admin",
    sessionHash: trustedSiteAdminSessionHash(session),
  });
  const account = await site.getAdminByEmail(session.email);
  if (
    !account ||
    account.id !== session.accountId ||
    !(await passwordMatches(current, account.passwordHash))
  )
    return NextResponse.json(
      { error: "Current password is invalid." },
      { status: 403 },
    );
  const result = await new PostgresPrivacyRepository({
    boundary: "runtime",
  }).requestCustomerExport(
    trustedSiteAdminSessionHash(session),
    account.passwordHash,
    exportCorrelationId(request),
  );
  return NextResponse.json(result, {
    status: result.ok ? 202 : 409,
    headers: { "cache-control": "private, no-store" },
  });
}
