-- Task Group 4-B1: versioned technical retention policy, privacy job ledger,
-- dry-run planning and scoped legal holds. This migration performs no
-- customer deletion, anonymization, export or provider operation.

create extension if not exists pgcrypto;

alter table public.sites
  add column if not exists appointment_retention_days integer not null default 180
  check (appointment_retention_days in (90,180,365));

create table if not exists public.privacy_policy_versions (
  id uuid primary key,
  policy_key text not null check (policy_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  version integer not null check (version > 0),
  status text not null check (status in ('draft','active','retired')),
  canonical_manifest jsonb not null check (jsonb_typeof(canonical_manifest)='object'),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid,
  reviewed_by uuid,
  activated_by uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  unique(policy_key,version),
  check ((status='draft' and activated_at is null) or (status in ('active','retired') and activated_at is not null))
);
create unique index if not exists privacy_policy_one_active_idx
  on public.privacy_policy_versions(policy_key) where status='active';

create table if not exists public.privacy_retention_rules (
  id uuid primary key,
  policy_version_id uuid not null references public.privacy_policy_versions(id) on delete restrict,
  class_key text not null check (class_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  trigger_key text not null check (trigger_key in ('created_at','updated_at','expires_at','window_start','access_locked_at','account_closed_at','disabled_at','verified_effective_end','trial_recovery_ends_at','manual_legal_review')),
  duration_value integer check (duration_value is null or duration_value between 1 and 10000),
  duration_unit text check (duration_unit is null or duration_unit in ('hours','days','months')),
  cooling_days integer check (cooling_days is null or cooling_days between 0 and 365),
  tenant_options_days integer[] not null default '{}',
  disposition text not null check (disposition in ('delete','anonymize','retain','manual_review')),
  automatic_disposition boolean not null,
  legal_review_required boolean not null,
  export_eligible boolean not null,
  hold_eligible boolean not null,
  provider_reconciliation_required boolean not null,
  technical_owner text not null check (technical_owner in ('privacy_operations','finder_operations','ai_operations','platform_operations','security_operations','integration_operations','content_operations','billing_operations','legal_operations','customer_operations')),
  covered_stores text[] not null,
  rule_version integer not null default 1 check (rule_version > 0),
  created_at timestamptz not null default now(),
  unique(policy_version_id,class_key),
  check ((duration_value is null)=(duration_unit is null)),
  check (tenant_options_days <@ array[90,180,365]),
  check (not legal_review_required or (not automatic_disposition and disposition='manual_review'))
);

create table if not exists public.privacy_jobs (
  id uuid primary key,
  kind text not null check (kind in ('retention_scan','export','deletion','anonymization','provider_cleanup','legal_hold_review')),
  subject_kind text not null check (subject_kind in ('customer_account','site','owner_account','appointment','lead','editorial_member','invitation','integration')),
  subject_reference text not null check (char_length(subject_reference) between 1 and 160 and subject_reference !~ '[[:space:]]'),
  site_id text,
  site_admin_account_id uuid,
  owner_account_id uuid,
  policy_version_id uuid not null references public.privacy_policy_versions(id) on delete restrict,
  snapshot_at timestamptz not null,
  requested_actor_kind text not null check (requested_actor_kind in ('owner','system')),
  requested_actor_reference uuid,
  status text not null check (status in ('queued','planning','awaiting_approval','blocked','running','retry_wait','completed','failed','canceled')),
  idempotency_hash text not null check (idempotency_hash ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 20),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz,
  lease_expires_at timestamptz,
  worker_reference text check (worker_reference is null or worker_reference ~ '^[A-Za-z0-9._:-]{1,100}$'),
  error_code text check (error_code is null or error_code in ('invalid_subject','policy_unavailable','legal_hold','manual_review','active_subscription','attempt_limit','item_failed','lease_expired','execution_disabled','controlled_failure')),
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(kind,subject_kind,subject_reference,idempotency_hash)
);
create index if not exists privacy_jobs_claim_idx on public.privacy_jobs(status,next_attempt_at,created_at);
create index if not exists privacy_jobs_subject_idx on public.privacy_jobs(subject_kind,subject_reference,created_at desc);
create index if not exists privacy_jobs_site_idx on public.privacy_jobs(site_id,created_at desc) where site_id is not null;

create table if not exists public.privacy_job_items (
  id uuid primary key,
  job_id uuid not null references public.privacy_jobs(id) on delete restrict,
  policy_version_id uuid not null references public.privacy_policy_versions(id) on delete restrict,
  policy_rule_id uuid not null references public.privacy_retention_rules(id) on delete restrict,
  data_class text not null check (data_class ~ '^[a-z][a-z0-9_]{2,79}$'),
  datastore text not null check (datastore ~ '^[a-z][a-z0-9_]{1,79}$'),
  operation text not null check (operation in ('inspect','delete','anonymize','retain','manual_review','provider_reconcile')),
  status text not null check (status in ('planned','eligible','blocked','running','completed','failed','skipped')),
  eligible_count bigint not null default 0 check (eligible_count >= 0),
  estimated_bytes bigint check (estimated_bytes is null or estimated_bytes >= 0),
  block_reason_code text check (block_reason_code is null or block_reason_code in ('legal_hold','manual_legal_review','active_subscription','provider_reconciliation','execution_disabled','not_due','not_applicable','subject_not_found')),
  prerequisites text[] not null default '{}',
  provider_reconciliation_required boolean not null,
  legal_review_required boolean not null,
  retry_count integer not null default 0 check (retry_count between 0 and 20),
  next_retry_at timestamptz,
  checksum text check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  manifest_reference text check (manifest_reference is null or manifest_reference ~ '^[A-Za-z0-9._:-]{1,160}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,data_class,datastore),
  check (prerequisites <@ array['verified_cancellation','effective_end','read_only_complete','pending_deletion_complete','export_decision','export_or_cooling_complete','disable_account','revoke_sessions','last_owner_transfer','manual_legal_review','provider_reconciliation'])
);

create or replace function public.privacy_safe_details(p_details jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(coalesce(p_details,'{}'::jsonb))='object' and not exists(
   select 1 from jsonb_object_keys(coalesce(p_details,'{}'::jsonb)) k
   where k not in ('reasonCode','itemCount','eligibleCount','blockedCount','attempt','maxAttempts','leaseSeconds','policyVersion','policyHash','classKey','previousStatus','nextStatus')
 )
$$;

create table if not exists public.privacy_job_events (
  id uuid primary key,
  job_id uuid not null references public.privacy_jobs(id) on delete restrict,
  event_type text not null check (event_type in ('job_requested','planning_started','plan_created','job_claimed','state_changed','job_blocked','retry_scheduled','job_failed','job_completed','job_canceled','hold_detected')),
  actor_kind text not null check (actor_kind in ('owner','system')),
  actor_reference uuid,
  previous_state text check (previous_state is null or previous_state in ('queued','planning','awaiting_approval','blocked','running','retry_wait','completed','failed','canceled')),
  next_state text check (next_state is null or next_state in ('queued','planning','awaiting_approval','blocked','running','retry_wait','completed','failed','canceled')),
  details jsonb not null default '{}',
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  created_at timestamptz not null default now(),
  check (public.privacy_safe_details(details))
);
create index if not exists privacy_job_events_job_idx on public.privacy_job_events(job_id,created_at,id);

create table if not exists public.privacy_legal_holds (
  id uuid primary key,
  subject_kind text not null check (subject_kind in ('customer_account','site','owner_account','appointment','lead','editorial_member','invitation','integration')),
  subject_reference text not null check (char_length(subject_reference) between 1 and 160 and subject_reference !~ '[[:space:]]'),
  site_id text,
  site_admin_account_id uuid,
  owner_account_id uuid,
  data_classes text[] not null default '{}',
  reason_category text not null check (reason_category in ('litigation','regulatory_request','billing_dispute','security_incident','contract_dispute','data_subject_dispute')),
  external_reference text check (external_reference is null or (char_length(external_reference) between 1 and 120 and external_reference ~ '^[A-Za-z0-9._:/-]+$')),
  status text not null check (status in ('active','released')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  released_at timestamptz,
  created_by uuid,
  released_by uuid,
  creation_correlation_id text check (creation_correlation_id is null or creation_correlation_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  release_correlation_id text check (release_correlation_id is null or release_correlation_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  created_at timestamptz not null default now(),
  check (cardinality(data_classes) between 0 and 17),
  check (data_classes <@ array['appointments','finder_cache','abandoned_finder_searches','qualified_leads','ai_detail','usage_events','usage_aggregates','canceled_customer','export_artifacts','security_audit','webhook_redi_evidence','ephemeral_security','media_content','active_subscription','owner_account','contract_billing_accounting','trial_demo']),
  check ((status='released')=(released_at is not null)),
  check (ends_at is null or ends_at>starts_at)
);
create index if not exists privacy_legal_holds_subject_idx on public.privacy_legal_holds(subject_kind,subject_reference,status);
create index if not exists privacy_legal_holds_site_idx on public.privacy_legal_holds(site_id,status) where site_id is not null;

create or replace function public.privacy_policy_hash(p_policy uuid)
returns text language sql stable set search_path=pg_catalog as $$
 select encode(public.digest(convert_to(coalesce(string_agg(concat_ws('|',r.class_key,r.trigger_key,coalesce(r.duration_value::text,''),coalesce(r.duration_unit,''),coalesce(r.cooling_days::text,''),r.tenant_options_days::text,r.disposition,r.automatic_disposition::text,r.legal_review_required::text,r.export_eligible::text,r.hold_eligible::text,r.provider_reconciliation_required::text,r.technical_owner,r.covered_stores::text,r.rule_version::text),E'\n' order by r.class_key),''),'UTF8'),'sha256'),'hex')
 from public.privacy_retention_rules r where r.policy_version_id=p_policy
$$;

create or replace function public.privacy_immutable_evidence()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'privacy_evidence_immutable'; end $$;

create or replace function public.privacy_policy_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='retired' then raise exception 'privacy_policy_immutable'; end if;
 if old.status='active' and not (new.status='retired' and new.retired_at is not null
   and new.policy_key=old.policy_key and new.version=old.version and new.canonical_manifest=old.canonical_manifest
   and new.manifest_hash=old.manifest_hash and new.created_by is not distinct from old.created_by
   and new.reviewed_by is not distinct from old.reviewed_by and new.activated_by is not distinct from old.activated_by
   and new.created_at=old.created_at and new.reviewed_at is not distinct from old.reviewed_at
   and new.activated_at is not distinct from old.activated_at) then raise exception 'privacy_policy_immutable'; end if;
 if new.policy_key<>old.policy_key or new.version<>old.version or new.canonical_manifest<>old.canonical_manifest or new.created_by is distinct from old.created_by or new.created_at<>old.created_at then raise exception 'privacy_policy_identity_immutable'; end if;
 if new.status='active' and (new.manifest_hash<>public.privacy_policy_hash(new.id) or new.reviewed_at is null or new.activated_at is null) then raise exception 'privacy_policy_activation_invalid'; end if;
 return new;
end $$;

create or replace function public.privacy_rule_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if exists(select 1 from public.privacy_policy_versions p where p.id=coalesce(old.policy_version_id,new.policy_version_id) and p.status<>'draft') then raise exception 'privacy_rule_immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.privacy_hold_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='released' then raise exception 'privacy_hold_immutable'; end if;
 if new.subject_kind<>old.subject_kind or new.subject_reference<>old.subject_reference or new.site_id is distinct from old.site_id or new.site_admin_account_id is distinct from old.site_admin_account_id or new.owner_account_id is distinct from old.owner_account_id or new.data_classes<>old.data_classes or new.reason_category<>old.reason_category or new.external_reference is distinct from old.external_reference or new.created_by is distinct from old.created_by or new.created_at<>old.created_at or new.starts_at<>old.starts_at then raise exception 'privacy_hold_creation_immutable'; end if;
 if new.status<>'released' or new.released_at is null or new.released_by is null then raise exception 'privacy_hold_release_invalid'; end if;
 return new;
end $$;

create or replace function public.privacy_job_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.id<>old.id or new.kind<>old.kind or new.subject_kind<>old.subject_kind or new.subject_reference<>old.subject_reference
   or new.site_id is distinct from old.site_id or new.site_admin_account_id is distinct from old.site_admin_account_id
   or new.owner_account_id is distinct from old.owner_account_id or new.policy_version_id<>old.policy_version_id
   or new.snapshot_at<>old.snapshot_at or new.requested_actor_kind<>old.requested_actor_kind
   or new.requested_actor_reference is distinct from old.requested_actor_reference or new.idempotency_hash<>old.idempotency_hash
   or new.requested_at<>old.requested_at or new.created_at<>old.created_at then raise exception 'privacy_job_identity_immutable'; end if;
 if old.status in('completed','canceled') and new is distinct from old then raise exception 'privacy_job_terminal'; end if;
 if new.status<>old.status and not ((old.status='queued' and new.status in('planning','blocked','failed','canceled'))
   or (old.status='planning' and new.status in('awaiting_approval','blocked','failed'))
   or (old.status='awaiting_approval' and new.status in('running','blocked','canceled'))
   or (old.status='blocked' and new.status in('queued','canceled'))
   or (old.status='running' and new.status in('retry_wait','completed','failed','blocked'))
   or (old.status='retry_wait' and new.status in('planning','blocked','canceled'))
   or (old.status='failed' and new.status in('queued','canceled'))) then raise exception 'privacy_job_transition_denied'; end if;
 return new;
end $$;

drop trigger if exists privacy_policy_guard_trigger on public.privacy_policy_versions;
create trigger privacy_policy_guard_trigger before update on public.privacy_policy_versions for each row execute function public.privacy_policy_guard();
drop trigger if exists privacy_policy_delete_guard on public.privacy_policy_versions;
create trigger privacy_policy_delete_guard before delete on public.privacy_policy_versions for each row execute function public.privacy_immutable_evidence();
drop trigger if exists privacy_rule_guard_trigger on public.privacy_retention_rules;
create trigger privacy_rule_guard_trigger before update or delete on public.privacy_retention_rules for each row execute function public.privacy_rule_guard();
drop trigger if exists privacy_job_event_immutable on public.privacy_job_events;
create trigger privacy_job_event_immutable before update or delete on public.privacy_job_events for each row execute function public.privacy_immutable_evidence();
drop trigger if exists privacy_job_guard_trigger on public.privacy_jobs;
create trigger privacy_job_guard_trigger before update on public.privacy_jobs for each row execute function public.privacy_job_guard();
drop trigger if exists privacy_hold_guard_trigger on public.privacy_legal_holds;
create trigger privacy_hold_guard_trigger before update on public.privacy_legal_holds for each row execute function public.privacy_hold_guard();
drop trigger if exists privacy_hold_delete_guard on public.privacy_legal_holds;
create trigger privacy_hold_delete_guard before delete on public.privacy_legal_holds for each row execute function public.privacy_immutable_evidence();

-- Seed Policy v1 once. Rules are normalized; the manifest hash is derived from
-- the sorted normalized rows and is therefore deterministic across installs.
insert into public.privacy_policy_versions(id,policy_key,version,status,canonical_manifest,manifest_hash,created_at)
values('47000000-0000-4000-8000-000000000001','businesssite_privacy_retention',1,'draft',
 '{"technicalBaseline":true,"legalCertification":false,"approval":"owner-approved-task-group-4-b1","backupTargets":{"rpoHours":24,"rtoHours":8,"dailyRetentionDays":30,"restoreDrillMonths":3},"technicalTargets":{"exportHours":24,"deletionDays":30,"exportArtifactHours":24}}'::jsonb,
 repeat('0',64),timestamp with time zone '2026-08-26 00:00:00+00')
on conflict(policy_key,version) do nothing;

insert into public.privacy_retention_rules(id,policy_version_id,class_key,trigger_key,duration_value,duration_unit,cooling_days,tenant_options_days,disposition,automatic_disposition,legal_review_required,export_eligible,hold_eligible,provider_reconciliation_required,technical_owner,covered_stores)
values
('47000000-0000-4000-8100-000000000001','47000000-0000-4000-8000-000000000001','appointments','created_at',180,'days',null,array[90,180,365],'anonymize',true,false,true,true,true,'privacy_operations',array['site_appointments','resend']),
('47000000-0000-4000-8100-000000000002','47000000-0000-4000-8000-000000000001','finder_cache','expires_at',30,'days',null,'{}','delete',true,false,false,true,false,'finder_operations',array['finder_search_cache','google_finder']),
('47000000-0000-4000-8100-000000000003','47000000-0000-4000-8000-000000000001','abandoned_finder_searches','created_at',90,'days',null,'{}','delete',true,false,true,true,false,'finder_operations',array['finder_searches']),
('47000000-0000-4000-8100-000000000004','47000000-0000-4000-8000-000000000001','qualified_leads','updated_at',365,'days',null,'{}','anonymize',true,false,true,true,false,'finder_operations',array['leads','lead_scores','lead_pipeline_events','lead_website_history','prepared_business_profiles']),
('47000000-0000-4000-8100-000000000005','47000000-0000-4000-8000-000000000001','ai_detail','created_at',90,'days',null,'{}','delete',true,false,true,true,true,'ai_operations',array['ai_runs','openai']),
('47000000-0000-4000-8100-000000000006','47000000-0000-4000-8000-000000000001','usage_events','created_at',90,'days',null,'{}','delete',true,false,true,true,false,'platform_operations',array['tenant_usage_events']),
('47000000-0000-4000-8100-000000000007','47000000-0000-4000-8000-000000000001','usage_aggregates','window_start',14,'months',null,'{}','delete',true,false,true,true,false,'platform_operations',array['tenant_usage_counters','tenant_usage_states']),
('47000000-0000-4000-8100-000000000008','47000000-0000-4000-8000-000000000001','canceled_customer','access_locked_at',30,'days',30,'{}','anonymize',false,false,true,true,true,'privacy_operations',array['sites','site_features','site_admin_accounts','site_admin_sessions','site_admin_password_resets','subscriber_intakes']),
('47000000-0000-4000-8100-000000000009','47000000-0000-4000-8000-000000000001','export_artifacts','created_at',24,'hours',null,'{}','delete',true,false,false,false,true,'privacy_operations','{}'),
('47000000-0000-4000-8100-000000000010','47000000-0000-4000-8000-000000000001','security_audit','created_at',12,'months',null,'{}','anonymize',false,false,true,true,true,'security_operations',array['audit_events','owner_auth_audit_events','site_content_audit_events','site_integration_events','platform_users','platform_roles','privacy_policy_versions','privacy_retention_rules','privacy_jobs','privacy_job_items','privacy_job_events','privacy_legal_holds','hosting_logs','postgres_backups']),
('47000000-0000-4000-8100-000000000011','47000000-0000-4000-8000-000000000001','webhook_redi_evidence','created_at',90,'days',null,'{}','delete',true,false,false,true,true,'integration_operations',array['payment_webhook_events','integration_api_requests','integration_nonces','stripe','paddle','redi_control']),
('47000000-0000-4000-8100-000000000012','47000000-0000-4000-8000-000000000001','ephemeral_security','expires_at',null,null,null,'{}','delete',true,false,false,false,false,'security_operations',array['api_rate_limits','owner_auth_challenges','owner_mfa_recovery_codes','owner_sessions','owner_invitations','site_preview_tokens','tenant_concurrency_leases']),
('47000000-0000-4000-8100-000000000013','47000000-0000-4000-8000-000000000001','media_content','account_closed_at',null,null,null,'{}','manual_review',false,false,true,true,true,'content_operations',array['site_media','site_media_assets','site_media_blobs','site_article_categories','site_article_media','site_article_sources','site_articles','site_editorial_memberships','site_editorial_settings','site_information_ad_slots','vercel_blob','resend']),
('47000000-0000-4000-8100-000000000014','47000000-0000-4000-8000-000000000001','active_subscription','verified_effective_end',null,null,null,'{}','retain',false,false,true,true,true,'billing_operations',array['site_subscriptions','site_addon_subscriptions','subscription_lifecycle_events','stripe','paddle']),
('47000000-0000-4000-8100-000000000015','47000000-0000-4000-8000-000000000001','owner_account','disabled_at',null,null,null,'{}','anonymize',false,false,true,true,false,'security_operations',array['owner_accounts']),
('47000000-0000-4000-8100-000000000016','47000000-0000-4000-8000-000000000001','contract_billing_accounting','manual_legal_review',null,null,null,'{}','manual_review',false,true,true,true,true,'legal_operations',array['contract_acceptances','customer_business_identities','platform_legal_config_versions','platform_legal_document_versions','schema_migrations','stripe','paddle']),
('47000000-0000-4000-8100-000000000017','47000000-0000-4000-8000-000000000001','trial_demo','trial_recovery_ends_at',30,'days',null,'{}','delete',true,false,true,true,true,'customer_operations',array['demo_sites','site_external_integrations','vercel_domains'])
on conflict(policy_version_id,class_key) do nothing;

update public.privacy_policy_versions p set manifest_hash=public.privacy_policy_hash(p.id),status='active',reviewed_at=timestamp with time zone '2026-08-26 00:00:00+00',activated_at=timestamp with time zone '2026-08-26 00:00:00+00'
where p.id='47000000-0000-4000-8000-000000000001' and p.status='draft';

-- Extend the independently approved bounded maintenance routine with the
-- approved 30-day Finder-cache physical expiry. No lead/search/customer/media
-- row is added to automatic cleanup here.
create or replace function public.cleanup_expired_demo_batch(p_purpose text,p_batch integer default 100)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ids text[]; profiles text[]; leads_to_check text[]; deleted_sites integer:=0; deleted_previews integer:=0; deleted_limits integer:=0; deleted_cache integer:=0; begin
 if p_purpose<>'expired_demo_maintenance' or p_batch not between 1 and 200 then return null; end if;
 select array_agg(x.id),array_agg(x.prepared_profile_id),array_agg(x.lead_id) into ids,profiles,leads_to_check from(
  select s.id,d.prepared_profile_id,s.lead_id from public.sites s join public.demo_sites d on d.site_id=s.id
  where s.activated_at is null and s.trial_recovery_ends_at<=statement_timestamp()
   and not exists(select 1 from public.site_subscriptions sub where sub.site_id=s.id)
   and not exists(select 1 from public.subscriber_intakes i where i.demo_site_id=s.id and i.status='pending_payment' and i.updated_at>statement_timestamp()-interval '24 hours')
   and not exists(select 1 from public.site_preview_tokens p where p.site_id=s.id and p.revoked_at is null and p.expires_at>statement_timestamp())
  order by s.trial_recovery_ends_at,s.id for update of s skip locked limit p_batch)x;
 if ids is not null then delete from public.sites where id=any(ids); get diagnostics deleted_sites=row_count;
  delete from public.prepared_business_profiles p where p.id=any(profiles) and not exists(select 1 from public.demo_sites d where d.prepared_profile_id=p.id);
  delete from public.leads l where l.id=any(leads_to_check) and l.source='self-service' and not exists(select 1 from public.sites s where s.lead_id=l.id);
 end if;
 with doomed as(select ctid from public.site_preview_tokens where revoked_at is not null or expires_at<=statement_timestamp() order by expires_at limit p_batch) delete from public.site_preview_tokens p using doomed d where p.ctid=d.ctid; get diagnostics deleted_previews=row_count;
 with doomed as(select ctid from public.api_rate_limits where updated_at<statement_timestamp()-interval '2 days' order by updated_at limit p_batch*10) delete from public.api_rate_limits r using doomed d where r.ctid=d.ctid; get diagnostics deleted_limits=row_count;
 with doomed as(select ctid from public.finder_search_cache where expires_at<=statement_timestamp() order by expires_at limit p_batch*10) delete from public.finder_search_cache c using doomed d where c.ctid=d.ctid; get diagnostics deleted_cache=row_count;
 with doomed as(select ctid from public.tenant_usage_counters where window_start<statement_timestamp()-interval '14 months' order by window_start limit p_batch*10) delete from public.tenant_usage_counters t using doomed d where t.ctid=d.ctid;
 with doomed as(select ctid from public.tenant_usage_events where created_at<statement_timestamp()-interval '90 days' order by created_at limit p_batch*10) delete from public.tenant_usage_events t using doomed d where t.ctid=d.ctid;
 with doomed as(select ctid from public.tenant_concurrency_leases where expires_at<statement_timestamp() order by expires_at limit p_batch*10) delete from public.tenant_concurrency_leases t using doomed d where t.ctid=d.ctid;
 insert into public.audit_events(id,entity_type,entity_id,action,details) values(gen_random_uuid(),'platform','cleanup','expired_demo_cleanup',jsonb_build_object('deletedSites',deleted_sites,'deletedPreviews',deleted_previews,'deletedRateLimits',deleted_limits,'deletedFinderCache',deleted_cache,'batch',p_batch));
 return jsonb_build_object('deletedSites',deleted_sites,'deletedPreviews',deleted_previews,'deletedRateLimits',deleted_limits,'deletedFinderCache',deleted_cache,'batch',p_batch); end $$;
revoke all on function public.cleanup_expired_demo_batch(text,integer) from public;

create or replace function public.privacy_policy_valid(p_policy uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(
  select 1 from public.privacy_policy_versions p where p.id=p_policy
   and p.manifest_hash=public.privacy_policy_hash(p.id)
   and (select count(*) from public.privacy_retention_rules r where r.policy_version_id=p.id)=17
   and not exists(select 1 from public.privacy_retention_rules r where r.policy_version_id=p.id and r.legal_review_required and (r.automatic_disposition or r.disposition<>'manual_review'))
   and not exists(
    select 1 from unnest(array[
     'ai_runs','api_rate_limits','audit_events','contract_acceptances','customer_business_identities','demo_sites','finder_search_cache','finder_searches',
     'integration_api_requests','integration_nonces','lead_pipeline_events','lead_scores','lead_website_history','leads','owner_accounts','owner_auth_audit_events',
     'owner_auth_challenges','owner_invitations','owner_mfa_recovery_codes','owner_sessions','payment_webhook_events','platform_legal_config_versions',
     'platform_legal_document_versions','platform_roles','platform_users','prepared_business_profiles','schema_migrations','site_addon_subscriptions',
     'site_admin_accounts','site_admin_password_resets','site_admin_sessions','site_appointments','site_article_categories','site_article_media','site_article_sources',
     'site_articles','site_content_audit_events','site_editorial_memberships','site_editorial_settings','site_external_integrations','site_features',
     'site_information_ad_slots','site_integration_events','site_media','site_media_assets','site_media_blobs','site_preview_tokens','site_subscriptions','sites',
     'subscriber_intakes','subscription_lifecycle_events','tenant_concurrency_leases','tenant_usage_counters','tenant_usage_events','tenant_usage_states',
     'privacy_policy_versions','privacy_retention_rules','privacy_jobs','privacy_job_items','privacy_job_events','privacy_legal_holds',
     'stripe','paddle','resend','vercel_domains','vercel_blob','openai','google_finder','redi_control','hosting_logs','postgres_backups'
    ]::text[]) required(store)
    where not exists(select 1 from public.privacy_retention_rules r where r.policy_version_id=p.id and required.store=any(r.covered_stores))
   )
 )
$$;

create or replace function public.privacy_active_policy_valid()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select count(*)=1 and bool_and(public.privacy_policy_valid(id)) from public.privacy_policy_versions where status='active'
$$;

create or replace function public.privacy_resolve_subject(p_kind text,p_reference text)
returns table(subject_exists boolean,site_id text,site_admin_account_id uuid,owner_account_id uuid)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_uuid uuid; begin
 if p_kind not in('customer_account','site','owner_account','appointment','lead','editorial_member','invitation','integration')
   or p_reference is null or char_length(p_reference) not between 1 and 160 or p_reference ~ '[[:space:]]' then return query select false,null::text,null::uuid,null::uuid; return; end if;
 if p_kind in('customer_account','owner_account','appointment','editorial_member','invitation','integration') then
  if p_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return query select false,null::text,null::uuid,null::uuid; return; end if;
  v_uuid:=p_reference::uuid;
 end if;
 if p_kind='site' then return query select true,s.id,null::uuid,null::uuid from public.sites s where s.id=p_reference;
 elsif p_kind='customer_account' then return query select true,a.site_id,a.id,null::uuid from public.site_admin_accounts a where a.id=v_uuid;
 elsif p_kind='owner_account' then return query select true,null::text,null::uuid,a.id from public.owner_accounts a where a.id=v_uuid;
 elsif p_kind='appointment' then return query select true,a.site_id,null::uuid,null::uuid from public.site_appointments a where a.id=v_uuid;
 elsif p_kind='lead' then return query select true,s.id,null::uuid,null::uuid from public.leads l left join public.sites s on s.lead_id=l.id where l.id=p_reference limit 1;
 elsif p_kind='editorial_member' then return query select true,m.site_id,m.account_id,null::uuid from public.site_editorial_memberships m where m.id=v_uuid;
 elsif p_kind='invitation' then return query select true,null::text,null::uuid,i.created_by from public.owner_invitations i where i.id=v_uuid;
 elsif p_kind='integration' then return query select true,i.site_id,null::uuid,null::uuid from public.site_external_integrations i where i.id=v_uuid;
 end if;
 return query select false,null::text,null::uuid,null::uuid;
exception when invalid_text_representation then return query select false,null::text,null::uuid,null::uuid;
end $$;

create or replace function public.privacy_hold_applies(p_kind text,p_reference text,p_site text,p_class text default null)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.privacy_legal_holds h
  where h.status='active' and h.starts_at<=statement_timestamp() and (h.ends_at is null or h.ends_at>statement_timestamp())
   and ((h.subject_kind=p_kind and h.subject_reference=p_reference) or (p_site is not null and h.site_id=p_site))
   and (p_class is null or cardinality(h.data_classes)=0 or p_class=any(h.data_classes)))
$$;

create or replace function public.privacy_eligible_count(p_class text,p_kind text,p_reference text,p_site text,p_snapshot timestamptz)
returns bigint language plpgsql stable security definer set search_path=pg_catalog as $$
declare v_count bigint:=0; v_uuid uuid; v_days integer:=180; begin
 if p_kind in('customer_account','owner_account','appointment','editorial_member','invitation','integration') and p_reference ~* '^[0-9a-f-]{36}$' then v_uuid:=p_reference::uuid; end if;
 if p_class='appointments' then
  if p_kind='appointment' then select count(*) into v_count from public.site_appointments a join public.sites s on s.id=a.site_id where a.id=v_uuid and a.created_at<=p_snapshot-make_interval(days=>s.appointment_retention_days);
  elsif p_site is not null then select appointment_retention_days into v_days from public.sites where id=p_site; select count(*) into v_count from public.site_appointments where site_id=p_site and created_at<=p_snapshot-make_interval(days=>coalesce(v_days,180)); end if;
 elsif p_class='finder_cache' then select count(*) into v_count from public.finder_search_cache where expires_at<=p_snapshot;
 elsif p_class='abandoned_finder_searches' then select count(*) into v_count from public.finder_searches where status in('pending','failed') and created_at<=p_snapshot-interval '90 days' and (p_kind<>'owner_account' or created_by_owner_id=v_uuid);
 elsif p_class='qualified_leads' and p_kind='lead' then select count(*) into v_count from public.leads where id=p_reference and updated_at<=p_snapshot-interval '365 days';
 elsif p_class='ai_detail' then select count(*) into v_count from public.ai_runs where created_at<=p_snapshot-interval '90 days' and ((p_site is not null and site_id=p_site) or (p_kind='lead' and lead_id=p_reference) or (p_kind='owner_account' and actor_id=p_reference));
 elsif p_class='usage_events' and p_site is not null then select count(*) into v_count from public.tenant_usage_events where site_id=p_site and created_at<=p_snapshot-interval '90 days';
 elsif p_class='usage_aggregates' and p_site is not null then select count(*) into v_count from public.tenant_usage_counters where site_id=p_site and window_start<=p_snapshot-interval '14 months';
 elsif p_class='canceled_customer' and p_site is not null then select count(*) into v_count from public.site_subscriptions where site_id=p_site and status in('canceled','unpaid','incomplete_expired') and read_only_ends_at is not null and read_only_ends_at<=p_snapshot-interval '30 days';
 elsif p_class='security_audit' then select (select count(*) from public.audit_events where created_at<=p_snapshot-interval '12 months')+(select count(*) from public.owner_auth_audit_events where created_at<=p_snapshot-interval '12 months' and (p_kind<>'owner_account' or owner_id=v_uuid or target_owner_id=v_uuid)) into v_count;
 elsif p_class='webhook_redi_evidence' then select count(*) into v_count from public.payment_webhook_events where processed_at<=p_snapshot-interval '90 days' and (p_site is null or site_id=p_site);
 elsif p_class='ephemeral_security' then select (select count(*) from public.site_preview_tokens where expires_at<=p_snapshot and (p_site is null or site_id=p_site))+(select count(*) from public.tenant_concurrency_leases where expires_at<=p_snapshot and (p_site is null or site_id=p_site)) into v_count;
 elsif p_class='media_content' and p_site is not null then select (select count(*) from public.site_media where site_id=p_site)+(select count(*) from public.site_media_assets where site_id=p_site)+(select count(*) from public.site_media_blobs where site_id=p_site) into v_count;
 elsif p_class='active_subscription' and p_site is not null then select count(*) into v_count from public.site_subscriptions where site_id=p_site and status in('active','trialing','past_due');
 elsif p_class='owner_account' and p_kind='owner_account' then select count(*) into v_count from public.owner_accounts where id=v_uuid and status='disabled';
 elsif p_class='contract_billing_accounting' then select (select count(*) from public.contract_acceptances where p_site is null or site_id=p_site)+(select count(*) from public.customer_business_identities where p_site is null or site_id=p_site) into v_count;
 elsif p_class='trial_demo' and p_site is not null then select count(*) into v_count from public.sites s where s.id=p_site and s.activated_at is null and s.trial_recovery_ends_at<=p_snapshot and not exists(select 1 from public.site_subscriptions sub where sub.site_id=s.id);
 end if;
 return coalesce(v_count,0);
exception when invalid_text_representation then return 0;
end $$;

create or replace function public.privacy_plan_job(p_job uuid,p_actor_kind text,p_actor uuid,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_job record; v_rule record; v_count bigint; v_hold boolean; v_active boolean; v_prerequisites text[]; v_blocked integer:=0; v_items integer:=0; v_eligible bigint:=0; v_status text; begin
 select * into v_job from public.privacy_jobs where id=p_job for update;
 if v_job.id is null or v_job.kind<>'retention_scan' or v_job.status not in('queued','planning') then return false; end if;
 if not public.privacy_policy_valid(v_job.policy_version_id) then
  update public.privacy_jobs set status='failed',error_code='policy_unavailable',completed_at=statement_timestamp(),updated_at=statement_timestamp() where id=p_job;
  insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id)
  values(gen_random_uuid(),p_job,'job_failed',p_actor_kind,p_actor,v_job.status,'failed',jsonb_build_object('reasonCode','policy_unavailable'),p_correlation);
  return false;
 end if;
 if v_job.status='queued' then update public.privacy_jobs set status='planning',started_at=coalesce(started_at,statement_timestamp()),updated_at=statement_timestamp() where id=p_job; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'planning_started',p_actor_kind,p_actor,'queued','planning','{}',p_correlation); end if;
 delete from public.privacy_job_items where job_id=p_job;
 select exists(select 1 from public.site_subscriptions where site_id=v_job.site_id and status in('active','trialing','past_due')) into v_active;
 for v_rule in select * from public.privacy_retention_rules where policy_version_id=v_job.policy_version_id order by class_key loop
  v_hold:=v_rule.hold_eligible and public.privacy_hold_applies(v_job.subject_kind,v_job.subject_reference,v_job.site_id,v_rule.class_key);
  v_count:=case when v_hold then 0 else public.privacy_eligible_count(v_rule.class_key,v_job.subject_kind,v_job.subject_reference,v_job.site_id,v_job.snapshot_at) end;
  v_prerequisites:=case v_rule.class_key
   when 'canceled_customer' then array['verified_cancellation','effective_end','read_only_complete','pending_deletion_complete','export_decision','provider_reconciliation']
   when 'active_subscription' then array['verified_cancellation','effective_end']
   when 'owner_account' then array['disable_account','revoke_sessions','last_owner_transfer']
   when 'contract_billing_accounting' then array['manual_legal_review']
   when 'media_content' then array['export_or_cooling_complete','provider_reconciliation']
   else case when v_rule.provider_reconciliation_required then array['provider_reconciliation'] else '{}'::text[] end end;
  insert into public.privacy_job_items(id,job_id,policy_version_id,policy_rule_id,data_class,datastore,operation,status,eligible_count,block_reason_code,prerequisites,provider_reconciliation_required,legal_review_required)
  values(gen_random_uuid(),p_job,v_job.policy_version_id,v_rule.id,v_rule.class_key,coalesce(v_rule.covered_stores[1],'policy_registry'),
   case v_rule.disposition when 'delete' then 'delete' when 'anonymize' then 'anonymize' when 'retain' then 'retain' else 'manual_review' end,
   case when v_hold or v_rule.legal_review_required or (v_rule.class_key='active_subscription' and v_active) or not v_rule.automatic_disposition then 'blocked' when v_count>0 then 'eligible' else 'planned' end,
   v_count,
   case when v_hold then 'legal_hold' when v_rule.legal_review_required then 'manual_legal_review' when v_rule.class_key='active_subscription' and v_active then 'active_subscription' when not v_rule.automatic_disposition then 'manual_legal_review' when v_count=0 then 'not_due' else null end,
   v_prerequisites,v_rule.provider_reconciliation_required,v_rule.legal_review_required);
  v_items:=v_items+1; v_eligible:=v_eligible+v_count;
  if v_hold or v_rule.legal_review_required or (v_rule.class_key='active_subscription' and v_active) or not v_rule.automatic_disposition then v_blocked:=v_blocked+1; end if;
 end loop;
 v_status:=case when public.privacy_hold_applies(v_job.subject_kind,v_job.subject_reference,v_job.site_id,null) then 'blocked' else 'awaiting_approval' end;
 update public.privacy_jobs set status=v_status,error_code=case when v_status='blocked' then 'legal_hold' else null end,lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id)
 values(gen_random_uuid(),p_job,case when v_status='blocked' then 'job_blocked' else 'plan_created' end,p_actor_kind,p_actor,'planning',v_status,jsonb_build_object('itemCount',v_items,'eligibleCount',v_eligible,'blockedCount',v_blocked),p_correlation);
 return true;
end $$;

create or replace function public.owner_privacy_snapshot(p_session_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with actor as(select * from public.owner_auth_resolve_session(p_session_hash,'audit.read')),
 active as(select p.* from public.privacy_policy_versions p where p.status='active' and exists(select 1 from actor)),
 rules as(select coalesce(jsonb_agg(jsonb_build_object('classKey',r.class_key,'triggerKey',r.trigger_key,'durationValue',r.duration_value,'durationUnit',r.duration_unit,'coolingDays',r.cooling_days,'tenantOptionsDays',r.tenant_options_days,'disposition',r.disposition,'automaticDisposition',r.automatic_disposition,'legalReviewRequired',r.legal_review_required,'exportEligible',r.export_eligible,'holdEligible',r.hold_eligible,'providerReconciliationRequired',r.provider_reconciliation_required,'technicalOwner',r.technical_owner,'stores',r.covered_stores) order by r.class_key),'[]'::jsonb) value from public.privacy_retention_rules r join active p on p.id=r.policy_version_id),
 jobs as(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'kind',j.kind,'subjectKind',j.subject_kind,'subjectReference',j.subject_reference,'status',j.status,'snapshotAt',j.snapshot_at,'attempts',j.attempts,'maxAttempts',j.max_attempts,'errorCode',j.error_code,'correlationId',j.correlation_id,'createdAt',j.created_at,'updatedAt',j.updated_at,'itemCount',(select count(*) from public.privacy_job_items i where i.job_id=j.id),'eligibleCount',(select coalesce(sum(i.eligible_count),0) from public.privacy_job_items i where i.job_id=j.id),'blockedCount',(select count(*) from public.privacy_job_items i where i.job_id=j.id and i.status='blocked')) order by j.created_at desc),'[]'::jsonb) value from(select * from public.privacy_jobs order by created_at desc limit 100)j where exists(select 1 from actor)),
 holds as(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'subjectKind',h.subject_kind,'subjectReference',h.subject_reference,'siteId',h.site_id,'dataClasses',h.data_classes,'reasonCategory',h.reason_category,'externalReference',h.external_reference,'status',h.status,'startsAt',h.starts_at,'endsAt',h.ends_at,'releasedAt',h.released_at,'createdAt',h.created_at) order by h.created_at desc),'[]'::jsonb) value from(select * from public.privacy_legal_holds order by created_at desc limit 100)h where exists(select 1 from actor))
 select case when exists(select 1 from actor) then jsonb_build_object('policy',(select jsonb_build_object('id',p.id,'policyKey',p.policy_key,'version',p.version,'status',p.status,'manifestHash',p.manifest_hash,'valid',public.privacy_policy_valid(p.id),'activatedAt',p.activated_at,'manifest',p.canonical_manifest) from active p),'rules',(select value from rules),'jobs',(select value from jobs),'holds',(select value from holds)) else null end
