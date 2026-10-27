# Customer closure, deletion and anonymization

Task Group 4-B3 implements a controlled workflow for an authenticated BusinessSite customer/site only. It does not implement general owner deletion, public appointment-requester erasure, Finder-lead erasure, Information-author erasure or white-label operator termination. Those require separate subject-resolution, authority and retention workflows.

## Customer boundary and lifecycle

The customer route derives the exact account and site from the hashed active session. It requires the current password, same-origin POST, explicit irreversible acknowledgement, an allowlisted reason and an optional 500-character note. The browser cannot supply a site ID, account ID or role as authority. Rate limiting and a partial unique index make one active request idempotent per site. `PRIVACY_DELETION_REQUESTS_ENABLED=false` keeps the request and cancel routes unavailable by default.

The durable state machine is:

`requested → eligibility_check → blocked | cooling_period → awaiting_provider_cleanup → awaiting_approval → ready_for_execution → executing → completed`

It also supports bounded `retry_wait` and terminal `canceled`, `rejected` and `failed` states. Workers use leases and `SKIP LOCKED`; transitions are allowlisted and emit controlled, non-PII receipts. The customer may cancel before execution, but not after destructive execution begins.

Active, trialing or past-due subscriptions block. `cancel_at_period_end` with an active provider state still blocks. The workflow never requests subscription cancellation and accepts only persisted, provider-observed terminal evidence. Access/recovery must have ended, including the 30-day read-only recovery period, before a further 30-day pending-deletion cooling period begins. Missing, stale or corrupt provider binding evidence fails closed. Trial/demo expiry remains a separate system workflow.

## Disposition matrix

| Class | Disposition | Guard |
| --- | --- | --- |
| Site-admin sessions/resets | Delete/revoke first | Exact tenant; prevents login and recovery |
| Site-admin account/contact and appointments | Deterministic anonymization | Never reuse raw name, email, phone or domain |
| Generated content, preview, features, integrations, usage and same-site editorial data | Delete/neutralize | Dependency plan and tenant scope |
| Media and external provider objects | Provider cleanup required | Successful reconciliation or approved retained tombstone |
| Subscription and provider lifecycle | Retained-minimal | Immutable lifecycle evidence; never cancel from this workflow |
| Business identity, contract, billing and accounting evidence | Manual legal review; retained-minimal | `automatic_disposition=false`; professional retention decision required |
| Privacy policy, holds, plans, receipts and audit evidence | Retained-minimal | Append-only/evidentiary boundary |
| Any held class | Blocked by hold | Rechecked at request, planning, provider work, approval, retry and execution |

An eligible export is offered but is not mandatory. The deletion workflow stores only the export decision and safe job/artifact identifiers. A requested, unexpired artifact remains available until expiry unless the subject explicitly cancels it; no export payload is copied into deletion receipts.

Provider cleanup items cover Vercel Blob/domains, Stripe/Paddle, Resend, OpenAI, Google and REDI when references exist. Items store reference hashes and tombstone checksums, not provider payloads, tokens or secrets. Migration 051/B5A accepts exact-store public Blob cleanup in staging; migration 052/B5B accepts exact-team/project domain detachment in staging; B5C accepts both paths inside the full hosted customer lifecycle through migration 058. Production remains unaccepted and deterministic fakes are forbidden there.

## Execution and production boundary

Execution first removes publication eligibility and makes the site private. It then revokes sessions/resets, anonymizes permitted contact fields, removes non-evidence tenant content and writes checksum/count-only receipts. It does not delete the `sites` row, subscription lifecycle, business identity, contract acceptance, privacy ledger or audit evidence. The executor repeats policy/version, hold, provider and approval checks immediately before mutation.

`PRIVACY_DELETION_EXECUTION_ENABLED=false` is the required default. Full hosted-staging acceptance does not authorize production deletion. Production execution remains unsupported until every enabled provider path, professional legal disposition, monitoring/alerting, backup/restore and controlled-rollout evidence are completed. Local or hosted-staging tests are not legal certification. Deleted source data can remain in backups until the approved backup-expiry period.

## Rollback

First set both deletion flags to `false` and stop the deletion scheduler. Run `db/admin/rollback-customer-deletion-workflow.sql` with the administrative role. The script revokes only 4-B3 callable entry points and safely pauses active deletion jobs; it preserves source rows, jobs, plans, receipts, legal holds, exports, RLS/FORCE and migration history. Re-running role provisioning restores the reviewed grants. It does not roll back Task Groups 3, 4-B1 or 4-B2.
