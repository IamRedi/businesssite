-- Task Group 4-B3: authenticated BusinessSite customer closure workflow.
-- Production execution remains application-gated and disabled by default.
-- This migration creates no deletion jobs and performs no source-data mutation.

create table if not exists public.customer_deletion_workflows (
  job_id uuid primary key references public.privacy_jobs(id) on delete restrict,
  site_id text not null,
  site_admin_account_id uuid not null,
  policy_version_id uuid not null references public.privacy_policy_versions(id) on delete restrict,
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  phase text not null check (phase in ('requested','eligibility_check','blocked','cooling_period','awaiting_provider_cleanup','awaiting_approval','ready_for_execution','executing','retry_wait','completed','canceled','rejected','failed')),
  request_reason text not null check (request_reason in ('business_closed','service_no_longer_needed','business_transferred','privacy_request','other')),
  request_note text check (request_note is null or (char_length(request_note) between 1 and 500 and request_note !~ '[[:cntrl:]]')),
  irreversible_acknowledged boolean not null check (irreversible_acknowledged),
  export_offered boolean not null default true,
  export_requested boolean not null default false,
  export_job_id uuid references public.privacy_jobs(id) on delete restrict,
  export_artifact_id uuid references public.privacy_export_artifacts(id) on delete restrict,
  export_pending_until timestamptz,
  cooling_started_at timestamptz,
  cooling_ends_at timestamptz,
  lifecycle_observed_at timestamptz,
  legal_review_reference text check (legal_review_reference is null or legal_review_reference ~ '^[A-Za-z0-9._:/-]{1,120}$'),
  legal_review_recorded_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  decision_reason_code text check (decision_reason_code is null or decision_reason_code in ('eligible_approved','legal_disposition_confirmed','insufficient_basis','customer_request_invalid','risk_review_failed')),
  execution_started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cooling_started_at is null and cooling_ends_at is null) or (cooling_started_at is not null and cooling_ends_at>=cooling_started_at)),
  check ((approved_at is null)=(approved_by is null)),
  check ((rejected_at is null)=(rejected_by is null))
);
create unique index if not exists customer_deletion_one_active_site_idx on public.customer_deletion_workflows(site_id)
  where phase not in ('completed','canceled','rejected','failed');
create index if not exists customer_deletion_phase_idx on public.customer_deletion_workflows(phase,cooling_ends_at,created_at);

