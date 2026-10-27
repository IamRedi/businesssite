# B2B launch policy

BusinessSite RC launch acquisition is restricted to businesses and self-employed professionals acting for their commercial or independent professional activity. It is not a B2C purchase flow. This repository enforcement is an operational boundary, not proof of a customer's legal status and not a guarantee of legal compliance.

## Enforcement

In the RLS pilot, migration `041` makes identity versioning, intake reservation
and immutable acceptance one session-bound database transaction. The routine
re-resolves active account/site/slug and exact EN/DE reviewed evidence; browser
account, plan, provider and legal version/hash claims are not authority.

- Landing/pricing and trial/signup show the restriction before account creation.
- Checkout requires legal/business name, country, business category, business-use attestation, contracting-authority attestation, separate Terms acceptance, automatic-renewal acknowledgement and Privacy Notice acknowledgement.
- VAT ID is optional. Local normalization is syntax-only and never labelled provider verification. No VIES request is made.
- A real configured launch promotion adds a separate promotion acknowledgement. The evidence records the configured promotion-terms version.
- The authenticated site-admin session supplies account, email and site ownership. The browser cannot supply the contract document version or hash.
- The authenticated account's durable EN/DE preference selects the legal locale. Checkout requires active reviewed Terms and Privacy in that exact locale and never falls back across languages.
- Consumer withdrawal/Widerruf is not offered by this B2B flow. Cancel-at-period-end and the documented access lifecycle remain available.

Business identity states are `self_attested`, `review_required`, `manually_verified`, `provider_verified` and `rejected`. Launch uses self-attestation; malformed VAT syntax may flag manual review. `provider_verified` is reserved for a later provider integration and is never produced by local syntax checks.

## Normative references and review boundary

The product distinction is based on [BGB §13](https://www.gesetze-im-internet.de/bgb/__13.html) and [BGB §14](https://www.gesetze-im-internet.de/bgb/__14.html). Platform provider information is structured with [DDG §5](https://www.gesetze-im-internet.de/ddg/__5.html) in mind. Privacy-information structure follows [GDPR Article 13](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679).

These links are implementation references only. The operator must obtain professional review for its jurisdiction, exact identity, final contract text, tax presentation, privacy roles, and sales process before activating a version. The software does not certify the operator, customer, legal text or tax treatment.

## Deferred boundaries

Full GDPR export/deletion/retention automation, VIES/provider verification, VAT calculation, reverse-charge decisions, invoicing and full white-label/PWA cleanup are separate tasks. Customer lifecycle is EN/DE, generated sites remain six-language and owner UI is English-only. Professional and Premium, Paddle acquisition, Social Media Studio and REDI CONTROL remain unavailable according to the product catalog.
