-- Explicit, deny-by-default REDI CONTROL inbound grants for Information sites.
alter table site_external_integrations
  add column if not exists inbound_enabled boolean not null default false,
  add column if not exists inbound_permissions text[] not null default '{}',
  add column if not exists inbound_approved_at timestamptz,
  add column if not exists inbound_approved_by text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'site_external_integrations_inbound_permissions_check'
  ) then
    alter table site_external_integrations add constraint site_external_integrations_inbound_permissions_check
      check (inbound_permissions <@ array[
        'articles:read','articles:create','articles:update','articles:submit',
        'articles:publish','articles:archive','media:read','media:write'
      ]::text[]);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'site_external_integrations_inbound_approval_check'
  ) then
    alter table site_external_integrations add constraint site_external_integrations_inbound_approval_check
      check (
        not inbound_enabled or (
          inbound_approved_at is not null
          and inbound_approved_by is not null
          and char_length(inbound_approved_by) between 1 and 200
        )
      );
  end if;
end $$;

create unique index if not exists site_external_integrations_provider_installation_unique
  on site_external_integrations(provider, external_installation_id)
  where external_installation_id is not null;
