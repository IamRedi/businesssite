-- Standalone website-owner portal. No dependency on the source SaaS schema.
create table if not exists site_admin_accounts (
  id uuid primary key,
  site_id text not null unique references sites(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_admin_sessions (
  id uuid primary key,
  account_id uuid not null references site_admin_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists site_admin_sessions_token_idx on site_admin_sessions(token_hash, expires_at);

create table if not exists site_media (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  slot text not null check (slot in ('logo', 'hero', 'service_1', 'service_2', 'service_3', 'gallery')),
  url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists site_media_site_idx on site_media(site_id, slot, sort_order);

create table if not exists site_appointments (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  customer_name text not null,
  phone text not null,
  email text,
  service_title text,
  preferred_date date,
  preferred_time time,
  note text,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists site_appointments_site_idx on site_appointments(site_id, status, created_at desc);
