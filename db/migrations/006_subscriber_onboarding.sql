-- Customer acquisition boundary for the standalone website product.
create table if not exists subscriber_intakes (
  id uuid primary key,
  email text not null,
  business_name text,
  demo_site_id text references sites(id) on delete set null,
  plan_key text not null check (plan_key in ('starter', 'professional', 'premium')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (email, demo_site_id)
);
create index if not exists subscriber_intakes_demo_idx on subscriber_intakes(demo_site_id, created_at desc);
