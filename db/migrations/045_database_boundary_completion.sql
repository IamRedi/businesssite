-- Task Group 3-B3C4: complete the pilot web-process database boundary.
-- FORCE ROW LEVEL SECURITY remains intentionally disabled.

create or replace function public.database_site_admin_mutation_allowed(
  p_session_hash text, p_site_id text, p_capability text
) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(
    select 1
    from public.site_admin_resolve_session(p_session_hash) a
    join public.sites s on s.id=a.site_id
    join public.site_features f on f.site_id=s.id and f.feature_key=p_capability and f.enabled
    left join public.site_subscriptions sub on sub.site_id=s.id
    where a.site_id=p_site_id and s.site_kind='business'
      and (
        (s.activated_at is null and s.demo_expires_at>statement_timestamp())
        or (sub.status in ('active','trialing') and (
          not sub.cancel_at_period_end or sub.current_period_end>statement_timestamp()
        ))
        or (sub.status='past_due' and sub.payment_grace_ends_at>statement_timestamp())
      )
  )
$$;

create or replace function public.site_admin_site_projection(
  p_session_hash text, p_slug text
) returns table(site_id text,generated_document jsonb,plan_key text,custom_domain text,
  custom_domain_status text,custom_domain_verification jsonb)
language sql stable security definer set search_path=pg_catalog as $$
  select s.id,s.generated_document,coalesce(sub.plan_key,'starter'),s.custom_domain,
         s.custom_domain_status,s.custom_domain_verification
  from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id and s.slug=p_slug
  left join public.site_subscriptions sub on sub.site_id=s.id
  limit 1
$$;

create or replace function public.site_admin_capability_allowed(
  p_session_hash text,p_site_id text,p_capability text
) returns boolean language sql stable security definer set search_path=pg_catalog as $$
  select p_capability in('website','editor','media','ai_rewrite','appointment_requests','custom_domain_existing')
    and public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,p_capability)
$$;

create or replace function public.site_admin_site_plan(p_session_hash text,p_site_id text)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(sub.plan_key,'starter') from public.site_admin_resolve_session(p_session_hash) a
  left join public.site_subscriptions sub on sub.site_id=a.site_id where a.site_id=p_site_id limit 1
$$;

create or replace function public.site_admin_cache_identities(p_session_hash text,p_site_id text)
returns table(slug text,custom_domain text) language sql stable security definer set search_path=pg_catalog as $$
  select s.slug,s.custom_domain from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id where a.site_id=p_site_id limit 1
$$;

create or replace function public.information_redi_site_plan(p_integration uuid,p_site_id text)
returns text language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(sub.plan_key,'starter') from public.site_external_integrations i
  left join public.site_subscriptions sub on sub.site_id=i.site_id
  where i.id=p_integration and i.site_id=p_site_id and i.provider='redi_control' and i.status='active'
    and i.inbound_enabled and 'media:write'=any(i.inbound_permissions) limit 1
$$;

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
     or not public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,v_capability)
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

create or replace function public.site_admin_concurrency_acquire(
  p_session_hash text,p_site_id text,p_operation text,p_limit integer,p_ttl integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_capability text; v_count integer; v_earliest timestamptz; v_id uuid;
begin
  v_capability:=case p_operation when 'client_ai_rewrite' then 'ai_rewrite' when 'media_upload' then 'media' else null end;
  if v_capability is null or p_limit not between 1 and 20 or p_ttl not between 10 and 300
     or not public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,v_capability)
  then return jsonb_build_object('allowed',false,'retryAfterSeconds',60); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id||':concurrency:'||p_operation,0));
  delete from public.tenant_concurrency_leases where site_id=p_site_id and operation=p_operation and expires_at<=statement_timestamp();
  select count(*)::integer,min(expires_at) into v_count,v_earliest from public.tenant_concurrency_leases where site_id=p_site_id and operation=p_operation and expires_at>statement_timestamp();
  if v_count>=p_limit then return jsonb_build_object('allowed',false,'retryAfterSeconds',greatest(1,extract(epoch from(v_earliest-statement_timestamp()))::integer)); end if;
  v_id:=gen_random_uuid();
  insert into public.tenant_concurrency_leases(id,site_id,operation,expires_at) values(v_id,p_site_id,p_operation,statement_timestamp()+(p_ttl*interval '1 second'));
  return jsonb_build_object('allowed',true,'leaseId',v_id);
