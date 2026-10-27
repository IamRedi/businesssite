create table if not exists site_admin_password_resets (
  id uuid primary key,
  account_id uuid not null references site_admin_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists site_admin_password_resets_lookup_idx
  on site_admin_password_resets(token_hash, expires_at)
  where used_at is null;
