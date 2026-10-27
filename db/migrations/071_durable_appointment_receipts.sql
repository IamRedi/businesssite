-- BSRC-APPT-002: additive receipt metadata stays in the existing appointments privacy class.
-- migrate-as-migrator
alter table public.site_appointments
  add column receipt_key_digest text,
  add column request_fingerprint text,
  add column fingerprint_key_version text,
  add column receipt_expires_at timestamptz,
  add column request_service_id text,
  add column appointment_version integer not null default 1;
alter table public.site_appointments add constraint appointment_receipt_shape check (
  (receipt_key_digest is null and request_fingerprint is null and fingerprint_key_version is null and receipt_expires_at is null)
  or (receipt_key_digest ~ '^[a-f0-9]{64}$' and request_fingerprint ~ '^[a-f0-9]{64}$'
    and fingerprint_key_version ~ '^[A-Za-z0-9._-]{1,40}$' and receipt_expires_at is not null
    and receipt_expires_at = created_at + interval '24 hours'
    and receipt_key_digest is not null and request_fingerprint is not null and fingerprint_key_version is not null)
);
alter table public.site_appointments add constraint appointment_version_positive check(appointment_version > 0);
create unique index appointment_receipt_tenant_key on public.site_appointments(site_id,receipt_key_digest)
  where receipt_key_digest is not null;

create or replace function public.appointment_receipt_privacy_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if (to_jsonb(new)-'appointment_version'-'updated_at') is distinct from (to_jsonb(old)-'appointment_version'-'updated_at') then
    new.appointment_version := old.appointment_version + 1;
  end if;
  -- Exact existing 049 anonymization marker. The existing workflow checks holds,
  -- policy and provider reconciliation before this update; this trigger enables no execution.
  if new.phone='deleted' and new.customer_name='Deleted requester '||left(replace(new.id::text,'-',''),12)
     and new.email is null and new.customer_message is null and new.service_title is null
     and new.preferred_date is null and new.preferred_time is null and new.note is null then
    new.receipt_key_digest:=null; new.request_fingerprint:=null;
    new.fingerprint_key_version:=null; new.receipt_expires_at:=null; new.request_service_id:=null;
  end if;
  return new;
end $$;
revoke all on function public.appointment_receipt_privacy_guard() from public;
create trigger appointment_receipt_privacy_guard before update on public.site_appointments
  for each row execute function public.appointment_receipt_privacy_guard();
-- Exclude capability material even from authenticated direct customer SELECT.
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid
    where p.polrelid='public.site_appointments'::regclass and p.polname='site_appointments_site_admin_select'
  loop
    execute format('revoke select on public.site_appointments from %I',v_role);
    execute format('grant select(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,note,customer_message,status,created_at,updated_at) on public.site_appointments to %I',v_role);
  end loop;
end $$;

-- migrate-as-owner-of: public.site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric)
create or replace function public.appointment_receipt_projection(p public.site_appointments,p_replayed boolean)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('ok',true,'receipt',jsonb_build_object('appointmentId',p.id,'createdAt',p.created_at,'expiresAt',p.receipt_expires_at),
    'appointment',jsonb_build_object('status',p.status,'version',p.appointment_version,'serviceTitle',p.service_title,
      'preferredDate',p.preferred_date,'preferredTime',p.preferred_time),
    'replayed',p_replayed,'notification',jsonb_build_object('state','disabled'))
$$;
revoke all on function public.appointment_receipt_projection(public.site_appointments,boolean) from public;