create table if not exists public.privacy_provider_cleanup_items (
  id uuid primary key,
  job_id uuid not null references public.privacy_jobs(id) on delete restrict,
  provider text not null check (provider in ('vercel_blob','vercel_domains','stripe','paddle','resend','openai','google','redi_control')),
  source_kind text not null check (source_kind in ('media','domain','subscription','email','ai','finder','integration')),
  reference_hash text not null check (reference_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('pending','running','retry_wait','completed','canceled')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  worker_reference text check (worker_reference is null or worker_reference ~ '^[A-Za-z0-9._:-]{1,100}$'),
  failure_code text check (failure_code is null or failure_code in ('fake_provider_failure','lease_expired','attempt_limit','controlled_failure')),
  tombstone_checksum text check (tombstone_checksum is null or tombstone_checksum ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,provider,source_kind,reference_hash)
);
create index if not exists privacy_provider_cleanup_claim_idx on public.privacy_provider_cleanup_items(status,next_attempt_at,created_at);

alter table public.privacy_jobs drop constraint privacy_jobs_error_code_check;
alter table public.privacy_jobs add constraint privacy_jobs_error_code_check check (error_code is null or error_code in
 ('invalid_subject','policy_unavailable','legal_hold','manual_review','active_subscription','attempt_limit','item_failed','lease_expired','execution_disabled','controlled_failure','export_limit_exceeded','artifact_store_failed','archive_failed','encryption_failed','recovery_window','cooling_period','provider_cleanup','provider_binding_invalid','policy_mismatch'));
alter table public.privacy_job_items drop constraint privacy_job_items_block_reason_code_check;
alter table public.privacy_job_items add constraint privacy_job_items_block_reason_code_check check (block_reason_code is null or block_reason_code in
 ('legal_hold','manual_legal_review','active_subscription','provider_reconciliation','execution_disabled','not_due','not_applicable','subject_not_found','recovery_window','cooling_period','provider_binding_invalid','policy_mismatch'));
alter table public.privacy_job_events drop constraint privacy_job_events_event_type_check;
alter table public.privacy_job_events add constraint privacy_job_events_event_type_check check (event_type in
 ('job_requested','planning_started','plan_created','job_claimed','state_changed','job_blocked','retry_scheduled','job_failed','job_completed','job_canceled','hold_detected','artifact_created','capability_issued','download_completed','download_denied','artifact_deleted','eligibility_result','cooling_started','cooling_completed','deletion_approved','deletion_rejected','execution_started','disposition_completed','provider_cleanup_blocked','provider_cleanup_completed'));

create or replace function public.privacy_safe_details(p_details jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(coalesce(p_details,'{}'::jsonb))='object' and not exists(
   select 1 from jsonb_object_keys(coalesce(p_details,'{}'::jsonb)) k
   where k not in ('reasonCode','itemCount','eligibleCount','blockedCount','attempt','maxAttempts','leaseSeconds','policyVersion','policyHash','classKey','previousStatus','nextStatus','artifactId','archiveBytes','fileCount','expiresAt','phase','provider','disposition','count','checksum','coolingEndsAt','exportOffered','exportRequested')
 )
$$;

create or replace function public.customer_deletion_workflow_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.phase in('completed','canceled','rejected','failed') and new is distinct from old then raise exception 'customer_deletion_terminal'; end if;
 if row(new.job_id,new.site_id,new.site_admin_account_id,new.policy_version_id,new.policy_hash,new.request_reason,new.irreversible_acknowledged,new.export_offered,new.export_requested,new.export_job_id,new.export_artifact_id,new.created_at)
    is distinct from row(old.job_id,old.site_id,old.site_admin_account_id,old.policy_version_id,old.policy_hash,old.request_reason,old.irreversible_acknowledged,old.export_offered,old.export_requested,old.export_job_id,old.export_artifact_id,old.created_at) then raise exception 'customer_deletion_identity_immutable'; end if;
 if new.phase<>old.phase and not ((old.phase='requested' and new.phase in('eligibility_check','blocked','canceled'))
   or (old.phase='eligibility_check' and new.phase in('blocked','cooling_period','awaiting_provider_cleanup','awaiting_approval','failed'))
   or (old.phase='blocked' and new.phase in('eligibility_check','canceled','rejected'))
   or (old.phase='cooling_period' and new.phase in('awaiting_provider_cleanup','awaiting_approval','blocked','canceled','rejected'))
   or (old.phase='awaiting_provider_cleanup' and new.phase in('awaiting_approval','blocked','retry_wait','canceled','rejected'))
   or (old.phase='awaiting_approval' and new.phase in('ready_for_execution','blocked','canceled','rejected'))
   or (old.phase='ready_for_execution' and new.phase in('executing','blocked','canceled'))
   or (old.phase='executing' and new.phase in('completed','retry_wait','blocked','failed'))
   or (old.phase='retry_wait' and new.phase in('awaiting_provider_cleanup','ready_for_execution','executing','blocked','canceled','failed'))) then raise exception 'customer_deletion_transition_denied'; end if;
 if old.request_note is distinct from new.request_note and not (old.request_note is not null and new.request_note is null and new.phase in('executing','completed')) then raise exception 'customer_deletion_note_immutable'; end if;
 return new;
end $$;
create trigger customer_deletion_workflow_guard before update on public.customer_deletion_workflows for each row execute function public.customer_deletion_workflow_guard();
create trigger customer_deletion_workflow_no_delete before delete on public.customer_deletion_workflows for each row execute function public.privacy_immutable_evidence();

create or replace function public.privacy_provider_cleanup_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status in('completed','canceled') and new is distinct from old then raise exception 'privacy_provider_cleanup_terminal'; end if;
 if row(new.id,new.job_id,new.provider,new.source_kind,new.reference_hash,new.created_at) is distinct from row(old.id,old.job_id,old.provider,old.source_kind,old.reference_hash,old.created_at) then raise exception 'privacy_provider_cleanup_identity_immutable'; end if;
 if new.status<>old.status and not ((old.status='pending' and new.status in('running','canceled')) or (old.status='running' and new.status in('completed','retry_wait')) or (old.status='retry_wait' and new.status in('running','canceled'))) then raise exception 'privacy_provider_cleanup_transition_denied'; end if;
 if new.attempts<old.attempts or new.attempts>old.attempts+1 then raise exception 'privacy_provider_cleanup_attempt_invalid'; end if;
 return new;
end $$;
create trigger privacy_provider_cleanup_guard before update on public.privacy_provider_cleanup_items for each row execute function public.privacy_provider_cleanup_guard();
create trigger privacy_provider_cleanup_no_delete before delete on public.privacy_provider_cleanup_items for each row execute function public.privacy_immutable_evidence();

create or replace function public.customer_deletion_lifecycle_reason(p_site text,p_now timestamptz)
returns text language plpgsql stable security definer set search_path=pg_catalog as $$
declare v public.site_subscriptions; begin
 select * into v from public.site_subscriptions where site_id=p_site;
 if v.site_id is null then return 'provider_binding_invalid'; end if;
 if v.status in('active','trialing','past_due') then return 'active_subscription'; end if;
 if v.status not in('canceled','unpaid','paused','incomplete','incomplete_expired')
   or v.billing_provider not in('stripe','paddle') or v.provider_subscription_id is null
   or v.provider_status_observed_at is null or v.latest_provider_event_at is null or v.latest_provider_event_id is null then return 'provider_binding_invalid'; end if;
 if v.read_only_ends_at is null or v.read_only_ends_at>p_now then return 'recovery_window'; end if;
 return null;
end $$;

create or replace function public.site_admin_request_customer_deletion(p_session_hash text,p_password_hash text,p_reason text,p_note text,p_ack boolean,p_correlation text)
returns table(ok boolean,reason text,job_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_policy record; v_existing uuid; v_job uuid:=gen_random_uuid(); v_hash text; v_export record; v_blocked boolean; begin
 select r.account_id,r.site_id,a.password_hash,s.site_kind,s.activated_at into v from public.site_admin_resolve_session(p_session_hash)r join public.site_admin_accounts a on a.id=r.account_id join public.sites s on s.id=r.site_id;
 if v.account_id is null or v.password_hash<>p_password_hash or v.site_kind<>'business' or v.activated_at is null or not p_ack or p_reason not in('business_closed','service_no_longer_needed','business_transferred','privacy_request','other') or char_length(coalesce(p_note,''))>500 or coalesce(p_note,'')~'[[:cntrl:]]' then return query select false,'request_denied'::text,null::uuid; return; end if;
 perform pg_advisory_xact_lock(hashtextextended('customer_deletion:'||v.site_id,4901));
 select w.job_id into v_existing from public.customer_deletion_workflows w where w.site_id=v.site_id and w.phase not in('completed','canceled','rejected','failed');
 if v_existing is not null then return query select true,'existing'::text,v_existing; return; end if;
 select p.*,public.privacy_policy_valid(p.id) valid into v_policy from public.privacy_policy_versions p where p.status='active';
 if v_policy.id is null or not v_policy.valid then return query select false,'request_denied'::text,null::uuid; return; end if;
 select j.id job_id,a.id artifact_id,a.expires_at into v_export from public.privacy_jobs j left join public.privacy_export_artifacts a on a.job_id=j.id and a.status='ready' and a.expires_at>statement_timestamp() where j.kind='export' and j.site_admin_account_id=v.account_id order by j.created_at desc limit 1;
 v_blocked:=public.privacy_hold_applies('customer_account',v.account_id::text,v.site_id,null);
 v_hash:=encode(public.digest(convert_to('deletion|'||v.site_id||'|'||v_policy.id::text||'|'||v_job::text,'UTF8'),'sha256'),'hex');
 insert into public.privacy_jobs(id,kind,subject_kind,subject_reference,site_id,site_admin_account_id,policy_version_id,snapshot_at,requested_actor_kind,requested_actor_reference,status,idempotency_hash,max_attempts,error_code,correlation_id)
 values(v_job,'deletion','customer_account',v.account_id::text,v.site_id,v.account_id,v_policy.id,statement_timestamp(),'site_admin',v.account_id,case when v_blocked then 'blocked' else 'queued' end,v_hash,5,case when v_blocked then 'legal_hold' end,p_correlation);
 insert into public.customer_deletion_workflows(job_id,site_id,site_admin_account_id,policy_version_id,policy_hash,phase,request_reason,request_note,irreversible_acknowledged,export_offered,export_requested,export_job_id,export_artifact_id,export_pending_until)
 values(v_job,v.site_id,v.account_id,v_policy.id,v_policy.manifest_hash,case when v_blocked then 'blocked' else 'requested' end,p_reason,nullif(btrim(p_note),''),true,true,v_export.job_id is not null,v_export.job_id,v_export.artifact_id,v_export.expires_at);
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,next_state,details,correlation_id) values(gen_random_uuid(),v_job,'job_requested','site_admin',v.account_id,case when v_blocked then 'blocked' else 'queued' end,jsonb_build_object('exportOffered',true,'exportRequested',v_export.job_id is not null,'reasonCode',case when v_blocked then 'legal_hold' else null end),p_correlation);
 return query select true,case when v_blocked then 'legal_hold' else null end,v_job;
exception when unique_violation then select w.job_id into v_existing from public.customer_deletion_workflows w where w.site_id=v.site_id and w.phase not in('completed','canceled','rejected','failed'); return query select true,'existing'::text,v_existing; end $$;

create or replace function public.site_admin_customer_deletion_status(p_session_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with actor as(select * from public.site_admin_resolve_session(p_session_hash)), w as(select w.*,j.status job_status,j.error_code from actor a join public.customer_deletion_workflows w on w.site_id=a.site_id and w.site_admin_account_id=a.account_id join public.privacy_jobs j on j.id=w.job_id order by w.created_at desc limit 1)
 select case when exists(select 1 from actor) then (select jsonb_build_object('jobId',job_id,'phase',phase,'jobStatus',job_status,'errorCode',error_code,'reason',request_reason,'exportOffered',export_offered,'exportRequested',export_requested,'exportJobId',export_job_id,'exportPendingUntil',export_pending_until,'coolingEndsAt',cooling_ends_at,'createdAt',created_at,'completedAt',completed_at,'canceledAt',canceled_at) from w) else null end
$$;

create or replace function public.site_admin_cancel_customer_deletion(p_session_hash text,p_password_hash text,p_job uuid,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin select w.*,j.status job_status,a.password_hash into v from public.site_admin_resolve_session(p_session_hash)r join public.site_admin_accounts a on a.id=r.account_id join public.customer_deletion_workflows w on w.site_id=r.site_id and w.site_admin_account_id=r.account_id and w.job_id=p_job join public.privacy_jobs j on j.id=w.job_id for update of w,j;
 if v.job_id is null or v.password_hash<>p_password_hash or v.phase not in('requested','blocked','cooling_period','awaiting_provider_cleanup','awaiting_approval','ready_for_execution') or v.job_status not in('queued','blocked','awaiting_approval') then return false; end if;
 update public.privacy_provider_cleanup_items set status='canceled',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where job_id=p_job and status in('pending','retry_wait');
 update public.customer_deletion_workflows set phase='canceled',canceled_at=statement_timestamp(),request_note=null,updated_at=statement_timestamp() where job_id=p_job;
 update public.privacy_jobs set status='canceled',completed_at=statement_timestamp(),error_code=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'job_canceled','site_admin',v.site_admin_account_id,v.job_status,'canceled','{}',p_correlation); return true;
end $$;

create or replace function public.privacy_deletion_insert_plan_item(p_job uuid,p_class text,p_store text,p_operation text,p_status text,p_count bigint,p_block text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin select r.id rule_id,j.policy_version_id into v from public.privacy_jobs j join public.privacy_retention_rules r on r.policy_version_id=j.policy_version_id and r.class_key=p_class where j.id=p_job;
 insert into public.privacy_job_items(id,job_id,policy_version_id,policy_rule_id,data_class,datastore,operation,status,eligible_count,block_reason_code,prerequisites,provider_reconciliation_required,legal_review_required)
 values(gen_random_uuid(),p_job,v.policy_version_id,v.rule_id,p_class,p_store,p_operation,p_status,p_count,p_block,case p_class when 'canceled_customer' then array['verified_cancellation','effective_end','read_only_complete','pending_deletion_complete','export_decision','provider_reconciliation'] when 'media_content' then array['export_or_cooling_complete','provider_reconciliation'] when 'contract_billing_accounting' then array['manual_legal_review'] else '{}'::text[] end,p_class in('appointments','media_content','active_subscription','contract_billing_accounting','webhook_redi_evidence'),p_class='contract_billing_accounting')
 on conflict(job_id,data_class,datastore) do update set status=excluded.status,eligible_count=excluded.eligible_count,block_reason_code=excluded.block_reason_code,updated_at=statement_timestamp(); end $$;

create or replace function public.privacy_deletion_add_provider_item(p_job uuid,p_provider text,p_source text,p_reference text)
returns void language sql security definer set search_path=pg_catalog as $$
 insert into public.privacy_provider_cleanup_items(id,job_id,provider,source_kind,reference_hash,status)
 select gen_random_uuid(),p_job,p_provider,p_source,encode(public.digest(convert_to(p_reference,'UTF8'),'sha256'),'hex'),'pending'
 where p_reference is not null and p_reference<>'' on conflict(job_id,provider,source_kind,reference_hash) do nothing
$$;

create or replace function public.privacy_system_claim_deletion_plan(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if;
 select w.*,j.status job_status,j.attempts,j.max_attempts into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.phase in('requested','blocked','retry_wait') and j.status in('queued','blocked','retry_wait') and j.attempts<j.max_attempts and coalesce(j.next_attempt_at,'-infinity')<=statement_timestamp() order by w.created_at for update of w,j skip locked limit 1;
 if v.job_id is null then return null; end if; perform pg_advisory_xact_lock(hashtextextended('customer_deletion:'||v.site_id,4901));
 if v.job_status='blocked' then update public.privacy_jobs set status='queued',error_code=null,updated_at=statement_timestamp() where id=v.job_id; v.job_status:='queued'; end if;
 update public.customer_deletion_workflows set phase='eligibility_check',updated_at=statement_timestamp() where job_id=v.job_id;
 update public.privacy_jobs set status='planning',attempts=attempts+1,started_at=coalesce(started_at,statement_timestamp()),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,updated_at=statement_timestamp() where id=v.job_id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),v.job_id,'job_claimed','system',v.job_status,'planning',jsonb_build_object('attempt',v.attempts+1,'maxAttempts',v.max_attempts,'leaseSeconds',p_lease_seconds)); return v.job_id; end $$;

create or replace function public.privacy_system_plan_customer_deletion(p_job uuid,p_worker text)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_reason text; v_sub public.site_subscriptions; v_cooling timestamptz; v_legal bigint; v_media bigint; v_appointments bigint; v_provider_count integer; begin
 select w.*,j.status job_status,j.policy_version_id job_policy,j.lease_expires_at,j.worker_reference into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j;
 if v.job_id is null or v.phase<>'eligibility_check' or v.job_status<>'planning' or v.worker_reference<>p_worker or v.lease_expires_at<=statement_timestamp() then return 'denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('customer_deletion:'||v.site_id,4901));
 v_reason:=case when v.job_policy<>v.policy_version_id or v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or not public.privacy_policy_valid(v.policy_version_id) then 'policy_mismatch' when public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then 'legal_hold' else public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) end;
 if v_reason is not null then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=p_job; update public.privacy_jobs set status='blocked',error_code=v_reason,lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),p_job,'eligibility_result','system','planning','blocked',jsonb_build_object('reasonCode',v_reason,'phase','blocked')); return v_reason; end if;
 select * into v_sub from public.site_subscriptions where site_id=v.site_id; v_cooling:=v_sub.read_only_ends_at+interval '30 days';
 select count(*) into v_appointments from public.site_appointments where site_id=v.site_id;
 select (select count(*) from public.site_media where site_id=v.site_id)+(select count(*) from public.site_media_blobs where site_id=v.site_id)+(select count(*) from public.site_media_assets where site_id=v.site_id)+(select count(*) from public.site_articles where site_id=v.site_id) into v_media;
 select (select count(*) from public.contract_acceptances where site_id=v.site_id)+(select count(*) from public.customer_business_identities where site_id=v.site_id) into v_legal;
 perform public.privacy_deletion_insert_plan_item(p_job,'canceled_customer','sites','anonymize','eligible',1,null);
 perform public.privacy_deletion_insert_plan_item(p_job,'appointments','site_appointments','anonymize',case when v_appointments>0 then 'eligible' else 'planned' end,v_appointments,case when v_appointments=0 then 'not_applicable' end);
 perform public.privacy_deletion_insert_plan_item(p_job,'media_content','site_content','delete',case when v_media>0 then 'eligible' else 'planned' end,v_media,case when v_media=0 then 'not_applicable' end);
 perform public.privacy_deletion_insert_plan_item(p_job,'active_subscription','site_subscriptions','retain','eligible',1,null);
 perform public.privacy_deletion_insert_plan_item(p_job,'contract_billing_accounting','legal_evidence','manual_review',case when v_legal>0 and v.legal_review_reference is null then 'blocked' else 'eligible' end,v_legal,case when v_legal>0 and v.legal_review_reference is null then 'manual_legal_review' end);
 perform public.privacy_deletion_insert_plan_item(p_job,'security_audit','audit_evidence','retain','eligible',1,null);
 if exists(select 1 from public.site_media where site_id=v.site_id and url is not null) or exists(select 1 from public.site_media_assets where site_id=v.site_id) then perform public.privacy_deletion_add_provider_item(p_job,'vercel_blob','media',v.site_id||':media'); end if;
 if exists(select 1 from public.sites where id=v.site_id and custom_domain is not null) then perform public.privacy_deletion_add_provider_item(p_job,'vercel_domains','domain',v.site_id||':domain'); end if;
 perform public.privacy_deletion_add_provider_item(p_job,v_sub.billing_provider,'subscription',v.site_id||':subscription');
 if v_appointments>0 or exists(select 1 from public.subscriber_intakes where site_admin_account_id=v.site_admin_account_id) then perform public.privacy_deletion_add_provider_item(p_job,'resend','email',v.site_id||':email'); end if;
 if exists(select 1 from public.ai_runs where site_id=v.site_id or applied_site_id=v.site_id) then perform public.privacy_deletion_add_provider_item(p_job,'openai','ai',v.site_id||':ai'); end if;
 if exists(select 1 from public.sites where id=v.site_id and lead_id is not null) then perform public.privacy_deletion_add_provider_item(p_job,'google','finder',v.site_id||':finder'); end if;
 if exists(select 1 from public.site_external_integrations where site_id=v.site_id and provider='redi_control') then perform public.privacy_deletion_add_provider_item(p_job,'redi_control','integration',v.site_id||':redi'); end if;
 select count(*) into v_provider_count from public.privacy_provider_cleanup_items where job_id=p_job and status not in('completed','canceled');
 update public.customer_deletion_workflows set phase=case when v_cooling>statement_timestamp() then 'cooling_period' when v_provider_count>0 then 'awaiting_provider_cleanup' else 'awaiting_approval' end,cooling_started_at=v_sub.read_only_ends_at,cooling_ends_at=v_cooling,lifecycle_observed_at=v_sub.provider_status_observed_at,updated_at=statement_timestamp() where job_id=p_job;
 update public.privacy_jobs set status='awaiting_approval',error_code=case when v_cooling>statement_timestamp() then 'cooling_period' when v_provider_count>0 then 'provider_cleanup' when v_legal>0 and v.legal_review_reference is null then 'manual_review' end,lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),p_job,'eligibility_result','system','planning','awaiting_approval',jsonb_build_object('reasonCode',case when v_cooling>statement_timestamp() then 'cooling_period' when v_provider_count>0 then 'provider_cleanup' when v_legal>0 and v.legal_review_reference is null then 'manual_review' end,'phase',case when v_cooling>statement_timestamp() then 'cooling_period' when v_provider_count>0 then 'awaiting_provider_cleanup' else 'awaiting_approval' end,'itemCount',6,'coolingEndsAt',v_cooling)); return 'planned'; end $$;

