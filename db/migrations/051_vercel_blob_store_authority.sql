-- Task Group 4-B5A: bind every Vercel Blob cleanup target to an explicit store.
-- Legacy bindings without authority remain readable evidence but fail closed.

alter table public.site_media_assets
  add column if not exists provider_authority text;
alter table public.site_media_assets
  add constraint site_media_assets_provider_authority_check
  check (provider_authority is null or provider_authority ~ '^store_[A-Za-z0-9]{16}$');

alter table public.privacy_provider_cleanup_bindings
  add column if not exists provider_authority text;
alter table public.privacy_provider_cleanup_bindings
  add constraint privacy_provider_cleanup_bindings_authority_check
  check (provider_authority is null or provider_authority ~ '^[A-Za-z0-9._:-]{1,160}$');
alter table public.privacy_provider_cleanup_bindings
  add constraint privacy_provider_cleanup_bindings_authority_unique
  unique(job_id,provider,resource_kind,provider_authority,provider_reference);

drop trigger if exists privacy_provider_cleanup_bindings_no_delete on public.privacy_provider_cleanup_bindings;
create trigger privacy_provider_cleanup_bindings_immutable
before update or delete on public.privacy_provider_cleanup_bindings
for each row execute function public.privacy_immutable_evidence();

create or replace function public.site_admin_register_business_provider_media(
  p_session_hash text,p_slug text,p_authority text,p_storage_key text,p_public_url text,
  p_content_type text,p_byte_size integer
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_id uuid:=gen_random_uuid(); v_store text;
begin
  select s.id into v_site from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id and s.slug=p_slug and s.site_kind='business'
  where public.database_site_admin_mutation_allowed(p_session_hash,s.id,'media') limit 1;
  v_store:=replace(coalesce(p_authority,''),'store_','');
  if v_site is null or p_authority!~'^store_[A-Za-z0-9]{16}$'
    or left(p_storage_key,length('sites/'||v_site||'/'))<>'sites/'||v_site||'/'
    or char_length(p_storage_key) not between 1 and 500
    or p_storage_key!~'^[A-Za-z0-9._/-]+$'
    or p_storage_key like '%..%' or p_storage_key like '%/editorial/%'
    or p_public_url is distinct from 'https://'||lower(v_store)||'.public.blob.vercel-storage.com/'||p_storage_key
    or p_content_type<>'image/webp' or p_byte_size not between 1 and 4194304 then return null; end if;
  insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size)
  values(v_id,v_site,'vercel_blob',p_storage_key,'public',p_authority,p_public_url,p_content_type,p_byte_size)
  on conflict(site_id,storage_provider,storage_key) do update
    set provider_authority=site_media_assets.provider_authority
    where site_media_assets.provider_authority=excluded.provider_authority
      and site_media_assets.storage_access=excluded.storage_access
      and site_media_assets.public_url=excluded.public_url
      and site_media_assets.mime_type=excluded.mime_type
      and site_media_assets.byte_size=excluded.byte_size
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.privacy_provider_cleanup_add_authorized_binding(
  p_job uuid,p_site text,p_policy uuid,p_provider text,p_source text,p_resource text,
  p_operation text,p_authority text,p_reference text,p_required boolean default true
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_hash text;
begin
  if p_provider<>'vercel_blob' or p_source<>'media' or p_resource<>'blob_object'
    or p_operation<>'delete_exact' or p_reference is null or char_length(p_reference) not between 1 and 500
    or p_reference~'[[:cntrl:]]' or (p_authority is not null and p_authority!~'^store_[A-Za-z0-9]{16}$') then return null; end if;
  v_hash:=encode(public.digest(convert_to(coalesce(p_authority,'missing')||'|'||p_reference,'UTF8'),'sha256'),'hex');
  insert into public.privacy_provider_cleanup_items(id,job_id,provider,source_kind,reference_hash,status,required,result_code)
  values(v_id,p_job,p_provider,p_source,v_hash,'pending',p_required,null)
  on conflict(job_id,provider,source_kind,reference_hash) do update set updated_at=public.privacy_provider_cleanup_items.updated_at returning id into v_id;
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
 select s.id site_id,s.custom_domain into v from public.sites s join public.customer_deletion_workflows w on w.site_id=s.id where w.job_id=p_job;
 if v.custom_domain is not null and v.custom_domain<>'' and (select custom_domain_status from public.sites where id=v.site_id)='verified' then perform public.privacy_provider_cleanup_add_binding(p_job,v.site_id,(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_domains','domain','project_domain_attachment','detach_exact',v.custom_domain,true); v_count:=v_count+1; end if;
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
 select i.*,b.site_id,b.resource_kind,b.operation,b.provider_reference,b.provider_authority,b.binding_state,w.site_admin_account_id,w.policy_version_id,w.policy_hash,j.correlation_id into v from public.privacy_provider_cleanup_items i join public.privacy_provider_cleanup_bindings b on b.item_id=i.id join public.customer_deletion_workflows w on w.job_id=i.job_id join public.privacy_jobs j on j.id=i.job_id where w.phase='awaiting_provider_cleanup' and i.required and i.status in('pending','retry_wait','uncertain') and i.attempts<i.max_attempts and coalesce(i.next_attempt_at,'-infinity')<=statement_timestamp() order by i.created_at,case when i.provider='vercel_blob' then 0 else 1 end,i.id for update of i,b,w,j skip locked limit 1;
 if v.id is null then return; end if;
 if v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or not public.privacy_policy_valid(v.policy_version_id) or public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or v.binding_state<>'trusted' or (v.provider='vercel_blob' and coalesce(v.provider_authority,'')!~'^store_[A-Za-z0-9]{16}$') then update public.privacy_provider_cleanup_items i set status='manual_review_required',failure_code='binding_invalid',result_code='manual_review_required',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where i.id=v.id; update public.customer_deletion_workflows w set phase='blocked',updated_at=statement_timestamp() where w.job_id=v.job_id; update public.privacy_jobs j set status='blocked',error_code=case when public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then 'legal_hold' else 'provider_binding_invalid' end,updated_at=statement_timestamp() where j.id=v.job_id; return; end if;
 update public.privacy_provider_cleanup_items i set status=case when v.status='uncertain' then 'reconciling' else 'running' end,attempts=attempts+1,operation_started_at=statement_timestamp(),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,failure_code=null,updated_at=statement_timestamp() where i.id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.job_id,'provider_cleanup_blocked','system',case when v.status in('running','retry_wait','completed','blocked','canceled') then v.status else 'awaiting_approval' end,'running',jsonb_build_object('provider',v.provider,'attempt',v.attempts+1,'maxAttempts',v.max_attempts,'reasonCode','provider_operation_started'),v.correlation_id);
 return query select v.id,v.job_id,v.site_id,v.provider,v.source_kind,v.resource_kind,v.operation,v.provider_reference,v.reference_hash,v.attempts+1,v.max_attempts,v.status='uncertain',v.correlation_id;
end $$;

create or replace function public.privacy_system_claim_provider_cleanup_work_v2(p_worker text,p_lease_seconds integer default 300)
returns table(id uuid,job_id uuid,site_id text,provider text,source_kind text,resource_kind text,operation text,provider_authority text,provider_reference text,reference_hash text,attempt integer,max_attempts integer,reconcile boolean,correlation_id text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_authority text;
begin
  select * into v from public.privacy_system_claim_provider_cleanup_work(p_worker,p_lease_seconds);
  if v.id is null then return; end if;
  select b.provider_authority into v_authority from public.privacy_provider_cleanup_bindings b where b.item_id=v.id;
  return query select v.id,v.job_id,v.site_id,v.provider,v.source_kind,v.resource_kind,v.operation,v_authority,
    v.provider_reference,v.reference_hash,v.attempt,v.max_attempts,v.reconcile,v.correlation_id;
end
$$;

-- A missing provider authority is a manual-review boundary, not an automatic
-- planner retry. Other pre-existing blocked reasons retain their prior retry behavior.
create or replace function public.privacy_system_claim_deletion_plan(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record;
begin
  if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if;
  select w.*,j.status job_status,j.attempts,j.max_attempts into v
  from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id
  where w.phase in('requested','blocked','retry_wait') and j.status in('queued','blocked','retry_wait')
    and not (w.phase='blocked' and j.error_code='provider_binding_invalid')
    and j.attempts<j.max_attempts and coalesce(j.next_attempt_at,'-infinity')<=statement_timestamp()
  order by w.created_at for update of w,j skip locked limit 1;
  if v.job_id is null then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_deletion:'||v.site_id,4901));
  if v.job_status='blocked' then
    update public.privacy_jobs j set status='queued',error_code=null,updated_at=statement_timestamp() where j.id=v.job_id;
    v.job_status:='queued';
  end if;
  update public.customer_deletion_workflows w set phase='eligibility_check',updated_at=statement_timestamp() where w.job_id=v.job_id;
  update public.privacy_jobs j set status='planning',attempts=attempts+1,started_at=coalesce(started_at,statement_timestamp()),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,updated_at=statement_timestamp() where j.id=v.job_id;
  insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details)
  values(gen_random_uuid(),v.job_id,'job_claimed','system',v.job_status,'planning',jsonb_build_object('attempt',v.attempts+1,'maxAttempts',v.max_attempts,'leaseSeconds',p_lease_seconds));
  return v.job_id;
end $$;

revoke all on function public.site_admin_register_business_provider_media(text,text,text,text,text,text,integer) from public;
revoke all on function public.privacy_provider_cleanup_add_authorized_binding(uuid,text,uuid,text,text,text,text,text,text,boolean) from public;
revoke all on function public.privacy_system_claim_provider_cleanup_work_v2(text,integer) from public;
