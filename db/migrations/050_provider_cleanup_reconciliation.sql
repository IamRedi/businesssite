-- Task Group 4-B4: exact provider cleanup bindings and reconciliation.
-- This migration never calls a provider and leaves deletion execution application-gated.

alter table public.privacy_provider_cleanup_items
  add column if not exists required boolean not null default true,
  add column if not exists result_code text,
  add column if not exists receipt_reference text,
  add column if not exists verified_at timestamptz,
  add column if not exists reconciled_at timestamptz,
  add column if not exists operation_started_at timestamptz;
alter table public.privacy_provider_cleanup_items drop constraint if exists privacy_provider_cleanup_items_status_check;
alter table public.privacy_provider_cleanup_items add constraint privacy_provider_cleanup_items_status_check check (status in ('pending','running','retry_wait','reconciling','completed','already_absent','detached','retained_by_policy','blocked','permanent_failure','uncertain','manual_review_required','unsupported','canceled'));
alter table public.privacy_provider_cleanup_items drop constraint if exists privacy_provider_cleanup_items_failure_code_check;
alter table public.privacy_provider_cleanup_items add constraint privacy_provider_cleanup_items_failure_code_check check (failure_code is null or failure_code in ('fake_provider_failure','lease_expired','attempt_limit','controlled_failure','binding_invalid','policy_mismatch','legal_hold','provider_disabled','provider_unconfigured','provider_unauthorized','provider_rate_limited','provider_timeout','provider_malformed_response','provider_uncertain','provider_permanent_failure','manual_review_required','unsupported'));
alter table public.privacy_provider_cleanup_items add constraint privacy_provider_cleanup_items_result_code_check check (result_code is null or result_code in ('completed','already_absent','detached','retained_by_policy','blocked','retryable_failure','permanent_failure','uncertain','manual_review_required','unsupported','no_provider_object'));
alter table public.privacy_provider_cleanup_items add constraint privacy_provider_cleanup_items_receipt_reference_check check (receipt_reference is null or receipt_reference ~ '^[A-Za-z0-9._:-]{1,160}$');
alter table public.privacy_provider_cleanup_items add constraint privacy_provider_cleanup_items_verified_check check (verified_at is null or status in ('completed','already_absent','detached','retained_by_policy'));
create index if not exists privacy_provider_cleanup_reconcile_idx on public.privacy_provider_cleanup_items(status,next_attempt_at,lease_expires_at,created_at);