$$;

create or replace function public.owner_privacy_job_items(p_session_hash text,p_job uuid)
returns table(id uuid,policy_version_id uuid,policy_rule_id uuid,data_class text,datastore text,operation text,status text,eligible_count bigint,estimated_bytes bigint,block_reason_code text,prerequisites text[],provider_reconciliation_required boolean,legal_review_required boolean,retry_count integer,checksum text,manifest_reference text,created_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
 select i.id,i.policy_version_id,i.policy_rule_id,i.data_class,i.datastore,i.operation,i.status,i.eligible_count,i.estimated_bytes,i.block_reason_code,i.prerequisites,i.provider_reconciliation_required,i.legal_review_required,i.retry_count,i.checksum,i.manifest_reference,i.created_at
 from public.owner_auth_resolve_session(p_session_hash,'audit.read') actor cross join public.privacy_job_items i where i.job_id=p_job order by i.data_class
$$;

create or replace function public.owner_privacy_start_dry_run(p_session_hash text,p_password_hash text,p_totp_step bigint,p_subject_kind text,p_subject_reference text,p_correlation text)
returns table(ok boolean,reason text,job_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_subject record; v_policy uuid; v_job uuid:=gen_random_uuid(); v_hash text; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure');
 if v_actor is null then return query select false,'forbidden'::text,null::uuid; return; end if;
 select * into v_subject from public.privacy_resolve_subject(p_subject_kind,p_subject_reference);
 if not coalesce(v_subject.subject_exists,false) then return query select false,'not_found'::text,null::uuid; return; end if;
 select id into v_policy from public.privacy_policy_versions where status='active';
 if v_policy is null or not public.privacy_policy_valid(v_policy) then return query select false,'policy_unavailable'::text,null::uuid; return; end if;
 v_hash:=encode(public.digest(convert_to(concat_ws('|','retention_scan',p_subject_kind,p_subject_reference,v_policy::text,date_trunc('hour',statement_timestamp())::text),'UTF8'),'sha256'),'hex');
 insert into public.privacy_jobs(id,kind,subject_kind,subject_reference,site_id,site_admin_account_id,owner_account_id,policy_version_id,snapshot_at,requested_actor_kind,requested_actor_reference,status,idempotency_hash,correlation_id)
 values(v_job,'retention_scan',p_subject_kind,p_subject_reference,v_subject.site_id,v_subject.site_admin_account_id,v_subject.owner_account_id,v_policy,statement_timestamp(),'owner',v_actor,'queued',v_hash,p_correlation)
 on conflict(kind,subject_kind,subject_reference,idempotency_hash) do update set updated_at=public.privacy_jobs.updated_at returning id into v_job;
 if not exists(select 1 from public.privacy_job_events e where e.job_id=v_job and e.event_type='job_requested') then insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,next_state,details,correlation_id) values(gen_random_uuid(),v_job,'job_requested','owner',v_actor,'queued','{}',p_correlation); end if;
 if (select status from public.privacy_jobs where id=v_job)='queued' then perform public.privacy_plan_job(v_job,'owner',v_actor,p_correlation); end if;
 return query select true,null::text,v_job;
end $$;

create or replace function public.owner_privacy_create_hold(p_session_hash text,p_password_hash text,p_totp_step bigint,p_subject_kind text,p_subject_reference text,p_classes text[],p_reason text,p_external_reference text,p_ends_at timestamptz,p_correlation text)
returns table(ok boolean,reason text,hold_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_subject record; v_id uuid:=gen_random_uuid(); v_job record; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return query select false,'forbidden'::text,null::uuid; return; end if;
 select * into v_subject from public.privacy_resolve_subject(p_subject_kind,p_subject_reference); if not coalesce(v_subject.subject_exists,false) then return query select false,'not_found'::text,null::uuid; return; end if;
 if p_reason not in('litigation','regulatory_request','billing_dispute','security_incident','contract_dispute','data_subject_dispute') or p_classes is null or cardinality(p_classes)>17 or not(p_classes<@array['appointments','finder_cache','abandoned_finder_searches','qualified_leads','ai_detail','usage_events','usage_aggregates','canceled_customer','export_artifacts','security_audit','webhook_redi_evidence','ephemeral_security','media_content','active_subscription','owner_account','contract_billing_accounting','trial_demo']) or (p_ends_at is not null and p_ends_at<=statement_timestamp()) then return query select false,'invalid_input'::text,null::uuid; return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_subject_kind||':'||p_subject_reference,4701));
 insert into public.privacy_legal_holds(id,subject_kind,subject_reference,site_id,site_admin_account_id,owner_account_id,data_classes,reason_category,external_reference,status,ends_at,created_by,creation_correlation_id)
 values(v_id,p_subject_kind,p_subject_reference,v_subject.site_id,v_subject.site_admin_account_id,v_subject.owner_account_id,p_classes,p_reason,nullif(p_external_reference,''),'active',p_ends_at,v_actor,p_correlation);
 for v_job in select id,status,correlation_id from public.privacy_jobs where status in('queued','planning','awaiting_approval','retry_wait') and ((subject_kind=p_subject_kind and subject_reference=p_subject_reference) or (v_subject.site_id is not null and site_id=v_subject.site_id)) for update loop
  update public.privacy_jobs set status='blocked',error_code='legal_hold',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=v_job.id;
  insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v_job.id,'hold_detected','owner',v_actor,v_job.status,'blocked',jsonb_build_object('reasonCode','legal_hold'),coalesce(p_correlation,v_job.correlation_id));
 end loop;
 return query select true,null::text,v_id;
