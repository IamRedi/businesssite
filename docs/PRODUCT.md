# Product scope and workflows

## What the product is

The platform combines a private operator workspace with a B2B-only customer-facing website product. It turns either a discovered business or a minimal self-service business intake into a complete editable website demo. Businesses and self-employed professionals may acquire Starter; a consumer purchase path is not part of launch.

The generated site is represented by a neutral `SiteDocument`. Business discovery, persistence, payment and UI remain adapters around the pure website engine.

In `DATABASE_RLS_MODE=pilot`, migration 044 moves active Finder persistence,
prepared-demo creation, self-service trial identity/session creation, preview
issuance, application rate limiting and expired-demo cleanup behind distinct
owner/runtime/system routines. This is locally verified, non-FORCE database
isolation; it is not real Google/provider or production acceptance.

## Operator outreach workflow

1. The platform owner signs in at `/owner/login`.
2. Finder searches Google Places by category, exact address or device location and radius.
3. Results are normalized, deduplicated, scored and persisted with reasons and audit history.
4. `/owner/businesses` keeps every saved business in a card-based workspace with website status, score, rating, contact enrichment, pipeline state and generated-profile history.
5. `/owner/searches` preserves fresh and cached Finder runs with location, radius, result count and links to the resulting business records.
6. `/owner/customers` combines website, trial, subscriber-intake and Stripe subscription state into one owner-only customer operations view.
7. `/owner/promotions` creates and monitors controlled Stripe promotion codes for private complimentary access and time-limited campaigns.
5. Optional owner AI research enriches the durable lead record with verified category, description, services, email, phone, address, social links and opening hours before preparing the website plan.
6. The owner prepares a versioned `PreparedBusinessProfile`.
7. `Create Demo` generates one idempotent site for that profile version.
8. The owner creates business-admin credentials and shares the private preview and sign-in details.
9. The business edits the demo during its configured trial.
10. The authenticated business administrator starts Starter checkout for that same site. A verified Stripe subscription activates only the pre-bound site and prevents trial cleanup; preview access and billing email never transfer ownership.
11. Social Media remains **Coming soon**. Its direct page is informational, its checkout endpoint returns `410`, and no new add-on is provisioned from webhook metadata.

## Complimentary (owner-granted) workflow

1. The owner signs in at `/owner/login` and opens `/owner/complimentary`.
2. The owner supplies the business name, customer email, language (EN/DE), the plan whose feature entitlement is granted (Starter, Professional or Premium) and an optional internal reason.
3. Creation is one audited transaction: a public, activated business website, the administrator account, plan-aligned feature entitlements and a `site_complimentary_access` row with `status = complimentary_active` and no expiry.
4. The owner receives the single-use password-setup link exactly once. It expires after one hour; the customer sets their own password there and then signs in at `/site-admin/login`. The stored password hash of a fresh account can never verify a login.
5. Complimentary access needs no Stripe/Paddle object, no checkout and no billing webhook, and it is unaffected by `BILLING_EXECUTION_ENABLED`. Trial expiry, recovery and demo cleanup never lock or delete a complimentary site.
6. Only an owner with `websites.manage` can revoke. Revoking hides the website, signs out admin sessions and records the owner, timestamp and reason. The customer keeps site data and can subscribe normally later.
7. When the customer later subscribes, the verified provider event activates the subscription and deterministically retires the entitlement (`converted`, with first-conversion timestamp) without losing site, content, media, login, domain or settings.

## Self-service workflow

1. A business user starts from `/`, sees the B2B-only restriction and supplies a business name and category.
2. The user attests business/professional use, acknowledges the Privacy Notice and creates an account with an email and password.
3. The website engine fills missing copy, services, theme and starter media from the selected category.
4. The generated website opens through a signed private preview URL and remains editable for the configured trial duration.
5. The authenticated user supplies the customer business identity and separate checkout attestations, then subscribes from the site or editor to keep access. A canceled or
   otherwise recoverable customer can restart authenticated Starter checkout
   against the same site; only the verified provider event restores access.

## Site-owner capabilities

The business owner signs in at `/site-admin/login`. The editor presents one focused section at a time for identity, content, services, images, design, and contact. Contact includes address-based map data and a seven-day schedule with explicit closed-day controls. Each section saves independently so unrelated website data is not overwritten. Browser uploads are converted to WebP before persistence. Unverified demo opening hours are editable starter content and must be reviewed before publication.

Starter includes the complete current editor, media under quota, client AI under quota/provider availability, request-only appointments, every current style including Gold, and connection of a customer-owned existing domain. Professional and Premium are catalogue-only **Coming soon** plans. See [Product availability catalog](PRODUCT_AVAILABILITY.md).

Template extension and rendering rules are documented in [Website templates and themes](TEMPLATES_AND_THEMES.md).

The automotive catalog contains separate `auto-repair` and `car-dealership` subcategories. Each has an exclusive hero and three-image service pack so workshop/repair content cannot be mixed with showroom/vehicle-sales content.

## Lifecycle rules

- New demos are private, use revocable preview tokens and expire after the configured trial duration.
- Expired previews are rejected immediately. The customer session can still
  open the read-only recovery panel until the configured recovery deadline.
- Scheduled cleanup deletes only expired, never-paid trials after the durable
  recovery window; any subscription row, recent pending payment or active
  preview excludes the site from trial cleanup. It is not activated-customer
  GDPR deletion or orphan-media cleanup.
- Only a verified payment webhook may mark a Stripe intake paid and activate its site.
- A new activation additionally requires immutable, server-versioned B2B contract acceptance bound to that exact account/site/intake. Historical subscriptions remain `acceptance_unknown`.
- Active/trialing subscriptions are full. Past-due subscriptions receive seven
  days of durable grace for public resolution, appointment requests and core
  editing while cost-bearing mutations are blocked. Inactive/expired-grace
  accounts are private and read-only for 30 days, then locked without deletion.
- A newer verified reactivation restores the same site, ownership and saved
  publication intent. Duplicate/stale events cannot reactivate it.
- Custom-domain requests may be recorded only for activated sites; DNS verification and routing remain a separate provider integration.

The authoritative capability matrix and timestamp semantics are in
[Subscription lifecycle and customer access](SUBSCRIPTION_LIFECYCLE.md).

## Out of scope today

Automated outreach, AI image generation, a booking calendar, direct domain procurement, organization accounts, a production identity provider, metered AI billing and customer support tooling are not part of the current product. Appointment forms collect a preferred time and the business confirms personally; they are not a booking calendar.

Tax calculation, invoice generation, VIES/provider business verification and consumer commerce are also out of scope. See [B2B policy](B2B_LAUNCH_POLICY.md).
## AI-assisted website workflow

When enabled by the buyer, the platform owner can open a lead, add creative direction, optionally analyze readable text from its existing public website, review the recommended template/theme/copy/services, and create a private demo. Applying the same completed AI run again returns the same demo.

Business customers receive a deliberately smaller assistant inside the editor: hero, about and service-description rewrites only. Generated text is placed into the field for review and is not persisted until Save is selected.
