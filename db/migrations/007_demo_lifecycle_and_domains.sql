-- A private demo lasts three days unless a verified subscription activates it.
alter table sites add column if not exists demo_expires_at timestamptz;
alter table sites add column if not exists activated_at timestamptz;
alter table sites add column if not exists custom_domain text unique;
alter table sites add column if not exists custom_domain_status text not null default 'not_requested'
  check (custom_domain_status in ('not_requested', 'pending_dns', 'verified', 'failed'));

update sites
set demo_expires_at = created_at + interval '3 days'
where demo_expires_at is null and activated_at is null;

alter table sites alter column demo_expires_at set not null;
create index if not exists sites_demo_expiry_idx on sites(demo_expires_at) where activated_at is null;