exception when check_violation then return query select false,'invalid_input'::text,null::uuid;
end $$;

create or replace function public.owner_privacy_release_hold(p_session_hash text,p_password_hash text,p_totp_step bigint,p_hold uuid,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; begin v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return false; end if;
 update public.privacy_legal_holds set status='released',released_at=statement_timestamp(),released_by=v_actor,release_correlation_id=p_correlation where id=p_hold and status='active'; return found; end $$;

create or replace function public.owner_privacy_clone_policy(p_session_hash text,p_password_hash text,p_totp_step bigint,p_version integer,p_correlation text)
returns table(ok boolean,reason text,policy_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_source uuid; v_id uuid:=gen_random_uuid(); begin v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return query select false,'forbidden'::text,null::uuid; return; end if;
 select id into v_source from public.privacy_policy_versions where status='active' for share; if v_source is null or p_version<=0 then return query select false,'invalid_state'::text,null::uuid; return; end if;
 insert into public.privacy_policy_versions(id,policy_key,version,status,canonical_manifest,manifest_hash,created_by) select v_id,policy_key,p_version,'draft',canonical_manifest,repeat('0',64),v_actor from public.privacy_policy_versions where id=v_source;
 insert into public.privacy_retention_rules(id,policy_version_id,class_key,trigger_key,duration_value,duration_unit,cooling_days,tenant_options_days,disposition,automatic_disposition,legal_review_required,export_eligible,hold_eligible,provider_reconciliation_required,technical_owner,covered_stores,rule_version)
 select gen_random_uuid(),v_id,class_key,trigger_key,duration_value,duration_unit,cooling_days,tenant_options_days,disposition,automatic_disposition,legal_review_required,export_eligible,hold_eligible,provider_reconciliation_required,technical_owner,covered_stores,rule_version from public.privacy_retention_rules where policy_version_id=v_source;
 update public.privacy_policy_versions set manifest_hash=public.privacy_policy_hash(v_id) where id=v_id; return query select true,null::text,v_id;
exception when unique_violation then return query select false,'conflict'::text,null::uuid; end $$;

create or replace function public.owner_privacy_activate_policy(p_session_hash text,p_password_hash text,p_totp_step bigint,p_policy uuid,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; begin perform pg_advisory_xact_lock(4701001); v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return false; end if;
 if not exists(select 1 from public.privacy_policy_versions where id=p_policy and status='draft') or not public.privacy_policy_valid(p_policy) then return false; end if;
 update public.privacy_policy_versions set status='retired',retired_at=statement_timestamp() where status='active';
 update public.privacy_policy_versions set status='active',reviewed_by=v_actor,activated_by=v_actor,reviewed_at=statement_timestamp(),activated_at=statement_timestamp() where id=p_policy and status='draft'; return found; end $$;

create or replace function public.owner_privacy_control_job(p_session_hash text,p_password_hash text,p_totp_step bigint,p_job uuid,p_action text,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; v_next text; begin v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null or p_action not in('retry','cancel') then return false; end if;
 select * into v from public.privacy_jobs where id=p_job for update; if v.id is null or v.kind<>'retention_scan' then return false; end if;
 if p_action='retry' then if v.status not in('failed','blocked','retry_wait') or v.attempts>=v.max_attempts or public.privacy_hold_applies(v.subject_kind,v.subject_reference,v.site_id,null) then return false; end if; v_next:='queued'; update public.privacy_jobs set status=v_next,error_code=null,next_attempt_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 else if v.status not in('queued','awaiting_approval','blocked','failed','retry_wait') then return false; end if; v_next:='canceled'; update public.privacy_jobs set status=v_next,completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job; end if;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,case when p_action='retry' then 'state_changed' else 'job_canceled' end,'owner',v_actor,v.status,v_next,'{}',p_correlation); return true; end $$;

create or replace function public.privacy_system_enqueue_retention_scan(p_subject_kind text,p_subject_reference text,p_correlation text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_subject record; v_policy uuid; v_id uuid:=gen_random_uuid(); v_hash text; begin select * into v_subject from public.privacy_resolve_subject(p_subject_kind,p_subject_reference); if not coalesce(v_subject.subject_exists,false) then return null; end if;
 select id into v_policy from public.privacy_policy_versions where status='active'; if not public.privacy_policy_valid(v_policy) then return null; end if;
 v_hash:=encode(public.digest(convert_to(concat_ws('|','retention_scan',p_subject_kind,p_subject_reference,v_policy::text,date_trunc('day',statement_timestamp())::text),'UTF8'),'sha256'),'hex');
 insert into public.privacy_jobs(id,kind,subject_kind,subject_reference,site_id,site_admin_account_id,owner_account_id,policy_version_id,snapshot_at,requested_actor_kind,status,idempotency_hash,correlation_id)
 values(v_id,'retention_scan',p_subject_kind,p_subject_reference,v_subject.site_id,v_subject.site_admin_account_id,v_subject.owner_account_id,v_policy,statement_timestamp(),'system','queued',v_hash,p_correlation)
 on conflict(kind,subject_kind,subject_reference,idempotency_hash) do update set updated_at=public.privacy_jobs.updated_at returning id into v_id;
 if not exists(select 1 from public.privacy_job_events where job_id=v_id and event_type='job_requested') then insert into public.privacy_job_events(id,job_id,event_type,actor_kind,next_state,details,correlation_id) values(gen_random_uuid(),v_id,'job_requested','system','queued','{}',p_correlation); end if; return v_id; end $$;

create or replace function public.privacy_system_claim_retention_job(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker !~ '^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if;
 select * into v from public.privacy_jobs j where j.kind='retention_scan' and j.status in('queued','retry_wait') and j.attempts<j.max_attempts and coalesce(j.next_attempt_at,'-infinity')<=statement_timestamp() and (j.lease_expires_at is null or j.lease_expires_at<=statement_timestamp()) order by j.created_at for update skip locked limit 1;
 if v.id is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.subject_kind||':'||v.subject_reference,4701));
 if public.privacy_hold_applies(v.subject_kind,v.subject_reference,v.site_id,null) then update public.privacy_jobs set status='blocked',error_code='legal_hold',updated_at=statement_timestamp() where id=v.id; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.id,'job_blocked','system',v.status,'blocked','{}',v.correlation_id); return null; end if;
 update public.privacy_jobs set status='planning',attempts=attempts+1,started_at=coalesce(started_at,statement_timestamp()),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,updated_at=statement_timestamp() where id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.id,'job_claimed','system',v.status,'planning',jsonb_build_object('attempt',v.attempts+1,'maxAttempts',v.max_attempts,'leaseSeconds',p_lease_seconds),v.correlation_id); return v.id; end $$;

create or replace function public.privacy_system_plan_retention_job(p_job uuid,p_worker text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin select * into v from public.privacy_jobs where id=p_job and kind='retention_scan' and status='planning' and worker_reference=p_worker and lease_expires_at>statement_timestamp() for update; if v.id is null then return false; end if;
 if public.privacy_hold_applies(v.subject_kind,v.subject_reference,v.site_id,null) then update public.privacy_jobs set status='blocked',error_code='legal_hold',lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'job_blocked','system','planning','blocked','{}',v.correlation_id); return false; end if;
 return public.privacy_plan_job(p_job,'system',null,v.correlation_id); end $$;

create or replace function public.privacy_system_transition_retention_job(p_job uuid,p_worker text,p_next text,p_error text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_delay integer; begin if p_worker !~ '^[A-Za-z0-9._:-]{1,100}$' then return false; end if;
 select * into v from public.privacy_jobs where id=p_job and kind='retention_scan' and ((status='awaiting_approval') or (status='running' and worker_reference=p_worker)) for update; if v.id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(v.subject_kind||':'||v.subject_reference,4701));
 if public.privacy_hold_applies(v.subject_kind,v.subject_reference,v.site_id,null) then p_next:='blocked'; p_error:='legal_hold'; end if;
 if v.status='awaiting_approval' and p_next<>'running' then return false; end if;
 if v.status='running' and p_next not in('retry_wait','completed','failed','blocked') then return false; end if;
 if p_next='completed' and exists(select 1 from public.privacy_job_items where job_id=p_job and status not in('completed','skipped')) then return false; end if;
 if p_next='retry_wait' and v.attempts>=v.max_attempts then p_next:='failed'; p_error:='attempt_limit'; end if;
 if p_error is not null and p_error not in('legal_hold','manual_review','active_subscription','attempt_limit','item_failed','lease_expired','execution_disabled','controlled_failure') then return false; end if;
 v_delay:=least(3600,(power(2,greatest(v.attempts,1))::integer)*30);
 update public.privacy_jobs set status=p_next,error_code=p_error,next_attempt_at=case when p_next='retry_wait' then statement_timestamp()+make_interval(secs=>v_delay) else null end,completed_at=case when p_next in('completed','failed') then statement_timestamp() else null end,lease_expires_at=case when p_next='running' then statement_timestamp()+interval '5 minutes' else null end,worker_reference=case when p_next='running' then p_worker else null end,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,case p_next when 'completed' then 'job_completed' when 'failed' then 'job_failed' when 'retry_wait' then 'retry_scheduled' when 'blocked' then 'job_blocked' else 'state_changed' end,'system',v.status,p_next,jsonb_build_object('reasonCode',p_error,'attempt',v.attempts,'maxAttempts',v.max_attempts),v.correlation_id); return true; end $$;

