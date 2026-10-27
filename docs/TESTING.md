# Testing and acceptance

Task Group 4-B2 adds archive/encryption/store unit tests and `rls-privacy-export.integration.test.ts` to PostgreSQL 16 enforced mode. Coverage includes tenant/self binding, password/TOTP replay denial, legal-hold export, secret exclusion, one-winner capability consumption, FORCE/PUBLIC denial, ZIP/CSV safety, nonce/tamper rejection and idempotent store deletion. Vercel Blob/staging remain external acceptance.

## Automated gates

Run the full suite before every release:

```bash
npm run quality
```

Individual commands include `typecheck`, `lint`, `test`,
`check:database-boundaries`, `check:privacy-policy`, `check:boundaries`, `check:translations`,
`check:docs`, `check:secrets`, `check:sca` and `build`.

The B4A enforced RLS suite is separate because it creates temporary roles in an
admin-capable disposable PostgreSQL 16 instance:

```bash
RLS_TEST_DISPOSABLE_DATABASE=true \
MIGRATION_DATABASE_URL=postgresql://... npm run test:rls
```

It runs 129 tests: 9 contextual, 42 core-customer, 11 public-bootstrap, 9 billing-system,
8 owner-security, 10 Information/REDI, 13 Finder/demo/cleanup and 9 final-boundary
plus 10 FORCE-specific and 8 privacy-foundation tests, including routine ownership/search-path grants, isolation, cross-tenant
denial, atomic quota/concurrency/AI/domain/media paths, pool reuse/concurrency and
representative slug/domain/preview/appointment/billing/Finder/cache/cleanup `EXPLAIN (ANALYZE, BUFFERS)`
evidence. The same harness runs enforced setup and release preflight. Evidence is
synthetic and is not a production benchmark.

`quality` runs the no-session-context scan and prints that it does not certify
this suite. CI runs the dedicated suite in a separate job.

## Task Group 4-B1 privacy verification

Run `npm run check:privacy-policy` for deterministic Policy v1/hash, complete
database/provider inventory coverage, legal-review safeguards and destructive
route checks. The database workspace includes
`rls-privacy-foundation.integration.test.ts`: active-policy immutability and
replacement, dry-run/no-mutation, holds, permission/direct denial, concurrent
claim, typed transitions/events and local EXPLAIN evidence. Site-data and web
tests prove the execution flag defaults off with zero DB query, the internal
route gate, and Owner privacy RBAC.

`npm run test:rls-upgrade` proves 046→047 preservation and non-destructive B1
rollback. `npm run test:rls` proves the full 001→047 PostgreSQL 16 enforced
boundary. These suites require an explicitly disposable database and synthetic
records only. They do not test providers, production data, real deletion,
backup restoration or legal correctness.

The locale acceptance matrix must cover EN/DE platform, signup/trial, checkout, login/recovery, every lifecycle state, editor, appointment requests and legal pages at desktop and mobile widths. Verify owner pages remain English after changing `platform_locale`. Separately verify at least one generated website in each of `de,en,fr,es,it,sq`, including `<html lang>`, metadata and request-only appointment wording. Custom-domain and private-preview checks must prove the tenant locale overrides the platform cookie.

Database integration tests require a disposable PostgreSQL database. Never point destructive or cleanup tests at production. Provider and payment tests should use Google quota intentionally and Stripe test mode.

Owner-auth integration tests deliberately truncate only the new owner-auth tables and therefore require both an isolated database and an explicit opt-in:

```bash
DATABASE_URL=postgresql://... OWNER_AUTH_DESTRUCTIVE_TESTS=true npm run test --workspace=@platform/site-data -- owner-auth.integration.test.ts
```

Apply all migrations first. The opt-in must never be set against a shared, staging or production database. The web owner-auth tests use mocks and do not require credentials or network providers.

## Owner outreach acceptance

1. Sign in at `/owner/login` with configured owner email and password.
2. Search for a real category and location.
3. Verify normalized unique leads, score breakdown, signals and pipeline history.
4. Repeat the identical search and verify an unexpired cache hit with no provider call.
5. Create a prepared profile, then a demo.
6. Repeat demo creation for the same profile version and verify the same site relation.
7. Create business-admin credentials and open the signed private preview. Replace the private link and confirm the old token is denied.

## Self-service acceptance

1. Enter only a business name and category on `/`.
2. Create an account with a new email and password.
3. Verify that the generated site opens in a new tab with hero and three service images.
4. Edit copy, theme, contact information and media from the business-admin panel; confirm the selected theme remains after refresh.
5. Verify that uploads are served as WebP.
6. Submit an appointment request and confirm it appears only for the correct site.

## Subscription and expiry acceptance

1. Create a configured-duration B2B trial and begin Starter Stripe test checkout while signed in as that site's administrator.
2. Confirm missing/expired sessions, preview-only access, cross-site slugs, Professional, Premium, unknown plans and cross-origin POSTs are denied before Stripe is called.
3. Complete payment with a Stripe test method and deliver a signed event whose intake, site, Starter Price and Checkout Session match the server-bound checkout.
4. Verify one intake activation and one processed webhook event despite duplicate delivery; a changed Stripe customer email must not change the administrator/login email.
5. Send missing or mismatched metadata and confirm activation fails closed.
6. Verify the activated site is publicly available at `/site/[slug]` after its original trial deadline.
7. Send renewal, payment-failed, reactivation and cancellation test webhook events; verify entitlement and public-site state change server-side.
8. For an inactive expired test site, verify preview denial, read-only admin recovery and retention before the recovery deadline; then verify cleanup only after the deadline and never for a site with a subscription row.
9. Run the protected cleanup endpoint and verify site-scoped cascading deletion.

