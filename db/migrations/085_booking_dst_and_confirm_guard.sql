-- BOOKING V1 LOCAL: one canonical availability check for public slots and
-- confirmation. Applied migrations 079-084 remain unchanged.
-- migrate-as-owner-of: public.booking_available_slots(text,date,timestamp with time zone)
create function public.booking_available_slots_for(
  p_site text,p_day date,p_now timestamptz,p_exclude_id uuid)
returns table(starts_at timestamptz,ends_at timestamptz,local_time text)
language sql stable security definer set search_path=pg_catalog as $$
  with config as (
    select * from public.booking_settings where site_id=p_site and enabled
      and p_day between (p_now at time zone timezone)::date and (p_now at time zone timezone)::date+90
  ), candidates as materialized (
    select g.instant as s,g.instant+make_interval(mins=>c.slot_minutes) as e,c.timezone as tz,
      (g.instant at time zone c.timezone) as local_start,
      ((g.instant+make_interval(mins=>c.slot_minutes)) at time zone c.timezone) as local_end,
      c.slot_minutes
    from config c cross join lateral generate_series(
      (p_day::timestamp at time zone c.timezone)-interval '3 hours',
      ((p_day+1)::timestamp at time zone c.timezone)+interval '3 hours',
      interval '15 minutes') as g(instant)
  )
  select x.s,x.e,to_char(x.local_start,'HH24:MI') || ' UTC' ||
    case when x.local_start-(x.s at time zone 'UTC')>=interval '0' then '+' else '' end ||
    trim(to_char(extract(epoch from (x.local_start-(x.s at time zone 'UTC')))/3600,'FM99'))
  from candidates x
  where x.s>p_now and x.local_start::date=p_day and x.local_end::date=p_day
    -- A transition inside the interval makes its civil-time span misleading.
    and x.local_start-(x.s at time zone 'UTC') = x.local_end-(x.e at time zone 'UTC')
    -- A repeated local start or end is ambiguous even if this individual
    -- instant does not itself cross the offset transition.
    and not exists(select 1 from candidates twin where twin.s<>x.s and twin.local_start=x.local_start)
    and not exists(select 1 from candidates twin where twin.s<>x.e and twin.local_start=x.local_end)
    and exists(select 1 from public.booking_weekly w where w.site_id=p_site and w.kind='work'
      and w.weekday=extract(isodow from x.local_start)::integer
      and x.local_start::time>=w.starts_at and x.local_end::time<=w.ends_at
      and mod(extract(epoch from (x.local_start::time-w.starts_at))::integer/60,x.slot_minutes)=0)
    and not exists(select 1 from public.booking_weekly b where b.site_id=p_site and b.kind='break'
      and b.weekday=extract(isodow from x.local_start)::integer
      and x.local_start::time<b.ends_at and x.local_end::time>b.starts_at)
    and not exists(select 1 from public.booking_blocks b where b.site_id=p_site and x.s<b.ends_at and x.e>b.starts_at)
    and not exists(select 1 from public.site_appointments a where a.site_id=p_site
      and a.id is distinct from p_exclude_id
      and a.booking_start<x.e and a.booking_end>x.s
      and (a.status='confirmed' or (a.status='requested' and a.booking_hold_expires_at>p_now)))
  order by x.s
$$;
revoke all on function public.booking_available_slots_for(text,date,timestamp with time zone,uuid) from public;

create or replace function public.booking_available_slots(p_site text,p_day date,p_now timestamptz default statement_timestamp())
returns table(starts_at timestamptz,ends_at timestamptz,local_time text)
language sql stable security definer set search_path=pg_catalog as $$
  select * from public.booking_available_slots_for(p_site,p_day,p_now,null::uuid)
$$;
revoke all on function public.booking_available_slots(text,date,timestamp with time zone) from public;

-- migrate-as-owner-of: public.booking_transition(text,uuid,text,integer,timestamp with time zone)
create or replace function public.booking_transition(p_site text,p_id uuid,p_action text,p_version integer,p_new_start timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.site_appointments; v_settings public.booking_settings; v_end timestamptz;
begin
  if not public.app_context_is_valid_site_admin() or public.app_context_site_id()::text is distinct from p_site
  then return jsonb_build_object('errorCode','forbidden'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site||':booking',0));
  select * into v_settings from public.booking_settings where site_id=p_site and enabled for update;
  if not found then return jsonb_build_object('errorCode','slot_unavailable'); end if;
  select * into v_row from public.site_appointments where id=p_id and site_id=p_site and booking_start is not null for update;
  if not found or v_row.appointment_version<>p_version then return jsonb_build_object('errorCode','stale'); end if;
  if p_action='confirm' and v_row.status='requested' then
    -- The same canonical engine as public requests, excluding only this
    -- request's own hold. This rejects past, blocked, ambiguous and newly
    -- occupied slots regardless of whether its hold remains active.
    select ends_at into v_end from public.booking_available_slots_for(p_site,
      (v_row.booking_start at time zone v_settings.timezone)::date,clock_timestamp(),p_id)
      where starts_at=v_row.booking_start;
    if v_end is distinct from v_row.booking_end then return jsonb_build_object('errorCode','slot_unavailable'); end if;
    update public.site_appointments set status='confirmed',booking_hold_expires_at=null,updated_at=clock_timestamp() where id=p_id;
  elsif p_action='decline' and v_row.status in ('requested','proposed','accepted') then
    update public.site_appointments set status='declined',booking_hold_expires_at=null,booking_proposed_start=null,updated_at=clock_timestamp() where id=p_id;
  elsif p_action='cancel' and v_row.status='confirmed' then
    update public.site_appointments set status='cancelled',updated_at=clock_timestamp() where id=p_id;
  elsif p_action='propose' and v_row.status in ('requested','proposed','accepted') and p_new_start is not null then
    select ends_at into v_end from public.booking_available_slots(p_site,
      (p_new_start at time zone v_settings.timezone)::date,clock_timestamp()) where starts_at=p_new_start;
    if v_end is null then return jsonb_build_object('errorCode','slot_unavailable'); end if;
    update public.site_appointments set status='proposed',booking_proposed_start=p_new_start,
      booking_hold_expires_at=null,updated_at=clock_timestamp() where id=p_id;
  elsif p_action='accept_proposed' and v_row.status='proposed' and v_row.booking_proposed_start is not null then
    update public.site_appointments set status='accepted',updated_at=clock_timestamp() where id=p_id;
  else return jsonb_build_object('errorCode','invalid_transition'); end if;
  return (select jsonb_build_object('ok',true,'id',id,'status',status,'version',appointment_version,
    'startsAt',booking_start,'phone',phone,'name',customer_name) from public.site_appointments where id=p_id);
exception when exclusion_violation then return jsonb_build_object('errorCode','slot_unavailable');
end $$;
revoke all on function public.booking_transition(text,uuid,text,integer,timestamp with time zone) from public;