create or replace function public.privacy_system_recover_stuck_jobs()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; v_next text; begin for v in select * from public.privacy_jobs where kind='retention_scan' and status in('planning','running') and lease_expires_at<=statement_timestamp() for update skip locked loop
 v_next:=case when v.attempts>=v.max_attempts then 'failed' else 'retry_wait' end;
 update public.privacy_jobs set status=v_next,error_code=case when v_next='failed' then 'attempt_limit' else 'lease_expired' end,next_attempt_at=case when v_next='retry_wait' then statement_timestamp()+interval '60 seconds' else null end,lease_expires_at=null,worker_reference=null,completed_at=case when v_next='failed' then statement_timestamp() else null end,updated_at=statement_timestamp() where id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.id,case when v_next='failed' then 'job_failed' else 'retry_scheduled' end,'system',v.status,v_next,jsonb_build_object('reasonCode','lease_expired','attempt',v.attempts,'maxAttempts',v.max_attempts),v.correlation_id); v_count:=v_count+1; end loop; return v_count; end $$;

-- No generic destructive transition or executor exists in B1. Existing cleanup
-- remains independently constrained; registry-driven execution is application-
-- gated and retention scans only calculate counts.

alter table public.privacy_policy_versions enable row level security;
alter table public.privacy_policy_versions force row level security;
alter table public.privacy_retention_rules enable row level security;
alter table public.privacy_retention_rules force row level security;
alter table public.privacy_jobs enable row level security;
alter table public.privacy_jobs force row level security;
alter table public.privacy_job_items enable row level security;
alter table public.privacy_job_items force row level security;
alter table public.privacy_job_events enable row level security;
alter table public.privacy_job_events force row level security;
alter table public.privacy_legal_holds enable row level security;
alter table public.privacy_legal_holds force row level security;

