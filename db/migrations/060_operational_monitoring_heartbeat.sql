-- Task Group 4-B6A: durable, aggregate-only scheduler heartbeat state.
-- The single row contains no tenant, customer, provider reference or payload.

create table if not exists public.operational_monitoring_state (
  monitor_key text primary key check (monitor_key='aggregate'),
  active_run_id uuid not null,
  last_started_at timestamptz not null,
  last_completed_at timestamptz,
  last_healthy_at timestamptz,
  status text not null check (status in('running','healthy','alert','delivery_failed','error')),
  signal_count integer not null default 0 check (signal_count between 0 and 1000000),
  delivery_healthy boolean not null default false,
  run_count bigint not null default 1 check (run_count>0),
  updated_at timestamptz not null default now()
);

alter table public.operational_monitoring_state enable row level security;
alter table public.operational_monitoring_state force row level security;

create or replace function public.monitoring_system_begin(p_purpose text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_run uuid:=gen_random_uuid(); begin
  if p_purpose<>'operational_monitoring_scheduler' then
    raise exception 'monitoring_purpose_invalid';
  end if;
  insert into public.operational_monitoring_state(
    monitor_key,active_run_id,last_started_at,status,signal_count,
    delivery_healthy,run_count,updated_at
  ) values(
    'aggregate',v_run,statement_timestamp(),'running',0,false,1,statement_timestamp()
  )
  on conflict(monitor_key) do update set
    active_run_id=excluded.active_run_id,
    last_started_at=excluded.last_started_at,
    status='running',
    signal_count=0,
    delivery_healthy=false,
    run_count=public.operational_monitoring_state.run_count+1,
    updated_at=excluded.updated_at;
  return v_run;
end $$;

create or replace function public.monitoring_system_complete(
  p_run_id uuid,
  p_status text,
  p_signal_count integer,
  p_delivery_healthy boolean
)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_status not in('healthy','alert','delivery_failed','error')
     or p_signal_count not between 0 and 1000000 then
    raise exception 'monitoring_completion_invalid';
  end if;
  update public.operational_monitoring_state set
    last_completed_at=statement_timestamp(),
    last_healthy_at=case
      when p_status='healthy' and p_delivery_healthy then statement_timestamp()
      else last_healthy_at
    end,
    status=p_status,
    signal_count=p_signal_count,
    delivery_healthy=p_delivery_healthy,
    updated_at=statement_timestamp()
  where monitor_key='aggregate'
    and active_run_id=p_run_id
    and status='running';
  return found;
end $$;

create or replace function public.monitoring_system_heartbeat(
  p_max_age_seconds integer default 900,
  p_stale_run_seconds integer default 180
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v public.operational_monitoring_state;
  v_now timestamptz:=statement_timestamp();
  v_status text;
  v_reason text;
begin
  if p_max_age_seconds not between 60 and 86400
     or p_stale_run_seconds not between 30 and 3600
     or p_stale_run_seconds>p_max_age_seconds then
    raise exception 'monitoring_heartbeat_threshold_invalid';
  end if;
  select * into v from public.operational_monitoring_state where monitor_key='aggregate';
  if v.monitor_key is null then
    v_status:='missed'; v_reason:='no_completed_run';
  elsif v.status='running' and v.last_started_at<v_now-make_interval(secs=>p_stale_run_seconds) then
    v_status:='stalled'; v_reason:='run_not_completed';
  elsif v.last_completed_at is null or v.last_completed_at<v_now-make_interval(secs=>p_max_age_seconds) then
    v_status:='missed'; v_reason:='completion_too_old';
  elsif v.status='running' then
    v_status:='running'; v_reason:='run_in_progress';
  elsif v.status<>'healthy' or not v.delivery_healthy then
    v_status:='unhealthy'; v_reason:='last_run_unhealthy';
  else
    v_status:='healthy'; v_reason:='within_threshold';
  end if;
  return jsonb_build_object(
    'schema','businesssite.operational-heartbeat.v1',
    'checkedAt',v_now,
    'status',v_status,
    'reason',v_reason,
    'lastStartedAt',v.last_started_at,
    'lastCompletedAt',v.last_completed_at,
    'lastHealthyAt',v.last_healthy_at,
    'lastRunStatus',v.status,
    'signalCount',coalesce(v.signal_count,0),
    'deliveryHealthy',coalesce(v.delivery_healthy,false),
    'runCount',coalesce(v.run_count,0),
    'maxAgeSeconds',p_max_age_seconds,
    'staleRunSeconds',p_stale_run_seconds
  );
end $$;

revoke all on table public.operational_monitoring_state from public;
revoke all on function public.monitoring_system_begin(text) from public;
revoke all on function public.monitoring_system_complete(uuid,text,integer,boolean) from public;
revoke all on function public.monitoring_system_heartbeat(integer,integer) from public;
