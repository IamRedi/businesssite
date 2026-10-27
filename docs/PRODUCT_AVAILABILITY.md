# Product availability catalog

The typed catalog in `packages/product-catalog/src/index.ts`, backed by the
secret-free `catalog.json`, is the executable launch boundary. UI order,
environment variables, provider Price IDs and database enum values do not make
a product available.

## Status model

| Status | Meaning |
| --- | --- |
| `active` | Available through its enforced launch workflow |
| `coming_soon` | May be shown as future context; purchase and use fail closed |
| `hidden` | Not shown or offered; configuration alone cannot activate it |
| `internal` | Seller/owner operational capability, never a customer-plan claim |

Readiness is separate: `locally_verified`,
`provider_configuration_required` or `production_verified`. Provider
configuration never changes launch status.

## Launch catalog

- Starter is the only active/purchasable plan and supports Stripe acquisition.
- Starter acquisition is B2B-only and requires the versioned contract-acceptance boundary. VAT ID is optional.
- Professional and Premium are `coming_soon` and have no purchase path.
- Social Media is `coming_soon`; its route displays only that status and its
  checkout endpoint returns `410` without contacting Stripe.
- Paddle billing is `hidden` and runtime-disabled for acquisition and portal.
- Information/News and advertising placeholders are `internal`. Platform
  owner/admin provision and control integrations/placeholders; the deliberately
  created publication editorial administrator manages same-site content. Public
  published articles are reader-facing, but Information is not a customer-plan
  entitlement or purchase claim.
- Existing-domain connection is active but still requires Vercel production
  verification. Direct domain purchase is `coming_soon`.

## Starter entitlements

Starter includes website publication, editor mutations, WebP media under quota,
client AI rewrite under quota and provider availability, request-only
appointments, all current styles including Gold, and connection of an existing
custom domain. Trial access includes editor, media, AI and appointment requests;
domain connection and public publication require an active paid subscription.

`appointment_requests` is the canonical entitlement. Migration `034` retains
legacy `booking` as a compatibility alias for request-only appointments and
adds `booking_calendar=false`; it does not rename or delete existing data.
`custom_domain_existing` similarly replaces ambiguous new-code use of the
legacy `custom_domain` key.

Subscription status is interpreted only by the typed central lifecycle policy.
`active`/`trialing` are full; cancel-at-period-end remains full until the saved
effective end. `past_due` receives a durable seven-day grace period with public
resolution, appointment requests and basic editing, while media, AI and domain
mutations are denied. Inactive states and expired grace are private/read-only
for 30 days, then locked without deleting paid data. See the complete
[subscription lifecycle matrix](SUBSCRIPTION_LIFECYCLE.md).

## Provider gates

- A launch promotion is active only when the public request flag, a valid
  server-side `promo_...` ID, Starter eligibility, the Stripe acquisition
  credentials/Starter Price and explicit price-catalog verification all agree.
  Otherwise the banner is hidden and normal checkout continues.
- Stripe Portal requires `STRIPE_PORTAL_CONFIGURATION_STARTER` and explicit
  `STRIPE_PORTAL_STARTER_ONLY_VERIFIED=true`. The referenced Dashboard
  configuration must permit payment-method/cancellation management and prohibit
  product switching.
- `PADDLE_LEGACY_LIFECYCLE_ENABLED=false` is the default. When explicitly true,
  signed Paddle events are stripped of intake/site/plan claims and may resolve
  only an existing provider-subscription binding. They cannot create first
  activation or change the local plan.

The public projection exposes statuses, readiness, entitlements and trial
policy, but no secrets, Price IDs or promotion IDs. `scripts/product-catalog.mjs`
loads the same JSON for setup and release validation.