create or replace function public.privacy_system_record_deletion_legal_review(p_job uuid,p_reference text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin if p_reference!~'^[A-Za-z0-9._:/-]{1,120}$' then return false; end if; update public.customer_deletion_workflows set legal_review_reference=p_reference,legal_review_recorded_at=statement_timestamp(),updated_at=statement_timestamp() where job_id=p_job and phase in('cooling_period','awaiting_provider_cleanup','awaiting_approval'); if not found then return false; end if; update public.privacy_job_items set operation='retain',status='eligible',block_reason_code=null,updated_at=statement_timestamp() where job_id=p_job and data_class='contract_billing_accounting' and status='blocked'; return true; end $$;

create or replace function public.privacy_system_claim_deletion_provider_item(p_worker text,p_lease_seconds integer default 300)
returns table(id uuid,job_id uuid,provider text,reference_hash text) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return; end if;
 update public.customer_deletion_workflows w set phase='awaiting_provider_cleanup',updated_at=statement_timestamp() where w.phase='cooling_period' and w.cooling_ends_at<=statement_timestamp() and exists(select 1 from public.privacy_provider_cleanup_items i where i.job_id=w.job_id and i.status in('pending','retry_wait'));
 select i.*,w.site_id,w.site_admin_account_id into v from public.privacy_provider_cleanup_items i join public.customer_deletion_workflows w on w.job_id=i.job_id where w.phase='awaiting_provider_cleanup' and i.status in('pending','retry_wait') and i.attempts<i.max_attempts and coalesce(i.next_attempt_at,'-infinity')<=statement_timestamp() order by i.created_at for update of i,w skip locked limit 1;
 if v.id is null then update public.customer_deletion_workflows w set phase='awaiting_approval',updated_at=statement_timestamp() where w.phase in('cooling_period','awaiting_provider_cleanup') and w.cooling_ends_at<=statement_timestamp() and not exists(select 1 from public.privacy_provider_cleanup_items i where i.job_id=w.job_id and i.status not in('completed','canceled')); return; end if;
 if public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='blocked',error_code='legal_hold',updated_at=statement_timestamp() where id=v.job_id; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),v.job_id,'provider_cleanup_blocked','system','awaiting_approval','blocked',jsonb_build_object('reasonCode','legal_hold','provider',v.provider)); return; end if;
 update public.privacy_provider_cleanup_items set status='running',attempts=attempts+1,lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,failure_code=null,updated_at=statement_timestamp() where privacy_provider_cleanup_items.id=v.id;
 return query select v.id,v.job_id,v.provider,v.reference_hash; end $$;

