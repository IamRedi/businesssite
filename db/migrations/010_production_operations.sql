-- Production operations: managed migration history and durable endpoint rate limits.
create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists api_rate_limits (
  scope text not null,
  subject_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key, window_start)
);

create index if not exists api_rate_limits_updated_idx
  on api_rate_limits(updated_at);
