alter table sites
  add column if not exists custom_domain_verification jsonb not null default '{}'::jsonb,
  add column if not exists custom_domain_checked_at timestamptz;

create index if not exists sites_verified_custom_domain_idx
  on sites(custom_domain)
  where custom_domain_status = 'verified';