revoke all on table public.privacy_policy_versions,public.privacy_retention_rules,public.privacy_jobs,public.privacy_job_items,public.privacy_job_events,public.privacy_legal_holds from public;
revoke all on function public.privacy_safe_details(jsonb) from public;
revoke all on function public.privacy_policy_hash(uuid) from public;
revoke all on function public.privacy_policy_valid(uuid) from public;
revoke all on function public.privacy_active_policy_valid() from public;
revoke all on function public.privacy_immutable_evidence() from public;
revoke all on function public.privacy_policy_guard() from public;
revoke all on function public.privacy_rule_guard() from public;
revoke all on function public.privacy_hold_guard() from public;
revoke all on function public.privacy_job_guard() from public;
revoke all on function public.privacy_resolve_subject(text,text) from public;
revoke all on function public.privacy_hold_applies(text,text,text,text) from public;
revoke all on function public.privacy_eligible_count(text,text,text,text,timestamptz) from public;
revoke all on function public.privacy_plan_job(uuid,text,uuid,text) from public;
revoke all on function public.owner_privacy_snapshot(text) from public;
revoke all on function public.owner_privacy_job_items(text,uuid) from public;
revoke all on function public.owner_privacy_start_dry_run(text,text,bigint,text,text,text) from public;
revoke all on function public.owner_privacy_create_hold(text,text,bigint,text,text,text[],text,text,timestamptz,text) from public;
revoke all on function public.owner_privacy_release_hold(text,text,bigint,uuid,text) from public;
revoke all on function public.owner_privacy_clone_policy(text,text,bigint,integer,text) from public;
revoke all on function public.owner_privacy_activate_policy(text,text,bigint,uuid,text) from public;
revoke all on function public.owner_privacy_control_job(text,text,bigint,uuid,text,text) from public;
revoke all on function public.privacy_system_enqueue_retention_scan(text,text,text) from public;
revoke all on function public.privacy_system_claim_retention_job(text,integer) from public;
revoke all on function public.privacy_system_plan_retention_job(uuid,text) from public;
revoke all on function public.privacy_system_transition_retention_job(uuid,text,text,text) from public;
revoke all on function public.privacy_system_recover_stuck_jobs() from public;

create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=61 and count(*) filter(where c.relrowsecurity)=58 and count(*) filter(where c.relforcerowsecurity)=58 and count(distinct c.relowner)=1
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p'))
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('public',p.oid,'execute'))
  and (select count(distinct p.proowner)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;

-- pgcrypto is used only for deterministic SHA-256 identifiers. Its extension
-- defaults must not reintroduce PUBLIC function execution into the application
-- schema; role provisioning grants only the one required digest overload.
revoke all on all functions in schema public from public;
