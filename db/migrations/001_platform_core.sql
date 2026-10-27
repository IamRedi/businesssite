-- Neutral baseline. Apply through the production database migration tool, not manually.
create table platform_users (id uuid primary key, email text not null unique, created_at timestamptz not null default now());
create table platform_roles (user_id uuid not null references platform_users(id) on delete cascade, role text not null check (role in ('OWNER','CUSTOMER')), primary key (user_id, role));
create table leads (id text primary key, name text not null, source text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table lead_scores (lead_id text primary key references leads(id) on delete cascade, score integer not null check (score between 0 and 100), reasons jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());
create table lead_pipeline_events (id uuid primary key, lead_id text not null references leads(id) on delete cascade, status text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table prepared_business_profiles (id text primary key, lead_id text not null references leads(id) on delete cascade, version integer not null, profile jsonb not null, created_at timestamptz not null default now(), unique (lead_id, version));
create table sites (id text primary key, owner_user_id uuid references platform_users(id), slug text not null unique, visibility text not null check (visibility in ('private','public')), generated_document jsonb not null, created_at timestamptz not null default now());
create table demo_sites (site_id text primary key references sites(id) on delete cascade, prepared_profile_id text not null references prepared_business_profiles(id), created_by uuid references platform_users(id), created_at timestamptz not null default now());
create table site_features (site_id text not null references sites(id) on delete cascade, feature_key text not null check (feature_key in ('website','booking','custom_domain')), enabled boolean not null default false, primary key (site_id, feature_key));
-- Later migrations add profiles/themes/media/catalog, subscriptions/entitlements, bookings and domains.
