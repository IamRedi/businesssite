-- Preserve business lifecycle authorization; permit only media quota/lease
-- reservations for a live same-publication editor session. No role/table grants
-- or business mutation capability is widened. Existing limits/locks stay intact.

-- migrate-as-owner-of: public.site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric)
create or replace function public.site_admin_reserve_usage(
  p_session_hash text,p_site_id text,p_metric text,p_amount bigint,
  p_quotas jsonb,p_warning_ratio numeric
) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_capability text; v_state record; v_quota jsonb; v_window text;
  v_start timestamptz; v_end timestamptz; v_quantity bigint; v_limit bigint;
  v_reason text; v_warning boolean:=false; v_retry integer:=0;
begin
  v_capability:=case p_metric when 'client_ai_rewrite' then 'ai_rewrite'
    when 'media_upload' then 'media' when 'media_upload_bytes' then 'media' else null end;
  if v_capability is null or p_amount<1 or jsonb_typeof(p_quotas)<>'array'
     or jsonb_array_length(p_quotas) not between 1 and 4
     or p_warning_ratio not between 0.5 and 0.95
     or not (public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,v_capability)
     or (p_metric in('media_upload','media_upload_bytes') and exists(
       select 1 from public.site_admin_resolve_session(p_session_hash) a
       join public.sites s on s.id=a.site_id and s.site_kind='information'
       join public.site_editorial_memberships m on m.account_id=a.account_id and m.site_id=a.site_id
       where a.site_id=p_site_id and m.role in('editor','publisher','administrator')
     )))
  then return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode','authorization_denied'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id||':'||p_metric,0));
  insert into public.tenant_usage_states(site_id) values(p_site_id) on conflict(site_id) do nothing;
  select * into v_state from public.tenant_usage_states where site_id=p_site_id for update;
  if v_state.owner_override_until>statement_timestamp() and v_state.owner_override_state='temporarily_restricted' then
    return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode',coalesce(v_state.owner_override_reason,'owner_temporarily_restricted'),
      'retryAfterSeconds',greatest(1,extract(epoch from(v_state.owner_override_until-statement_timestamp()))::integer));
  end if;
  if v_state.state='temporarily_restricted' and (v_state.state_until is null or v_state.state_until>statement_timestamp()) then
    return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode',coalesce(v_state.reason_code,'tenant_temporarily_restricted'),
      'retryAfterSeconds',greatest(1,coalesce(extract(epoch from(v_state.state_until-statement_timestamp()))::integer,3600)));
  end if;
  for v_quota in select value from jsonb_array_elements(p_quotas) loop
    v_window:=v_quota->>'window'; v_limit:=(v_quota->>'limit')::bigint;
    if v_window not in('minute','hour','day','month') or v_limit<1 then raise exception 'Invalid usage quota'; end if;
    v_start:=case v_window when 'minute' then date_trunc('minute',statement_timestamp())
      when 'hour' then date_trunc('hour',statement_timestamp()) when 'day' then date_trunc('day',statement_timestamp())
      else date_trunc('month',statement_timestamp()) end;
    v_end:=case v_window when 'minute' then v_start+interval '1 minute' when 'hour' then v_start+interval '1 hour'
      when 'day' then v_start+interval '1 day' else v_start+interval '1 month' end;
    select quantity into v_quantity from public.tenant_usage_counters
      where site_id=p_site_id and metric=p_metric and window_type=v_window and window_start=v_start for update;
    v_quantity:=coalesce(v_quantity,0);
    if v_quantity+p_amount>v_limit then
      v_reason:='quota_'||p_metric||'_'||v_window;
      update public.tenant_usage_states set state='throttled',reason_code=v_reason,state_until=v_end,updated_at=statement_timestamp() where site_id=p_site_id;
      insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code,window_type,quantity,limit_value)
        select gen_random_uuid(),p_site_id,p_metric,'throttled',v_reason,v_window,v_quantity,v_limit
        where v_state.state is distinct from 'throttled' or v_state.reason_code is distinct from v_reason;
      return jsonb_build_object('allowed',false,'state','throttled','reasonCode',v_reason,
        'retryAfterSeconds',greatest(1,extract(epoch from(v_end-statement_timestamp()))::integer));
    end if;
  end loop;
  for v_quota in select value from jsonb_array_elements(p_quotas) loop
    v_window:=v_quota->>'window'; v_limit:=(v_quota->>'limit')::bigint;
    v_start:=case v_window when 'minute' then date_trunc('minute',statement_timestamp())
      when 'hour' then date_trunc('hour',statement_timestamp()) when 'day' then date_trunc('day',statement_timestamp())
      else date_trunc('month',statement_timestamp()) end;
    v_end:=case v_window when 'minute' then v_start+interval '1 minute' when 'hour' then v_start+interval '1 hour'
      when 'day' then v_start+interval '1 day' else v_start+interval '1 month' end;
    insert into public.tenant_usage_counters(site_id,metric,window_type,window_start,quantity)
      values(p_site_id,p_metric,v_window,v_start,p_amount)
      on conflict(site_id,metric,window_type,window_start) do update
      set quantity=tenant_usage_counters.quantity+excluded.quantity,updated_at=statement_timestamp()
      returning quantity into v_quantity;
    if v_quantity::numeric/v_limit::numeric>=p_warning_ratio then v_warning:=true; v_reason:='warning_'||p_metric||'_'||v_window; v_retry:=greatest(v_retry,extract(epoch from(v_end-statement_timestamp()))::integer); end if;
  end loop;
  if v_warning then
    update public.tenant_usage_states set state='warning',reason_code=v_reason,state_until=statement_timestamp()+(v_retry*interval '1 second'),updated_at=statement_timestamp() where site_id=p_site_id and (owner_override_until is null or owner_override_until<=statement_timestamp());
    insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code)
      select gen_random_uuid(),p_site_id,p_metric,'warning',v_reason
      where v_state.state is distinct from 'warning' or v_state.reason_code is distinct from v_reason;
  else
    update public.tenant_usage_states set state='normal',reason_code=null,state_until=null,updated_at=statement_timestamp()
      where site_id=p_site_id and state<>'temporarily_restricted' and (owner_override_until is null or owner_override_until<=statement_timestamp());
  end if;
  return jsonb_build_object('allowed',true,'state',case when v_warning then 'warning' else 'normal' end);
