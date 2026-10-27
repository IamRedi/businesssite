import { NextResponse } from "next/server";
import {
  PostgresPrivacyRepository,
  privacyDataClasses,
  privacyHoldReasons,
  privacySubjectKinds,
  type PrivacyDataClass,
  type PrivacyHoldReason,
  type PrivacySubjectKind,
} from "@platform/site-data";
import {
  authorizeOwnerRequest,
  freshOwnerCredentials,
} from "../../../../lib/owner-authorization";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ref = /^[A-Za-z0-9._:-]{1,160}$/;
const redirect = (request: Request, result: string) =>
  NextResponse.redirect(
    new URL(`/owner/privacy?result=${encodeURIComponent(result)}`, request.url),
    303,
  );

export async function POST(request: Request) {
  const authorization = await authorizeOwnerRequest(request, "privacy.manage");
  if (!authorization.ok) return authorization.response;
  const raw = await request.text();
  if (raw.length > 16_384) return redirect(request, "invalid_input");
  const body = new URLSearchParams(raw);
  const action = body.get("action");
  const fresh = await freshOwnerCredentials(
    authorization.owner,
    body.get("currentPassword") ?? "",
    body.get("code") ?? "",
  );
  if (!fresh) return redirect(request, "fresh_auth_denied");
  const actor = { ...fresh, correlationId: authorization.owner.correlationId };
  const repository = new PostgresPrivacyRepository({
    boundary: "owner",
    sessionHash: authorization.owner.sessionHash,
  });
  if (action === "dry_run") {
    const subjectKind = body.get("subjectKind") as PrivacySubjectKind;
    const subjectReference = body.get("subjectReference")?.trim() ?? "";
    if (
      !privacySubjectKinds.includes(subjectKind) ||
      !ref.test(subjectReference)
    )
      return redirect(request, "invalid_input");
    const result = await repository.startDryRun(
      actor,
      subjectKind,
      subjectReference,
    );
    return redirect(
      request,
      result.ok ? "dry_run_started" : (result.reason ?? "dry_run_denied"),
    );
  }
  if (action === "create_hold") {
    const subjectKind = body.get("subjectKind") as PrivacySubjectKind;
    const subjectReference = body.get("subjectReference")?.trim() ?? "";
    const reason = body.get("reason") as PrivacyHoldReason;
    const dataClasses = body.getAll("dataClass") as PrivacyDataClass[];
    const externalReference =
      body.get("externalReference")?.trim() || undefined;
    const rawEnds = body.get("endsAt")?.trim();
    const parsedEnds = rawEnds ? new Date(rawEnds) : undefined;
    const endsAt =
      parsedEnds && Number.isFinite(parsedEnds.getTime())
        ? parsedEnds.toISOString()
        : undefined;
    if (
      !privacySubjectKinds.includes(subjectKind) ||
      !ref.test(subjectReference) ||
      !privacyHoldReasons.includes(reason) ||
      dataClasses.some((key) => !privacyDataClasses.includes(key)) ||
      (externalReference &&
        !/^[A-Za-z0-9._:/-]{1,120}$/.test(externalReference)) ||
      (rawEnds && !endsAt)
    )
      return redirect(request, "invalid_input");
    const result = await repository.createHold(actor, {
      subjectKind,
      subjectReference,
      dataClasses,
      reason,
      externalReference,
      endsAt,
    });
    return redirect(
      request,
      result.ok ? "hold_created" : (result.reason ?? "hold_denied"),
    );
  }
  if (action === "release_hold") {
    const id = body.get("holdId") ?? "";
    return redirect(
      request,
      uuid.test(id) && (await repository.releaseHold(actor, id))
        ? "hold_released"
        : "hold_denied",
    );
  }
  if (action === "clone_policy") {
    const version = Number(body.get("version"));
    const result =
      Number.isInteger(version) && version > 1 && version <= 10000
        ? await repository.clonePolicy(actor, version)
        : { ok: false, reason: "invalid_input" };
    return redirect(
      request,
      result.ok ? "policy_draft_created" : (result.reason ?? "policy_denied"),
    );
  }
  if (action === "activate_policy") {
    const id = body.get("policyId") ?? "";
    return redirect(
      request,
      uuid.test(id) &&
        body.get("confirm") === "yes" &&
        (await repository.activatePolicy(actor, id))
        ? "policy_activated"
        : "policy_denied",
    );
  }
  if (action === "retry_job" || action === "cancel_job") {
    const id = body.get("jobId") ?? "";
    const operation = action === "retry_job" ? "retry" : "cancel";
    return redirect(
      request,
      uuid.test(id) && (await repository.controlJob(actor, id, operation))
        ? operation === "retry"
          ? "job_queued"
          : "job_canceled"
        : "job_denied",
    );
  }
  if (action === "approve_deletion" || action === "reject_deletion") {
    const id = body.get("jobId") ?? "";
    const decision = action === "approve_deletion" ? "approve" : "reject";
    const reason = body.get("reason") ?? "";
    const allowed =
      decision === "approve"
        ? ["eligible_approved", "legal_disposition_confirmed"]
        : [
            "insufficient_basis",
            "customer_request_invalid",
            "risk_review_failed",
          ];
    if (!uuid.test(id) || !allowed.includes(reason))
      return redirect(request, "invalid_input");
    const result = await repository.reviewCustomerDeletion(
      actor,
      id,
      decision,
      reason,
    );
    return redirect(
      request,
      result.ok
        ? `deletion_${decision}d`
        : (result.reason ?? "deletion_denied"),
    );
  }
  if (action === "record_deletion_legal_review") {
    const id = body.get("jobId") ?? "";
    const reference = body.get("legalReference")?.trim() ?? "";
    return redirect(
      request,
      uuid.test(id) &&
        /^[A-Za-z0-9._:/-]{1,120}$/.test(reference) &&
        (await repository.recordCustomerDeletionLegalReview(
          actor,
          id,
          reference,
        ))
        ? "deletion_legal_review_recorded"
        : "deletion_legal_review_denied",
    );
  }
  return redirect(request, "invalid_action");
}