end $$;

create or replace function public.site_admin_concurrency_release(p_session_hash text,p_site_id text,p_lease uuid)
returns boolean language sql security definer set search_path=pg_catalog as $$
  with valid as(select 1 from public.site_admin_resolve_session(p_session_hash) a where a.site_id=p_site_id),
  gone as(delete from public.tenant_concurrency_leases l using valid where l.id=p_lease and l.site_id=p_site_id returning 1)
  select exists(select 1 from gone)
$$;

create or replace function public.site_admin_ai_start(p_session_hash text,p_site_id text,p_provider text,p_model text,p_input jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_actor uuid;
begin
  select account_id into v_actor from public.site_admin_resolve_session(p_session_hash) a where a.site_id=p_site_id;
  if v_actor is null or not public.database_site_admin_mutation_allowed(p_session_hash,p_site_id,'ai_rewrite')
     or length(p_provider) not between 1 and 80 or length(p_model) not between 1 and 160 then return null; end if;
  insert into public.ai_runs(id,actor_type,actor_id,operation,site_id,provider,model,input)
    values(v_id,'site_admin',v_actor::text,'text_rewrite',p_site_id,p_provider,p_model,p_input);
  return v_id;
end $$;

create or replace function public.site_admin_ai_finish(p_session_hash text,p_run uuid,p_status text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text;
begin
  select r.site_id into v_site from public.ai_runs r join public.site_admin_resolve_session(p_session_hash) a on a.site_id=r.site_id
    where r.id=p_run and r.actor_type='site_admin' and r.operation='text_rewrite' and r.status='pending' for update of r;
  if v_site is null or p_status not in('completed','failed') then return false; end if;
  update public.ai_runs set status=p_status,output=case when p_status='completed' then p_payload->'output' end,
    usage=case when p_status='completed' then coalesce(p_payload->'usage','{}') else '{}' end,
    provider_response_id=case when p_status='completed' then left(p_payload->>'providerResponseId',255) end,
    error=case when p_status='failed' then left(p_payload->>'error',1000) end,completed_at=statement_timestamp() where id=p_run;
  return true;
end $$;

create or replace function public.owner_ai_start(p_session_hash text,p_lead_id text,p_provider text,p_model text,p_input jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid:=gen_random_uuid();
begin
  select owner_id into v_actor from public.owner_auth_resolve_session(p_session_hash,'ai.manage');
  if v_actor is null or not exists(select 1 from public.leads where id=p_lead_id)
     or length(p_provider) not between 1 and 80 or length(p_model) not between 1 and 160 then return null; end if;
  insert into public.ai_runs(id,actor_type,actor_id,operation,lead_id,provider,model,input)
    values(v_id,'owner',v_actor::text,'website_blueprint',p_lead_id,p_provider,p_model,p_input);
  return v_id;
end $$;

create or replace function public.owner_ai_finish(p_session_hash text,p_run uuid,p_status text,p_payload jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid;
begin
  select owner_id into v_actor from public.owner_auth_resolve_session(p_session_hash,'ai.manage');
  if v_actor is null or p_status not in('completed','failed') then return false; end if;
  update public.ai_runs set status=p_status,output=case when p_status='completed' then p_payload->'output' end,
    usage=case when p_status='completed' then coalesce(p_payload->'usage','{}') else '{}' end,
    provider_response_id=case when p_status='completed' then left(p_payload->>'providerResponseId',255) end,
    error=case when p_status='failed' then left(p_payload->>'error',1000) end,completed_at=statement_timestamp()
    where id=p_run and actor_type='owner' and actor_id=v_actor::text and status='pending';
  return found;
end $$;

create or replace function public.owner_ai_get(p_session_hash text,p_run uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('id',r.id,'actorType',r.actor_type,'actorId',r.actor_id,'operation',r.operation,
    'leadId',r.lead_id,'siteId',r.site_id,'provider',r.provider,'model',r.model,'status',r.status,
    'input',r.input,'output',r.output,'usage',r.usage,'providerResponseId',r.provider_response_id,
    'error',r.error,'appliedSiteId',r.applied_site_id,'createdAt',r.created_at)
  from public.owner_auth_resolve_session(p_session_hash,'ai.manage') a
  join public.ai_runs r on r.id=p_run and r.actor_type='owner' and r.actor_id=a.owner_id::text
$$;

create or replace function public.owner_ai_apply(p_session_hash text,p_run uuid,p_site_id text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_applied text;
begin
  select owner_id into v_actor from public.owner_auth_resolve_session(p_session_hash,'ai.manage');
  if v_actor is null then return null; end if;
  update public.ai_runs r set status='applied',applied_site_id=p_site_id,applied_at=statement_timestamp()
    where r.id=p_run and r.actor_type='owner' and r.actor_id=v_actor::text and r.status='completed'
      and exists(select 1 from public.sites s where s.id=p_site_id and s.lead_id=r.lead_id)
    returning applied_site_id into v_applied;
  if v_applied is null then select applied_site_id into v_applied from public.ai_runs where id=p_run and actor_id=v_actor::text and status='applied'; end if;
  return v_applied;
end $$;

create or replace function public.site_admin_domain_preflight(p_session_hash text,p_slug text)
returns table(site_id text,current_domain text) language sql stable security definer set search_path=pg_catalog as $$
  select s.id,s.custom_domain from public.site_admin_resolve_session(p_session_hash) a join public.sites s on s.id=a.site_id and s.slug=p_slug
  where s.activated_at is not null and public.database_site_admin_mutation_allowed(p_session_hash,s.id,'custom_domain_existing') limit 1
$$;

create or replace function public.site_admin_domain_persist(p_session_hash text,p_site_id text,p_domain text,p_status text,p_verification jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text;
begin
  select a.site_id into v_site from public.site_admin_resolve_session(p_session_hash) a
    where a.site_id=p_site_id and public.database_site_admin_mutation_allowed(p_session_hash,a.site_id,'custom_domain_existing');
  if v_site is null or p_domain<>lower(p_domain) or p_domain like 'www.%'
     or p_domain !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
     or p_status not in('pending_dns','verified','failed') or jsonb_typeof(p_verification)<>'object'
     or octet_length(p_verification::text)>32768
     or (p_status<>'failed' and (
       (p_verification->>'provider') is distinct from 'vercel' or (p_verification->>'domain') is distinct from p_domain
       or jsonb_typeof(p_verification->'ownershipVerified') is distinct from 'boolean'
       or jsonb_typeof(p_verification->'dnsConfigured') is distinct from 'boolean'
       or jsonb_typeof(p_verification->'ready') is distinct from 'boolean'
       or (p_verification->>'ready') is distinct from (p_status='verified')::text
       or jsonb_typeof(p_verification->'checkedAt') is distinct from 'string'
       or length(coalesce(p_verification->>'checkedAt','')) not between 10 and 64
       or jsonb_typeof(p_verification->'records') is distinct from 'array'
       or jsonb_array_length(p_verification->'records')>20
       or p_verification-array['provider','domain','ownershipVerified','dnsConfigured','ready','records','checkedAt']::text[]<>'{}'::jsonb
       or exists(select 1 from jsonb_array_elements(p_verification->'records') r
         where jsonb_typeof(r)<>'object' or r-array['type','name','value','purpose']::text[]<>'{}'::jsonb
           or coalesce(r->>'purpose','') not in('ownership','routing')
           or length(coalesce(r->>'type','')) not between 1 and 16 or length(coalesce(r->>'name','')) not between 1 and 253
           or length(coalesce(r->>'value','')) not between 1 and 1024)
     )) then return false; end if;
  update public.sites set custom_domain=p_domain,custom_domain_status=p_status,
    custom_domain_verification=p_verification,custom_domain_checked_at=statement_timestamp() where id=v_site;
  return found;
exception when unique_violation then return false;
end $$;

create or replace function public.resolve_public_business_media_blob(p_id uuid)
returns table(site_id text,content_type text,data bytea)
language sql stable security definer set search_path=pg_catalog as $$
  select b.site_id,b.content_type,b.data from public.site_media_blobs b
  join public.sites s on s.id=b.site_id and s.site_kind='business'
  join public.site_features f on f.site_id=s.id and f.feature_key='media' and f.enabled
  where b.id=p_id and public.public_site_lifecycle_allows(s.id) limit 1
$$;

drop function if exists public.resolve_public_legal_config();
create function public.resolve_public_legal_config()
returns table(id uuid,version integer,legal_business_name text,legal_form text,street text,address_line_2 text,
  postal_code text,city text,country_code text,country_name text,authorized_representative text,
  contact_email text,support_email text,phone text,register_name text,register_court text,register_number text,
  vat_id text,supervisory_authority text,editorial_responsible_person text,tax_display_mode text,currency text,
  price_tax_label text,special_tax_note text,legal_review_status text,status text,reviewed_at timestamptz,
  effective_from timestamptz,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
  select c.id,c.version,c.legal_business_name,c.legal_form,c.street,c.address_line_2,c.postal_code,c.city,
    c.country_code,c.country_name,c.authorized_representative,c.contact_email,c.support_email,c.phone,
    c.register_name,c.register_court,c.register_number,c.vat_id,c.supervisory_authority,
    c.editorial_responsible_person,c.tax_display_mode,c.currency,c.price_tax_label,c.special_tax_note,
    c.legal_review_status,c.status,c.reviewed_at,c.effective_from,c.created_at
  from public.platform_legal_config_versions c where c.status='active' and c.legal_review_status='reviewed'
    and c.effective_from<=statement_timestamp() order by c.version desc limit 1
$$;

drop function if exists public.resolve_public_legal_documents();
create function public.resolve_public_legal_documents()
returns table(id uuid,document_key text,locale text,version text,content_hash text,status text,
  effective_from timestamptz,reviewed_at timestamptz,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
  select d.id,d.document_key,d.locale,d.version,d.content_hash,d.status,d.effective_from,d.reviewed_at,d.created_at
  from public.platform_legal_document_versions d where d.status='active' and d.reviewed_at is not null
    and d.effective_from<=statement_timestamp() order by d.document_key,d.locale,d.created_at desc
$$;

create or replace function public.information_redi_media_blob_insert(p_integration uuid,p_site_id text,p_filename text,p_data bytea)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid();
begin
  if length(p_filename) not between 1 and 180 or octet_length(p_data) not between 1 and 4194304
     or not exists(select 1 from public.site_external_integrations i join public.sites s on s.id=i.site_id and s.site_kind='information'
       where i.id=p_integration and i.site_id=p_site_id and i.provider='redi_control' and i.status='active'
         and i.inbound_enabled and 'media:write'=any(i.inbound_permissions)) then return null; end if;
  insert into public.site_media_blobs(id,site_id,filename,content_type,data) values(v_id,p_site_id,p_filename,'image/webp',p_data);
  return v_id;
end $$;

create or replace function public.information_redi_usage_reserve(
  p_integration uuid,p_site_id text,p_metric text,p_amount bigint,p_quotas jsonb,p_warning_ratio numeric
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_state record; v_quota jsonb; v_window text; v_start timestamptz; v_end timestamptz;
  v_quantity bigint; v_limit bigint; v_reason text; v_warning boolean:=false; v_retry integer:=0;
begin
  if not exists(select 1 from public.site_external_integrations i where i.id=p_integration and i.site_id=p_site_id
    and i.provider='redi_control' and i.status='active' and i.inbound_enabled and 'media:write'=any(i.inbound_permissions))
  then return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode','authorization_denied'); end if;
  if p_metric not in('media_upload','media_upload_bytes') or p_amount<1 or jsonb_typeof(p_quotas)<>'array'
     or jsonb_array_length(p_quotas) not between 1 and 4 or p_warning_ratio not between 0.5 and 0.95
  then return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode','invalid_quota'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id||':'||p_metric,0));
  insert into public.tenant_usage_states(site_id) values(p_site_id) on conflict(site_id) do nothing;
  select * into v_state from public.tenant_usage_states where site_id=p_site_id for update;
  if v_state.owner_override_until>statement_timestamp() and v_state.owner_override_state='temporarily_restricted' then
    return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode',coalesce(v_state.owner_override_reason,'owner_temporarily_restricted'),
      'retryAfterSeconds',greatest(1,extract(epoch from(v_state.owner_override_until-statement_timestamp()))::integer)); end if;
  if v_state.state='temporarily_restricted' and (v_state.state_until is null or v_state.state_until>statement_timestamp()) then
    return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode',coalesce(v_state.reason_code,'tenant_temporarily_restricted'),
      'retryAfterSeconds',greatest(1,coalesce(extract(epoch from(v_state.state_until-statement_timestamp()))::integer,3600))); end if;
  for v_quota in select value from jsonb_array_elements(p_quotas) loop
    v_window:=v_quota->>'window'; v_limit:=(v_quota->>'limit')::bigint;
    if v_window not in('minute','hour','day','month') or v_limit<1 then raise exception 'Invalid usage quota'; end if;
    v_start:=case v_window when 'minute' then date_trunc('minute',statement_timestamp()) when 'hour' then date_trunc('hour',statement_timestamp()) when 'day' then date_trunc('day',statement_timestamp()) else date_trunc('month',statement_timestamp()) end;
    v_end:=case v_window when 'minute' then v_start+interval '1 minute' when 'hour' then v_start+interval '1 hour' when 'day' then v_start+interval '1 day' else v_start+interval '1 month' end;
    select quantity into v_quantity from public.tenant_usage_counters where site_id=p_site_id and metric=p_metric and window_type=v_window and window_start=v_start for update;
    v_quantity:=coalesce(v_quantity,0);
    if v_quantity+p_amount>v_limit then
      v_reason:='quota_'||p_metric||'_'||v_window;
      update public.tenant_usage_states set state='throttled',reason_code=v_reason,state_until=v_end,updated_at=statement_timestamp() where site_id=p_site_id;
      insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code,window_type,quantity,limit_value)
        select gen_random_uuid(),p_site_id,p_metric,'throttled',v_reason,v_window,v_quantity,v_limit
        where v_state.state is distinct from 'throttled' or v_state.reason_code is distinct from v_reason;
      return jsonb_build_object('allowed',false,'state','throttled','reasonCode',v_reason,'retryAfterSeconds',greatest(1,extract(epoch from(v_end-statement_timestamp()))::integer));
    end if;
  end loop;
  for v_quota in select value from jsonb_array_elements(p_quotas) loop
    v_window:=v_quota->>'window'; v_limit:=(v_quota->>'limit')::bigint;
    v_start:=case v_window when 'minute' then date_trunc('minute',statement_timestamp()) when 'hour' then date_trunc('hour',statement_timestamp()) when 'day' then date_trunc('day',statement_timestamp()) else date_trunc('month',statement_timestamp()) end;
    v_end:=case v_window when 'minute' then v_start+interval '1 minute' when 'hour' then v_start+interval '1 hour' when 'day' then v_start+interval '1 day' else v_start+interval '1 month' end;
    insert into public.tenant_usage_counters(site_id,metric,window_type,window_start,quantity) values(p_site_id,p_metric,v_window,v_start,p_amount)
      on conflict(site_id,metric,window_type,window_start) do update set quantity=tenant_usage_counters.quantity+excluded.quantity,updated_at=statement_timestamp() returning quantity into v_quantity;
    if v_quantity::numeric/v_limit::numeric>=p_warning_ratio then v_warning:=true; v_reason:='warning_'||p_metric||'_'||v_window; v_retry:=greatest(v_retry,extract(epoch from(v_end-statement_timestamp()))::integer); end if;
  end loop;
  if v_warning then
    update public.tenant_usage_states set state='warning',reason_code=v_reason,state_until=statement_timestamp()+(v_retry*interval '1 second'),updated_at=statement_timestamp() where site_id=p_site_id and (owner_override_until is null or owner_override_until<=statement_timestamp());
    insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code) select gen_random_uuid(),p_site_id,p_metric,'warning',v_reason where v_state.state is distinct from 'warning' or v_state.reason_code is distinct from v_reason;
  else
    update public.tenant_usage_states set state='normal',reason_code=null,state_until=null,updated_at=statement_timestamp() where site_id=p_site_id and state<>'temporarily_restricted' and (owner_override_until is null or owner_override_until<=statement_timestamp());
  end if;
  return jsonb_build_object('allowed',true,'state',case when v_warning then 'warning' else 'normal' end);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('allowed',false,'state','temporarily_restricted','reasonCode','invalid_quota');
end $$;

create or replace function public.information_redi_concurrency_acquire(p_integration uuid,p_site_id text,p_limit integer,p_ttl integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_count integer; v_id uuid:=gen_random_uuid();
begin
  if p_limit not between 1 and 20 or p_ttl not between 10 and 300 or not exists(
    select 1 from public.site_external_integrations i where i.id=p_integration and i.site_id=p_site_id and i.provider='redi_control'
      and i.status='active' and i.inbound_enabled and 'media:write'=any(i.inbound_permissions)) then return jsonb_build_object('allowed',false,'retryAfterSeconds',60); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_site_id||':concurrency:media_upload',0));
  delete from public.tenant_concurrency_leases where site_id=p_site_id and operation='media_upload' and expires_at<=statement_timestamp();
  select count(*)::integer into v_count from public.tenant_concurrency_leases where site_id=p_site_id and operation='media_upload' and expires_at>statement_timestamp();
  if v_count>=p_limit then return jsonb_build_object('allowed',false,'retryAfterSeconds',60); end if;
  insert into public.tenant_concurrency_leases(id,site_id,operation,expires_at) values(v_id,p_site_id,'media_upload',statement_timestamp()+(p_ttl*interval '1 second'));
  return jsonb_build_object('allowed',true,'leaseId',v_id);
end $$;

create or replace function public.information_redi_concurrency_release(p_integration uuid,p_site_id text,p_lease uuid)
returns boolean language sql security definer set search_path=pg_catalog as $$
  with valid as(select 1 from public.site_external_integrations i where i.id=p_integration and i.site_id=p_site_id and i.provider='redi_control' and i.status='active'),
  gone as(delete from public.tenant_concurrency_leases l using valid where l.id=p_lease and l.site_id=p_site_id and l.operation='media_upload' returning 1)
  select exists(select 1 from gone)
$$;

revoke all on function public.database_site_admin_mutation_allowed(text,text,text) from public;
revoke all on function public.site_admin_capability_allowed(text,text,text) from public;
revoke all on function public.site_admin_site_projection(text,text) from public;
revoke all on function public.site_admin_site_plan(text,text) from public;
revoke all on function public.site_admin_cache_identities(text,text) from public;
revoke all on function public.information_redi_site_plan(uuid,text) from public;
revoke all on function public.site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric) from public;
revoke all on function public.site_admin_concurrency_acquire(text,text,text,integer,integer) from public;
revoke all on function public.site_admin_concurrency_release(text,text,uuid) from public;
revoke all on function public.site_admin_ai_start(text,text,text,text,jsonb) from public;
revoke all on function public.site_admin_ai_finish(text,uuid,text,jsonb) from public;
revoke all on function public.owner_ai_start(text,text,text,text,jsonb) from public;
revoke all on function public.owner_ai_finish(text,uuid,text,jsonb) from public;
revoke all on function public.owner_ai_get(text,uuid) from public;
revoke all on function public.owner_ai_apply(text,uuid,text) from public;
revoke all on function public.site_admin_domain_preflight(text,text) from public;
revoke all on function public.site_admin_domain_persist(text,text,text,text,jsonb) from public;
revoke all on function public.resolve_public_business_media_blob(uuid) from public;
revoke all on function public.resolve_public_legal_config() from public;
revoke all on function public.resolve_public_legal_documents() from public;
revoke all on function public.information_redi_media_blob_insert(uuid,text,text,bytea) from public;
revoke all on function public.information_redi_usage_reserve(uuid,text,text,bigint,jsonb,numeric) from public;
revoke all on function public.information_redi_concurrency_acquire(uuid,text,integer,integer) from public;
revoke all on function public.information_redi_concurrency_release(uuid,text,uuid) from public;