## B2B legal/commercial acceptance

1. Confirm landing/pricing, trial and checkout show the B2B-only restriction; omit each required attestation separately and verify server rejection.
2. Confirm a sole proprietor with no VAT ID can proceed and remains `self_attested`; malformed syntax can become `review_required` but never `provider_verified`.
3. Confirm the server selects the active exact Terms/Privacy versions and hashes. Browser-supplied versions/hashes must be ignored.
4. Retry identical checkout and verify one attempt/acceptance. Change the legal source version and verify a new attempt while the first record rejects update/delete.
5. Confirm new provider activation requires the acceptance reference and a legacy subscription remains `acceptance_unknown`.
6. Verify the configured promotion requires separate acknowledgement/version; without an active configured promotion, neither acknowledgement nor arbitrary Stripe codes are enabled.
7. As admin/operator/viewer, confirm legal mutations fail. As owner, confirm activation/manual verification requires current password, a fresh TOTP step, explicit review confirmation and audit.
8. Confirm public platform projection omits private review/dispute metadata and generated sites use only customer-owned identity/privacy fields.
9. Run setup/release checks with missing config, missing tax mode and unreviewed/placeholder documents; each must fail closed.

## Authorization negatives

- Owner pages and APIs deny missing or invalid owner credentials.
- Business-admin sessions cannot read or mutate a different site.
- Preview tokens cannot start checkout, and authenticated checkout cannot target another site's slug.
- Authenticated mutation requests with a missing or cross-origin `Origin` are denied.
- Internal endpoints deny absent or incorrect secrets.
- Stripe events with an invalid signature do not change subscription or site state.
- `/api/internal/subscriptions/activate` remains retired with `410`; only verified provider webhooks may activate base subscriptions.

## Information media acceptance

1. Upload a raster image in the Information article editor and verify the browser converts it to WebP.
2. Select it as the featured image and in the article gallery; save the draft and verify both in authenticated private preview.
3. Open `/api/media/<asset-id>` without the site-admin session and verify the draft asset returns `404`.
4. Publish the article and verify the featured/gallery images on `/site/<slug>` and the exact verified custom domain.
5. Verify a different custom domain, a spoofed Host and a different tenant's media ID are denied.
6. Archive the article and verify media referenced only by that article is no longer publicly delivered.
7. In production, confirm the object belongs to the private Information Blob store and the browser never receives its raw storage URL.

## Information ad-slot acceptance

1. Have an authorized platform owner configure selected placements through the fixed-slot owner boundary; confirm the Editorial CMS cannot mutate advertising configuration.
2. Verify enabled placeholders on the platform route and exact verified custom domain; disabled slots must render nothing.
3. Verify another tenant's configuration cannot appear on the current site.
4. Inspect the output and confirm it contains only the controlled `data-ad-slot` and `data-ad-format` contract, with no injected external script or HTML.
5. Verify desktop and mobile layouts reserve stable space without horizontal overflow.

## REDI CONTROL Information API acceptance

1. Keep the inbound feature disabled and confirm the versioned endpoint fails closed.
2. Activate one Information-site mapping through the owner grant endpoint with read/create/update/submit only.
3. Sign a list request and confirm only that site's articles are returned with a maximum page size of 50.
4. Repeat the signed request with the same nonce, an expired timestamp, modified query, modified installation ID and modified body; confirm rejection.
5. Create the same external reference and idempotency key twice using a fresh nonce; confirm one article and a replayed response.
6. Confirm a media ID and category ID from another site are rejected.
7. Create and update a draft, then submit it. Confirm publication is denied without `articles:publish`.
8. Add the publish grant, send a current approval for the pending version and confirm publication plus audit details.
9. Confirm the integration route is unavailable through customer custom domains and public behavior remains unchanged.
10. Run the repository integration suite with `DATABASE_URL`, the complete quality gate and a production build.
## Owner RLS suite

`npm run test:rls` now creates ephemeral runtime, system and owner LOGIN roles
in PostgreSQL 16 and runs 89 tests. The eight B3C1 tests cover identity/grants,
direct-table denial, session/MFA/permission resolution, immediate DB role
changes, safe projections, transaction context cleanup/nesting and synthetic
`EXPLAIN (ANALYZE, BUFFERS)` evidence. Run owner auth/team destructive tests
with `OWNER_AUTH_DESTRUCTIVE_TESTS=true` only on a disposable database.

The ten B3C2 tests cover owner/admin versus operator/viewer Information
management, exact editorial context and tenant isolation, published-only
public projections, media eligibility, exact REDI bootstrap/permission,
concurrent nonce replay, request idempotency, body-supplied site rejection,
Social-state non-interference and synthetic resolver plans. The suite requires
`RLS_TEST_DISPOSABLE_DATABASE=true`; never target shared/staging/production.
