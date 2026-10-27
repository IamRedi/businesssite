-- Social Media is a separately billed add-on, never a base-plan entitlement.
create table if not exists site_addon_subscriptions (
  site_id text not null references sites(id) on delete cascade,
  addon_key text not null check (addon_key in ('social_media')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  last_processed_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, addon_key)
);

create index if not exists site_addon_subscriptions_customer_idx
  on site_addon_subscriptions(stripe_customer_id);
create index if not exists site_addon_subscriptions_status_idx
  on site_addon_subscriptions(addon_key, status, current_period_end);

-- Migration 018 provisionally mapped Professional/Premium to Social Media.
-- Remove that provisional grant; only a verified add-on subscription may enable it.
update site_features set enabled=false where feature_key='social_media';
