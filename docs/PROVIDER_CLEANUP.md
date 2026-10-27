# Provider cleanup and reconciliation

Migration `050_provider_cleanup_reconciliation.sql` records an exact, trusted provider binding before a deletion worker can act. Migration `051_vercel_blob_store_authority.sql` binds public business media to an explicit `store_...`; migration `052_vercel_domain_project_authority.sql` binds a custom domain to one exact Vercel team/project. Authority is never derived from a URL, name similarity or whichever credential happens to be present. The binding stores the site, policy version, resource kind, operation, provider authority and an evidence hash; raw references are RLS-protected and available only through the system cleanup routine. Legacy Blob/domain rows without authority remain immutable evidence and stop in `manual_review_required` before transport.

All flags are false by default. `PRIVACY_DELETION_EXECUTION_ENABLED`, `PRIVACY_PROVIDER_CLEANUP_WORKER_ENABLED`, `PRIVACY_PROVIDER_RECONCILIATION_ENABLED`, a non-fake adapter, and the individual provider flag are required before a real adapter can run. Production remains intentionally rejected by release preflight until a staging acceptance record exists.

The hosted worker treats `VERCEL_ENV=production` or
`RELEASE_TARGET=production` as Production. A Vercel Preview deployment may run
in Next.js `NODE_ENV=production`, so an explicit `VERCEL_ENV=preview` plus a
non-production release target remains eligible for the bounded staging worker;
without Vercel environment identity, `NODE_ENV=production` continues to fail
closed.

| Provider | Actual B4 treatment | Provider call |
| --- | --- | --- |
| Vercel Blob | Delete and `head`-verify only an exact `siteId`-scoped `site_media_assets.storage_key` in the bound store authority | B5A accepted against the canonical public staging store; production remains disabled/unverified |
| Vercel Domains | Inspect, detach and re-inspect an exact verified custom-domain attachment under the bound team/project; never delete account domains or DNS | B5B accepted in staging; production remains disabled/unverified |
| Stripe | Subscription records are retained financial evidence | None |
| Paddle | No enabled runtime adapter/catalog | Unsupported; none |
| Resend | Transactional mail, no persisted customer-owned object | None |
| OpenAI | Stateless Responses use, no persisted customer-owned object | None |
| Google Finder | API lookup, no tenant provider resource | None |
| REDI CONTROL | External workspace reference has no verified cleanup receiver contract | Manual review; none |

The worker claims one leased item with `FOR UPDATE SKIP LOCKED`, calls the adapter outside the transaction, then writes a redacted receipt/outcome. Retryable and uncertain outcomes are bounded by the existing item attempts; terminal provider failures block customer deletion. `retained_by_policy` and `no_provider_object` are locally completed evidence outcomes, not claims that a remote deletion occurred.

Required staging evidence before enabling either Vercel path: isolated tenant fixture, exact object/domain identity, delete/detach response classification, independent absence verification, retry/timeout and already-absent cases, audit correlation, and rollback drill. B5A/B5B evidence satisfies this only for the accepted staging store/project boundaries. Do not place tokens or raw provider references in logs.

For Blob, configure `PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID` to the same explicit store as `BLOB_STORE_ID`. OIDC is preferred and the SDK receives both the short-lived `VERCEL_OIDC_TOKEN` and exact store ID. A legacy `BLOB_READ_WRITE_TOKEN` is accepted only when its embedded store identity equals the trusted binding. Cross-store, cross-site, malformed and missing-authority work is refused before `head` or `del`.

For Domains, configure `PRIVACY_PROVIDER_VERCEL_DOMAINS_PROJECT_ID` and `PRIVACY_PROVIDER_VERCEL_DOMAINS_TEAM_ID` to the exact accepted cleanup project and team. They must equal the runtime `VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`. The adapter allowlists only the project-domain GET/DELETE endpoint, validates returned `name + projectId`, applies a bounded timeout and requires a separate absence reinspection. See the B5B record.
