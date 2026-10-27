-- Provider-neutral AI run audit, usage tracking and idempotent application.
create table if not exists ai_runs (
  id uuid primary key,
  actor_type text not null check (actor_type in ('owner', 'site_admin')),
  actor_id text not null,
  operation text not null check (operation in ('website_blueprint', 'text_rewrite')),
  lead_id text references leads(id) on delete set null,
  site_id text references sites(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'applied')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  usage jsonb not null default '{}'::jsonb,
  provider_response_id text,
  error text,
  applied_site_id text references sites(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  applied_at timestamptz
);

create index if not exists ai_runs_lead_idx on ai_runs(lead_id, created_at desc);
create index if not exists ai_runs_site_idx on ai_runs(site_id, created_at desc);
create index if not exists ai_runs_actor_idx on ai_runs(actor_type, actor_id, created_at desc);
