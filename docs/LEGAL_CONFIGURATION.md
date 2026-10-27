# Legal and commercial configuration

Migration `036_b2b_commercial_legal_boundary.sql` stores versioned platform legal/commercial configuration. Configure and review it in `/owner/legal`; do not put a real operator identity in source control.

## Identity boundaries

| Role | Source of truth | Public use |
| --- | --- | --- |
| Platform operator | `platform_legal_config_versions` | Platform imprint, Terms/controller contact and commercial display |

Owner management reads and writes these tables only through migration 042
procedures. Owner create/review/activation and business-identity review require
the authenticated session, current password and fresh non-replayed TOTP in the
same transaction. Admin remains read-only; operator/viewer and customer/system
identities cannot mutate legal evidence. Registered owner documents are limited
to exact EN/DE manifest version/hash evidence; reviewed/active identities remain
immutable.
| White-label buyer/operator | Deployment owner plus the active platform legal version | May be the platform operator, but branding alone never supplies legal identity |
| Customer business | `customer_business_identities` | Contract evidence and internal verification state |
| Generated website owner/controller | `SiteDocument.publicLegal` | Customer website legal identity and customer privacy-notice link only |
| Billing identity | Stripe customer/address/tax-ID collection | Provider billing; never changes login or website ownership |
| Technical contact | Deployment/operations configuration | Infrastructure operations only |
| Support contact | `supportEmail` and brand support settings | Customer support; not automatically treated as legal contact |

The public projection excludes database IDs, review status/timestamps, reviewer information and private dispute-workflow metadata. A private tax number is not modelled or published. Conditional register, representative, VAT, supervisory and editorial fields render only when configured.

## Version lifecycle and privileges

Migration `041` enables routine-only non-FORCE RLS on legal config/document,
business identity and acceptance tables. Customer runtime can resolve only the
active reviewed exact-locale checkout projection and atomically persist its own
acceptance. It cannot read drafts or mutate evidence; the provider system cannot
manage legal versions. Owner legal management remains compatibility until 3-B3C.

Configuration versions start `draft` with `legal_review_required`. Only an authenticated `owner` can create or activate a version. Activation requires current password, a fresh non-replayed TOTP step, explicit review confirmation and an audit event. Activation marks the selected exact version reviewed/active and retires the prior active version. Admin has read-only legal-console access; operator and viewer have no mutation permission.

Legal documents are repository-owned versioned EN/DE sources registered by key, locale, version and SHA-256 hash. Lifecycle states are `draft`, `legal_review_required`, `reviewed`, `active` and `retired`. Production checkout accepts only an active, reviewed database record whose version/hash exactly matches the current source. Changing content requires a new version.

Checkout selects the legal locale from the authenticated customer account preference. EN requires active reviewed EN Terms and Privacy; DE requires the corresponding DE versions. Missing exact evidence blocks checkout with a localized controlled error. Translation creates a distinct source/version and never inherits review state. Browser locale/version/hash fields are ignored.

The source drafts deliberately say that professional legal review is required. Activation records operator review; it is not a certification claim.

## Tax and price display

The required tax-display modes are:

| Mode | Meaning |
| --- | --- |
| `gross_inclusive` | Displayed price includes configured applicable tax |
| `net_plus_tax` | Displayed price is net and applicable tax is additional |
| `tax_exempt_or_special_note` | Operator supplies exact reviewed explanatory text |

There is no assumed production default. Production billing setup requires an active reviewed configuration, currency matching `NEXT_PUBLIC_DEFAULT_BILLING_CURRENCY`, a non-empty price/tax label and, for the special mode, operator-provided text. The operator must reconcile the visible recurring price and promotion copy with the Stripe Price and configure Stripe Tax/invoices as applicable. BusinessSite does not calculate VAT, decide reverse charge, validate VIES or generate invoices.

Environment `LEGAL_*` values are explicitly non-production rendering fixtures and setup inputs; they do not become an active reviewed database version automatically. See [.env.example](../.env.example), [configuration](CONFIGURATION.md) and [release checklist](RELEASE_CHECKLIST.md).

## Customer public release gate

`CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED=true` is mandatory for production. Public slug/custom-domain resolution then requires customer-owned legal/business name, address, country code, legal contact email and a safe customer privacy-notice URL. Platform operator identity is never copied into the generated website. Missing fields keep the site private/fail closed.
