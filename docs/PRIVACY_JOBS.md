# Privacy jobs

Task Group 4-B2 activates export. Task Group 4-B3 adds an independently default-off authenticated BusinessSite deletion state machine; see [customer deletion](CUSTOMER_DATA_DELETION.md). Public/owner/Finder/editorial subject deletion remains absent.

Migration `047` adds the PII-minimizing ledger; `048` implements export and `049` implements exact customer-site deletion. Retention scans remain dry-run only.

## Model and receipt

`privacy_jobs` pins a typed subject reference, verified site/account/owner relationship, policy version, snapshot, actor, idempotency hash, attempts/lease, controlled error and correlation ID. `privacy_job_items` contains only class/store, proposed operation, count/byte estimate, blockers and controlled retry/manifest fields. Append-only `privacy_job_events` records safe state changes.

The ledger must never contain passwords, tokens, session or MFA material, raw request/provider bodies, exported content, arbitrary stack traces or a copied email/name/phone directory. The Owner UI truncates subject and actor references.

## State machine

The allowed states are `queued`, `planning`, `awaiting_approval`, `blocked`, `running`, `retry_wait`, `completed`, `failed` and `canceled`. Claims use `FOR UPDATE SKIP LOCKED`, a bounded lease and one winner. Subject advisory locks serialize claims with hold creation. Attempts are bounded; retry delay is exponential without sleeping inside a transaction; expired planning/running leases are recovered to retry or failure.

Unknown transitions fail closed. Terminal jobs are immutable. Completion is rejected while an item is unresolved or failed. A job event is inserted in the same transaction as each controlled transition. Jobs blocked by a hold or manual/legal/provider prerequisite stay visible.

## Owner and scheduler boundaries

`/owner/privacy` is explicitly “technical privacy operations”. Owner can create a dry-run, clone/activate a policy, create/release a hold and retry/cancel an allowed job state. These mutations are same-origin, bounded, rechecked in the database and require fresh password plus non-replayed TOTP. Admin has read-only access; operator and viewer are denied.

`POST /api/internal/privacy-retention` accepts only the exact cron bearer secret and uses `DATABASE_SYSTEM_URL`. With the execution flag off, the application returns without opening the privacy repository or issuing a database/provider mutation. With it on, B1 recovers stale leases, claims and plans only; it still cannot execute a destructive item.

## Operations

Use policy/job/item/event timestamps and correlation IDs to investigate a plan. Do not edit rows directly. A controlled owner action may retry a retryable job or cancel an approved non-running state. Disable the scheduler and keep `PRIVACY_RETENTION_EXECUTION_ENABLED=false` during an incident. See [legal holds](LEGAL_HOLDS.md) and [retention policy](PRIVACY_RETENTION_POLICY.md).
