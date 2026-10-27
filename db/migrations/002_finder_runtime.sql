-- Postgres/Neon source of truth for the owner-only Finder workflow.
alter table leads add column if not exists external_id text unique, add column if not exists category text, add column if not exists address text, add column if not exists phone text, add column if not exists website text, add column if not exists rating numeric, add column if not exists review_count integer, add column if not exists score_reasons jsonb not null default '[]'::jsonb, add column if not exists signals jsonb not null default '{}'::jsonb, add column if not exists updated_at timestamptz not null default now();
create index if not exists leads_external_id_idx on leads(external_id);
create table if not exists finder_searches (id uuid primary key, query text not null, filters jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists finder_search_cache (cache_key text primary key, lead_ids jsonb not null, expires_at timestamptz not null, updated_at timestamptz not null default now());
alter table lead_pipeline_events add column if not exists notes text;
alter table prepared_business_profiles add column if not exists status text not null default 'draft' check (status in ('draft','ready_for_handoff','demo_created'));
create table if not exists audit_events (id uuid primary key, entity_type text not null, entity_id text not null, action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists audit_events_entity_idx on audit_events(entity_type, entity_id, created_at);
alter table sites add column if not exists lead_id text references leads(id), add column if not exists prepared_profile_id text references prepared_business_profiles(id);
