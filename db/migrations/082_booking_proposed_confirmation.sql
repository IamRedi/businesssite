-- Local booking follow-up: confirm a proposed time with the same transaction guard.
create function public.booking_confirm_proposed(p_site text,p_id uuid,p_version integer)
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
  if v_row.status<>'requested' or v_row.booking_proposed_start is null
  then return jsonb_build_object('errorCode','invalid_transition'); end if;
  -- A proposal does not reserve the new time. The current availability check and
  -- confirmed exclusion constraint both run before this transaction can commit.
  select ends_at into v_end from public.booking_available_slots(p_site,
    (v_row.booking_proposed_start at time zone v_settings.timezone)::date)
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
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid where p.polrelid='public.site_appointments'::regclass
      and p.polname='site_appointments_site_admin_select'
  loop execute format('grant execute on function public.booking_confirm_proposed(text,uuid,integer) to %I',v_role); end loop;
end $$;
