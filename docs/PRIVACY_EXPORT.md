# Authenticated privacy export

Migration `048_authenticated_privacy_exports.sql` implements customer/site-admin export and owner-team self-export. It does not implement public DSAR, source-data deletion/anonymization, subscription cancellation, provider-account deletion, domain cleanup, backup or restore.

## Trust boundary

Customer scope is derived by `site_admin_resolve_session`; the browser cannot select account, site, subject, policy, object key or expiry. Request and capability issuance require the current password and same-origin POST. Owner scope is derived by `owner_auth_resolve_session`; every owner/admin/operator/viewer may export only their own subject and both request and capability issuance consume a fresh, non-replayed password/TOTP proof. Platform privacy-job administration remains separate RBAC.

The worker uses a PostgreSQL `REPEATABLE READ` transaction and a system-only safe projection. Legal holds do not block export. `SKIP LOCKED`, a five-minute lease, three bounded attempts, one active job per subject, a one-hour cooldown, 10,000-record bounds, 200 media files, 50 MiB database media and a 100 MiB archive ceiling limit abuse. Exceeding a bound fails the whole export with a controlled code; it never creates an undeclared partial export.

## Archive allowlist

Customer ZIP files include `manifest.json`, `account.json`, `site.json`, `business-identity.json`, `appointments.json`, formula-neutralized `appointments.csv`, `media/manifest.json`, fixed-name database media files, `subscription.json`, `contract-acceptances.json`, `usage.json`, `ai-runs.json`, `audit.json`, `editorial.json`, `integrations.json`, `domains.json` and `checksums.sha256`. Owner ZIP files contain only own profile, safe session metadata, invitations, auth-audit receipts, legal authorship and own privacy receipts under `owner/`.

Explicit exclusions include password/session/reset/invitation/capability hashes; MFA secrets/recovery codes; raw webhook/provider payloads and response identifiers; billing/provider secret identifiers; encrypted integration credentials and metadata; raw Blob keys or public artifact URLs; other tenants; customer datasets in owner self-export; internal heuristics/logs and legal draft content. Database media bytes are embedded under fixed generated paths. External media is inventory-only with a controlled provider-copy status; missing external copies are declared in the manifest and never silently represented as included.

ZIP names are code-owned, traversal and symlinks are impossible, JSON is escaped, CSV formulas are prefixed with an apostrophe, entry count/bytes are bounded and STORE-mode ZIP generation is deterministic for one snapshot. Generation is bounded-memory (maximum 100 MiB archive input/output); it is not unbounded streaming.

## Artifact and download

`PrivacyArtifactStore` is private-only and supports create/read/idempotent delete. The deterministic memory adapter is local/test only. A deployed environment uses a dedicated private Vercel Blob store through `PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN`; business public Blob is never used. Task Group 4-B6C accepted real private create/head/get/conditional-delete behavior in an isolated Vercel Preview. Production still requires its own dedicated private store, distinct credentials and keys.

The authority persisted before upload is the tuple `provider + store_authority + environment_identity + object_key + artifact/job/subject`. Vercel token identity must equal `PRIVACY_EXPORT_BLOB_STORE_ID`, the provider URL must use that store's exact private hostname and the key must match `privacy-exports/<environment>/<four-hex-shard>/<opaque-artifact-uuid>.enc`. Keys contain no email, slug or other tenant PII. Missing or legacy authority, a wrong environment/store/key, a public hostname or provider identity drift fails before read/delete. An `uploading` reservation is durable before the provider write; uncertain persistence stays discoverable and cleanup-retryable.

Before storage, the ZIP is encrypted with AES-256-GCM using a random 96-bit nonce and versioned 32-byte master key. The database stores only key version, encrypted/plain checksums and safe metadata, never encryption material. Download validates object length, ciphertext checksum, GCM tag and plaintext checksum. A fresh-auth POST issues a random capability once; only its SHA-256 hash is stored. The authenticated download is a same-origin POST body, never a query token. Atomic consumption permits one concurrent winner, denies replay and returns `Cache-Control: private, no-store`; Range is rejected.

Artifacts expire in at most 24 hours and capabilities in at most 10 minutes. The capability is a one-time, same-origin authenticated POST body; no provider URL or bearer token is exposed to the browser. Authorization is revalidated when the capability is issued and consumed, so a disabled/deleted customer fails closed immediately. The system cleanup deletes only the exact temporary export object, independently verifies provider absence, records deletion only after store success, treats already-absent as success and leaves authority/provider failures retryable. Source customer/owner data and B1 evidence are untouched.

Schedule cleanup once daily for the current low-cost deployment. The 24-hour authorization cutoff is enforced by the database even if physical deletion waits for the next bounded run; failed deletions retry on every later run. This export-object lifecycle is separate from the B6B database-backup policy.

## Relationship to customer deletion

Task Group 4-B3 offers export before closure but does not make it a deletion prerequisite. A deletion job records only whether export was offered/requested, the safe export job/artifact identifiers and whether an unexpired artifact is pending. It never copies archive content or personal data into deletion events. A requested, valid artifact remains intact through source-data execution until its own expiry or explicit subject cancellation. Export cleanup and deletion execution use separate flags, leases and workers.

## Configuration and readiness

Exports default off. Configure:

- `PRIVACY_EXPORT_ENABLED=true`
- `PRIVACY_EXPORT_ARTIFACT_STORE=vercel_blob_private` in production (`memory_test` is local/test only)
- `PRIVACY_EXPORT_BLOB_READ_WRITE_TOKEN` for a dedicated private store
- `PRIVACY_EXPORT_ENCRYPTION_KEY_VERSION=v1`
- `PRIVACY_EXPORT_ENCRYPTION_KEYS={"v1":"<canonical-base64url-32-byte-key>"}`

Keep old key versions in the map until every artifact that references them has expired and been deleted. `/api/internal/privacy-exports` requires the existing exact `CRON_SECRET` bearer value, recovers expired leases, cleans up a bounded batch and processes at most one job per call. Local tests use synthetic keys and the memory store.

Task Group 4-B6C verified a dedicated private Blob store in isolated hosted staging with a synthetic two-tenant archive, anonymous refusal, application-mediated authorized download, wrong-tenant/expired/disabled-account refusal, actual provider deletion, already-absent convergence, wrong-authority retry, durable reservation recovery and B6A signal delivery. See the B6C acceptance record. This is staging evidence only: Production execution remains disabled and requires a separate private store, environment-specific encryption keys, an approved scheduler and monitoring destination, legal disposition of ambiguous retention/export fields and a controlled rollout.
