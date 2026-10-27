-- Task Group 3-B2: customer-owned rows and the site-admin bootstrap boundary.
-- FORCE ROW LEVEL SECURITY remains intentionally disabled. Owner, public,
-- webhook, REDI and cleanup paths continue through the compatibility role.

alter table site_admin_accounts
  add column if not exists status text not null default 'active';
alter table site_admin_accounts drop constraint if exists site_admin_accounts_status_check;
alter table site_admin_accounts add constraint site_admin_accounts_status_check
  check (status in ('active','disabled'));

create or replace function site_admin_login_lookup(p_normalized_email text)
returns table(account_id uuid, site_id text, email text, password_hash text, preferred_locale text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select a.id,a.site_id,a.email,a.password_hash,a.preferred_locale
  from public.site_admin_accounts a
  where a.status='active'
    and lower(btrim(a.email))=lower(btrim(p_normalized_email))
  limit 1
$$;

create or replace function site_admin_resolve_session(p_token_hash text)
returns table(account_id uuid, site_id text, email text, preferred_locale text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select a.id,a.site_id,a.email,a.preferred_locale
  from public.site_admin_sessions s
  join public.site_admin_accounts a on a.id=s.account_id
  where s.token_hash=p_token_hash
    and s.expires_at > statement_timestamp()
    and a.status='active'
  limit 1
$$;

create or replace function site_admin_create_session(
  p_account_id uuid, p_expected_password_hash text, p_token_hash text, p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_expires_at <= statement_timestamp() or char_length(p_token_hash) <> 64 then return false; end if;
  if not exists (
    select 1 from public.site_admin_accounts a
    where a.id=p_account_id and a.status='active' and a.password_hash=p_expected_password_hash
  ) then return false; end if;
  delete from public.site_admin_sessions where expires_at <= statement_timestamp();
  insert into public.site_admin_sessions(id,account_id,token_hash,expires_at)
    values(gen_random_uuid(),p_account_id,p_token_hash,p_expires_at);
  return true;
end
$$;

create or replace function site_admin_revoke_session(p_token_hash text)
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  with deleted as (
    delete from public.site_admin_sessions where token_hash=p_token_hash returning 1
  ) select exists(select 1 from deleted)
$$;

create or replace function site_admin_create_password_reset(
  p_account_id uuid, p_token_hash text, p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_expires_at <= statement_timestamp() or char_length(p_token_hash) <> 64 then return false; end if;
  if not exists (select 1 from public.site_admin_accounts where id=p_account_id and status='active') then return false; end if;
  delete from public.site_admin_password_resets where account_id=p_account_id and used_at is null;
  insert into public.site_admin_password_resets(id,account_id,token_hash,expires_at)
    values(gen_random_uuid(),p_account_id,p_token_hash,p_expires_at);
  return true;
end
$$;

create or replace function site_admin_consume_password_reset(p_token_hash text, p_password_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_account_id uuid;
begin
  select r.account_id into v_account_id
  from public.site_admin_password_resets r
  join public.site_admin_accounts a on a.id=r.account_id and a.status='active'
  where r.token_hash=p_token_hash and r.used_at is null and r.expires_at > statement_timestamp()
  for update of r;
  if v_account_id is null then return false; end if;
  update public.site_admin_accounts set password_hash=p_password_hash,updated_at=statement_timestamp()
    where id=v_account_id;
  update public.site_admin_password_resets set used_at=statement_timestamp()
    where token_hash=p_token_hash and used_at is null;
  delete from public.site_admin_sessions where account_id=v_account_id;
  return true;
end
$$;

create or replace function site_admin_change_password(
  p_session_hash text, p_account_id uuid, p_current_password_hash text, p_password_hash text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.site_admin_accounts
    set password_hash=p_password_hash,updated_at=statement_timestamp()
    where id=p_account_id and status='active' and password_hash=p_current_password_hash
      and exists (
        select 1 from public.site_admin_sessions s
        where s.account_id=p_account_id and s.token_hash=p_session_hash
          and s.expires_at > statement_timestamp()
      );
  if not found then return false; end if;
  delete from public.site_admin_sessions where account_id=p_account_id;
  return true;
end
$$;

create or replace function site_admin_site_available()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.sites s
    left join public.site_subscriptions sub on sub.site_id=s.id
    where public.app_context_is_valid_site_admin()
      and s.id=public.app_context_site_id()::text
      and (
        s.site_kind='information'
        or s.trial_recovery_ends_at > statement_timestamp()
        or sub.status in ('active','trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')
      )
  )
$$;

create or replace function site_admin_access_snapshot()
returns table(
  activated_at timestamptz, demo_expires_at timestamptz,
  trial_recovery_ends_at timestamptz, publication_intent text,
  subscription_status text, cancel_at_period_end boolean,
  current_period_end timestamptz, first_past_due_at timestamptz,
  payment_grace_ends_at timestamptz, suspended_at timestamptz,
  read_only_ends_at timestamptz, last_active_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.activated_at,s.demo_expires_at,s.trial_recovery_ends_at,s.publication_intent,
         sub.status,sub.cancel_at_period_end,sub.current_period_end,sub.first_past_due_at,
         sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at
  from public.sites s left join public.site_subscriptions sub on sub.site_id=s.id
  where public.app_context_is_valid_site_admin()
    and s.id=public.app_context_site_id()::text
  limit 1
$$;

revoke all on function site_admin_login_lookup(text) from public;
revoke all on function site_admin_resolve_session(text) from public;
revoke all on function site_admin_create_session(uuid,text,text,timestamptz) from public;
revoke all on function site_admin_revoke_session(text) from public;
revoke all on function site_admin_create_password_reset(uuid,text,timestamptz) from public;
revoke all on function site_admin_consume_password_reset(text,text) from public;
revoke all on function site_admin_change_password(text,uuid,text,text) from public;
revoke all on function site_admin_site_available() from public;
revoke all on function site_admin_access_snapshot() from public;

alter table sites enable row level security;
alter table site_media enable row level security;
alter table site_media_blobs enable row level security;
alter table site_appointments enable row level security;
alter table ai_runs enable row level security;
alter table tenant_usage_counters enable row level security;
alter table tenant_usage_states enable row level security;
alter table tenant_usage_events enable row level security;
alter table tenant_concurrency_leases enable row level security;
alter table site_external_integrations enable row level security;
alter table site_integration_events enable row level security;
alter table site_admin_accounts enable row level security;
alter table site_admin_sessions enable row level security;
alter table site_admin_password_resets enable row level security;

-- Policies are created without TO because roles are provider-provisioned after
-- migrations. The role provisioner immediately retargets each policy.
create policy sites_site_admin_select on sites for select
  using (app_context_is_valid_site_admin() and id=app_context_site_id()::text);
create policy sites_site_admin_update on sites for update
  using (app_context_is_valid_site_admin() and id=app_context_site_id()::text)
  with check (app_context_is_valid_site_admin() and id=app_context_site_id()::text);

create policy site_media_site_admin_select on site_media for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_media_site_admin_insert on site_media for insert
  with check (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_media_site_admin_update on site_media for update
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text)
  with check (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_media_site_admin_delete on site_media for delete
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);

create policy site_media_blobs_site_admin_select on site_media_blobs for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_media_blobs_site_admin_insert on site_media_blobs for insert
  with check (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_media_blobs_site_admin_delete on site_media_blobs for delete
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);

create policy site_appointments_site_admin_select on site_appointments for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_appointments_site_admin_update on site_appointments for update
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text)
  with check (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);

create policy ai_runs_site_admin_select on ai_runs for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text and actor_type='site_admin');

create policy tenant_usage_counters_site_admin_select on tenant_usage_counters for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy tenant_usage_states_site_admin_select on tenant_usage_states for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy tenant_usage_events_site_admin_select on tenant_usage_events for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy tenant_concurrency_leases_site_admin_select on tenant_concurrency_leases for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);

create policy site_external_integrations_site_admin_select on site_external_integrations for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
create policy site_integration_events_site_admin_select on site_integration_events for select
  using (app_context_is_valid_site_admin() and site_id=app_context_site_id()::text);
