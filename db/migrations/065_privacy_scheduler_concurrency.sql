-- migrate-as-owner-of: public.monitoring_system_begin(text)
-- Task Group 4-B6F1: reject overlapping scheduler runs while retaining
-- stale-run recovery through the existing aggregate heartbeat ledger.

create or replace function public.monitoring_system_begin(p_purpose text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_run uuid:=gen_random_uuid();
  v_state public.operational_monitoring_state;
begin
  if p_purpose<>'operational_monitoring_scheduler' then
    raise exception 'monitoring_purpose_invalid';
  end if;

  select * into v_state
  from public.operational_monitoring_state
  where monitor_key='aggregate'
  for update;

  if v_state.monitor_key is not null
     and v_state.status='running'
     and v_state.last_started_at>=statement_timestamp()-make_interval(secs=>180) then
    return null;
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

revoke all on function public.monitoring_system_begin(text) from public;