create table if not exists public.privacy_provider_cleanup_bindings (
  item_id uuid primary key references public.privacy_provider_cleanup_items(id) on delete restrict,
  job_id uuid not null references public.privacy_jobs(id) on delete restrict,
  site_id text not null,
  policy_version_id uuid not null references public.privacy_policy_versions(id) on delete restrict,
  provider text not null check (provider in ('vercel_blob','vercel_domains','stripe','paddle','resend','openai','google','redi_control')),
  resource_kind text not null check (resource_kind in ('blob_object','project_domain_attachment','subscription_retained','transactional_no_customer_object','stateless_ai_no_customer_object','finder_no_customer_object','redi_workspace','legacy_unresolved')),
  operation text not null check (operation in ('delete_exact','detach_exact','revoke_exact','retain')),
  provider_reference text not null check (char_length(provider_reference) between 1 and 500 and provider_reference !~ '[[:cntrl:]]'),
  ownership_reference text not null check (ownership_reference ~ '^[a-f0-9]{64}$'),
  binding_state text not null default 'trusted' check (binding_state in ('trusted','detached','tombstoned','manual_review_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,provider,resource_kind,provider_reference)
);
create index if not exists privacy_provider_cleanup_bindings_job_idx on public.privacy_provider_cleanup_bindings(job_id,provider,resource_kind);
create index if not exists privacy_provider_cleanup_bindings_site_idx on public.privacy_provider_cleanup_bindings(site_id,provider,created_at);
create trigger privacy_provider_cleanup_bindings_no_delete before delete on public.privacy_provider_cleanup_bindings for each row execute function public.privacy_immutable_evidence();

create or replace function public.privacy_provider_cleanup_item_approved(p_status text,p_required boolean)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select not p_required or p_status in ('completed','already_absent','detached','retained_by_policy')
$$;

create or replace function public.privacy_provider_cleanup_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status in('completed','already_absent','detached','retained_by_policy','permanent_failure','manual_review_required','unsupported','canceled') and new is distinct from old then raise exception 'privacy_provider_cleanup_terminal'; end if;
 if row(new.id,new.job_id,new.provider,new.source_kind,new.reference_hash,new.created_at) is distinct from row(old.id,old.job_id,old.provider,old.source_kind,old.reference_hash,old.created_at) then raise exception 'privacy_provider_cleanup_identity_immutable'; end if;
 if new.status<>old.status and not ((old.status='pending' and new.status in('running','retained_by_policy','manual_review_required','unsupported','canceled') or (old.status='pending' and new.status='completed' and not new.required)) or (old.status='running' and new.status in('completed','already_absent','detached','retained_by_policy','blocked','retry_wait','uncertain','permanent_failure','manual_review_required')) or (old.status='retry_wait' and new.status in('running','reconciling','manual_review_required','canceled')) or (old.status='uncertain' and new.status in('reconciling','manual_review_required')) or (old.status='reconciling' and new.status in('completed','already_absent','detached','retained_by_policy','blocked','retry_wait','permanent_failure','manual_review_required'))) then raise exception 'privacy_provider_cleanup_transition_denied'; end if;
 if new.attempts<old.attempts or new.attempts>old.attempts+1 then raise exception 'privacy_provider_cleanup_attempt_invalid'; end if;
 return new;
end $$;

create or replace function public.privacy_provider_cleanup_add_binding(p_job uuid,p_site text,p_policy uuid,p_provider text,p_source text,p_resource text,p_operation text,p_reference text,p_required boolean default true)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_hash text; begin
 if p_provider not in('vercel_blob','vercel_domains','stripe','paddle','resend','openai','google','redi_control') or p_source not in('media','domain','subscription','email','ai','finder','integration') or p_resource not in('blob_object','project_domain_attachment','subscription_retained','transactional_no_customer_object','stateless_ai_no_customer_object','finder_no_customer_object','redi_workspace','legacy_unresolved') or p_operation not in('delete_exact','detach_exact','revoke_exact','retain') or p_reference is null or char_length(p_reference) not between 1 and 500 or p_reference~'[[:cntrl:]]' then return null; end if;
 v_hash:=encode(public.digest(convert_to(p_reference,'UTF8'),'sha256'),'hex');
 insert into public.privacy_provider_cleanup_items(id,job_id,provider,source_kind,reference_hash,status,required,result_code)
 values(v_id,p_job,p_provider,p_source,v_hash,case when p_operation='retain' then 'pending' else 'pending' end,p_required,null)
 on conflict(job_id,provider,source_kind,reference_hash) do update set updated_at=public.privacy_provider_cleanup_items.updated_at returning id into v_id;
 insert into public.privacy_provider_cleanup_bindings(item_id,job_id,site_id,policy_version_id,provider,resource_kind,operation,provider_reference,ownership_reference)
 values(v_id,p_job,p_site,p_policy,p_provider,p_resource,p_operation,p_reference,encode(public.digest(convert_to(p_site||'|'||p_provider||'|'||p_resource||'|'||p_reference,'UTF8'),'sha256'),'hex'))
 on conflict(item_id) do nothing;
 return v_id;
end $$;

create or replace function public.privacy_system_expand_provider_cleanup(p_job uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 select w.*,j.policy_version_id into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j;
 if v.job_id is null or v.phase not in('awaiting_provider_cleanup','cooling_period') then return 0; end if;
 -- B3 created only aggregate hashes. Retire them as non-required and rebuild exact trusted bindings.
 update public.privacy_provider_cleanup_items i set status='completed',required=false,result_code='unsupported',completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp()
 where i.job_id=p_job and i.status='pending' and not exists(select 1 from public.privacy_provider_cleanup_bindings b where b.item_id=i.id);
 for v in select a.storage_key from public.site_media_assets a where a.site_id=(select site_id from public.customer_deletion_workflows where job_id=p_job) and a.storage_provider='vercel_blob' loop
   perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_blob','media','blob_object','delete_exact',v.storage_key,true); v_count:=v_count+1;
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
 select i.*,b.site_id,b.resource_kind,b.operation,b.provider_reference,b.binding_state,w.site_admin_account_id,w.policy_version_id,w.policy_hash,j.correlation_id into v from public.privacy_provider_cleanup_items i join public.privacy_provider_cleanup_bindings b on b.item_id=i.id join public.customer_deletion_workflows w on w.job_id=i.job_id join public.privacy_jobs j on j.id=i.job_id where w.phase='awaiting_provider_cleanup' and i.required and i.status in('pending','retry_wait','uncertain') and i.attempts<i.max_attempts and coalesce(i.next_attempt_at,'-infinity')<=statement_timestamp() order by i.created_at for update of i,b,w,j skip locked limit 1;
 if v.id is null then return; end if;
 if v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or not public.privacy_policy_valid(v.policy_version_id) or public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or v.binding_state<>'trusted' then update public.privacy_provider_cleanup_items i set status='manual_review_required',failure_code='binding_invalid',result_code='manual_review_required',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where i.id=v.id; update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='blocked',error_code=case when public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then 'legal_hold' else 'provider_binding_invalid' end,updated_at=statement_timestamp() where id=v.job_id; return; end if;
 update public.privacy_provider_cleanup_items i set status=case when v.status='uncertain' then 'reconciling' else 'running' end,attempts=attempts+1,operation_started_at=statement_timestamp(),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,failure_code=null,updated_at=statement_timestamp() where i.id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.job_id,'provider_cleanup_blocked','system',case when v.status in('running','retry_wait','completed','blocked','canceled') then v.status else 'awaiting_approval' end,'running',jsonb_build_object('provider',v.provider,'attempt',v.attempts+1,'maxAttempts',v.max_attempts,'reasonCode','provider_operation_started'),v.correlation_id);
 return query select v.id,v.job_id,v.site_id,v.provider,v.source_kind,v.resource_kind,v.operation,v.provider_reference,v.reference_hash,v.attempts+1,v.max_attempts,v.status='uncertain',v.correlation_id;
end $$;

create or replace function public.privacy_system_record_provider_cleanup_result(p_id uuid,p_worker text,p_result text,p_reason text,p_receipt text,p_retry_after_seconds integer default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_status text; v_delay integer; begin
 select i.*,w.site_id,w.site_admin_account_id,w.policy_version_id,w.policy_hash,j.correlation_id into v from public.privacy_provider_cleanup_items i join public.customer_deletion_workflows w on w.job_id=i.job_id join public.privacy_jobs j on j.id=i.job_id where i.id=p_id and i.status in('running','reconciling') and i.worker_reference=p_worker and i.lease_expires_at>statement_timestamp() for update of i,w,j;
 if v.id is null or p_result not in('completed','already_absent','detached','retained_by_policy','blocked','retryable_failure','permanent_failure','uncertain','manual_review_required','unsupported','no_provider_object') or p_reason !~'^[a-z_]{2,80}$' or (p_receipt is not null and p_receipt!~'^[A-Za-z0-9._:-]{1,160}$') then return false; end if;
 v_status:=case p_result when 'completed' then 'completed' when 'already_absent' then 'completed' when 'detached' then 'completed' when 'retained_by_policy' then 'completed' when 'no_provider_object' then 'completed' when 'retryable_failure' then 'retry_wait' when 'uncertain' then 'uncertain' when 'permanent_failure' then 'permanent_failure' when 'blocked' then 'blocked' when 'manual_review_required' then 'manual_review_required' else 'unsupported' end;
 if v_status in('retry_wait','uncertain') and v.attempts>=v.max_attempts then v_status:='manual_review_required'; p_reason:='attempt_limit'; end if;
 v_delay:=least(3600,greatest(30,coalesce(p_retry_after_seconds,30*(2^least(v.attempts,6)))));
 update public.privacy_provider_cleanup_items i set status=v_status,result_code=p_result,failure_code=case when v_status in('retry_wait','uncertain') then case when p_result='uncertain' then 'provider_uncertain' else 'controlled_failure' end when v_status in('blocked','manual_review_required') then 'manual_review_required' when v_status='unsupported' then 'unsupported' when v_status='permanent_failure' then 'provider_permanent_failure' else null end,receipt_reference=p_receipt,tombstone_checksum=case when v_status in('completed','already_absent','detached','retained_by_policy') then encode(public.digest(convert_to(coalesce(p_receipt,'receipt')||'|'||p_result,'UTF8'),'sha256'),'hex') end,next_attempt_at=case when v_status in('retry_wait','uncertain') then statement_timestamp()+make_interval(secs=>v_delay) end,lease_expires_at=null,worker_reference=null,completed_at=case when v_status in('completed','already_absent','detached','retained_by_policy') then statement_timestamp() end,verified_at=case when v_status in('completed','already_absent','detached','retained_by_policy') then statement_timestamp() end,reconciled_at=case when v.status='reconciling' then statement_timestamp() end,updated_at=statement_timestamp() where i.id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.job_id,case when v_status='completed' then 'provider_cleanup_completed' when v_status in('retry_wait','uncertain') then 'retry_scheduled' else 'provider_cleanup_blocked' end,'system',case when v.status in('running','retry_wait','completed','blocked','canceled') then v.status else 'running' end,case when v_status in('completed','retry_wait','blocked') then v_status else 'blocked' end,jsonb_build_object('provider',v.provider,'reasonCode',p_reason,'attempt',v.attempts,'maxAttempts',v.max_attempts,'checksum',case when p_receipt is null then null else encode(public.digest(convert_to(p_receipt,'UTF8'),'sha256'),'hex') end),v.correlation_id);
 if not exists(select 1 from public.privacy_provider_cleanup_items i where i.job_id=v.job_id and not public.privacy_provider_cleanup_item_approved(i.status,i.required)) then update public.customer_deletion_workflows set phase='awaiting_approval',updated_at=statement_timestamp() where job_id=v.job_id and phase='awaiting_provider_cleanup'; update public.privacy_jobs set error_code=null,updated_at=statement_timestamp() where id=v.job_id; end if;
 if v_status in('blocked','permanent_failure','manual_review_required','unsupported') then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='blocked',error_code='provider_cleanup',updated_at=statement_timestamp() where id=v.job_id; end if;
 return true;
end $$;

create or replace function public.privacy_system_claim_deletion_provider_item(p_worker text,p_lease_seconds integer default 300)
returns table(id uuid,job_id uuid,provider text,reference_hash text) language sql security definer set search_path=pg_catalog as $$
 select c.id,c.job_id,c.provider,c.reference_hash from public.privacy_system_claim_provider_cleanup_work(p_worker,p_lease_seconds) c
$$;

create or replace function public.privacy_system_finish_deletion_provider_item(p_id uuid,p_worker text,p_success boolean,p_tombstone_checksum text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin return public.privacy_system_record_provider_cleanup_result(p_id,p_worker,case when p_success then 'completed' else 'retryable_failure' end,case when p_success then 'fake_completed' else 'fake_provider_failure' end,case when p_tombstone_checksum~'^[a-f0-9]{64}$' then p_tombstone_checksum end,null); end $$;

create or replace function public.privacy_system_claim_deletion_execution(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if; select w.*,j.attempts,j.max_attempts into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.phase in('ready_for_execution','retry_wait') and j.status in('awaiting_approval','retry_wait') and j.attempts<j.max_attempts order by w.updated_at for update of w,j skip locked limit 1; if v.job_id is null then return null; end if;
 if public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or exists(select 1 from public.privacy_provider_cleanup_items i where i.job_id=v.job_id and not public.privacy_provider_cleanup_item_approved(i.status,i.required)) or v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='blocked',error_code='provider_cleanup',updated_at=statement_timestamp() where id=v.job_id; return null; end if;
 update public.customer_deletion_workflows set phase='executing',execution_started_at=coalesce(execution_started_at,statement_timestamp()),updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='running',attempts=attempts+1,worker_reference=p_worker,lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp() where id=v.job_id; return v.job_id; end $$;

create or replace function public.privacy_system_recover_customer_deletions()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 for v in select i.id from public.privacy_provider_cleanup_items i where i.status in('running','reconciling') and i.lease_expires_at<=statement_timestamp() for update skip locked loop update public.privacy_provider_cleanup_items i set status='retry_wait',failure_code='lease_expired',result_code='retryable_failure',next_attempt_at=statement_timestamp()+interval '60 seconds',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where i.id=v.id; v_count:=v_count+1; end loop;
 for v in select w.job_id,j.worker_reference from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.phase='executing' and j.status='running' and j.lease_expires_at<=statement_timestamp() for update of w,j skip locked loop if public.privacy_system_fail_customer_deletion(v.job_id,v.worker_reference,'lease_expired') then v_count:=v_count+1; end if; end loop;
 return v_count;
end $$;

alter table public.privacy_provider_cleanup_bindings enable row level security;
alter table public.privacy_provider_cleanup_bindings force row level security;
revoke all on table public.privacy_provider_cleanup_bindings from public;
revoke all on all functions in schema public from public;

create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select (select count(*)=66 and count(*) filter(where c.relrowsecurity)=63 and count(*) filter(where c.relforcerowsecurity)=63 and count(distinct c.relowner)=1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p'))
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('public',p.oid,'execute'))
  and (select count(distinct p.proowner)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;