create or replace function public.privacy_system_finish_deletion_provider_item(p_id uuid,p_worker text,p_success boolean,p_tombstone_checksum text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_next text; begin select i.*,w.site_id,w.site_admin_account_id into v from public.privacy_provider_cleanup_items i join public.customer_deletion_workflows w on w.job_id=i.job_id where i.id=p_id and i.status='running' and i.worker_reference=p_worker and i.lease_expires_at>statement_timestamp() for update of i,w; if v.id is null or (p_success and p_tombstone_checksum!~'^[a-f0-9]{64}$') then return false; end if;
 if public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) then p_success:=false; end if;
 v_next:=case when p_success then 'completed' else 'retry_wait' end; update public.privacy_provider_cleanup_items set status=v_next,failure_code=case when p_success then null else 'fake_provider_failure' end,tombstone_checksum=case when p_success then p_tombstone_checksum end,next_attempt_at=case when p_success then null else statement_timestamp()+make_interval(secs=>least(3600,30*(2^attempts))) end,lease_expires_at=null,worker_reference=null,completed_at=case when p_success then statement_timestamp() end,updated_at=statement_timestamp() where id=p_id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,details) values(gen_random_uuid(),v.job_id,case when p_success then 'provider_cleanup_completed' else 'provider_cleanup_blocked' end,'system',jsonb_build_object('provider',v.provider,'reasonCode',case when p_success then null else 'controlled_failure' end,'attempt',v.attempts));
 if p_success and not exists(select 1 from public.privacy_provider_cleanup_items where job_id=v.job_id and status not in('completed','canceled')) then update public.customer_deletion_workflows set phase='awaiting_approval',updated_at=statement_timestamp() where job_id=v.job_id and phase='awaiting_provider_cleanup'; update public.privacy_jobs set error_code=case when exists(select 1 from public.privacy_job_items where job_id=v.job_id and block_reason_code='manual_legal_review') then 'manual_review' end,updated_at=statement_timestamp() where id=v.job_id; end if; return true; end $$;

