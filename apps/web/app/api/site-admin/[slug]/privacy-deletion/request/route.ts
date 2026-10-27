import { NextResponse } from "next/server";
import {
  customerDeletionReasons,
  PostgresPrivacyRepository,
  PostgresSiteRepository,
  privacyDeletionRequestsEnabled,
  type CustomerDeletionReason,
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

const denied = (status = 403) =>
  NextResponse.json(
    { error: "Deletion request denied." },
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
  const parsed = await readUrlEncodedBody(request, 8192);
  if (!parsed.ok) return denied(400);
  const reason = String(
    parsed.value.get("reason") ?? "",
  ) as CustomerDeletionReason;
  const note = String(parsed.value.get("note") ?? "").trim();
  const current = String(parsed.value.get("currentPassword") ?? "").slice(
    0,
    200,
  );
  if (
    !customerDeletionReasons.includes(reason) ||
    note.length > 500 ||
    parsed.value.get("acknowledge") !== "yes"
  )
    return denied(400);
  const limit = await enforceSubjectRateLimit(
    "privacy_deletion_customer",
    session.accountId,
    2,
    86400,
  );
  if (!limit.allowed) return denied(429);
  const hash = trustedSiteAdminSessionHash(session);
  const site = new PostgresSiteRepository({
    boundary: "site_admin",
    sessionHash: hash,
  });
  const account = await site.getAdminByEmail(session.email);
  if (
    !account ||
    account.id !== session.accountId ||
    !(await passwordMatches(current, account.passwordHash))
  )
    return denied();
  const result = await new PostgresPrivacyRepository({
    boundary: "runtime",
  }).requestCustomerDeletion({
    sessionHash: hash,
    currentPasswordHash: account.passwordHash,
    reason,
    note: note || undefined,
    acknowledged: true,
    correlationId: exportCorrelationId(request),
  });
  return NextResponse.json(result, {
    status: result.ok ? 202 : 409,
    headers: { "cache-control": "private, no-store" },
  });
}