exception when invalid_text_representation or numeric_value_out_of_range then
  return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode','invalid_quota');
end $$;

-- migrate-as-owner-of: public.site_admin_concurrency_acquire(text,text,text,integer,integer)
create or replace function public.site_admin_concurrency_acquire(
  p_session_hash text,p_site_id text,p_operation text,p_limit integer,p_ttl integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_capability text; v_count integer; v_earliest timestamptz; v_id uuid;
begin
  v_capability:=case p_operation when 'client_ai_rewrite' then 'ai_rewrite' when 'media_upload' then 'media' else null end;
  if v_capability is null or p_limit not between 1 and 20 or p_ttl not between 10 and 300
     or not (public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,v_capability)
     or (p_operation='media_upload' and exists(
       select 1 from public.site_admin_resolve_session(p_session_hash) a
       join public.sites s on s.id=a.site_id and s.site_kind='information'
       join public.site_editorial_memberships m on m.account_id=a.account_id and m.site_id=a.site_id
       where a.site_id=p_site_id and m.role in('editor','publisher','administrator')
     )))
  then return jsonb_build_object('allowed',false,'retryAfterSeconds',60); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id||':concurrency:'||p_operation,0));
  delete from public.tenant_concurrency_leases where site_id=p_site_id and operation=p_operation and expires_at<=statement_timestamp();
  select count(*)::integer,min(expires_at) into v_count,v_earliest from public.tenant_concurrency_leases where site_id=p_site_id and operation=p_operation and expires_at>statement_timestamp();
  if v_count>=p_limit then return jsonb_build_object('allowed',false,'retryAfterSeconds',greatest(1,extract(epoch from(v_earliest-statement_timestamp()))::integer)); end if;
  v_id:=gen_random_uuid();
  insert into public.tenant_concurrency_leases(id,site_id,operation,expires_at) values(v_id,p_site_id,p_operation,statement_timestamp()+(p_ttl*interval '1 second'));
  return jsonb_build_object('allowed',true,'leaseId',v_id);
end $$;
