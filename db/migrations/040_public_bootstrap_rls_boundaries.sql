-- Task Group 3-B3A: constrained public, domain, preview and appointment
-- bootstrap boundaries. FORCE RLS remains intentionally disabled.

alter table site_appointments add column if not exists customer_message text;

create or replace function public_site_lifecycle_allows(p_site_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.sites s
    join public.site_subscriptions sub on sub.site_id=s.id
    where s.id=p_site_id
      and s.site_kind='business'
      and s.visibility='public'
      and s.publication_intent='public'
      and s.activated_at is not null
      and (
        (sub.status in ('active','trialing') and (
          not sub.cancel_at_period_end
          or (sub.current_period_end is not null and sub.current_period_end > statement_timestamp())
        ))
        or (
          sub.status='past_due'
          and sub.first_past_due_at is not null
          and sub.payment_grace_ends_at is not null
          and sub.read_only_ends_at is not null
          and sub.payment_grace_ends_at > statement_timestamp()
        )
      )
  )
$$;

create or replace function resolve_public_site_by_slug(p_slug text)
returns table(site_id text, generated_document jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_count integer;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$' then return; end if;
  select count(*) into v_count from public.sites s where s.slug=p_slug;
  if v_count <> 1 then return; end if;
  return query
    select s.id,s.generated_document
    from public.sites s
    join public.site_features f on f.site_id=s.id and f.feature_key='website' and f.enabled
    where s.slug=p_slug and public.public_site_lifecycle_allows(s.id)
    limit 1;
end
$$;

create or replace function resolve_public_site_by_domain(p_hostname text)
returns table(site_id text, generated_document jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_count integer;
begin
  if p_hostname is null
     or p_hostname <> lower(p_hostname)
     or p_hostname like 'www.%'
     or p_hostname !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
  then return; end if;
  select count(*) into v_count
  from public.sites s
  where s.custom_domain=p_hostname and s.custom_domain_status='verified';
  if v_count <> 1 then return; end if;
  return query
    select s.id,s.generated_document
    from public.sites s
    join public.site_features f on f.site_id=s.id and f.feature_key='website' and f.enabled
    where s.custom_domain=p_hostname
      and s.custom_domain_status='verified'
      and public.public_site_lifecycle_allows(s.id)
    limit 1;
end
$$;

create or replace function resolve_private_preview(p_token_id uuid)
returns table(site_id text, generated_document jsonb)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.id,s.generated_document
  from public.site_preview_tokens p
  join public.sites s on s.id=p.site_id
  where p.token_id=p_token_id
    and p.revoked_at is null
    and p.expires_at > statement_timestamp()
    and s.site_kind='business'
    and s.visibility='private'
    and (
      (s.activated_at is null and s.demo_expires_at > statement_timestamp())
      or (s.activated_at is not null and exists (
        select 1 from public.site_subscriptions sub
        where sub.site_id=s.id and (
          (sub.status in ('active','trialing') and (
            not sub.cancel_at_period_end
            or (sub.current_period_end is not null and sub.current_period_end > statement_timestamp())
          ))
          or (sub.status='past_due' and sub.read_only_ends_at is not null and sub.read_only_ends_at > statement_timestamp())
          or (sub.status in ('unpaid','paused','canceled','incomplete','incomplete_expired')
              and sub.read_only_ends_at is not null and sub.read_only_ends_at > statement_timestamp())
        )
      ))
    )
  limit 1
$$;

create or replace function create_public_appointment_request(
  p_slug text,
  p_customer_name text,
  p_phone text,
  p_email text default null,
  p_service_title text default null,
  p_preferred_date date default null,
  p_preferred_time time default null,
  p_message text default null
)
returns table(
  appointment_id uuid, site_id text, customer_name text, phone text,
  email text, service_title text, preferred_date date, preferred_time time,
  message text, status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_site_id text;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'
     or p_customer_name is null or char_length(p_customer_name) not between 1 and 120
     or p_phone is null or char_length(p_phone) not between 1 and 40
     or p_email is not null and char_length(p_email) > 160
     or p_service_title is not null and char_length(p_service_title) > 120
     or p_message is not null and char_length(p_message) > 1000
  then return; end if;

  select r.site_id into v_site_id from public.resolve_public_site_by_slug(p_slug) r;
  if v_site_id is null or not exists (
    select 1 from public.site_features f
    where f.site_id=v_site_id and f.feature_key='appointment_requests' and f.enabled
  ) then return; end if;

  return query
    insert into public.site_appointments(
      id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,customer_message,note,status,created_at,updated_at
    ) values (
      gen_random_uuid(),v_site_id,p_customer_name,p_phone,nullif(p_email,''),nullif(p_service_title,''),
      p_preferred_date,p_preferred_time,nullif(p_message,''),null,'requested',statement_timestamp(),statement_timestamp()
    )
    returning id,site_appointments.site_id,site_appointments.customer_name,site_appointments.phone,
      site_appointments.email,site_appointments.service_title,site_appointments.preferred_date,
      site_appointments.preferred_time,site_appointments.customer_message,site_appointments.status,site_appointments.created_at;
end
$$;

revoke all on function public_site_lifecycle_allows(text) from public;
revoke all on function resolve_public_site_by_slug(text) from public;
revoke all on function resolve_public_site_by_domain(text) from public;
revoke all on function resolve_private_preview(uuid) from public;
revoke all on function create_public_appointment_request(text,text,text,text,text,date,time,text) from public;
