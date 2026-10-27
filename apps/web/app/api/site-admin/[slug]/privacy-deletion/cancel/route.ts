import { NextResponse } from "next/server";
import {
  PostgresPrivacyRepository,
  PostgresSiteRepository,
  privacyDeletionRequestsEnabled,
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
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const denied = (status = 403) =>
  NextResponse.json(
    { error: "Deletion cancellation denied." },
    { status, headers: { "cache-control": "private, no-store" } },
  );
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!privacyDeletionRequestsEnabled()) return denied(503);
  if (!isSameOriginRequest(request)) return denied();
  const { slug } = await params;
  const session = await requireSiteAdmin(slug);
  if (!session) return denied();
  const parsed = await readUrlEncodedBody(request, 4096);
  if (!parsed.ok) return denied(400);
  const jobId = String(parsed.value.get("jobId") ?? "");
  const current = String(parsed.value.get("currentPassword") ?? "").slice(
    0,
    200,
  );
  if (!uuid.test(jobId)) return denied(400);
  const limit = await enforceSubjectRateLimit(
    "privacy_deletion_cancel",
    session.accountId,
    3,
    3600,
  );
  if (!limit.allowed) return denied(429);
  const hash = trustedSiteAdminSessionHash(session);
  const account = await new PostgresSiteRepository({
    boundary: "site_admin",
    sessionHash: hash,
  }).getAdminByEmail(session.email);
  if (
    !account ||
    account.id !== session.accountId ||
    !(await passwordMatches(current, account.passwordHash))
  )
    return denied();
  const ok = await new PostgresPrivacyRepository({
    boundary: "runtime",
  }).cancelCustomerDeletion({
    sessionHash: hash,
    currentPasswordHash: account.passwordHash,
    jobId,
    correlationId: exportCorrelationId(request),
  });
  return NextResponse.json(
    { ok },
    {
      status: ok ? 200 : 409,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
