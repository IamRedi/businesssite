# Paddle Billing boundary

Pilot legacy events use `DATABASE_SYSTEM_URL` after Paddle signature
verification. The constrained routine accepts only an already-bound Paddle
subscription and preserves site, owner, plan and `acceptance_unknown`; unknown
subscriptions cannot activate. Default `410`, no-checkout and no-portal behavior
remain unchanged.

Paddle is `hidden` in the product catalog and runtime-disabled. It is not an
acquisition provider, has no customer checkout and has no customer portal.
Setting API keys, client tokens, Price IDs or `BILLING_PROVIDERS=paddle` cannot
activate it; setup/release validation rejects Paddle as an acquisition provider.

## Default behavior

- `/api/subscribe` rejects `billingProvider=paddle`.
- `/api/paddle/webhook` returns controlled `410 Gone` before signature/provider
  processing.
- The site-admin billing action refuses Paddle identities.
- No first Paddle activation or plan change is accepted.
- Historical database rows and webhook evidence are retained. The application
  never cancels or refunds a provider subscription automatically.

## Explicit historical lifecycle mode

`PADDLE_LEGACY_LIFECYCLE_ENABLED=true` is a server-only emergency/transition
gate and defaults to false. When enabled, configure only the API key, webhook
secret and correct `PADDLE_ENVIRONMENT`; production also requires
`PADDLE_LIVE_REVIEWED=true`.

The signed webhook input is stripped of `intakeId`, `siteId` and `planKey` before
persistence. It may update status only when `providerSubscriptionId` already
matches a bound `site_subscriptions` record. Unknown subscriptions are ignored;
the mode cannot create an intake, first activation, customer ownership or plan
change. It does not make Paddle visible or purchasable.

Historical events use the same durable ordering and fail-closed access policy
as Stripe: duplicate IDs are idempotent, older events are ignored, and an
equal-timestamp event can only make access more restrictive. This does not
constitute Paddle production verification.

## Manual handling

Before enabling historical mode, query/report the affected subscription IDs,
site IDs and current local/provider status through an approved operational
process without printing credentials or full customer data. Decide migration,
cancellation or refund manually with the product owner and provider. Disabling
the flag does not change provider-side state.

A future Paddle launch requires a separate authorized milestone: authenticated
account/site-bound checkout, portal configuration, price/catalog reconciliation,
legal alignment, sandbox acceptance and approved live verification.
