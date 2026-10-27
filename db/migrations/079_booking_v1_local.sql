-- BOOKING V1 LOCAL: additive. Legacy site_appointments rows have null booking_start.
-- Apply only to a proven disposable local database until separately authorized.
create extension if not exists btree_gist;

create table public.booking_settings (
  site_id text primary key references public.sites(id) on delete cascade,
  timezone text not null default 'Europe/Berlin',
  slot_minutes integer not null default 30 check (slot_minutes between 15 and 240 and slot_minutes % 15 = 0),
  hold_minutes integer not null default 15 check (hold_minutes between 1 and 60),
  mode text not null default 'approval_request' check (mode = 'approval_request'),
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table public.booking_weekly (
  site_id text not null references public.booking_settings(site_id) on delete cascade,
  weekday integer not null check (weekday between 1 and 7),
  kind text not null check (kind in ('work','break')),
  starts_at time not null,
  ends_at time not null,
  primary key (site_id,weekday,kind,starts_at),
  check (starts_at < ends_at)
);

create table public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.booking_settings(site_id) on delete cascade,
  kind text not null check (kind in ('closed_day','manual')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index booking_blocks_site_time on public.booking_blocks using gist(site_id,tstzrange(starts_at,ends_at,'[)'));

alter table public.site_appointments
  add column booking_start timestamptz,
  add column booking_end timestamptz,
  add column booking_hold_expires_at timestamptz,
  add column booking_proposed_start timestamptz;
alter table public.site_appointments add constraint booking_shape check (
  (booking_start is null and booking_end is null and booking_hold_expires_at is null)
  or (booking_start is not null and booking_end > booking_start)
);
alter table public.site_appointments add constraint booking_confirmed_no_overlap
  exclude using gist (site_id with =, tstzrange(booking_start,booking_end,'[)') with &&)
  where (status='confirmed' and booking_start is not null);
create index booking_occupancy on public.site_appointments(site_id,booking_start,booking_end)
  where booking_start is not null and status in ('requested','confirmed');

-- Enumerate UTC instants, then map each to local civil time. This preserves both
-- autumn 02:00 occurrences and never fabricates a spring-gap local time.
create function public.booking_available_slots(p_site text,p_day date,p_now timestamptz default statement_timestamp())
returns table(starts_at timestamptz,ends_at timestamptz,local_time text)
language sql stable security definer set search_path=pg_catalog as $$
  with config as (
    select * from public.booking_settings where site_id=p_site and enabled
      and p_day between (p_now at time zone timezone)::date and (p_now at time zone timezone)::date+90
  ), candidates as (
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
    and exists(select 1 from public.booking_weekly w where w.site_id=p_site and w.kind='work'
      and w.weekday=extract(isodow from x.local_start)::integer
      and x.local_start::time>=w.starts_at and x.local_end::time<=w.ends_at
      and mod(extract(epoch from (x.local_start::time-w.starts_at))::integer/60,x.slot_minutes)=0)
    and not exists(select 1 from public.booking_weekly b where b.site_id=p_site and b.kind='break'
      and b.weekday=extract(isodow from x.local_start)::integer
      and x.local_start::time<b.ends_at and x.local_end::time>b.starts_at)
    and not exists(select 1 from public.booking_blocks b where b.site_id=p_site and x.s<b.ends_at and x.e>b.starts_at)
    and not exists(select 1 from public.site_appointments a where a.site_id=p_site
      and a.booking_start<x.e and a.booking_end>x.s
      and (a.status='confirmed' or (a.status='requested' and a.booking_hold_expires_at>p_now)))
  order by x.s
$$;

create function public.booking_public_slots(p_slug text,p_day date)
returns table(starts_at timestamptz,ends_at timestamptz,local_time text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text;
begin
  select r.site_id into v_site from public.resolve_public_site_by_slug(p_slug) r;
  if v_site is null or not exists(select 1 from public.site_features f where f.site_id=v_site and f.feature_key='appointment_requests' and f.enabled) then return; end if;
  return query select * from public.booking_available_slots(v_site,p_day);
end $$;

create function public.booking_public_config(p_slug text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_settings public.booking_settings;
begin
  select r.site_id into v_site from public.resolve_public_site_by_slug(p_slug) r;
  if v_site is null or not exists(select 1 from public.site_features where site_id=v_site and feature_key='appointment_requests' and enabled)
  then return jsonb_build_object('enabled',false); end if;
  select * into v_settings from public.booking_settings where site_id=v_site;
  return jsonb_build_object('enabled',coalesce(v_settings.enabled,false),'timezone',v_settings.timezone,
    'slotMinutes',v_settings.slot_minutes,'holdMinutes',v_settings.hold_minutes);
end $$;

create function public.booking_request(p_slug text,p_start timestamptz,p_service text,p_name text,p_phone text,p_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_settings public.booking_settings; v_end timestamptz; v_id uuid;
begin
  if p_slug is null or p_start is null or length(btrim(coalesce(p_service,''))) not between 1 and 120
    or length(btrim(coalesce(p_name,''))) not between 1 and 120 or length(btrim(coalesce(p_phone,''))) not between 1 and 40
    or length(coalesce(p_email,''))>160 or (nullif(p_email,'') is not null and p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
  then return jsonb_build_object('errorCode','invalid_request'); end if;
  select r.site_id into v_site from public.resolve_public_site_by_slug(p_slug) r;
  if v_site is null then return jsonb_build_object('errorCode','not_found'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_site||':booking',0));
  select * into v_settings from public.booking_settings where site_id=v_site and enabled for update;
  if not found or not exists(select 1 from public.site_features where site_id=v_site and feature_key='appointment_requests' and enabled)
  then return jsonb_build_object('errorCode','not_found'); end if;
  if (select count(*) from jsonb_array_elements(coalesce((select generated_document->'services' from public.sites where id=v_site),'[]'::jsonb)) s
      where s->>'title'=p_service and not coalesce((s->>'archived')::boolean,false))<>1
  then return jsonb_build_object('errorCode','invalid_service'); end if;
  select ends_at into v_end from public.booking_available_slots(v_site,(p_start at time zone v_settings.timezone)::date) where starts_at=p_start;
  if v_end is null then return jsonb_build_object('errorCode','slot_unavailable'); end if;
  insert into public.site_appointments(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,status,booking_start,booking_end,booking_hold_expires_at)
  values(gen_random_uuid(),v_site,btrim(p_name),btrim(p_phone),nullif(p_email,''),p_service,
    (p_start at time zone v_settings.timezone)::date,(p_start at time zone v_settings.timezone)::time,
    'requested',p_start,v_end,clock_timestamp()+make_interval(mins=>v_settings.hold_minutes)) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'status','requested');
end $$;

create function public.booking_transition(p_site text,p_id uuid,p_action text,p_version integer,p_new_start timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.site_appointments; v_settings public.booking_settings;
begin
  if not public.app_context_is_valid_site_admin() or public.app_context_site_id()::text is distinct from p_site
  then return jsonb_build_object('errorCode','forbidden'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site||':booking',0));
  select * into v_settings from public.booking_settings where site_id=p_site and enabled for update;
  select * into v_row from public.site_appointments where id=p_id and site_id=p_site and booking_start is not null for update;
  if not found or v_row.appointment_version<>p_version then return jsonb_build_object('errorCode','stale'); end if;
  if p_action='confirm' and v_row.status='requested' and v_row.booking_hold_expires_at>clock_timestamp() then
    -- The caller's own active hold is excluded by the availability function;
    -- validate schedule and competing occupancy separately below.
    if not exists(select 1 from public.booking_weekly w where w.site_id=p_site and w.kind='work'
      and w.weekday=extract(isodow from v_row.booking_start at time zone v_settings.timezone)::integer
      and (v_row.booking_start at time zone v_settings.timezone)::time>=w.starts_at
      and (v_row.booking_end at time zone v_settings.timezone)::time<=w.ends_at)
      or exists(select 1 from public.booking_weekly b where b.site_id=p_site and b.kind='break'
        and b.weekday=extract(isodow from v_row.booking_start at time zone v_settings.timezone)::integer
        and (v_row.booking_start at time zone v_settings.timezone)::time<b.ends_at
        and (v_row.booking_end at time zone v_settings.timezone)::time>b.starts_at)
      or exists(select 1 from public.booking_blocks b where b.site_id=p_site and b.starts_at<v_row.booking_end and b.ends_at>v_row.booking_start)
      or exists(select 1 from public.site_appointments a where a.site_id=p_site and a.id<>p_id and a.booking_start<v_row.booking_end and a.booking_end>v_row.booking_start
        and (a.status='confirmed' or (a.status='requested' and a.booking_hold_expires_at>clock_timestamp())))
    then return jsonb_build_object('errorCode','slot_unavailable'); end if;
    update public.site_appointments set status='confirmed',booking_hold_expires_at=null,updated_at=clock_timestamp() where id=p_id;
  elsif p_action='decline' and v_row.status='requested' then
    update public.site_appointments set status='declined',booking_hold_expires_at=null,updated_at=clock_timestamp() where id=p_id;
  elsif p_action='cancel' and v_row.status='confirmed' then
    update public.site_appointments set status='cancelled',updated_at=clock_timestamp() where id=p_id;
  elsif p_action='propose' and v_row.status='requested' and p_new_start is not null then
    update public.site_appointments set booking_proposed_start=p_new_start,updated_at=clock_timestamp() where id=p_id;
  else return jsonb_build_object('errorCode','invalid_transition'); end if;
  return (select jsonb_build_object('ok',true,'id',id,'status',status,'version',appointment_version,
    'startsAt',booking_start,'phone',phone,'name',customer_name) from public.site_appointments where id=p_id);
exception when exclusion_violation then return jsonb_build_object('errorCode','slot_unavailable');
end $$;

create function public.booking_configure(p_site text,p_version integer,p_timezone text,p_slot_minutes integer,
  p_weekly jsonb,p_blocks jsonb,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_current integer;
begin
  if not public.app_context_is_valid_site_admin() or public.app_context_site_id()::text is distinct from p_site
  then return jsonb_build_object('errorCode','forbidden'); end if;
  if p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)
    or p_slot_minutes not between 15 and 240 or p_slot_minutes%15<>0
    or jsonb_typeof(p_weekly) is distinct from 'array' or jsonb_array_length(p_weekly)>35
    or jsonb_typeof(p_blocks) is distinct from 'array' or jsonb_array_length(p_blocks)>200
    or p_enabled is null then return jsonb_build_object('errorCode','invalid_request'); end if;
  if exists(select 1 from jsonb_array_elements(p_weekly) w where jsonb_typeof(w) is distinct from 'object'
    or w->>'day' !~ '^[1-7]$' or w->>'kind' not in ('work','break')
    or w->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or w->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or (w->>'start')::time >= (w->>'end')::time)
  then return jsonb_build_object('errorCode','invalid_request'); end if;
  if exists(select 1 from jsonb_array_elements(p_blocks) b where jsonb_typeof(b) is distinct from 'object'
    or b->>'kind' not in ('closed_day','manual')
    or b->>'start' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    or b->>'end' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
    or (b->>'start')::timestamptz >= (b->>'end')::timestamptz)
  then return jsonb_build_object('errorCode','invalid_request'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site||':booking',0));
  select version into v_current from public.booking_settings where site_id=p_site for update;
  if found and v_current<>p_version then return jsonb_build_object('errorCode','stale'); end if;
  if not found and p_version<>0 then return jsonb_build_object('errorCode','stale'); end if;
  insert into public.booking_settings(site_id,timezone,slot_minutes,enabled,version,updated_at)
  values(p_site,p_timezone,p_slot_minutes,p_enabled,coalesce(v_current,0)+1,clock_timestamp())
  on conflict(site_id) do update set timezone=excluded.timezone,slot_minutes=excluded.slot_minutes,
    enabled=excluded.enabled,version=excluded.version,updated_at=excluded.updated_at;
  delete from public.booking_weekly where site_id=p_site;
  insert into public.booking_weekly(site_id,weekday,kind,starts_at,ends_at)
    select p_site,(w->>'day')::integer,w->>'kind',(w->>'start')::time,(w->>'end')::time
    from jsonb_array_elements(p_weekly) w;
  delete from public.booking_blocks where site_id=p_site;
  insert into public.booking_blocks(site_id,kind,starts_at,ends_at)
    select p_site,b->>'kind',(b->>'start')::timestamptz,(b->>'end')::timestamptz
    from jsonb_array_elements(p_blocks) b;
  return jsonb_build_object('ok',true,'version',coalesce(v_current,0)+1);
exception when invalid_datetime_format or datetime_field_overflow or unique_violation or foreign_key_violation
  then return jsonb_build_object('errorCode','invalid_request');
end $$;

create function public.booking_admin_snapshot(p_site text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
  if not public.app_context_is_valid_site_admin() or public.app_context_site_id()::text is distinct from p_site
  then return jsonb_build_object('errorCode','forbidden'); end if;
  return jsonb_build_object(
    'settings',(select jsonb_build_object('timezone',timezone,'slotMinutes',slot_minutes,'holdMinutes',hold_minutes,
      'enabled',enabled,'version',version) from public.booking_settings where site_id=p_site),
    'weekly',coalesce((select jsonb_agg(jsonb_build_object('day',weekday,'kind',kind,'start',to_char(starts_at,'HH24:MI'),
      'end',to_char(ends_at,'HH24:MI')) order by weekday,starts_at) from public.booking_weekly where site_id=p_site),'[]'::jsonb),
    'blocks',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'start',starts_at,'end',ends_at) order by starts_at)
      from public.booking_blocks where site_id=p_site),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',customer_name,'phone',phone,'email',email,
      'service',service_title,'startsAt',booking_start,'status',status,'holdExpiresAt',booking_hold_expires_at,
      'proposedStart',booking_proposed_start,'version',appointment_version) order by created_at desc)
      from public.site_appointments where site_id=p_site and booking_start is not null),'[]'::jsonb)
  );
end $$;

alter table public.booking_settings enable row level security;
alter table public.booking_weekly enable row level security;
alter table public.booking_blocks enable row level security;
revoke all on public.booking_settings,public.booking_weekly,public.booking_blocks from public;
revoke all on function public.booking_available_slots(text,date,timestamptz),public.booking_public_slots(text,date),
  public.booking_public_config(text),public.booking_admin_snapshot(text),
  public.booking_request(text,timestamptz,text,text,text,text),public.booking_transition(text,uuid,text,integer,timestamptz),
  public.booking_configure(text,integer,text,integer,jsonb,jsonb,boolean) from public;
-- Match the exact already provisioned runtime role; functions themselves check tenant and lifecycle.
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid where p.polrelid='public.site_appointments'::regclass and p.polname='site_appointments_site_admin_select'
  loop
    execute format('grant execute on function public.booking_public_slots(text,date),public.booking_public_config(text),public.booking_request(text,timestamptz,text,text,text,text),public.booking_transition(text,uuid,text,integer,timestamptz),public.booking_configure(text,integer,text,integer,jsonb,jsonb,boolean),public.booking_admin_snapshot(text) to %I',v_role);
  end loop;
end $$;
