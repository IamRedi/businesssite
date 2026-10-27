-- Provider-neutral base subscription state while preserving all Stripe columns.
alter table subscriber_intakes
  add column if not exists billing_provider text not null default 'stripe';

alter table subscriber_intakes
  drop constraint if exists subscriber_intakes_billing_provider_check;
alter table subscriber_intakes
  add constraint subscriber_intakes_billing_provider_check
  check (billing_provider in ('stripe', 'paddle'));

alter table site_subscriptions
  add column if not exists billing_provider text not null default 'stripe',
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_price_id text;

update site_subscriptions
set provider_customer_id = coalesce(provider_customer_id, stripe_customer_id),
    provider_subscription_id = coalesce(provider_subscription_id, stripe_subscription_id),
    provider_price_id = coalesce(provider_price_id, stripe_price_id)
where billing_provider = 'stripe';

alter table site_subscriptions
  drop constraint if exists site_subscriptions_billing_provider_check;
alter table site_subscriptions
  add constraint site_subscriptions_billing_provider_check
  check (billing_provider in ('stripe', 'paddle'));

alter table site_subscriptions
  drop constraint if exists site_subscriptions_status_check;
alter table site_subscriptions
  add constraint site_subscriptions_status_check
  check (status in ('pending', 'trialing', 'active', 'paused', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired'));

create unique index if not exists site_subscriptions_provider_subscription_idx
  on site_subscriptions(billing_provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists site_subscriptions_provider_customer_idx
  on site_subscriptions(billing_provider, provider_customer_id)
  where provider_customer_id is not null;

-- Keep the original event_id primary key so the previous release remains compatible
-- while this additive migration is applied before the application deployment.
-- Provider event IDs are still indexed as a pair for the provider-neutral code path.
create unique index if not exists payment_webhook_events_provider_event_idx
  on payment_webhook_events(provider, event_id);