create or replace function public.owner_review_customer_deletion(p_session_hash text,p_password_hash text,p_totp_step bigint,p_job uuid,p_decision text,p_reason text,p_correlation text)
returns table(ok boolean,reason text) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; v_lifecycle text; begin v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null or p_decision not in('approve','reject') then return query select false,'forbidden'::text; return; end if;
 select w.*,j.status job_status,j.policy_version_id job_policy into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j; if v.job_id is null then return query select false,'denied'::text; return; end if;
 if p_decision='reject' then if v.phase not in('blocked','cooling_period','awaiting_provider_cleanup','awaiting_approval') or p_reason not in('insufficient_basis','customer_request_invalid','risk_review_failed') then return query select false,'denied'::text; return; end if; update public.customer_deletion_workflows set phase='rejected',rejected_by=v_actor,rejected_at=statement_timestamp(),decision_reason_code=p_reason,request_note=null,updated_at=statement_timestamp() where job_id=p_job; update public.privacy_provider_cleanup_items set status='canceled',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where job_id=p_job and status in('pending','retry_wait'); update public.privacy_jobs set status='canceled',completed_at=statement_timestamp(),updated_at=statement_timestamp() where id=p_job; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'deletion_rejected','owner',v_actor,v.job_status,'canceled',jsonb_build_object('reasonCode',p_reason),p_correlation); return query select true,null::text; return; end if;
 v_lifecycle:=public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp());
 if v.phase<>'awaiting_approval' or v.cooling_ends_at>statement_timestamp() or v_lifecycle is not null or public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or v.job_policy<>v.policy_version_id or v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or not public.privacy_policy_valid(v.policy_version_id) or exists(select 1 from public.privacy_provider_cleanup_items where job_id=p_job and status<>'completed') or exists(select 1 from public.privacy_job_items where job_id=p_job and status='blocked') then return query select false,coalesce(v_lifecycle,'prerequisite_missing')::text; return; end if;
 update public.customer_deletion_workflows set phase='ready_for_execution',approved_by=v_actor,approved_at=statement_timestamp(),decision_reason_code=case when legal_review_reference is null then 'eligible_approved' else 'legal_disposition_confirmed' end,updated_at=statement_timestamp() where job_id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'deletion_approved','owner',v_actor,'awaiting_approval','awaiting_approval',jsonb_build_object('reasonCode',case when v.legal_review_reference is null then 'eligible_approved' else 'legal_disposition_confirmed' end,'phase','ready_for_execution'),p_correlation); return query select true,null::text; end $$;

