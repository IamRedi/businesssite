# White-label v1.0 release checklist

## Source freeze

### Brand/PWA boundary

- [ ] Set one validated brand profile key and asset version.
- [ ] Supply buyer-owned local logo, mark/favicon, PWA, Apple-touch and social assets.
- [ ] Run `npm run check:brand`, `npm run check:brand-hardcoding` and release preflight.
- [ ] Confirm EN/DE desktop/mobile branding, metadata, PWA manifest/install/logout/update in staging.
- [ ] Confirm custom domains and generated sites show tenant identity, not platform PWA/metadata branding.

- [ ] Release commit is identified and the working tree contains no accidental changes.
- [ ] `npm ci` succeeds from a clean clone using the supported Node version.
- [ ] `npm run quality` passes.
- [ ] Database integration suites pass with the release database configuration.
- [ ] `npm run check:secrets` and `npm run check:sca` pass.
- [ ] Dependency-license report from the exact deployment target is reviewed.
- [ ] Asset provenance audit is attached.

## Database and infrastructure

- [ ] Provider backup or recovery point is recorded.
- [ ] Every migration in the [migration inventory](MIGRATION_INVENTORY.md) is applied.
- [ ] `npm run migrate:status` reports no pending migration.
- [ ] `npm run preflight:release` passes with the intended production profile.
- [ ] HTTPS, canonical host, trusted-host denial and `/api/health` are verified.
- [ ] Every enabled cleanup/privacy cron, independent uptime monitor, centralized error destination and database/webhook/provider/privacy-job alert is verified with a dated delivery/escalation drill.
- [ ] Privacy export uses a dedicated private Production store, exact store/environment authority, distinct versioned Production encryption keys and a daily cleanup/reconciliation schedule; anonymous, wrong-tenant, expired, disabled-account, missing-object and historical-restore cases fail closed.
- [ ] Bounded staging load report is attached.
- [ ] Migration `036` is applied; a reviewed active legal/commercial version and all required active EN/DE document versions match repository hashes.
- [ ] Migration `037` is applied; existing account/invitation preferences are backfilled to English and new EN/DE preferences persist through login, checkout and email delivery.
- [ ] `CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED=true` and incomplete customer legal/privacy identity fails public resolution.
- [ ] Exactly one valid active retention policy matches the canonical Policy v1 hash; all 17 classes/stores are covered and contract/billing/accounting remains manual-review only.
- [ ] `PRIVACY_RETENTION_EXECUTION_ENABLED=false`; no registry-driven destructive executor or provider cleanup is enabled in B1.
- [ ] Privacy scheduler authentication, Owner/admin/operator/viewer RBAC, fresh-auth mutations, scoped holds and dry-run/no-mutation tests pass.
- [ ] Provider backup target (RPO ≤24h, RTO ≤8h, 30 daily points) and quarterly isolated restore evidence are supplied separately; repository policy text is not evidence.

## Product acceptance

- [ ] Database owner login completes password + TOTP, challenge-only/customer/preview cookies are denied, logout revokes server-side, and an old cookie cannot replay.
- [ ] First-owner bootstrap is no longer available after provisioning; administrative recovery is restricted to the controlled interactive CLI.
- [ ] Fresh Finder search calls Google once; the identical search uses the 30-day cache.
- [ ] Lead → prepared profile → idempotent demo → signed preview succeeds.
- [ ] Business admin edits identity, content, services, media, design, contact and hours.
- [ ] Landing/trial/checkout show B2B-only; missing B2B, authority, Terms, renewal or Privacy Notice acknowledgement is rejected server-side.
- [ ] Checkout retry reuses identical evidence; changed versions create a new immutable attempt; legacy subscriptions remain `acceptance_unknown`.
- [ ] Owner legal activation/manual verification rejects admin/operator/viewer and requires current password plus a fresh non-replayed TOTP step.
- [ ] Trial invitation and password reset arrive from the verified sender.
- [ ] Stripe Test full lifecycle: checkout, verified webhook, entitlement,
  replay/idempotency, Billing Portal, payment recovery and cancellation; refund
  only if the reviewed contract requires it. B6E is blocked before checkout by
  missing active reviewed EN/DE legal evidence.
