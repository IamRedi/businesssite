-- Task Group 3-B1 pilot only. FORCE ROW LEVEL SECURITY is intentionally not
-- enabled. Role grants are applied separately by the administrative role setup.

create or replace function app_context_actor_kind()
returns text
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when nullif(current_setting('app.actor_kind', true), '') in
      ('site_admin', 'owner', 'public_resolver', 'system')
    then nullif(current_setting('app.actor_kind', true), '')
    else null
  end
$$;

create or replace function app_context_site_id()
returns uuid
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  configured text := nullif(current_setting('app.site_id', true), '');
begin
  if configured is null or configured !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return null;
  end if;
  return configured::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function app_context_is_valid_site_admin()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select public.app_context_actor_kind() = 'site_admin'
    and public.app_context_site_id() is not null
$$;

revoke all on function app_context_actor_kind() from public;
revoke all on function app_context_site_id() from public;
revoke all on function app_context_is_valid_site_admin() from public;

alter table site_features enable row level security;
alter table site_information_ad_slots enable row level security;

drop policy if exists site_features_site_admin_select on site_features;
create policy site_features_site_admin_select on site_features
  for select
  using (
    app_context_is_valid_site_admin()
    and site_id = app_context_site_id()::text
  );

drop policy if exists site_features_site_admin_insert on site_features;
create policy site_features_site_admin_insert on site_features
  for insert
  with check (
    app_context_is_valid_site_admin()
    and site_id = app_context_site_id()::text
  );

drop policy if exists site_features_site_admin_update on site_features;
create policy site_features_site_admin_update on site_features
  for update
  using (
    app_context_is_valid_site_admin()
    and site_id = app_context_site_id()::text
  )
  with check (
    app_context_is_valid_site_admin()
    and site_id = app_context_site_id()::text
  );

drop policy if exists site_information_ad_slots_site_admin_select
  on site_information_ad_slots;
create policy site_information_ad_slots_site_admin_select
  on site_information_ad_slots
  for select
  using (
    app_context_is_valid_site_admin()
    and site_id = app_context_site_id()::text
  );