create or replace function public.privacy_system_claim_deletion_execution(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker!~'^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if; select w.*,j.attempts,j.max_attempts into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.phase in('ready_for_execution','retry_wait') and j.status in('awaiting_approval','retry_wait') and j.attempts<j.max_attempts order by w.updated_at for update of w,j skip locked limit 1; if v.job_id is null then return null; end if;
 if public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or exists(select 1 from public.privacy_provider_cleanup_items where job_id=v.job_id and status<>'completed') or v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='blocked',error_code='controlled_failure',updated_at=statement_timestamp() where id=v.job_id; return null; end if;
 update public.customer_deletion_workflows set phase='executing',execution_started_at=coalesce(execution_started_at,statement_timestamp()),updated_at=statement_timestamp() where job_id=v.job_id; update public.privacy_jobs set status='running',attempts=attempts+1,worker_reference=p_worker,lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp() where id=v.job_id; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),v.job_id,'execution_started','system',case when v.phase='retry_wait' then 'retry_wait' else 'awaiting_approval' end,'running',jsonb_build_object('attempt',v.attempts+1,'phase','executing')); return v.job_id; end $$;

create or replace function public.privacy_system_execute_customer_deletion(p_job uuid,p_worker text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_account uuid; v_token text; v_count bigint:=0; begin select w.*,j.status job_status,j.worker_reference,j.lease_expires_at into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j; if v.job_id is null or v.phase<>'executing' or v.job_status<>'running' or v.worker_reference<>p_worker or v.lease_expires_at<=statement_timestamp() then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('customer_deletion:'||v.site_id,4901)); if public.privacy_hold_applies('customer_account',v.site_admin_account_id::text,v.site_id,null) or public.customer_deletion_lifecycle_reason(v.site_id,statement_timestamp()) is not null or v.policy_hash<>public.privacy_policy_hash(v.policy_version_id) or exists(select 1 from public.privacy_provider_cleanup_items where job_id=p_job and status<>'completed') or exists(select 1 from public.privacy_job_items where job_id=p_job and status='blocked') then update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=p_job; update public.privacy_jobs set status='blocked',error_code='controlled_failure',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job; return false; end if;
 v_account:=v.site_admin_account_id; v_token:=replace(p_job::text,'-','');
 update public.sites set visibility='private',publication_intent='private',generated_document=jsonb_build_object('schemaVersion',1,'status','closed'),slug='closed-'||left(v_token,24),trial_email=null,custom_domain=null,custom_domain_status='not_requested',custom_domain_verification='{}',custom_domain_checked_at=null,lead_id=null,prepared_profile_id=null where id=v.site_id;
 delete from public.site_admin_sessions where account_id=v_account; delete from public.site_admin_password_resets where account_id=v_account;
 update public.site_admin_accounts set email='closed+'||v_token||'@invalid.example',password_hash='closed$'||encode(public.digest(convert_to(p_job::text,'UTF8'),'sha256'),'hex'),status='disabled',updated_at=statement_timestamp() where id=v_account and site_id=v.site_id;
 update public.site_appointments set customer_name='Deleted requester '||left(replace(id::text,'-',''),12),phone='deleted',email=null,service_title=null,preferred_date=null,preferred_time=null,note=null,customer_message=null,status='cancelled',updated_at=statement_timestamp() where site_id=v.site_id; get diagnostics v_count=row_count;
 delete from public.site_article_media where article_id in(select id from public.site_articles where site_id=v.site_id); delete from public.site_article_sources where article_id in(select id from public.site_articles where site_id=v.site_id); delete from public.site_articles where site_id=v.site_id; delete from public.site_article_categories where site_id=v.site_id; delete from public.site_editorial_memberships where site_id=v.site_id; delete from public.site_editorial_settings where site_id=v.site_id; delete from public.site_information_ad_slots where site_id=v.site_id;
 delete from public.site_media_assets where site_id=v.site_id; delete from public.site_media_blobs where site_id=v.site_id; delete from public.site_media where site_id=v.site_id; delete from public.site_preview_tokens where site_id=v.site_id; delete from public.site_features where site_id=v.site_id;
 delete from public.integration_api_requests where site_id=v.site_id; delete from public.integration_nonces where site_id=v.site_id; delete from public.site_external_integrations where site_id=v.site_id;
 delete from public.tenant_concurrency_leases where site_id=v.site_id; delete from public.tenant_usage_events where site_id=v.site_id; delete from public.tenant_usage_counters where site_id=v.site_id; delete from public.tenant_usage_states where site_id=v.site_id; delete from public.ai_runs where site_id=v.site_id or applied_site_id=v.site_id;
 update public.subscriber_intakes set email='closed+'||left(replace(id::text,'-',''),24)||'@invalid.example',business_name='Closed customer',updated_at=statement_timestamp() where site_admin_account_id=v_account;
 update public.privacy_job_items set status=case when operation='retain' then 'skipped' else 'completed' end,block_reason_code=null,checksum=encode(public.digest(convert_to(p_job::text||'|'||data_class||'|'||datastore||'|'||eligible_count::text,'UTF8'),'sha256'),'hex'),updated_at=statement_timestamp() where job_id=p_job;
 update public.customer_deletion_workflows set phase='completed',request_note=null,completed_at=statement_timestamp(),updated_at=statement_timestamp() where job_id=p_job; update public.privacy_jobs set status='completed',error_code=null,completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),p_job,'disposition_completed','system','running','completed',jsonb_build_object('disposition','customer_site_anonymized','count',v_count,'checksum',encode(public.digest(convert_to(p_job::text||'|completed','UTF8'),'sha256'),'hex'))); insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details) values(gen_random_uuid(),p_job,'job_completed','system','running','completed',jsonb_build_object('phase','completed')); return true; end $$;