- [ ] When Paddle is enabled: all three sandbox prices, signed webhook replay/idempotency, pause/failure/resume/cancel and customer portal pass; live mode remains disabled until Paddle review.
- [ ] Social Media checkout creates only the separate add-on entitlement; failure/cancellation removes it without canceling the website.
- [ ] After migration `035`, expired preview is denied, read-only recovery is retained for the configured window, and cleanup removes only a never-paid trial after that deadline (previous immediate-cleanup evidence predates this policy).
- [ ] Custom-domain verification and routing pass with a staging domain.
- [ ] External registrar redirect opens the configured HTTPS provider; direct in-app purchase remains visibly disabled.
- [ ] Every enabled locale passes phone, tablet and desktop review.

## Commercial delivery

- [ ] Platform brand, support email, pricing and legal entity are configured without source edits.
- [ ] Qualified reviewers approve the exact active operator identity, B2B Terms, Privacy Notice, imprint, cancellation text and tax presentation; no certification claim is made.
- [ ] Proprietary non-exclusive license and sale agreement identify the rights holder.
- [ ] Support, warranty, update, tax and privacy responsibilities are signed.
- [ ] Known limitations and accepted exceptions are acknowledged.
- [ ] Delivery archive is created from tracked release files only.
- [ ] Tag `v1.0.0` points to the accepted release commit.

Record evidence using the handover checklist, production execution plan, [deployment topology](DEPLOYMENT_TOPOLOGY.md) and [known limitations](KNOWN_LIMITATIONS.md).
## Owner database identity

- Configure a distinct `DATABASE_OWNER_URL` member of `bsrc_owner_ops`.
- Run migration 042 followed by `npm run db:roles`.
- Require setup and release preflight to confirm four distinct identities,
  zero owner table grants and no migrator membership.
- Keep `DATABASE_RLS_MODE=enforced` disabled in shared environments until the B4A staging runbook is approved and completed.

## Information/REDI database boundary

- Apply migration 043, then rerun `npm run db:roles`.
- Confirm Information public/editorial routes use `DATABASE_RUNTIME_URL`,
  platform owner controls use `DATABASE_OWNER_URL`, and verified inbound uses
  `DATABASE_SYSTEM_URL`.
- Run the 89-test disposable PG16 suite and the 042→043 preservation fixture.
- Keep `REDI_CONTROL_INBOUND_ENABLED=false` until two-system staging acceptance.
- Confirm advertising remains a placeholder with no provider script, arbitrary
  markup, tracker or revenue claim.

## Finder/demo/operations database boundary

- Apply migration 044, then rerun `npm run db:roles`.
- Confirm active Finder/demo owner paths use `DATABASE_OWNER_URL`, public trial,
  site-admin preview and DB rate limits use `DATABASE_RUNTIME_URL`, and cleanup
  uses `DATABASE_SYSTEM_URL` only after exact cron-secret verification.
- Run the 102-test disposable PG16 suite and the `043→044` preservation fixture.
- Record one controlled cleanup proving expired never-paid deletion and paid,
  recent-pending-payment and active-preview preservation.
- Use `DATABASE_RLS_MODE=enforced` only after exact catalog/setup/preflight verification; B3C4 removed compatibility web-process paths.

## Final database-boundary completion

- Apply migrations 045-059 and rerun `npm run db:roles`.
- Confirm the deployed web environment contains runtime, owner and system URLs,
  but neither `DATABASE_URL` nor `MIGRATION_DATABASE_URL`.
- Run `npm run check:database-boundaries`, the 141-test disposable PG16 suite
  plus the `046->047` preservation/rollback verification.
- Confirm exactly 63 FORCE flags, zero PUBLIC access and exact executor ownership; attach B4A/B1/B2/B3/B5A/B5B/B5C evidence and the B6 go/no-go record.
