-- BOOKING V1 LOCAL: bounded review corrections. Preserve applied migrations 079-083.
-- migrate-as-migrator
alter table public.site_appointments drop constraint site_appointments_status_check;
alter table public.site_appointments add constraint site_appointments_status_check
  check (status in ('requested','proposed','accepted','confirmed','declined','cancelled'));

-- migrate-as-owner-of: public.booking_transition(text,uuid,text,integer,timestamp with time zone)
create or replace function public.booking_transition(p_site text,p_id uuid,p_action text,p_version integer,p_new_start timestamptz default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_row public.site_appointments; v_settings public.booking_settings; v_end timestamptz;
begin
  if not public.app_context_is_valid_site_admin() or public.app_context_site_id()::text is distinct from p_site
  then return jsonb_build_object('errorCode','forbidden'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site||':booking',0));
  select * into v_settings from public.booking_settings where site_id=p_site and enabled for update;
  select * into v_row from public.site_appointments where id=p_id and site_id=p_site and booking_start is not null for update;
  if not found or v_row.appointment_version<>p_version then return jsonb_build_object('errorCode','stale'); end if;
  if p_action='confirm' and v_row.status='requested' then
    if not coalesce(v_row.booking_hold_expires_at>clock_timestamp(),false) then
      -- An expired hold no longer reserves the slot. Recheck the canonical
      -- availability result while holding the same site transaction lock used
      -- by public requests and other owner transitions.
      select ends_at into v_end from public.booking_available_slots(p_site,
        (v_row.booking_start at time zone v_settings.timezone)::date,clock_timestamp())
        where starts_at=v_row.booking_start;
      if v_end is distinct from v_row.booking_end then return jsonb_build_object('errorCode','slot_unavailable'); end if;
    else
      -- The active request owns its hold, so exclude only that row from the
      -- competing occupancy check while validating the current schedule.
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
    end if;
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
    -- This records an explicit Site Admin assertion of customer acceptance.
    -- Opening WhatsApp or merely proposing never performs this transition.
    update public.site_appointments set status='accepted',updated_at=clock_timestamp() where id=p_id;
  else return jsonb_build_object('errorCode','invalid_transition'); end if;
  return (select jsonb_build_object('ok',true,'id',id,'status',status,'version',appointment_version,
    'startsAt',booking_start,'phone',phone,'name',customer_name) from public.site_appointments where id=p_id);
exception when exclusion_violation then return jsonb_build_object('errorCode','slot_unavailable');
end $$;
revoke all on function public.booking_transition(text,uuid,text,integer,timestamp with time zone) from public;

-- migrate-as-owner-of: public.booking_confirm_proposed(text,uuid,integer)
create or replace function public.booking_confirm_proposed(p_site text,p_id uuid,p_version integer)
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
  if v_row.status<>'accepted' or v_row.booking_proposed_start is null
  then return jsonb_build_object('errorCode','invalid_transition'); end if;
  select ends_at into v_end from public.booking_available_slots(p_site,
    (v_row.booking_proposed_start at time zone v_settings.timezone)::date,clock_timestamp())
    where starts_at=v_row.booking_proposed_start;
  if v_end is null then return jsonb_build_object('errorCode','slot_unavailable'); end if;
  update public.site_appointments set status='confirmed',booking_start=v_row.booking_proposed_start,
    booking_end=v_end,booking_hold_expires_at=null,booking_proposed_start=null,
    preferred_date=(v_row.booking_proposed_start at time zone v_settings.timezone)::date,
    preferred_time=(v_row.booking_proposed_start at time zone v_settings.timezone)::time,
    updated_at=clock_timestamp() where id=p_id;
  return (select jsonb_build_object('ok',true,'id',id,'status',status,'version',appointment_version,
    'startsAt',booking_start,'phone',phone,'name',customer_name) from public.site_appointments where id=p_id);
exception when exclusion_violation then return jsonb_build_object('errorCode','slot_unavailable');
end $$;
revoke all on function public.booking_confirm_proposed(text,uuid,integer) from public;
