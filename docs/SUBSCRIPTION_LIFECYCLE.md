# Subscription lifecycle and customer access

Migration `041_billing_legal_system_rls_boundaries.sql` moves pilot provider
lifecycle mutation behind the separate `bsrc_system` routine. Runtime cannot
execute it, system cannot execute customer checkout routines, and neither role
has direct grants on subscription, intake, webhook or lifecycle tables.

The executable policy is `resolveSubscriptionAccess` in
`packages/product-catalog/src/access-policy.ts`. It receives a persisted
snapshot and an injectable server clock and returns one typed access state plus
all customer capabilities. Routes and repositories must consume those
capabilities; they must not duplicate provider-status comparisons.

This policy applies to BusinessSite business websites. Information/News sites
have their independent owner/editorial access model.

## Access matrix

| Provider/customer state | Public website | Core editor | Appointments | Media | AI | Domain | Billing/reactivation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unexpired private trial | Private preview only | Full | Open | Open | Open when configured | Closed | Checkout open |
| `trialing` or `active` | Saved publication intent | Full | Open | Open | Open when configured | Open when entitled | Portal open |
| `active` + cancel at period end, before end | Saved publication intent | Full | Open | Open | Open when configured | Open when entitled | Portal open |
| `past_due`, first 7 days | Saved publication intent remains public/private | Core text/style only | Open | Closed | Closed | Closed | Recovery open |
| `past_due` after grace | Private | Read-only for 30 days | Closed | Closed | Closed | Closed | Recovery/reactivation open |
| `unpaid`, `paused`, `canceled`, `incomplete`, `incomplete_expired` | Private | Read-only for 30 days after prior activation | Closed | Closed | Closed | Closed | Recovery/reactivation open |
| Paid read-only window expired | Private | Locked; content is not deleted | Closed | Closed | Closed | Closed | Recovery/reactivation open |
| Trial expired, within recovery window | Private; preview denied | Read-only | Closed | Closed | Closed | Closed | Activation open |
| Trial recovery window expired | Private | Locked and cleanup-eligible | Closed | Closed | Closed | Closed | New checkout closed |
| Missing, unknown or corrupt lifecycle data | Private | Locked/fail-closed | Closed | Closed | Closed | Closed | Safe recovery boundary only |

Core editing during payment grace covers identity, hero/about text, services,
contact/opening hours and existing design selection. Server enforcement blocks
the media editor section, media upload route, client AI route and domain
mutations. Appointment terminology remains request-only; no booking calendar is
implemented.

## Durable state

Migration `035_subscription_access_lifecycle.sql` adds:

- `sites.trial_recovery_ends_at` and `sites.publication_intent`;
- provider-observed, first-past-due, grace-end, suspension, read-only-end and
  last-active timestamps on `site_subscriptions`;
- latest accepted provider event timestamp/ID;
- a monotonic `subscriber_intakes.checkout_attempt` for reactivation checkout
  idempotency;
- provider event time/site/disposition evidence on `payment_webhook_events`;
- secret-free `subscription_lifecycle_events` audit records.

Defaults are 7 grace days, 30 paid read-only days and 30 trial-recovery days.
`SUBSCRIPTION_PAYMENT_GRACE_DAYS`, `SUBSCRIPTION_READ_ONLY_DAYS` and
`TRIAL_RECOVERY_DAYS` may override them within catalog bounds. Setup and release
preflight reject invalid values. Existing rows are backfilled conservatively;
the migration deletes no content, media, appointments, accounts or provider
records.

Migration `036_b2b_commercial_legal_boundary.sql` adds a separate acquisition-evidence layer. New provider activation from an intake requires `contract_acceptance_id` and sets `contract_acceptance_state='accepted'`. Existing subscription rows remain `acceptance_unknown`; the migration never manufactures historical acceptance. The access policy itself remains in the product catalog and is not replaced by legal evidence.

## Provider ordering and idempotency

Webhook signature verification remains the first provider boundary. A unique
provider event ID makes exact replay idempotent. For an already-bound
subscription, events older than `latest_provider_event_at` are retained as
ignored/stale evidence. Provider timestamps can have only second precision, so
at an equal timestamp only a strictly more restrictive transition is accepted:
for example active to canceled is accepted, while canceled to active is
ignored. A permissive transition requires a provably newer verified event.
Once a subscription is in an immediate suspended/canceled state, a later
`past_due` event cannot reopen grace; only a newer verified `active`/`trialing`
event restores access. Transitions among immediate inactive states preserve the
original read-only window.

The first `past_due` event writes the grace window. Newer retries preserve that
window rather than extending it. An active cancellation scheduled for period
end stores the effective end and stays full until that instant. Missing or
invalid status/effective timestamps fail closed.

Paddle remains hidden and runtime-disabled. Its explicit legacy switch can only
apply this ordering policy to an already-bound historical Paddle subscription;
it cannot create a first activation, ownership or plan.

## Reactivation and publication intent

Reactivation requires an authenticated site administrator and the active
Starter/Stripe catalog path. It reuses the existing site/account binding and
bound Stripe customer when present, then creates a new checkout attempt without
creating a site or changing the login email. Redirect success is not activation:
only a newer verified provider event
restores full access.

Billing-forced privacy is stored separately from the customer's publication
intent. A previously public site becomes public again after verified
reactivation; a site the customer kept private remains private. Content, media,
domain records, appointments and ownership are preserved.

## Trial cleanup and operations

Trial expiry immediately denies public/private preview and mutations. Cleanup
waits until the durable recovery deadline. The delete query also requires no
`site_subscriptions` row, so stale trial fields cannot select a paid or
reactivated site. A recent pending checkout intake also defers cleanup for 24
hours so an in-flight verified provider event can bind safely. Paid-account deletion and final retention are intentionally
outside this milestone and remain GDPR work.

`reconcileLifecycleStates()` is idempotent and records time-based transition
events while applying billing-forced privacy. The daily cleanup invokes it.
Monitoring should alert on stale-event volume, repeated payment grace entry,
grace/read-only transitions, locked accounts, cleanup failures and webhook
failures without logging payment data or secrets.
