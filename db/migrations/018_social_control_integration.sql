alter table site_features drop constraint if exists site_features_feature_key_check;
alter table site_features add constraint site_features_feature_key_check
  check (feature_key in ('website','booking','custom_domain','social_media'));

create table site_external_integrations (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  provider text not null check (provider in ('redi_control')),
  external_installation_id text,
  external_tenant_id text,
  external_workspace_id text,
  status text not null check (status in ('disconnected','provisioning','active','degraded','suspended','error')),
  last_synced_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, provider)
);

create unique index site_external_integrations_provider_workspace_unique
  on site_external_integrations(provider, external_workspace_id)
  where external_workspace_id is not null;

create table site_integration_events (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  provider text not null check (provider in ('redi_control')),
  action text not null check (action in ('provisioning_started','provisioning_completed','provisioning_failed','session_created')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index site_integration_events_site_created_idx
  on site_integration_events(site_id, created_at desc);

insert into site_features(site_id, feature_key, enabled)
select site_id, 'social_media', true
from site_subscriptions
where plan_key in ('professional', 'premium') and status in ('active', 'trialing')
on conflict(site_id, feature_key) do update set enabled=excluded.enabled;
