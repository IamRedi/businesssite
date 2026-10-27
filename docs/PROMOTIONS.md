# Promotion codes

The Owner area at `/owner/promotions` manages customer-facing Stripe Promotion Codes. Stripe is the billing source of truth; the platform does not duplicate coupon validity or redemption counters in Postgres.

## Included offers

| Preset | Stripe discount | Recommended use |
| --- | --- | --- |
| Launch: 2 months free | 100% for 2 recurring billing months | Create a limited launch code, set its Stripe `promo_...` ID as `STRIPE_LAUNCH_PROMOTION_CODE`, then explicitly enable `NEXT_PUBLIC_LAUNCH_OFFER_ENABLED=true` |
| Friends: 6 months free | 100% for 6 recurring billing months | Set maximum redemptions to `1` and create a different code for each recipient |
| Launch: 50% for 3 months | 50% for 3 recurring billing months | Set the campaign redemption limit and an optional redemption deadline |

The discount ends automatically after the configured recurring months. The subscription then continues at its normal plan price unless the customer cancels it.

## Owner workflow

1. Sign in at `/owner/login`.
2. Open **Promotion codes** in the Owner navigation.
3. Select an offer, enter a code, set its maximum redemptions and optional expiry date.
4. Keep **first-time customers only** enabled unless the campaign deliberately targets existing customers.
5. To use one code in the current B2B launch, set its exact `promo_...` ID as the configured automatic launch promotion and enable the public launch-offer flag. Arbitrary customer-entered codes are disabled because the server cannot bind their exact terms to pre-Checkout acceptance evidence.
6. Monitor redemption counts or deactivate the code from the same Owner page.

Codes accept 4–32 letters, numbers and dashes and are normalized to uppercase. Do not reuse one unlimited code for private complimentary access.

## Billing and domains

Starter includes the current custom-domain entitlement. Promotion codes change the invoice amount for their defined duration; they do not remove plan entitlements. The broader catalogue remains visible as EUR €29/€69/€119, USD $39/$99/$139 and ALL 2,000/4,500/9,900 per month, but only Starter is purchasable in this release. Every enabled Starter currency requires its matching recurring Stripe Price ID.

Checkout applies only the server-configured `STRIPE_LAUNCH_PROMOTION_CODE`. It requires the separate promotion acknowledgement and stores its version before redirecting to Stripe. When no configured promotion is active, no promotion acknowledgement is requested and Stripe's arbitrary promotion-code field is not enabled. Coupon creation, limits, expiry, redemption tracking and deactivation remain Stripe operations.

## Current landing-page presentation

- The launch banner is rendered only when `NEXT_PUBLIC_LAUNCH_OFFER_ENABLED=true`, a valid server-side `STRIPE_LAUNCH_PROMOTION_CODE=promo_...` exists, Starter is promotion-eligible, Stripe is the catalog-active acquisition provider, its acquisition credentials and Starter Price exist, and `STRIPE_STARTER_PRICE_CATALOG_VERIFIED=true`. Missing/invalid configuration hides the claim and normal-price checkout continues.
- Starter is the only active landing-page package action and sends the visitor to the self-service website creation form.
- Starter is also the only active option on the authenticated subscription page. Checkout derives the site and billing email from the current site-admin session.
- The active automatic promotion displays its duration/normal-price continuation and requires separate acceptance; a hidden, invalid or inactive promotion creates no claim or evidence.
- Professional and Premium remain visible for catalogue context but their landing and subscription actions are disabled and labelled as coming soon. The API rejects both plans and unknown plan IDs fail-closed. Enabling either later requires an explicit product decision plus checkout and entitlement acceptance for that package.
- The self-service flow begins with the `TRIAL_DURATION_DAYS` no-card trial; landing copy reads the same configured duration. The two free recurring months apply after the trial when the customer starts the promoted subscription, and normal billing begins afterward unless the customer cancels.

## White-label operation

Each buyer creates coupons in their own Stripe account. No code, coupon ID or recipient is hard-coded into the repository. The Owner route is protected by the platform Owner session and must never be exposed without configured Owner credentials.
