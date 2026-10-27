-- Secure preview access and durable Stripe subscription state.
create table if not exists site_preview_tokens (
  token_id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists site_preview_tokens_one_active_per_site_idx
  on site_preview_tokens(site_id)
  where revoked_at is null;
create index if not exists site_preview_tokens_lookup_idx
  on site_preview_tokens(token_id, expires_at)
  where revoked_at is null;

create table if not exists site_subscriptions (
  site_id text primary key references sites(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_key text check (plan_key in ('starter', 'professional', 'premium')),
  status text not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  last_processed_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_subscriptions_customer_idx
  on site_subscriptions(stripe_customer_id);
create index if not exists site_subscriptions_status_idx
  on site_subscriptions(status, current_period_end);
