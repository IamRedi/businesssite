-- Task Group 4-B6A: aggregate operational signals without exposing tenant rows,
-- provider payloads or privacy subjects to the application system identity.

create or replace function public.monitoring_system_snapshot(
  p_webhook_window_minutes integer default 15,
  p_stale_lease_minutes integer default 5,
  p_connection_warning_percent integer default 80
)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare
  v_checked_at timestamptz:=statement_timestamp();
  v_connections integer;
  v_max_connections integer;
  v_connection_percent numeric;
  v_webhook_invalid bigint;
  v_privacy_failed bigint;
  v_privacy_blocked bigint;
  v_privacy_stale_lease bigint;
  v_privacy_overdue_retry bigint;
  v_provider_problem bigint;
  v_signals jsonb:='[]'::jsonb;
begin
  if p_webhook_window_minutes not between 5 and 1440
     or p_stale_lease_minutes not between 1 and 60
     or p_connection_warning_percent not between 50 and 95 then
    raise exception 'monitoring_threshold_invalid';
  end if;

  select count(*)::integer into v_connections from pg_catalog.pg_stat_activity;
  v_max_connections:=current_setting('max_connections')::integer;
  v_connection_percent:=round((v_connections::numeric/nullif(v_max_connections,0))*100,2);

  select count(*) into v_webhook_invalid
  from public.payment_webhook_events
  where processed_at>=v_checked_at-make_interval(mins=>p_webhook_window_minutes)
    and disposition in('ignored_invalid','ignored_unbound');

  select
    count(*) filter(where status='failed'),
    count(*) filter(where status='blocked'),
    count(*) filter(where status in('planning','running') and lease_expires_at<v_checked_at-make_interval(mins=>p_stale_lease_minutes)),
    count(*) filter(where status='retry_wait' and next_attempt_at<v_checked_at-make_interval(mins=>p_stale_lease_minutes))
  into v_privacy_failed,v_privacy_blocked,v_privacy_stale_lease,v_privacy_overdue_retry
  from public.privacy_jobs
  where updated_at>=v_checked_at-interval '24 hours'
     or (status in('planning','running','retry_wait') and coalesce(lease_expires_at,next_attempt_at)<v_checked_at);

  select count(*) into v_provider_problem
  from public.privacy_provider_cleanup_items
  where updated_at>=v_checked_at-interval '24 hours'
    and status in('blocked','permanent_failure','uncertain','manual_review_required','unsupported');

  if v_connection_percent>=p_connection_warning_percent then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','database_connection_saturation','severity','critical','count',v_connections));
  end if;
  if v_webhook_invalid>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','billing_webhook_rejected','severity','warning','count',v_webhook_invalid));
  end if;
  if v_privacy_failed>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','privacy_job_failed','severity','critical','count',v_privacy_failed));
  end if;
  if v_privacy_blocked>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','privacy_job_blocked','severity','warning','count',v_privacy_blocked));
  end if;
  if v_privacy_stale_lease>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','privacy_job_stale_lease','severity','critical','count',v_privacy_stale_lease));
  end if;
  if v_privacy_overdue_retry>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','privacy_job_overdue_retry','severity','warning','count',v_privacy_overdue_retry));
  end if;
  if v_provider_problem>0 then
    v_signals:=v_signals||jsonb_build_array(jsonb_build_object('code','privacy_provider_cleanup_problem','severity','critical','count',v_provider_problem));
  end if;

  return jsonb_build_object(
    'schema','businesssite.operational-snapshot.v1',
    'checkedAt',v_checked_at,
    'status',case when jsonb_array_length(v_signals)=0 then 'ok' else 'alert' end,
    'thresholds',jsonb_build_object(
      'webhookWindowMinutes',p_webhook_window_minutes,
      'staleLeaseMinutes',p_stale_lease_minutes,
      'databaseConnectionWarningPercent',p_connection_warning_percent
    ),
    'metrics',jsonb_build_object(
      'databaseConnections',v_connections,
      'databaseMaxConnections',v_max_connections,
      'databaseConnectionPercent',v_connection_percent,
      'billingWebhookRejected',v_webhook_invalid,
      'privacyJobsFailed',v_privacy_failed,
      'privacyJobsBlocked',v_privacy_blocked,
      'privacyJobsStaleLease',v_privacy_stale_lease,
      'privacyJobsOverdueRetry',v_privacy_overdue_retry,
      'privacyProviderCleanupProblem',v_provider_problem
    ),
    'signals',v_signals
  );
end $$;

revoke all on function public.monitoring_system_snapshot(integer,integer,integer) from public;