create or replace function public.public_appointment_create_v1(
  p_slug text,p_site_id text,p_digest text,p_input jsonb,p_active_key text,p_fingerprints jsonb,p_quotas_by_plan jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_site public.sites; v_sub public.site_subscriptions; v_row public.site_appointments;
  v_state public.tenant_usage_states; v_now timestamptz; v_q jsonb; v_quotas jsonb;
  v_window text; v_limit bigint; v_quantity bigint; v_start timestamptz; v_end timestamptz;
  v_service jsonb; v_service_count integer; v_title text; v_warning boolean:=false;
begin
  if p_slug is null or p_site_id is null or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_input) is distinct from 'object' or p_input->'contractVersion' is distinct from '1'::jsonb
     or p_input->>'slug' is distinct from p_slug or p_input-array['contractVersion','slug','customerName','phone','email','serviceId','serviceTitle','preferredDate','preferredTime','note']::text[] <> '{}'::jsonb
     or jsonb_typeof(p_input->'customerName') is distinct from 'string' or length(btrim(p_input->>'customerName')) not between 1 and 120
     or jsonb_typeof(p_input->'phone') is distinct from 'string' or length(btrim(p_input->>'phone')) not between 1 and 40
     or exists(select 1 from jsonb_each(p_input) e where e.key <> 'contractVersion' and jsonb_typeof(e.value) <> 'string')
     or length(coalesce(p_input->>'email',''))>160 or length(coalesce(p_input->>'note',''))>1000
     or length(coalesce(p_input->>'serviceTitle',''))>120 or length(coalesce(p_input->>'serviceId',''))>120
     or (p_input ? 'email' and p_input->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
     or (p_input ? 'serviceId' and (p_input ? 'serviceTitle' or p_input->>'serviceId' !~ '^[A-Za-z0-9_-]{1,120}$'))
     or (p_input ? 'preferredDate') <> (p_input ? 'preferredTime')
     or (p_input ? 'preferredDate' and (p_input->>'preferredDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or p_input->>'preferredTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$'))
  then return jsonb_build_object('errorCode','invalid_request'); end if;
  -- Parsing before any writes rejects calendar-invalid dates as well as malformed civil time.
  perform (p_input->>'preferredDate')::date,(p_input->>'preferredTime')::time;
  if p_active_key is null or p_active_key !~ '^[A-Za-z0-9._-]{1,40}$'
    or jsonb_typeof(p_fingerprints) is distinct from 'object'
    or coalesce(p_fingerprints->>p_active_key,'') !~ '^[a-f0-9]{64}$'
    or (select count(*) from jsonb_object_keys(p_fingerprints)) not between 1 and 32
    or exists(select 1 from jsonb_each_text(p_fingerprints) e where e.key !~ '^[A-Za-z0-9._-]{1,40}$' or e.value !~ '^[a-f0-9]{64}$')
  then return jsonb_build_object('errorCode','temporarily_unavailable'); end if;
  select * into v_site from public.sites where id=p_site_id and slug=p_slug for share;
  if not found then return jsonb_build_object('errorCode','not_found'); end if;
  select * into v_sub from public.site_subscriptions where site_id=v_site.id for share;
  perform 1 from public.site_features where site_id=v_site.id and feature_key in('website','appointment_requests') for share;
  if not exists(select 1 from public.resolve_public_site_by_slug(p_slug) r where r.site_id=v_site.id)
  then return jsonb_build_object('errorCode','not_found'); end if;
  if not exists(select 1 from public.site_features where site_id=v_site.id and feature_key='appointment_requests' and enabled)
  then return jsonb_build_object('errorCode','capability_disabled'); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_site.id||':appointment_submission',0));
  v_now:=clock_timestamp();
  select * into v_row from public.site_appointments where site_id=v_site.id and receipt_key_digest=p_digest for update;
  if found then
    if v_row.receipt_expires_at<=v_now then return jsonb_build_object('errorCode','capability_expired'); end if;
    if not (p_fingerprints ? v_row.fingerprint_key_version) then return jsonb_build_object('errorCode','temporarily_unavailable'); end if;
    if p_fingerprints->>v_row.fingerprint_key_version is distinct from v_row.request_fingerprint
      then return jsonb_build_object('errorCode','idempotency_conflict'); end if;
    return public.appointment_receipt_projection(v_row,true);
  end if;
  -- Replay precedes current service validation: a saved request survives a later catalog edit.
  if p_input ? 'serviceId' or p_input ? 'serviceTitle' then
    select count(*) into v_service_count from jsonb_array_elements(coalesce(v_site.generated_document->'services','[]'::jsonb)) s
      where coalesce((s->>'archived')::boolean,false)=false and
      case when p_input ? 'serviceId' then s->>'id'=p_input->>'serviceId' else s->>'title'=p_input->>'serviceTitle' end;
    if v_service_count<>1 then return jsonb_build_object('errorCode','service_selection_required'); end if;
    select s into v_service from jsonb_array_elements(v_site.generated_document->'services') s
      where coalesce((s->>'archived')::boolean,false)=false and
      case when p_input ? 'serviceId' then s->>'id'=p_input->>'serviceId' else s->>'title'=p_input->>'serviceTitle' end;
    v_title:=v_service->>'title';
    if length(coalesce(v_title,'')) not between 1 and 120 then return jsonb_build_object('errorCode','service_selection_required'); end if;
  end if;
  v_quotas:=p_quotas_by_plan->coalesce(v_sub.plan_key,'starter');
  if jsonb_typeof(v_quotas) is distinct from 'array' or jsonb_array_length(v_quotas)<>3
    or (select count(distinct q->>'window') from jsonb_array_elements(v_quotas) q)<>3
    or exists(select 1 from jsonb_array_elements(v_quotas) q where coalesce(q->>'window','') not in('minute','day','month')
      or jsonb_typeof(q->'limit') is distinct from 'number' or (q->>'limit')::numeric<>trunc((q->>'limit')::numeric)
      or (q->>'limit')::numeric not between 1 and 1000000)
  then return jsonb_build_object('errorCode','temporarily_unavailable'); end if;
  select * into v_state from public.tenant_usage_states where site_id=v_site.id for update;
  if (case when v_state.owner_override_until>v_now then v_state.owner_override_state
     when v_state.state_until is null or v_state.state_until>v_now then v_state.state else 'normal' end) = 'temporarily_restricted'
  then return jsonb_build_object('errorCode','quota_reached','retryAfterSeconds',greatest(1,coalesce(ceil(extract(epoch from(coalesce(v_state.owner_override_until,v_state.state_until)-v_now)))::integer,3600))); end if;
  for v_q in select value from jsonb_array_elements(v_quotas) loop
    v_window:=v_q->>'window'; v_limit:=(v_q->>'limit')::bigint;
    v_start:=date_trunc(v_window,v_now at time zone 'UTC') at time zone 'UTC';
    v_end:=v_start+case v_window when 'minute' then interval '1 minute' when 'day' then interval '1 day' else interval '1 month' end;
    select quantity into v_quantity from public.tenant_usage_counters
      where site_id=v_site.id and metric='appointment_submission' and window_type=v_window and window_start=v_start for update;
    if coalesce(v_quantity,0)+1>v_limit then
      return jsonb_build_object('errorCode','quota_reached','retryAfterSeconds',greatest(1,ceil(extract(epoch from(v_end-v_now)))::integer));
    end if;
    if (coalesce(v_quantity,0)+1)::numeric/v_limit>=0.8 then v_warning:=true; end if;
  end loop;
  insert into public.site_appointments(id,site_id,customer_name,phone,email,service_title,preferred_date,preferred_time,customer_message,
    status,created_at,updated_at,receipt_key_digest,request_fingerprint,fingerprint_key_version,receipt_expires_at,request_service_id)
  values(gen_random_uuid(),v_site.id,p_input->>'customerName',p_input->>'phone',p_input->>'email',v_title,
    (p_input->>'preferredDate')::date,(p_input->>'preferredTime')::time,p_input->>'note','requested',v_now,v_now,
    p_digest,p_fingerprints->>p_active_key,p_active_key,v_now+interval '24 hours',p_input->>'serviceId') returning * into v_row;
  for v_q in select value from jsonb_array_elements(v_quotas) loop
    v_window:=v_q->>'window';
    v_start:=date_trunc(v_window,v_now at time zone 'UTC') at time zone 'UTC';
    insert into public.tenant_usage_counters(site_id,metric,window_type,window_start,quantity,updated_at)
    values(v_site.id,'appointment_submission',v_window,v_start,1,v_now)
    on conflict(site_id,metric,window_type,window_start) do update
      set quantity=tenant_usage_counters.quantity+1,updated_at=v_now;
  end loop;
  insert into public.tenant_usage_states(site_id,state,updated_at) values(v_site.id,case when v_warning then 'warning' else 'normal' end,v_now)
    on conflict(site_id) do nothing;
  return public.appointment_receipt_projection(v_row,false);
exception when invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('errorCode','invalid_request');
end $$;
revoke all on function public.public_appointment_create_v1(text,text,text,jsonb,text,jsonb,jsonb) from public;

create or replace function public.public_appointment_receipt_v1(p_slug text,p_site_id text,p_digest text,p_key_versions text[])
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_site public.sites; v_row public.site_appointments;
begin
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then return jsonb_build_object('errorCode','not_found'); end if;
  select * into v_site from public.sites where id=p_site_id and slug=p_slug for share;
  if not found then return jsonb_build_object('errorCode','not_found'); end if;
  perform 1 from public.site_subscriptions where site_id=v_site.id for share;
  perform 1 from public.site_features where site_id=v_site.id and feature_key in('website','appointment_requests') for share;
  if not exists(select 1 from public.resolve_public_site_by_slug(p_slug) r where r.site_id=v_site.id)
    or not exists(select 1 from public.site_features where site_id=v_site.id and feature_key='appointment_requests' and enabled)
  then return jsonb_build_object('errorCode','not_found'); end if;
  select * into v_row from public.site_appointments where site_id=v_site.id and receipt_key_digest=p_digest for share;
  if not found then return jsonb_build_object('errorCode','not_found'); end if;
  if v_row.receipt_expires_at<=clock_timestamp() then return jsonb_build_object('errorCode','capability_expired'); end if;
  if not coalesce(v_row.fingerprint_key_version=any(p_key_versions),false)
    then return jsonb_build_object('errorCode','temporarily_unavailable'); end if;
  return public.appointment_receipt_projection(v_row,true);
end $$;
revoke all on function public.public_appointment_receipt_v1(text,text,text,text[]) from public;
-- Preserve the exact existing public-runtime caller role on already-provisioned upgrades.
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid
    where p.polrelid='public.site_appointments'::regclass and p.polname='site_appointments_site_admin_select'
  loop
    execute format('grant execute on function public.public_appointment_create_v1(text,text,text,jsonb,text,jsonb,jsonb),public.public_appointment_receipt_v1(text,text,text,text[]) to %I',v_role);
  end loop;
end $$;
-- migrate-as-owner-of: public.resolve_public_site_by_slug(text)
do $$ declare v_executor name; begin
  select pg_get_userbyid(proowner) into strict v_executor from pg_proc
    where oid='public.site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric)'::regprocedure;
  execute format('grant execute on function public.resolve_public_site_by_slug(text) to %I',v_executor);
end $$;
-- migrate-as-owner-of: public.privacy_system_export_snapshot(uuid,text)
-- Extend the existing allowlisted export without copying its authorization/hold logic.
do $$ declare v_definition text; v_marker text:='''serviceTitle'',service_title,''preferredDate'',preferred_date'; begin
  select pg_get_functiondef('public.privacy_system_export_snapshot(uuid,text)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'appointment_export_projection_drift'; end if;
  execute replace(v_definition,v_marker,'''serviceTitle'',service_title,''serviceId'',request_service_id,''version'',appointment_version,''preferredDate'',preferred_date');
end $$;
revoke all on function public.privacy_system_export_snapshot(uuid,text) from public;