create or replace function public.privacy_system_fail_customer_deletion(p_job uuid,p_worker text,p_error text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_next text; begin
 select w.phase,j.status,j.attempts,j.max_attempts,j.worker_reference into v
 from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id
 where w.job_id=p_job for update of w,j;
 if v.phase<>'executing' or v.status<>'running' or v.worker_reference<>p_worker
   or p_error not in('controlled_failure','lease_expired') then return false; end if;
 v_next:=case when v.attempts>=v.max_attempts then 'failed' else 'retry_wait' end;
 update public.customer_deletion_workflows set phase=v_next,updated_at=statement_timestamp() where job_id=p_job;
 update public.privacy_jobs set status=v_next,error_code=case when v_next='failed' then 'attempt_limit' else p_error end,
   next_attempt_at=case when v_next='retry_wait' then statement_timestamp()+interval '60 seconds' end,
   lease_expires_at=null,worker_reference=null,completed_at=case when v_next='failed' then statement_timestamp() end,
   updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details)
 values(gen_random_uuid(),p_job,case when v_next='failed' then 'job_failed' else 'retry_scheduled' end,'system','running',v_next,
   jsonb_build_object('reasonCode',p_error,'attempt',v.attempts,'maxAttempts',v.max_attempts,'phase',v_next));
 return true;
end $$;

create or replace function public.owner_record_customer_deletion_legal_review(p_session_hash text,p_password_hash text,p_totp_step bigint,p_job uuid,p_reference text,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure');
 if v_actor is null or p_reference!~'^[A-Za-z0-9._:/-]{1,120}$' then return false; end if;
 update public.customer_deletion_workflows set legal_review_reference=p_reference,legal_review_recorded_at=statement_timestamp(),updated_at=statement_timestamp()
 where job_id=p_job and phase in('cooling_period','awaiting_provider_cleanup','awaiting_approval');
 if not found then return false; end if;
 update public.privacy_job_items set operation='retain',status='eligible',block_reason_code=null,updated_at=statement_timestamp()
 where job_id=p_job and data_class='contract_billing_accounting' and status='blocked';
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details,correlation_id)
 values(gen_random_uuid(),p_job,'state_changed','owner',v_actor,jsonb_build_object('reasonCode','legal_disposition_confirmed','phase','legal_review_recorded'),p_correlation);
 return true;
