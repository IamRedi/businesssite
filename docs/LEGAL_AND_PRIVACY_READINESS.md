# Legal and privacy readiness

Task Group 4-B2 is a technical authenticated portability export, not legal certification or a complete DSAR program. It covers customer/site-admin and owner-team self subjects only. Public appointment/Finder requesters, legal identity/deadlines, deletion/anonymization, provider erasure and backup retention require later approval.

Status: implemented and locally testable, but production-blocked until the operator supplies an exact identity, activates reviewed EN/DE legal versions and completes professional legal/privacy/tax review. The software does not guarantee or certify compliance.

## Implemented safeguards

- Launch acquisition is B2B-only. Landing, trial and checkout disclose the restriction; checkout stores separate business-use, authority, Terms, renewal, Privacy Notice and conditional promotion evidence.
- Platform legal/commercial identity is versioned separately from branding, support, infrastructure, billing identity, customer contract identity and each generated website's public legal identity.
- `/legal/imprint`, `/legal/privacy`, `/legal/terms` and `/legal/cancellation` render versioned EN/DE operational drafts. Unreviewed content is visibly marked; production checkout requires the exact active reviewed version/hash.
- VAT ID is optional and local syntax normalization is not verification. No tax, invoice or VIES engine exists.
- Privacy Notice links appear at trial, checkout/business identity, recovery, invitation, AI generation and media upload. A generated site's appointment form uses the customer-owned privacy URL; the platform identity is not substituted.
- Public customer websites do not contact Google Maps until the visitor explicitly loads the map.
- Authenticated customers manage cancellation through the configured provider. Cancellation takes effect at period end and follows the documented grace/read-only/locked lifecycle.

## Article 13 content boundary

The Privacy Notice source contains configuration/review points for controller identity/contact, purposes, legal bases, provider-recipient categories, international transfers/safeguards, retention criteria, rights/complaint route, required versus optional fields and automated-decision status. A notice acknowledgement is not described as general consent.

The operator must replace generic categories with its actual provider and controller/processor facts, sign required processing agreements, assess transfers and confirm the competent complaint authority. Policy v1 now supplies a versioned technical retention registry, dry-run plans and scoped legal holds; it is not professional approval. Full data export, activated-customer deletion/anonymization and registry-driven destructive execution are not implemented in B1.

## Decisions and professional review still required

1. Enter the exact platform operator name/form, service address, representative, contact/support roles, register, VAT, supervisory and editorial fields only where applicable.
2. Review B2B eligibility, checkout presentation, contract formation, renewal/cancellation language, liability/warranty omissions and any jurisdiction clause with qualified counsel.
3. Reconcile tax label/currency/normal price/promotion with Stripe and decide Stripe Tax and invoice configuration with qualified tax advice.
4. Review the platform Privacy Notice and the controller/processor relationship for every generated customer website.
5. Obtain professional approval for the Policy v1 periods and define contract/billing/accounting periods, export delivery, deletion/anonymization and provider reconciliation procedures.
6. Provide customer-owned public legal identity and privacy content before a generated site becomes public.

No personal or business identity is hardcoded in the repository. `LEGAL_CONTACT_EMAIL`, `LEGAL_SUPPORT_EMAIL` and `EMAIL_FROM` are different roles and must be configured independently. The obsolete EU Online Dispute Resolution platform link is not included.

See [B2B launch policy](B2B_LAUNCH_POLICY.md), [legal configuration](LEGAL_CONFIGURATION.md) and [contract acceptance](CONTRACT_ACCEPTANCE.md).

## Technical retention foundation

Migration `047` seeds one immutable active technical policy and 17 rules, adds a PII-minimizing job/event ledger and scoped legal holds, and exposes the read-only/dry-run Owner workspace at `/owner/privacy`. Contract/billing/accounting remains `manual_review`, active subscriptions remain blocked from deletion, and execution defaults off. See [Policy v1](PRIVACY_RETENTION_POLICY.md), [privacy jobs](PRIVACY_JOBS.md) and [legal holds](LEGAL_HOLDS.md).

## License boundary

`LICENSE` grants no buyer rights by itself. Each commercial white-label delivery requires a separate executed agreement defining permitted deployments, source redistribution, support/update scope, warranty, payment, termination and data/legal responsibilities. Third-party dependencies retain their own licenses.
