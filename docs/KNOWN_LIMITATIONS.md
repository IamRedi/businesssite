# Known limitations and release exceptions

- Export embeds bounded PostgreSQL media; external/provider media is inventory-only pending private provider-copy acceptance.
- ZIP construction is bounded-memory (100 MiB maximum), not streaming. Oversize subjects fail whole and need support handling.
- Public requester DSAR remains unimplemented. Authenticated BusinessSite closure/anonymization is hosted-staging accepted for the exact B5C provider boundary, but both flags default off and production execution is blocked on legal review and operational acceptance.

This document prevents code-complete features from being marketed as provider-verified production features.

PostgreSQL RLS + FORCE is enforced through migration `053`, with four
NOLOGIN routine executors and exact manifest verification. Provider-managed
roles, runtime readiness and an isolated historical recovery are verified on
hosted staging; load, a Production 30-point backup schedule/store and Production monitoring remain required before claiming
production-verified tenant isolation.

| White-label/PWA | Remote assets/stylesheets are intentionally disabled; customer-admin PWA is online-only and not a native app | Add buyer-specific allowlist/CSP/asset review before enabling remote assets; complete browser staging acceptance |

| Area | Current boundary | Release requirement |
| --- | --- | --- |
| PostgreSQL RLS | 64/64 protected tables use FORCE after migration 063; 3 global/migration tables remain migrator-only; hosted Neon roles/readiness, historical recovery and exact routine owners/grants are checked | Load-test and approve/configure the Production 30-point backup schedule/store |
| Production deployment | Local/clean-clone evidence and an isolated B5C hosted-staging deletion acceptance exist; the current revision has no consolidated production-readiness acceptance | Complete the B6 NO-GO gates and Gates 1–3 in the production execution plan |
| Stripe | Authenticated same-site B2B Starter checkout, immutable contract evidence, billing-address/tax-ID collection and durable lifecycle are implemented; VAT calculation, invoices and provider tax correctness are not | Apply migrations `035`–`037`, reconcile price/currency/tax presentation, configure Stripe Tax/invoices as applicable and validate promotion, Portal and lifecycle in staging |
| Paddle Billing | Hidden/runtime-disabled. Optional legacy mode strips site/intake/plan claims and updates only an existing provider-subscription binding | Keep legacy flag false unless historical records require controlled lifecycle processing; a future launch requires separate acceptance |
| Redi Control | Coming soon. Direct page is informational, checkout is `410` and new add-ons cannot be activated from webhook metadata | Keep outbound/inbound flags disabled until the remote contract passes full two-system security/lifecycle tests |
| REDI CONTROL Information inbound | Versioned API plus system-only installation/permission/nonce/idempotency/content routines are locally verified; default remains disabled | One active shared inbound secret; keep disabled until REDI CONTROL implements and passes end-to-end staging acceptance |
| Custom domains | Vercel ownership + routing verification, normalized DNS guidance and exact-host routing are implemented | Validate certificate issuance/removal/retries with a staging domain; every apex and `www` alias requires independent DNS/TLS/routing acceptance; recurring health checks and direct reseller purchase remain deferred |
| Email | Localized EN/DE trial, demo, reset, team-invitation and appointment-request adapters exist with HTML/text bodies | Keep the sender on a Resend-verified domain and verify all flows plus renewal/cancellation notifications in staging before launch |
| Authentication | Site-admin lifecycle hardening plus database-backed owner password/TOTP/recovery/session, fixed RBAC, invitations and last-owner protection are implemented locally | Apply migrations `031`–`033`; validate real Resend invitation/recovery and multi-account authenticator/browser behavior in isolated staging. SSO/custom roles remain out of scope |
| Media | WebP validation, quotas, durable exact-store registration and the full exact-boundary Blob delete/reconcile lifecycle are hosted-staging accepted | Define malware/content moderation and object lifecycle policy; keep production cleanup off until B6 operational/legal gates pass |
| Finder | Owner procedure-only cache/persistence/scoring/demo boundary is locally verified; provider payloads are bounded and raw payload is not stored | Restrict the key, approve Google terms/data retention, monitor quota/cost and run real provider acceptance |
| AI | Provider-neutral audited workflows and bounded website reads exist | Buyer must approve model, budget, privacy disclosure, retention and output review |
| Abuse protection | Durable application limits and body/upload bounds exist | Configure provider WAF/bot controls and perform staging load verification |
| Legal | Versioned platform identity/documents, review gates and separate customer-site identity are implemented; bundled text remains `legal_review_required` until explicit owner activation | Qualified counsel/operator must approve the exact B2B terms, identity, privacy roles, cancellation and tax presentation; software does not certify compliance |
| Accessibility/performance | Responsive UI and automated code gates exist | Record manual device, keyboard, screen-reader and staging performance acceptance |

No unresolved repository-shipped image provenance remains according to the asset audit. Buyer/customer uploads and logos remain the uploader's responsibility.

Professional and Premium are catalogue-only **Coming soon** plans. They are disabled in the landing/subscription UI and rejected by `/api/subscribe`; provider Price IDs cannot activate them. Starter includes request-only appointments and all current styles, including Gold. A real booking calendar remains unimplemented. Private preview tokens authorize preview rendering only and never checkout or ownership.

Paid-account closure requires verified provider termination, the 30-day read-only window and a further 30-day cooling period. Authenticated customer export, BusinessSite anonymization, exact public Blob cleanup, exact Vercel project-domain detach and isolated hosted recovery are accepted in staging. Public-subject erasure, legally approved final export/retention periods and fields, a dedicated Production private export store/key/scheduler, Production alert routing, the 30-point Production backup schedule/store and Production acceptance remain open.

Business status is self-attested at launch. VAT syntax is not VIES or provider verification. Contract evidence is immutable, so a reviewed retention/deletion/export procedure is required before production subject-rights operations. Task Group 2-B4A establishes the EN/DE customer, six-language website and English-only owner boundaries locally; full provider/staging visual acceptance and the remaining branding/PWA work remain release work.
## Task Group 3-B3C4 residual boundary

Owner security/RBAC, approved customer projection and platform legal
management, Information/News tenant isolation, REDI inbound, Finder/discovery,
demo/trial/preview, global rate limits and cleanup are locally verified through
procedure-scoped identities. The remaining active compatibility writers were
removed in B3C4. FORCE RLS is locally completed in B4A; production credentials,
two-system REDI acceptance, production load evidence and operational restore
evidence remain outside this milestone. Local `DATABASE_RLS_MODE=off` retains an explicit
test/development compatibility projection; pilot mode has no compatibility
credential fallback. REDI media quota/concurrency and PostgreSQL Blob fallback
now use exact-integration system routines; metadata registration remains a
separate constrained step and may require orphan cleanup after partial failure.
