# Stripe setup

In `DATABASE_RLS_MODE=pilot`, configure a distinct `DATABASE_SYSTEM_URL` before
enabling this endpoint. Raw-body signature verification runs before any database
call; only normalized allowlisted input reaches the migrator-owned provider
routine. The system identity has no table grants and cannot call customer
checkout routines. This is locally verified only; repeat the lifecycle matrix
with current Stripe test-mode configuration before production acceptance.

Use `PLATFORM_PROFILE=billing` or `full-production`. Stripe is not required for a core or Finder-only installation.

1. In Stripe **test mode**, create the recurring Starter Product/Price. Starter is the only purchasable plan in the current release. Professional and Premium remain catalogue-only **Coming soon** plans and are rejected by the checkout API.
2. Copy the EUR Starter Price ID into `STRIPE_PRICE_STARTER`. Add `STRIPE_PRICE_STARTER_USD` or `STRIPE_PRICE_STARTER_ALL` only after creating matching recurring Prices in those currencies. Compare every configured Price amount/interval with its public display copy, then set `STRIPE_STARTER_PRICE_CATALOG_VERIFIED=true`. A checkout for a currency without a matching Starter Price ID fails closed. Future Professional/Premium Price IDs may remain unset and never activate those plans.
3. Set `STRIPE_SECRET_KEY` to the test secret key.
4. Add webhook endpoint `https://YOUR_APP/api/stripe/webhook` and subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`.
5. Copy the endpoint signing secret to `STRIPE_WEBHOOK_SECRET`.
6. In `/owner/legal`, activate the reviewed platform config and exact EN/DE document hashes, set the customer legal-identity production gate, then run `npm run setup:check`. Create a B2B trial, keep its site-admin session signed in, and start checkout. Confirm missing attestations or a missing/expired/other-site session is denied before Stripe is called.
7. Complete a Stripe test checkout and confirm the site appears at `/site/[slug]` only after a valid webhook whose intake, site, Starter Price and Checkout Session match the server-created record. Confirm a changed Stripe customer email does not change the business-admin login email.
8. Create a dedicated Billing Portal configuration that permits payment-method/cancellation management but no product switching. Put its `bpc_...` ID in `STRIPE_PORTAL_CONFIGURATION_STARTER` and set `STRIPE_PORTAL_STARTER_ONLY_VERIFIED=true` only after manually verifying those controls. Without both, the portal fails closed.
9. Keep Social Media disabled. Its checkout route returns `410` and webhook metadata cannot create a new add-on. Do not cancel/refund historical subscriptions automatically; report them for a manual decision.
10. Sign in as Owner, open `/owner/promotions` and create a bounded test code. For the campaign, copy its Stripe Promotion Code ID (`promo_...`) into `STRIPE_LAUNCH_PROMOTION_CODE`, then set `NEXT_PUBLIC_LAUNCH_OFFER_ENABLED=true`. Verify the B2B checkout shows and requires the separate promotion acknowledgement and records its version. Arbitrary customer-entered codes are not enabled; missing/invalid promotion configuration hides the banner and uses normal-price checkout.
11. Verify the [subscription lifecycle matrix](SUBSCRIPTION_LIFECYCLE.md): the
    first `past_due` event starts (and retries do not extend) seven-day grace;
    media/AI/domain are blocked during grace; effective cancellation becomes
    private/read-only; older events cannot reactivate; and a newer active event
    restores the same ownership/content and saved publication intent.

Do not activate a site or add-on from the success redirect. Stripe webhooks are the billing source of truth. `/api/internal/subscriptions/activate` is retired and returns `410`; do not recreate a bearer-token activation bypass. New intake activation also requires its immutable B2B contract acceptance. Checkout collects billing address and optional tax ID through Stripe; these are provider billing data and never change account ownership/login identity or constitute local VAT verification. Never reuse a base-plan Price ID for the Social Media add-on.

Provider `event.created` is persisted for ordering. Equal-second events accept
only a strictly more restrictive transition; reactivation therefore requires a
provably newer verified event. Do not rewrite lifecycle timestamps manually in
production except through a reviewed recovery procedure.
