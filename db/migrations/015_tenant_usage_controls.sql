-- Tenant-scoped usage counters, fair-use state and auditable enforcement.
create table if not exists tenant_usage_counters (
  site_id text not null references sites(id) on delete cascade,
  metric text not null,
  window_type text not null check (window_type in ('minute', 'hour', 'day', 'month')),
  window_start timestamptz not null,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (site_id, metric, window_type, window_start)
);

create index if not exists tenant_usage_counters_cleanup_idx
  on tenant_usage_counters(window_start);

create table if not exists tenant_usage_states (
  site_id text primary key references sites(id) on delete cascade,
  state text not null default 'normal'
    check (state in ('normal', 'warning', 'throttled', 'temporarily_restricted')),
  reason_code text,
  state_until timestamptz,
  owner_override_state text
    check (owner_override_state in ('normal', 'warning', 'throttled', 'temporarily_restricted')),
  owner_override_reason text,
  owner_override_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists tenant_usage_events (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  metric text not null,
  decision text not null check (decision in ('warning', 'throttled', 'restricted', 'override')),
  reason_code text not null,
  window_type text,
  quantity bigint,
  limit_value bigint,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tenant_usage_events_site_idx
  on tenant_usage_events(site_id, created_at desc);

create table if not exists tenant_concurrency_leases (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  operation text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists tenant_concurrency_active_idx
  on tenant_concurrency_leases(site_id, operation, expires_at);
