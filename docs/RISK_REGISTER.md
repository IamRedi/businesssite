# Risk register

| Privacy-export risk | Current control | Remaining action |
| --- | --- | --- |
| Disclosure/replay | AES-256-GCM, private opaque object, checksum/tag verification, authenticated POST-body token, atomic single-use | Staging provider/concurrency acceptance |
| Oversize export | 10k record, 200 media, 50 MiB DB-media, 500 file and 100 MiB archive bounds; fail whole | Representative staging load test |
| Key rotation loss | Version stored per artifact; multi-version key map | Exercise rotation before production |
| Cleanup drift | bounded idempotent delete; no false receipt | Alert on `delete_retry` and verify provider delete |

| Customer-deletion risk | Current control | Remaining action |
| --- | --- | --- |
| Premature or wrong-tenant destruction | Session-derived site/account, current password, same-origin POST, FORCE RLS, constrained routines, repeated tenant checks and hosted-staging authorization/duplicate evidence | Production remains default-off; require legal, monitoring, restore and controlled-rollout approval |
| Provider residue or false completion | Explicit hashed-reference cleanup items; unresolved/failed items block completion; exact Blob/domain hosted-staging cleanup plus uncertainty-first reconciliation; fake adapter rejected in production | Keep every unaccepted provider path disabled and require independent Production-scoped authority review before enablement |
| Legal evidence removed without authority | Contract/billing/accounting/business evidence retained; `automatic_disposition=false`; owner legal disposition required | Professional jurisdiction-specific retention approval |
| Recovery after source anonymization | Default-off execution, approval gate and non-destructive operational rollback before execution | Verify backups/restores and document backup-expiry treatment; execution itself is irreversible |

| Risk | Current control | Residual action/owner |
| --- | --- | --- |
| Migration credential compromise | Web cannot access it; FORCE applies to table owner during data access; exact catalog checks | Operator: rotate/review credential and DDL audit; RLS cannot defend against hostile DDL |
| Executor privilege drift | NOLOGIN/no-BYPASSRLS, no app membership, exact manifest and CI | Database operator: run setup/preflight after every function/grant change |
| Function replacement restores unsafe owner/PUBLIC EXECUTE | Role provisioning reapplies ownership/ACL; manifest rejects drift | Release owner: provision and verify after every migration |
| Partial FORCE rollout | Enforced setup/readiness require 63/63 after 051; pilot accepts only 0 or 63 | Operator: cut traffic and use the staged runbook |
| Session/GUC spoofing | Policy re-resolves opaque DB session; caller site ID alone denies | Security owner: retain negative tests for every contextual table family |
| Provider/staging behavior differs from local PG16 | Local verdict is labeled separately | Product/operator: complete managed-role, pooling, load and provider acceptance |
| Backup/restore unavailable during rollout | Runbook requires a verified restore point | Infrastructure owner: attach restore evidence before staging/production |
| Technical periods treated as legal approval | Policy labels itself non-certified; contract/billing/accounting is manual review | Legal/operator: approve exact jurisdictions, purposes and periods before production execution |
| Destructive privacy execution enabled prematurely | Separate request/execution flags default false, fake provider rejected in production, release/static gates | Release owner: retain false until legal, provider, staging, alerting and restore gates pass |
| Legal hold missed during concurrent work | DB relationship checks, per-subject advisory lock and checks at plan/claim/transition | Privacy owner: retain concurrency tests and require hold checks in every future destructive item routine |
| Privacy receipt leaks PII/secrets | Typed references and controlled detail keys; no payload columns | Security owner: review every new event/reason/class and reject free-form provider/error content |