end $$;

create or replace function public.privacy_system_recover_customer_deletions()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 for v in select i.id from public.privacy_provider_cleanup_items i
   where i.status='running' and i.lease_expires_at<=statement_timestamp() for update skip locked loop
   update public.privacy_provider_cleanup_items set status='retry_wait',failure_code='lease_expired',
     next_attempt_at=statement_timestamp()+interval '60 seconds',lease_expires_at=null,worker_reference=null,
     updated_at=statement_timestamp() where id=v.id; v_count:=v_count+1;
 end loop;
 for v in select w.job_id,j.worker_reference from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id
   where w.phase='executing' and j.status='running' and j.lease_expires_at<=statement_timestamp() for update of w,j skip locked loop
   if public.privacy_system_fail_customer_deletion(v.job_id,v.worker_reference,'lease_expired') then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;

create or replace function public.owner_privacy_snapshot(p_session_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with actor as(select * from public.owner_auth_resolve_session(p_session_hash,'audit.read')),
 active as(select p.* from public.privacy_policy_versions p where p.status='active' and exists(select 1 from actor)),
 rules as(select coalesce(jsonb_agg(jsonb_build_object('classKey',r.class_key,'triggerKey',r.trigger_key,'durationValue',r.duration_value,'durationUnit',r.duration_unit,'coolingDays',r.cooling_days,'tenantOptionsDays',r.tenant_options_days,'disposition',r.disposition,'automaticDisposition',r.automatic_disposition,'legalReviewRequired',r.legal_review_required,'exportEligible',r.export_eligible,'holdEligible',r.hold_eligible,'providerReconciliationRequired',r.provider_reconciliation_required,'technicalOwner',r.technical_owner,'stores',r.covered_stores) order by r.class_key),'[]'::jsonb) value from public.privacy_retention_rules r join active p on p.id=r.policy_version_id),
 jobs as(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'kind',j.kind,'subjectKind',j.subject_kind,'subjectReference',j.subject_reference,'status',j.status,'snapshotAt',j.snapshot_at,'attempts',j.attempts,'maxAttempts',j.max_attempts,'errorCode',j.error_code,'correlationId',j.correlation_id,'createdAt',j.created_at,'updatedAt',j.updated_at,'itemCount',(select count(*) from public.privacy_job_items i where i.job_id=j.id),'eligibleCount',(select coalesce(sum(i.eligible_count),0) from public.privacy_job_items i where i.job_id=j.id),'blockedCount',(select count(*) from public.privacy_job_items i where i.job_id=j.id and i.status='blocked')) order by j.created_at desc),'[]'::jsonb) value from(select * from public.privacy_jobs order by created_at desc limit 100)j where exists(select 1 from actor)),
 holds as(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'subjectKind',h.subject_kind,'subjectReference',h.subject_reference,'siteId',h.site_id,'dataClasses',h.data_classes,'reasonCategory',h.reason_category,'externalReference',h.external_reference,'status',h.status,'startsAt',h.starts_at,'endsAt',h.ends_at,'releasedAt',h.released_at,'createdAt',h.created_at) order by h.created_at desc),'[]'::jsonb) value from(select * from public.privacy_legal_holds order by created_at desc limit 100)h where exists(select 1 from actor)),
 deletions as(select coalesce(jsonb_agg(jsonb_build_object('jobId',w.job_id,'siteId',w.site_id,'phase',w.phase,'reason',w.request_reason,'exportOffered',w.export_offered,'exportRequested',w.export_requested,'exportJobId',w.export_job_id,'exportPendingUntil',w.export_pending_until,'coolingEndsAt',w.cooling_ends_at,'legalReviewRecorded',w.legal_review_reference is not null,'providerPending',(select count(*) from public.privacy_provider_cleanup_items i where i.job_id=w.job_id and i.status<>'completed'),'createdAt',w.created_at,'approvedAt',w.approved_at,'completedAt',w.completed_at) order by w.created_at desc),'[]'::jsonb) value from(select * from public.customer_deletion_workflows order by created_at desc limit 100)w where exists(select 1 from actor))
 select case when exists(select 1 from actor) then jsonb_build_object('policy',(select jsonb_build_object('id',p.id,'policyKey',p.policy_key,'version',p.version,'status',p.status,'manifestHash',p.manifest_hash,'valid',public.privacy_policy_valid(p.id),'activatedAt',p.activated_at,'manifest',p.canonical_manifest) from active p),'rules',(select value from rules),'jobs',(select value from jobs),'holds',(select value from holds),'deletions',(select value from deletions)) else null end
$$;

alter table public.customer_deletion_workflows enable row level security;
alter table public.customer_deletion_workflows force row level security;
alter table public.privacy_provider_cleanup_items enable row level security;
alter table public.privacy_provider_cleanup_items force row level security;
revoke all on table public.customer_deletion_workflows,public.privacy_provider_cleanup_items from public;
revoke all on all functions in schema public from public;

create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=65 and count(*) filter(where c.relrowsecurity)=62 and count(*) filter(where c.relforcerowsecurity)=62 and count(distinct c.relowner)=1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p'))
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('public',p.oid,'execute'))
  and (select count(distinct p.proowner)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;
