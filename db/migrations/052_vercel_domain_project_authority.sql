-- Task Group 4-B5B: bind a custom-domain attachment and its cleanup work to
-- one exact Vercel team/project. Existing rows are not guessed or backfilled.

alter table public.sites
  add column if not exists custom_domain_provider_authority text;
alter table public.sites
  add constraint sites_custom_domain_provider_authority_check
  check (custom_domain_provider_authority is null or
    custom_domain_provider_authority ~ '^vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}$');

create or replace function public.site_admin_domain_persist(
  p_session_hash text,p_site_id text,p_domain text,p_status text,p_verification jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_current_domain text; v_current_authority text; v_authority text;
begin
  select a.site_id,s.custom_domain,s.custom_domain_provider_authority
    into v_site,v_current_domain,v_current_authority
  from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id
  where a.site_id=p_site_id and public.database_site_admin_mutation_allowed(p_session_hash,a.site_id,'custom_domain_existing');
  if v_site is null or p_domain<>lower(p_domain) or p_domain like 'www.%'
     or p_domain !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
     or p_status not in('pending_dns','verified','failed') or jsonb_typeof(p_verification)<>'object'
     or octet_length(p_verification::text)>32768 then return false; end if;

  if p_status='failed' then
    if v_current_domain is distinct from p_domain or
       coalesce(v_current_authority,'') !~ '^vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}$'
      then return false; end if;
    update public.sites set custom_domain_status='failed',custom_domain_verification=p_verification,
      custom_domain_checked_at=statement_timestamp() where id=v_site and custom_domain=p_domain;
    return found;
  end if;

  if (p_verification->>'provider') is distinct from 'vercel'
     or (p_verification->>'domain') is distinct from p_domain
     or coalesce(p_verification->>'projectId','') !~ '^prj_[A-Za-z0-9]{20,64}$'
     or coalesce(p_verification->>'teamId','') !~ '^team_[A-Za-z0-9]{20,64}$'
     or jsonb_typeof(p_verification->'ownershipVerified') is distinct from 'boolean'
     or jsonb_typeof(p_verification->'dnsConfigured') is distinct from 'boolean'
     or jsonb_typeof(p_verification->'ready') is distinct from 'boolean'
     or (p_verification->>'ready') is distinct from (p_status='verified')::text
     or jsonb_typeof(p_verification->'checkedAt') is distinct from 'string'
     or length(coalesce(p_verification->>'checkedAt','')) not between 10 and 64
     or jsonb_typeof(p_verification->'records') is distinct from 'array'
     or jsonb_array_length(p_verification->'records')>20
     or p_verification-array['provider','domain','projectId','teamId','ownershipVerified','dnsConfigured','ready','records','checkedAt']::text[]<>'{}'::jsonb
     or exists(select 1 from jsonb_array_elements(p_verification->'records') r
       where jsonb_typeof(r)<>'object' or r-array['type','name','value','purpose']::text[]<>'{}'::jsonb
         or coalesce(r->>'purpose','') not in('ownership','routing')
         or length(coalesce(r->>'type','')) not between 1 and 16 or length(coalesce(r->>'name','')) not between 1 and 253
         or length(coalesce(r->>'value','')) not between 1 and 1024)
    then return false; end if;
  v_authority:='vercel-project:'||(p_verification->>'teamId')||':'||(p_verification->>'projectId');
  update public.sites set custom_domain=p_domain,custom_domain_status=p_status,
    custom_domain_provider_authority=v_authority,custom_domain_verification=p_verification,
    custom_domain_checked_at=statement_timestamp() where id=v_site;
  return found;
exception when unique_violation then return false;
end $$;

create or replace function public.privacy_provider_cleanup_add_authorized_binding(
  p_job uuid,p_site text,p_policy uuid,p_provider text,p_source text,p_resource text,
  p_operation text,p_authority text,p_reference text,p_required boolean default true
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_hash text;
begin
  if p_reference is null or p_reference~'[[:cntrl:]]' or not (
    (p_provider='vercel_blob' and p_source='media' and p_resource='blob_object'
      and p_operation='delete_exact' and char_length(p_reference) between 1 and 500
      and (p_authority is null or p_authority~'^store_[A-Za-z0-9]{16}$'))
    or
    (p_provider='vercel_domains' and p_source='domain' and p_resource='project_domain_attachment'
      and p_operation='detach_exact' and p_reference=lower(p_reference)
      and p_reference~'^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
      and (p_authority is null or p_authority~'^vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}$'))
  ) then return null; end if;
  v_hash:=encode(public.digest(convert_to(coalesce(p_authority,'missing')||'|'||p_reference,'UTF8'),'sha256'),'hex');
  insert into public.privacy_provider_cleanup_items(id,job_id,provider,source_kind,reference_hash,status,required,result_code)
  values(v_id,p_job,p_provider,p_source,v_hash,'pending',p_required,null)
  on conflict(job_id,provider,source_kind,reference_hash) do update
    set updated_at=public.privacy_provider_cleanup_items.updated_at returning id into v_id;
  insert into public.privacy_provider_cleanup_bindings(item_id,job_id,site_id,policy_version_id,provider,resource_kind,operation,provider_authority,provider_reference,ownership_reference)
  values(v_id,p_job,p_site,p_policy,p_provider,p_resource,p_operation,p_authority,p_reference,
    encode(public.digest(convert_to(p_site||'|'||p_provider||'|'||coalesce(p_authority,'missing')||'|'||p_resource||'|'||p_reference,'UTF8'),'sha256'),'hex'))
  on conflict(item_id) do nothing;
  return v_id;
end $$;

create or replace function public.privacy_system_expand_provider_cleanup(p_job uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 select w.*,j.policy_version_id into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j;
 if v.job_id is null or v.phase not in('awaiting_provider_cleanup','cooling_period') then return 0; end if;
 update public.privacy_provider_cleanup_items i set status='completed',required=false,result_code='unsupported',completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp()
 where i.job_id=p_job and i.status='pending' and not exists(select 1 from public.privacy_provider_cleanup_bindings b where b.item_id=i.id);
 for v in select a.storage_key,a.provider_authority from public.site_media_assets a where a.site_id=(select site_id from public.customer_deletion_workflows where job_id=p_job) and a.storage_provider='vercel_blob' loop
   perform public.privacy_provider_cleanup_add_authorized_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_blob','media','blob_object','delete_exact',v.provider_authority,v.storage_key,true); v_count:=v_count+1;
 end loop;
 select s.id site_id,s.custom_domain,s.custom_domain_status,s.custom_domain_provider_authority into v from public.sites s join public.customer_deletion_workflows w on w.site_id=s.id where w.job_id=p_job;
 if v.custom_domain is not null and v.custom_domain<>'' and v.custom_domain_status='verified' then perform public.privacy_provider_cleanup_add_authorized_binding(p_job,v.site_id,(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_domains','domain','project_domain_attachment','detach_exact',v.custom_domain_provider_authority,v.custom_domain,true); v_count:=v_count+1; end if;
 select s.billing_provider,s.provider_subscription_id into v from public.site_subscriptions s join public.customer_deletion_workflows w on w.site_id=s.site_id where w.job_id=p_job;
 if v.provider_subscription_id is not null then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),v.billing_provider,'subscription','subscription_retained','retain',v.provider_subscription_id,true); v_count:=v_count+1; end if;
 perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'resend','email','transactional_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':transactional',true); v_count:=v_count+1;
 if exists(select 1 from public.ai_runs a join public.customer_deletion_workflows w on w.site_id=a.site_id or w.site_id=a.applied_site_id where w.job_id=p_job) then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'openai','ai','stateless_ai_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':stateless',true); v_count:=v_count+1; end if;
 if exists(select 1 from public.sites s join public.customer_deletion_workflows w on w.site_id=s.id where w.job_id=p_job and s.lead_id is not null) then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'google','finder','finder_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':finder',true); v_count:=v_count+1; end if;
 for v in select i.external_workspace_id from public.site_external_integrations i join public.customer_deletion_workflows w on w.site_id=i.site_id where w.job_id=p_job and i.provider='redi_control' loop
   if v.external_workspace_id is not null and v.external_workspace_id<>'' then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'redi_control','integration','redi_workspace','detach_exact',v.external_workspace_id,true); v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;

create or replace function public.privacy_system_claim_provider_cleanup_work(p_worker text,p_lease_seconds integer default 300)
returns table(id uuid,job_id uuid,site_id text,provider text,source_kind text,resource_kind text,operation text,provider_reference text,reference_hash text,attempt integer,max_attempts integer,reconcile boolean,correlation_id text) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin
 if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return; end if;
 for v in select w.job_id from public.customer_deletion_workflows w where w.phase='awaiting_provider_cleanup' order by w.updated_at for update skip locked loop perform public.privacy_system_expand_provider_cleanup(v.job_id); end loop;
 select i.*,b.site_id,b.resource_kind,b.operation,b.provider_reference,b.provider_authority,b.binding_state,w.site_admin_account_id,w.policy_version_id,w.policy_hash,j.correlation_id into v from public.privacy_provider_cleanup_items i join public.privacy_provider_cleanup_bindings b on b.item_id=i.id join public.customer_deletion_workflows w on w.job_id=i.job_id join public.privacy_jobs j on j.id=i.job_id where w.phase='awaiting_provider_cleanup' and i.required and i.status in('pending','retry_wait','uncertain') and i.attempts<i.max_attempts and coalesce(i.next_attempt_at,'-infinity')<=statement_timestamp() order by i.created_at,case when i.provider='vercel_blob' then 0 when i.provider='vercel_domains' then 1 else 2 end,i.id for update of i,b,w,j skip locked limit 1;
 if v.id is null then return; end if;
 if v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or not public.privacy_policy_valid(v.policy_version_id) or public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or v.binding_state<>'trusted' or (v.provider='vercel_blob' and coalesce(v.provider_authority,'')!~'^store_[A-Za-z0-9]{16}$') or (v.provider='vercel_domains' and coalesce(v.provider_authority,'')!~'^vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}$') then update public.privacy_provider_cleanup_items i set status='manual_review_required',failure_code='binding_invalid',result_code='manual_review_required',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where i.id=v.id; update public.customer_deletion_workflows w set phase='blocked',updated_at=statement_timestamp() where w.job_id=v.job_id; update public.privacy_jobs j set status='blocked',error_code=case when public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then 'legal_hold' else 'provider_binding_invalid' end,updated_at=statement_timestamp() where j.id=v.job_id; return; end if;
 update public.privacy_provider_cleanup_items i set status=case when v.status='uncertain' then 'reconciling' else 'running' end,attempts=attempts+1,operation_started_at=statement_timestamp(),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,failure_code=null,updated_at=statement_timestamp() where i.id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.job_id,'provider_cleanup_blocked','system',case when v.status in('running','retry_wait','completed','blocked','canceled') then v.status else 'awaiting_approval' end,'running',jsonb_build_object('provider',v.provider,'attempt',v.attempts+1,'maxAttempts',v.max_attempts,'reasonCode','provider_operation_started'),v.correlation_id);
 return query select v.id,v.job_id,v.site_id,v.provider,v.source_kind,v.resource_kind,v.operation,v.provider_reference,v.reference_hash,v.attempts+1,v.max_attempts,v.status='uncertain',v.correlation_id;
end $$;

revoke all on function public.site_admin_domain_persist(text,text,text,text,jsonb) from public;
revoke all on function public.privacy_provider_cleanup_add_authorized_binding(uuid,text,uuid,text,text,text,text,text,text,boolean) from public;
revoke all on function public.privacy_system_expand_provider_cleanup(uuid) from public;
revoke all on function public.privacy_system_claim_provider_cleanup_work(text,integer) from public;
