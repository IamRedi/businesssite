import Link from "next/link";
import {
  PostgresPrivacyRepository,
  privacyDataClasses,
  privacyHoldReasons,
  privacySubjectKinds,
} from "@platform/site-data";
import { requireOwnerPagePermission } from "../../../lib/owner-authorization";

export const dynamic = "force-dynamic";
const value = (record: Record<string, unknown>, key: string) => record[key];
const text = (input: unknown) =>
  input === null || input === undefined ? "—" : String(input);
const date = (input: unknown) =>
  input ? new Date(String(input)).toLocaleString("en-GB") : "—";
const reference = (input: unknown) => {
  const raw = String(input ?? "");
  return raw.length > 12 ? `${raw.slice(0, 8)}…${raw.slice(-4)}` : raw || "—";
};
function FreshFields() {
  return (
    <>
      <input
        required
        type="password"
        name="currentPassword"
        autoComplete="current-password"
        placeholder="Current password"
      />
      <input
        required
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        placeholder="Fresh MFA code"
      />
    </>
  );
}

export default async function OwnerPrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; job?: string }>;
}) {
  const owner = await requireOwnerPagePermission("privacy.read");
  const repository = new PostgresPrivacyRepository({
    boundary: "owner",
    sessionHash: owner.sessionHash,
  });
  const snapshot = await repository.snapshot();
  if (!snapshot)
    return (
      <main className="owner-shell">
        <p className="error">Privacy workspace access was refused.</p>
      </main>
    );
  const params = await searchParams;
  const canManage = owner.role === "owner";
  const selectedJob =
    params.job && /^[0-9a-f-]{36}$/i.test(params.job) ? params.job : undefined;
  const items = selectedJob ? await repository.jobItems(selectedJob) : [];
  return (
    <main className="owner-shell">
      <header className="owner-header">
        <div>
          <p className="eyebrow">Technical privacy operations</p>
          <h1>Retention, jobs and legal holds</h1>
          <p>
            This workspace applies the approved technical baseline. It is not
            legal or tax certification. Customer deletion is separately gated,
            provider-bound and disabled by default.
          </p>
        </div>
      </header>
      {params.result ? (
        <p
          className={
            params.result.endsWith("created") ||
            params.result.endsWith("released") ||
            params.result.endsWith("started") ||
            params.result.endsWith("activated") ||
            params.result.endsWith("canceled") ||
            params.result.endsWith("queued")
              ? "success"
              : "error"
          }
        >
          {params.result.replaceAll("_", " ")}
        </p>
      ) : null}
      <section className="workspace-card">
        <h2>Active Policy</h2>
        {snapshot.policy ? (
          <p>
            <strong>
              {snapshot.policy.policyKey} v{snapshot.policy.version}
            </strong>{" "}
            · {snapshot.policy.status} ·{" "}
            {snapshot.policy.valid ? "hash verified" : "INVALID"}
            <br />
            <code>{snapshot.policy.manifestHash}</code>
            <br />
            Activated {date(snapshot.policy.activatedAt)}
          </p>
        ) : (
          <p className="error">No active policy.</p>
        )}
        {canManage ? (
          <div className="owner-table-wrap">
            <form
              action="/api/owner/privacy"
              method="post"
              className="admin-login"
            >
              <input type="hidden" name="action" value="clone_policy" />
              <input
                required
                type="number"
                min="2"
                max="10000"
                name="version"
                placeholder="New version"
              />
              <FreshFields />
              <button className="button secondary">
                Create immutable draft clone
              </button>
            </form>
            <form
              action="/api/owner/privacy"
              method="post"
              className="admin-login"
            >
              <input type="hidden" name="action" value="activate_policy" />
              <input
                required
                name="policyId"
                pattern="[0-9a-fA-F-]{36}"
                placeholder="Draft policy ID"
              />
              <label>
                <input required type="checkbox" name="confirm" value="yes" />{" "}
                Activate this exact verified version; this is not legal
                certification.
              </label>
              <FreshFields />
              <button className="button secondary">
                Activate policy version
              </button>
            </form>
          </div>
        ) : (
          <p>
            Read-only access. Policy and hold mutations require owner role plus
            fresh password/MFA.
          </p>
        )}
      </section>
      <section className="workspace-card">
        <h2>Retention rules</h2>
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Class / trigger</th>
                <th>Duration</th>
                <th>Disposition</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rules.map((rule) => (
                <tr key={text(value(rule, "classKey"))}>
                  <td>
                    {text(value(rule, "classKey"))}
                    <br />
                    <small>{text(value(rule, "triggerKey"))}</small>
                  </td>
                  <td>
                    {text(value(rule, "durationValue"))}{" "}
                    {text(value(rule, "durationUnit"))}
                    {value(rule, "coolingDays")
                      ? ` + ${text(value(rule, "coolingDays"))} cooling days`
                      : ""}
                  </td>
                  <td>{text(value(rule, "disposition"))}</td>
                  <td>
                    {value(rule, "automaticDisposition")
                      ? "automatic candidate"
                      : "manual"}
                    {value(rule, "legalReviewRequired")
                      ? " · legal review required"
                      : ""}
                    {value(rule, "providerReconciliationRequired")
                      ? " · provider reconciliation"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canManage ? (
        <section className="workspace-card">
          <h2>Start retention dry-run</h2>
          <form
            action="/api/owner/privacy"
            method="post"
            className="admin-login"
          >
            <input type="hidden" name="action" value="dry_run" />
            <select name="subjectKind" required defaultValue="site">
              {privacySubjectKinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
            <input
              required
              name="subjectReference"
              maxLength={160}
              placeholder="Exact typed reference"
            />
            <FreshFields />
            <button className="button">Create count-only plan</button>
          </form>
        </section>
      ) : null}
      <section className="workspace-card">
        <h2>Privacy jobs</h2>
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Plan</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.jobs.map((job) => (
                <tr key={text(value(job, "id"))}>
                  <td>
                    <Link
                      href={`/owner/privacy?job=${encodeURIComponent(text(value(job, "id")))}`}
                    >
                      {reference(value(job, "id"))}
                    </Link>
                    <br />
                    <small>
                      {text(value(job, "kind"))} ·{" "}
                      {date(value(job, "createdAt"))}
                    </small>
                  </td>
                  <td>
                    {text(value(job, "subjectKind"))}
                    <br />
                    <code>{reference(value(job, "subjectReference"))}</code>
                  </td>
                  <td>
                    {text(value(job, "status"))}
                    <br />
                    <small>
                      {text(value(job, "errorCode"))} ·{" "}
                      {reference(value(job, "correlationId"))}
                    </small>
                  </td>
                  <td>
                    {text(value(job, "itemCount"))} items ·{" "}
                    {text(value(job, "eligibleCount"))} eligible ·{" "}
                    {text(value(job, "blockedCount"))} blocked
                  </td>
                  <td>
                    {canManage &&
                    ["failed", "blocked", "retry_wait"].includes(
                      text(value(job, "status")),
                    ) ? (
                      <form
                        action="/api/owner/privacy"
                        method="post"
                        className="admin-login"
                      >
                        <input type="hidden" name="action" value="retry_job" />
                        <input
                          type="hidden"
                          name="jobId"
                          value={text(value(job, "id"))}
                        />
                        <FreshFields />
                        <button className="button secondary">
                          Retry planning
                        </button>
                      </form>
                    ) : null}
                    {canManage &&
                    [
                      "queued",
                      "awaiting_approval",
                      "blocked",
                      "failed",
                      "retry_wait",
                    ].includes(text(value(job, "status"))) ? (
                      <form
                        action="/api/owner/privacy"
                        method="post"
                        className="admin-login"
                      >
                        <input type="hidden" name="action" value="cancel_job" />
                        <input
                          type="hidden"
                          name="jobId"
                          value={text(value(job, "id"))}
                        />
                        <FreshFields />
                        <button className="button secondary">Cancel</button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedJob ? (
          <div className="owner-table-wrap">
            <h3>Selected job item summary</h3>
            <table className="owner-table">
              <thead>
                <tr>
                  <th>Class/store</th>
                  <th>Operation</th>
                  <th>Status</th>
                  <th>Count/bytes</th>
                  <th>Controls/prerequisites</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={String(item.id)}>
                    <td>
                      {item.data_class}
                      <br />
                      <small>
                        {item.datastore} · rule{" "}
                        {String(item.policy_rule_id).slice(0, 8)} · policy{" "}
                        {String(item.policy_version_id).slice(0, 8)}
                      </small>
                    </td>
                    <td>{item.operation}</td>
                    <td>{item.status}</td>
                    <td>
                      {String(item.eligible_count)} /{" "}
                      {item.estimated_bytes ?? "—"}
                    </td>
                    <td>
                      {item.block_reason_code ?? "—"}
                      {item.legal_review_required ? " · legal review" : ""}
                      {item.provider_reconciliation_required
                        ? " · provider reconciliation"
                        : ""}
                      <br />
                      <small>
                        {Array.isArray(item.prerequisites)
                          ? item.prerequisites.join(", ")
                          : ""}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="workspace-card">
        <h2>Customer closure reviews</h2>
        <p>
          Admins can inspect this queue. Only an owner with fresh password and
          MFA can approve or reject an exact job.
        </p>
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Job/site</th>
                <th>Phase</th>
                <th>Prerequisites</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.deletions.map((item) => (
                <tr key={text(value(item, "jobId"))}>
                  <td>
                    <code>{reference(value(item, "jobId"))}</code>
                    <br />
                    <small>
                      {reference(value(item, "siteId"))} ·{" "}
                      {text(value(item, "reason"))}
                    </small>
                  </td>
                  <td>
                    {text(value(item, "phase"))}
                    <br />
                    <small>{date(value(item, "createdAt"))}</small>
                  </td>
                  <td>
                    cooling {date(value(item, "coolingEndsAt"))}
                    <br />
                    <small>
                      providers {text(value(item, "providerPending"))} · legal{" "}
                      {value(item, "legalReviewRecorded")
                        ? "recorded"
                        : "pending/none"}{" "}
                      · export{" "}
                      {value(item, "exportRequested") ? "linked" : "offered"}
                    </small>
                  </td>
                  <td>
                    {canManage &&
                    !value(item, "legalReviewRecorded") &&
                    [
                      "cooling_period",
                      "awaiting_provider_cleanup",
                      "awaiting_approval",
                    ].includes(text(value(item, "phase"))) ? (
                      <form
                        action="/api/owner/privacy"
                        method="post"
                        className="admin-login"
                      >
                        <input
                          type="hidden"
                          name="action"
                          value="record_deletion_legal_review"
                        />
                        <input
                          type="hidden"
                          name="jobId"
                          value={text(value(item, "jobId"))}
                        />
                        <input
                          name="legalReference"
                          required
                          maxLength={120}
                          pattern="[A-Za-z0-9._:/-]+"
                          placeholder="Approved legal case reference"
                        />
                        <FreshFields />
                        <button className="button secondary">
                          Record legal disposition
                        </button>
                      </form>
                    ) : null}
                    {canManage &&
                    value(item, "phase") === "awaiting_approval" ? (
                      <>
                        <form
                          action="/api/owner/privacy"
                          method="post"
                          className="admin-login"
                        >
                          <input
                            type="hidden"
                            name="action"
                            value="approve_deletion"
                          />
                          <input
                            type="hidden"
                            name="jobId"
                            value={text(value(item, "jobId"))}
                          />
                          <select name="reason">
                            <option value="eligible_approved">
                              eligible_approved
                            </option>
                            <option value="legal_disposition_confirmed">
                              legal_disposition_confirmed
                            </option>
                          </select>
                          <FreshFields />
                          <button className="button">Approve exact job</button>
                        </form>
                        <form
                          action="/api/owner/privacy"
                          method="post"
                          className="admin-login"
                        >
                          <input
                            type="hidden"
                            name="action"
                            value="reject_deletion"
                          />
                          <input
                            type="hidden"
                            name="jobId"
                            value={text(value(item, "jobId"))}
                          />
                          <select name="reason">
                            <option value="insufficient_basis">
                              insufficient_basis
                            </option>
                            <option value="customer_request_invalid">
                              customer_request_invalid
                            </option>
                            <option value="risk_review_failed">
                              risk_review_failed
                            </option>
                          </select>
                          <FreshFields />
                          <button className="button secondary">Reject</button>
                        </form>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="workspace-card">
        <h2>Scoped legal holds</h2>
        {canManage ? (
          <form
            action="/api/owner/privacy"
            method="post"
            className="admin-login"
          >
            <input type="hidden" name="action" value="create_hold" />
            <select name="subjectKind" required>
              {privacySubjectKinds.map((kind) => (
                <option key={kind}>{kind}</option>
              ))}
            </select>
            <input
              required
              name="subjectReference"
              maxLength={160}
              placeholder="Exact typed reference"
            />
            <select name="reason" required>
              {privacyHoldReasons.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
            <input
              name="externalReference"
              maxLength={120}
              pattern="[A-Za-z0-9._:/-]+"
              placeholder="Restricted case reference (optional)"
            />
            <input name="endsAt" type="datetime-local" />
            <fieldset>
              <legend>Data classes (none means subject/site-wide)</legend>
              {privacyDataClasses.map((key) => (
                <label key={key}>
                  <input type="checkbox" name="dataClass" value={key} />
                  {key}
                </label>
              ))}
            </fieldset>
            <FreshFields />
            <button className="button">Create legal hold</button>
          </form>
        ) : null}
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Reason/classes</th>
                <th>Status</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.holds.map((hold) => (
                <tr key={text(value(hold, "id"))}>
                  <td>
                    {text(value(hold, "subjectKind"))} ·{" "}
                    <code>{reference(value(hold, "subjectReference"))}</code>
                    <br />
                    <small>site {reference(value(hold, "siteId"))}</small>
                  </td>
                  <td>
                    {text(value(hold, "reasonCategory"))}
                    <br />
                    <small>
                      {Array.isArray(value(hold, "dataClasses"))
                        ? (value(hold, "dataClasses") as unknown[]).join(
                            ", ",
                          ) || "subject-wide"
                        : "subject-wide"}{" "}
                      · {text(value(hold, "externalReference"))}
                    </small>
                  </td>
                  <td>
                    {text(value(hold, "status"))}
                    <br />
                    <small>{date(value(hold, "startsAt"))}</small>
                  </td>
                  <td>
                    {canManage && value(hold, "status") === "active" ? (
                      <form
                        action="/api/owner/privacy"
                        method="post"
                        className="admin-login"
                      >
                        <input
                          type="hidden"
                          name="action"
                          value="release_hold"
                        />
                        <input
                          type="hidden"
                          name="holdId"
                          value={text(value(hold, "id"))}
                        />
                        <FreshFields />
                        <button className="button secondary">
                          Release hold
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
