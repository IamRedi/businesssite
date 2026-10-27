-- Task Group 4-B2: authenticated customer and owner self-export.
-- This migration never deletes or mutates customer source data.

create table if not exists public.privacy_export_artifacts (
  id uuid primary key,
  job_id uuid not null unique references public.privacy_jobs(id) on delete restrict,
  subject_kind text not null check (subject_kind in ('customer_account','owner_account')),
  subject_reference text not null check (subject_reference ~ '^[A-Za-z0-9._:-]{1,160}$'),
  storage_adapter text not null check (storage_adapter in ('memory_test','vercel_blob_private')),
  object_key text not null unique check (object_key ~ '^privacy-exports/[a-f0-9]{2}/[a-f0-9-]{36}\.enc$'),
  encryption_algorithm text not null check (encryption_algorithm='AES-256-GCM'),
  key_version text not null check (key_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  ciphertext_checksum text not null check (ciphertext_checksum ~ '^[a-f0-9]{64}$'),
  plaintext_checksum text not null check (plaintext_checksum ~ '^[a-f0-9]{64}$'),
  archive_bytes bigint not null check (archive_bytes between 1 and 104857600),
  encrypted_bytes bigint not null check (encrypted_bytes between 1 and 104858624),
  file_count integer not null check (file_count between 1 and 500),
  schema_version integer not null check (schema_version=1),
  status text not null check (status in ('ready','delete_retry','deleted')),
  failure_code text check (failure_code is null or failure_code in ('store_delete_failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  deleted_at timestamptz,
  delete_attempts integer not null default 0 check (delete_attempts between 0 and 20),
  updated_at timestamptz not null default now(),
  check (expires_at>created_at and expires_at<=created_at+interval '24 hours'),
  check ((status='deleted')=(deleted_at is not null))
);
create index if not exists privacy_export_artifacts_expiry_idx on public.privacy_export_artifacts(status,expires_at);

create table if not exists public.privacy_export_download_capabilities (
  id uuid primary key,
  artifact_id uuid not null references public.privacy_export_artifacts(id) on delete restrict,
  job_id uuid not null references public.privacy_jobs(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  actor_kind text not null check (actor_kind in ('site_admin','owner')),
  site_id text,
  site_admin_account_id uuid,
  owner_account_id uuid,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  correlation_id text check (correlation_id is null or correlation_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  check (expires_at>issued_at and expires_at<=issued_at+interval '10 minutes'),
  check ((actor_kind='site_admin' and site_id is not null and site_admin_account_id is not null and owner_account_id is null)
      or (actor_kind='owner' and site_id is null and site_admin_account_id is null and owner_account_id is not null))
);
create index if not exists privacy_export_capability_expiry_idx on public.privacy_export_download_capabilities(expires_at) where consumed_at is null and revoked_at is null;

alter table public.privacy_jobs drop constraint privacy_jobs_requested_actor_kind_check;
alter table public.privacy_jobs add constraint privacy_jobs_requested_actor_kind_check check (requested_actor_kind in ('owner','site_admin','system'));
alter table public.privacy_jobs drop constraint privacy_jobs_error_code_check;
alter table public.privacy_jobs add constraint privacy_jobs_error_code_check check (error_code is null or error_code in
 ('invalid_subject','policy_unavailable','legal_hold','manual_review','active_subscription','attempt_limit','item_failed','lease_expired','execution_disabled','controlled_failure','export_limit_exceeded','artifact_store_failed','archive_failed','encryption_failed'));
alter table public.privacy_job_events drop constraint privacy_job_events_actor_kind_check;
alter table public.privacy_job_events add constraint privacy_job_events_actor_kind_check check (actor_kind in ('owner','site_admin','system'));
alter table public.privacy_job_events drop constraint privacy_job_events_event_type_check;
alter table public.privacy_job_events add constraint privacy_job_events_event_type_check check (event_type in
 ('job_requested','planning_started','plan_created','job_claimed','state_changed','job_blocked','retry_scheduled','job_failed','job_completed','job_canceled','hold_detected','artifact_created','capability_issued','download_completed','download_denied','artifact_deleted'));

create or replace function public.privacy_safe_details(p_details jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(coalesce(p_details,'{}'::jsonb))='object' and not exists(
   select 1 from jsonb_object_keys(coalesce(p_details,'{}'::jsonb)) k
   where k not in ('reasonCode','itemCount','eligibleCount','blockedCount','attempt','maxAttempts','leaseSeconds','policyVersion','policyHash','classKey','previousStatus','nextStatus','artifactId','archiveBytes','fileCount','expiresAt')
 )
$$;

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
   or (old.status='planning' and new.status in('awaiting_approval','blocked','failed') or (old.kind='export' and old.status='planning' and new.status='running'))
   or (old.status='awaiting_approval' and new.status in('running','blocked','canceled'))
   or (old.status='blocked' and new.status in('queued','canceled'))
   or (old.status='running' and new.status in('retry_wait','completed','failed','blocked'))
   or (old.status='retry_wait' and new.status in('queued','planning','failed','canceled'))
   or (old.status='failed' and new.status in('queued','canceled'))) then raise exception 'privacy_job_transition_denied'; end if;
 if new.attempts<old.attempts or new.attempts>old.attempts+1 then raise exception 'privacy_job_attempt_invalid'; end if;
 if new.kind='export' and new.status='completed' and not exists(select 1 from public.privacy_export_artifacts a where a.job_id=new.id and a.status='ready' and a.ciphertext_checksum~'^[a-f0-9]{64}$' and a.plaintext_checksum~'^[a-f0-9]{64}$') then raise exception 'privacy_export_artifact_required'; end if;
 return new;
end $$;

create or replace function public.privacy_export_artifact_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='deleted' then raise exception 'privacy_export_artifact_terminal'; end if;
 if row(old.id,old.job_id,old.subject_kind,old.subject_reference,old.storage_adapter,old.object_key,old.encryption_algorithm,old.key_version,old.ciphertext_checksum,old.plaintext_checksum,old.archive_bytes,old.encrypted_bytes,old.file_count,old.schema_version,old.created_at,old.expires_at)
  is distinct from row(new.id,new.job_id,new.subject_kind,new.subject_reference,new.storage_adapter,new.object_key,new.encryption_algorithm,new.key_version,new.ciphertext_checksum,new.plaintext_checksum,new.archive_bytes,new.encrypted_bytes,new.file_count,new.schema_version,new.created_at,new.expires_at) then raise exception 'privacy_export_artifact_identity_immutable'; end if;
 if new.status not in ('ready','delete_retry','deleted') or (new.status='deleted' and new.deleted_at is null) then raise exception 'privacy_export_artifact_transition_denied'; end if;
 return new;
end $$;

create trigger privacy_export_artifact_guard before update on public.privacy_export_artifacts for each row execute function public.privacy_export_artifact_guard();
create trigger privacy_export_artifact_no_delete before delete on public.privacy_export_artifacts for each row execute function public.privacy_immutable_evidence();
create trigger privacy_export_capability_no_update before update on public.privacy_export_download_capabilities for each row
 when (old.consumed_at is not null or old.revoked_at is not null) execute function public.privacy_immutable_evidence();
create trigger privacy_export_capability_no_delete before delete on public.privacy_export_download_capabilities for each row execute function public.privacy_immutable_evidence();

create or replace function public.privacy_export_active_policy()
returns table(policy_id uuid,policy_version integer,policy_hash text) language sql stable security definer set search_path=pg_catalog as $$
 select id,version,manifest_hash from public.privacy_policy_versions where status='active' and public.privacy_policy_valid(id) limit 1
$$;

create or replace function public.site_admin_request_privacy_export(p_session_hash text,p_password_hash text,p_correlation text)
returns table(ok boolean,reason text,job_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_policy record; v_existing uuid; v_id uuid:=gen_random_uuid(); v_hash text; begin
 select r.account_id,r.site_id,a.password_hash into v_actor from public.site_admin_resolve_session(p_session_hash) r join public.site_admin_accounts a on a.id=r.account_id;
 if v_actor.account_id is null or v_actor.password_hash<>p_password_hash then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 if exists(select 1 from public.privacy_jobs where subject_kind='customer_account' and subject_reference=v_actor.account_id::text and kind='export' and requested_at>statement_timestamp()-interval '1 hour' and status in('completed','failed','canceled')) then return query select false,'cooldown'::text,null::uuid; return; end if;
 select id into v_existing from public.privacy_jobs where subject_kind='customer_account' and subject_reference=v_actor.account_id::text and kind='export' and status in('queued','planning','running','retry_wait') order by created_at desc limit 1;
 if v_existing is not null then return query select true,'existing'::text,v_existing; return; end if;
 select * into v_policy from public.privacy_export_active_policy(); if v_policy.policy_id is null then return query select false,'policy_unavailable'::text,null::uuid; return; end if;
 v_hash:=encode(public.digest(convert_to(concat_ws('|','export','customer_account',v_actor.account_id::text,v_policy.policy_id::text,date_trunc('hour',statement_timestamp())::text),'UTF8'),'sha256'),'hex');
 insert into public.privacy_jobs(id,kind,subject_kind,subject_reference,site_id,site_admin_account_id,policy_version_id,snapshot_at,requested_actor_kind,requested_actor_reference,status,idempotency_hash,correlation_id,max_attempts)
 values(v_id,'export','customer_account',v_actor.account_id::text,v_actor.site_id,v_actor.account_id,v_policy.policy_id,statement_timestamp(),'site_admin',v_actor.account_id,'queued',v_hash,p_correlation,3)
 on conflict(kind,subject_kind,subject_reference,idempotency_hash) do update set updated_at=public.privacy_jobs.updated_at returning id into v_id;
 if not exists(select 1 from public.privacy_job_events e where e.job_id=v_id and e.event_type='job_requested') then insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,next_state,details,correlation_id) values(gen_random_uuid(),v_id,'job_requested','site_admin',v_actor.account_id,'queued',jsonb_build_object('policyVersion',v_policy.policy_version,'policyHash',v_policy.policy_hash),p_correlation); end if;
 return query select true,'created'::text,v_id;
end $$;

create or replace function public.owner_export_fresh_actor(p_session_hash text,p_password_hash text,p_totp_step bigint)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,null);
 if v_actor.owner_id is null then return null; end if;
 update public.owner_accounts set mfa_last_used_step=p_totp_step,updated_at=statement_timestamp()
 where id=v_actor.owner_id and status='active' and mfa_enrolled_at is not null and password_hash=p_password_hash and (mfa_last_used_step is null or mfa_last_used_step<p_totp_step);
 return case when found then v_actor.owner_id else null end;
end $$;

create or replace function public.owner_request_self_privacy_export(p_session_hash text,p_password_hash text,p_totp_step bigint,p_correlation text)
returns table(ok boolean,reason text,job_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_policy record; v_existing uuid; v_id uuid:=gen_random_uuid(); v_hash text; begin
 v_actor:=public.owner_export_fresh_actor(p_session_hash,p_password_hash,p_totp_step);
 if v_actor is null then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 if exists(select 1 from public.privacy_jobs where subject_kind='owner_account' and subject_reference=v_actor::text and kind='export' and requested_at>statement_timestamp()-interval '1 hour' and status in('completed','failed','canceled')) then return query select false,'cooldown'::text,null::uuid; return; end if;
 select id into v_existing from public.privacy_jobs where subject_kind='owner_account' and subject_reference=v_actor::text and kind='export' and status in('queued','planning','running','retry_wait') order by created_at desc limit 1;
 if v_existing is not null then return query select true,'existing'::text,v_existing; return; end if;
 select * into v_policy from public.privacy_export_active_policy(); if v_policy.policy_id is null then return query select false,'policy_unavailable'::text,null::uuid; return; end if;
 v_hash:=encode(public.digest(convert_to(concat_ws('|','export','owner_account',v_actor::text,v_policy.policy_id::text,date_trunc('hour',statement_timestamp())::text),'UTF8'),'sha256'),'hex');
 insert into public.privacy_jobs(id,kind,subject_kind,subject_reference,owner_account_id,policy_version_id,snapshot_at,requested_actor_kind,requested_actor_reference,status,idempotency_hash,correlation_id,max_attempts)
 values(v_id,'export','owner_account',v_actor::text,v_actor,v_policy.policy_id,statement_timestamp(),'owner',v_actor,'queued',v_hash,p_correlation,3)
 on conflict(kind,subject_kind,subject_reference,idempotency_hash) do update set updated_at=public.privacy_jobs.updated_at returning id into v_id;
 if not exists(select 1 from public.privacy_job_events e where e.job_id=v_id and e.event_type='job_requested') then insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,next_state,details,correlation_id) values(gen_random_uuid(),v_id,'job_requested','owner',v_actor,'queued',jsonb_build_object('policyVersion',v_policy.policy_version,'policyHash',v_policy.policy_hash),p_correlation); end if;
 return query select true,'created'::text,v_id;
end $$;

create or replace function public.privacy_export_status_json(p_job public.privacy_jobs,p_artifact public.privacy_export_artifacts)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('jobId',p_job.id,'status',p_job.status,'errorCode',p_job.error_code,'requestedAt',p_job.requested_at,'startedAt',p_job.started_at,'completedAt',p_job.completed_at,
 'artifact',case when p_artifact.id is null then null else jsonb_build_object('artifactId',p_artifact.id,'createdAt',p_artifact.created_at,'expiresAt',p_artifact.expires_at,'archiveBytes',p_artifact.archive_bytes,'fileCount',p_artifact.file_count,'status',p_artifact.status) end)
$$;

create or replace function public.site_admin_privacy_export_status(p_session_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select public.privacy_export_status_json(j,a) from public.site_admin_resolve_session(p_session_hash) s join lateral
 (select * from public.privacy_jobs where kind='export' and subject_kind='customer_account' and site_admin_account_id=s.account_id and site_id=s.site_id order by created_at desc limit 1) j on true
 left join public.privacy_export_artifacts a on a.job_id=j.id
$$;

create or replace function public.owner_self_privacy_export_status(p_session_hash text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select public.privacy_export_status_json(j,a) from public.owner_auth_resolve_session(p_session_hash,null) s join lateral
 (select * from public.privacy_jobs where kind='export' and subject_kind='owner_account' and owner_account_id=s.owner_id order by created_at desc limit 1) j on true
 left join public.privacy_export_artifacts a on a.job_id=j.id
$$;

create or replace function public.privacy_system_claim_export(p_worker text,p_lease_seconds integer default 300)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin if p_worker !~ '^[A-Za-z0-9._:-]{1,100}$' or p_lease_seconds not between 30 and 900 then return null; end if;
 select * into v from public.privacy_jobs where kind='export' and status in('queued','retry_wait') and attempts<max_attempts and coalesce(next_attempt_at,'-infinity')<=statement_timestamp() order by created_at for update skip locked limit 1;
 if v.id is null then return null; end if;
 update public.privacy_jobs set status='planning',attempts=attempts+1,started_at=coalesce(started_at,statement_timestamp()),lease_expires_at=statement_timestamp()+make_interval(secs=>p_lease_seconds),worker_reference=p_worker,updated_at=statement_timestamp() where id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.id,'job_claimed','system',v.status,'planning',jsonb_build_object('attempt',v.attempts+1,'maxAttempts',v.max_attempts,'leaseSeconds',p_lease_seconds),v.correlation_id);
 return v.id;
end $$;

create or replace function public.privacy_system_export_snapshot(p_job uuid,p_worker text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_policy record; v_count bigint; v_bytes bigint; v_data jsonb; begin
 select * into v from public.privacy_jobs where id=p_job and kind='export' and status='planning' and worker_reference=p_worker and lease_expires_at>statement_timestamp() for update;
 if v.id is null or exists(select 1 from public.privacy_export_artifacts where job_id=v.id and status<>'deleted') then return null; end if;
 select version,manifest_hash into v_policy from public.privacy_policy_versions where id=v.policy_version_id and public.privacy_policy_valid(id);
 if v_policy.version is null then raise exception 'policy_unavailable'; end if;
 if v.subject_kind='customer_account' then
  select count(*),coalesce(sum(octet_length(data)),0) into v_count,v_bytes from public.site_media_blobs where site_id=v.site_id;
  if (select count(*) from public.site_appointments where site_id=v.site_id)>10000 or v_count>200 or v_bytes>52428800 then raise exception 'export_limit_exceeded'; end if;
  select jsonb_build_object(
   'schemaVersion',1,'jobId',v.id,'subjectKind',v.subject_kind,'subjectReference',v.subject_reference,'dbSnapshotAt',statement_timestamp(),'policyVersion',v_policy.version,'policyHash',v_policy.manifest_hash,
   'account',(select jsonb_build_object('id',id,'email',email,'preferredLocale',preferred_locale,'status',status,'createdAt',created_at,'updatedAt',updated_at) from public.site_admin_accounts where id=v.site_admin_account_id and site_id=v.site_id),
   'site',(select jsonb_build_object('id',id,'slug',slug,'visibility',visibility,'generatedDocument',generated_document,'publicationIntent',publication_intent,'siteKind',site_kind,'createdAt',created_at,'activatedAt',activated_at,'demoExpiresAt',demo_expires_at,'trialRecoveryEndsAt',trial_recovery_ends_at,'appointmentRetentionDays',appointment_retention_days) from public.sites where id=v.site_id),
   'businessIdentity',coalesce((select jsonb_agg(jsonb_build_object('version',version,'isCurrent',is_current,'legalBusinessName',legal_business_name,'countryCode',country_code,'businessType',business_type,'vatId',vat_id_normalized,'verificationState',verification_state,'verificationSource',verification_source,'reviewReasonCode',review_reason_code,'verifiedAt',verified_at,'createdAt',created_at,'updatedAt',updated_at) order by version) from public.customer_business_identities where site_id=v.site_id),'[]'),
   'features',coalesce((select jsonb_agg(jsonb_build_object('key',feature_key,'enabled',enabled) order by feature_key) from public.site_features where site_id=v.site_id),'[]'),
   'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'customerName',customer_name,'phone',phone,'email',email,'serviceTitle',service_title,'preferredDate',preferred_date,'preferredTime',preferred_time,'note',note,'customerMessage',customer_message,'status',status,'createdAt',created_at,'updatedAt',updated_at) order by created_at,id) from public.site_appointments where site_id=v.site_id),'[]'),
   'media',jsonb_build_object('business',coalesce((select jsonb_agg(jsonb_build_object('id',id,'slot',slot,'url',url,'altText',alt_text,'sortOrder',sort_order,'createdAt',created_at) order by sort_order,id) from public.site_media where site_id=v.site_id),'[]'),'databaseFiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'filename',filename,'contentType',content_type,'byteSize',octet_length(data),'dataBase64',encode(data,'base64'),'createdAt',created_at) order by id) from public.site_media_blobs where site_id=v.site_id),'[]'),'editorial',coalesce((select jsonb_agg(jsonb_build_object('id',id,'storageProvider',storage_provider,'storageAccess',storage_access,'mimeType',mime_type,'altText',alt_text,'width',width,'height',height,'byteSize',byte_size,'createdAt',created_at,'providerCopyStatus',case when storage_provider='postgres' then 'database_copy_included' else 'external_unavailable' end) order by id) from public.site_media_assets where site_id=v.site_id),'[]')),
   'editorial',jsonb_build_object('settings',(select to_jsonb(x) from (select publication_name,tagline,subcategory,locale,theme_key,navigation,settings_version,created_at,updated_at from public.site_editorial_settings where site_id=v.site_id)x),'categories',coalesce((select jsonb_agg(to_jsonb(x) order by sort_order,id) from (select id,name,slug,description,sort_order,created_at,updated_at from public.site_article_categories where site_id=v.site_id)x),'[]'),'articles',coalesce((select jsonb_agg(to_jsonb(x) order by created_at,id) from (select id,category_id,slug,title,excerpt,body,featured_image_alt,tags,display_author,status,featured,publish_at,published_at,seo_title,seo_description,canonical_url,lock_version,created_at,updated_at from public.site_articles where site_id=v.site_id limit 10000)x),'[]')),
   'domains',(select jsonb_build_object('customDomain',custom_domain,'status',custom_domain_status,'checkedAt',custom_domain_checked_at) from public.sites where id=v.site_id),
   'integrations',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'status',status,'lastSyncedAt',last_synced_at,'lastErrorCode',last_error_code,'inboundEnabled',inbound_enabled,'inboundPermissions',inbound_permissions,'createdAt',created_at,'updatedAt',updated_at) order by provider) from public.site_external_integrations where site_id=v.site_id),'[]'),
   'subscription',(select jsonb_build_object('planKey',plan_key,'status',status,'currentPeriodEnd',current_period_end,'cancelAtPeriodEnd',cancel_at_period_end,'cancelledAt',cancelled_at,'billingProvider',billing_provider,'contractAcceptanceState',contract_acceptance_state,'createdAt',created_at,'updatedAt',updated_at) from public.site_subscriptions where site_id=v.site_id),
   'contractAcceptances',coalesce((select jsonb_agg(jsonb_build_object('id',id,'termsDocumentKey',terms_document_key,'termsVersion',terms_version,'termsContentHash',terms_content_hash,'privacyDocumentKey',privacy_document_key,'privacyVersion',privacy_version,'privacyContentHash',privacy_content_hash,'planKey',plan_key,'billingProvider',billing_provider,'currency',currency,'taxDisplayMode',tax_display_mode,'acceptedAt',accepted_at,'locale',locale,'source',source) order by accepted_at,id) from public.contract_acceptances where site_id=v.site_id),'[]'),
   'aiRuns',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actorType',actor_type,'operation',operation,'provider',provider,'model',model,'status',status,'usage',usage,'error',case when error is null then null else 'controlled_failure' end,'createdAt',created_at,'completedAt',completed_at,'appliedAt',applied_at) order by created_at,id) from public.ai_runs where site_id=v.site_id and created_at>=statement_timestamp()-interval '90 days' limit 10000),'[]'),
   'usage',jsonb_build_object('counters',coalesce((select jsonb_agg(jsonb_build_object('metric',metric,'windowType',window_type,'windowStart',window_start,'quantity',quantity,'updatedAt',updated_at)) from public.tenant_usage_counters where site_id=v.site_id),'[]'),'states',coalesce((select jsonb_agg(jsonb_build_object('state',state,'reasonCode',reason_code,'stateUntil',state_until,'updatedAt',updated_at)) from public.tenant_usage_states where site_id=v.site_id),'[]'),'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'metric',metric,'decision',decision,'reasonCode',reason_code,'windowType',window_type,'quantity',quantity,'limitValue',limit_value,'createdAt',created_at) order by created_at,id) from public.tenant_usage_events where site_id=v.site_id limit 10000),'[]')),
   'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'createdAt',created_at) order by created_at,id) from public.site_content_audit_events where site_id=v.site_id limit 10000),'[]')) into v_data;
 else
  select jsonb_build_object('schemaVersion',1,'jobId',v.id,'subjectKind',v.subject_kind,'subjectReference',v.subject_reference,'dbSnapshotAt',statement_timestamp(),'policyVersion',v_policy.version,'policyHash',v_policy.manifest_hash,
   'owner',(select jsonb_build_object('id',id,'email',email,'status',status,'role',role,'mfaEnrolled',mfa_enrolled_at is not null,'mfaEnrolledAt',mfa_enrolled_at,'passwordChangedAt',password_changed_at,'createdAt',created_at,'updatedAt',updated_at) from public.owner_accounts where id=v.owner_account_id),
   'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'mfaCompletedAt',mfa_completed_at,'expiresAt',expires_at,'lastUsedAt',last_used_at,'revokedAt',revoked_at,'createdAt',created_at) order by created_at,id) from public.owner_sessions where owner_id=v.owner_account_id),'[]'),
   'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'direction',case when created_by=v.owner_account_id then 'sent' else 'received' end,'role',role,'expiresAt',expires_at,'acceptedAt',accepted_at,'revokedAt',revoked_at,'deliveryStatus',delivery_status,'createdAt',created_at,'updatedAt',updated_at) order by created_at,id) from public.owner_invitations where created_by=v.owner_account_id or lower(email)=(select lower(email) from public.owner_accounts where id=v.owner_account_id)),'[]'),
   'authAudit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'outcome',outcome,'source',source,'createdAt',created_at,'targetIsSelf',target_owner_id=v.owner_account_id) order by created_at,id) from public.owner_auth_audit_events where owner_id=v.owner_account_id or target_owner_id=v.owner_account_id limit 10000),'[]'),
   'legalActions',jsonb_build_object('configReviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version,'status',status,'reviewedAt',reviewed_at,'effectiveFrom',effective_from,'createdAt',created_at)) from public.platform_legal_config_versions where reviewed_by=v.owner_account_id or created_by=v.owner_account_id),'[]'),'documentReviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'documentKey',document_key,'locale',locale,'version',version,'status',status,'effectiveFrom',effective_from,'reviewedAt',reviewed_at,'createdAt',created_at)) from public.platform_legal_document_versions where reviewed_by=v.owner_account_id or created_by=v.owner_account_id),'[]')),
   'privacyReceipts',coalesce((select jsonb_agg(jsonb_build_object('jobId',id,'kind',kind,'status',status,'requestedAt',requested_at,'completedAt',completed_at,'errorCode',error_code) order by created_at,id) from public.privacy_jobs where owner_account_id=v.owner_account_id or requested_actor_reference=v.owner_account_id),'[]')) into v_data;
 end if;
 update public.privacy_jobs set status='running',lease_expires_at=statement_timestamp()+interval '5 minutes',updated_at=statement_timestamp() where id=v.id;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),v.id,'state_changed','system','planning','running','{}',v.correlation_id);
 return v_data;
end $$;

create or replace function public.privacy_system_complete_export(p_job uuid,p_worker text,p_artifact uuid,p_adapter text,p_object_key text,p_key_version text,p_cipher_checksum text,p_plain_checksum text,p_archive_bytes bigint,p_encrypted_bytes bigint,p_file_count integer)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_expires timestamptz:=transaction_timestamp()+interval '24 hours'; begin select * into v from public.privacy_jobs where id=p_job and kind='export' and status='running' and worker_reference=p_worker and lease_expires_at>statement_timestamp() for update; if v.id is null then return false; end if;
 insert into public.privacy_export_artifacts(id,job_id,subject_kind,subject_reference,storage_adapter,object_key,encryption_algorithm,key_version,ciphertext_checksum,plaintext_checksum,archive_bytes,encrypted_bytes,file_count,schema_version,status,expires_at)
 values(p_artifact,p_job,v.subject_kind,v.subject_reference,p_adapter,p_object_key,'AES-256-GCM',p_key_version,p_cipher_checksum,p_plain_checksum,p_archive_bytes,p_encrypted_bytes,p_file_count,1,'ready',v_expires);
 update public.privacy_jobs set status='completed',completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,error_code=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,'artifact_created','system','running','completed',jsonb_build_object('artifactId',p_artifact,'archiveBytes',p_archive_bytes,'fileCount',p_file_count,'expiresAt',v_expires),v.correlation_id);
 return true;
exception when unique_violation or check_violation then return false; end $$;

create or replace function public.privacy_system_fail_export(p_job uuid,p_worker text,p_error text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_next text; begin select * into v from public.privacy_jobs where id=p_job and kind='export' and status in('planning','running') and worker_reference=p_worker for update; if v.id is null or p_error not in('export_limit_exceeded','artifact_store_failed','archive_failed','encryption_failed','policy_unavailable','controlled_failure') then return false; end if;
 v_next:=case when v.attempts>=v.max_attempts or p_error in('export_limit_exceeded','policy_unavailable') then 'failed' else 'retry_wait' end;
 update public.privacy_jobs set status=v_next,error_code=p_error,next_attempt_at=case when v_next='retry_wait' then statement_timestamp()+make_interval(secs=>least(3600,30*(2^v.attempts))) end,completed_at=case when v_next='failed' then statement_timestamp() end,lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,case when v_next='failed' then 'job_failed' else 'retry_scheduled' end,'system',v.status,v_next,jsonb_build_object('reasonCode',p_error,'attempt',v.attempts,'maxAttempts',v.max_attempts),v.correlation_id); return true;
end $$;

create or replace function public.site_admin_issue_export_capability(p_session_hash text,p_password_hash text,p_job uuid,p_token_hash text,p_correlation text)
returns table(ok boolean,reason text,artifact_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_artifact uuid; begin select r.account_id,r.site_id,a.password_hash into v from public.site_admin_resolve_session(p_session_hash)r join public.site_admin_accounts a on a.id=r.account_id;
 if v.account_id is null or v.password_hash<>p_password_hash or p_token_hash!~'^[a-f0-9]{64}$' then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 select a.id into v_artifact from public.privacy_export_artifacts a join public.privacy_jobs j on j.id=a.job_id where j.id=p_job and j.site_admin_account_id=v.account_id and j.site_id=v.site_id and a.status='ready' and a.expires_at>statement_timestamp();
 if v_artifact is null then return query select false,'unavailable'::text,null::uuid; return; end if;
 update public.privacy_export_download_capabilities c set revoked_at=statement_timestamp() where c.artifact_id=v_artifact and c.actor_kind='site_admin' and c.site_admin_account_id=v.account_id and c.consumed_at is null and c.revoked_at is null;
 insert into public.privacy_export_download_capabilities(id,artifact_id,job_id,token_hash,actor_kind,site_id,site_admin_account_id,expires_at,correlation_id) values(gen_random_uuid(),v_artifact,p_job,p_token_hash,'site_admin',v.site_id,v.account_id,transaction_timestamp()+interval '10 minutes',p_correlation);
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details,correlation_id) values(gen_random_uuid(),p_job,'capability_issued','site_admin',v.account_id,jsonb_build_object('artifactId',v_artifact),p_correlation); return query select true,null::text,v_artifact;
end $$;

create or replace function public.owner_issue_self_export_capability(p_session_hash text,p_password_hash text,p_totp_step bigint,p_job uuid,p_token_hash text,p_correlation text)
returns table(ok boolean,reason text,artifact_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_artifact uuid; begin v_actor:=public.owner_export_fresh_actor(p_session_hash,p_password_hash,p_totp_step); if v_actor is null or p_token_hash!~'^[a-f0-9]{64}$' then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 select a.id into v_artifact from public.privacy_export_artifacts a join public.privacy_jobs j on j.id=a.job_id where j.id=p_job and j.owner_account_id=v_actor and a.status='ready' and a.expires_at>statement_timestamp(); if v_artifact is null then return query select false,'unavailable'::text,null::uuid; return; end if;
 update public.privacy_export_download_capabilities c set revoked_at=statement_timestamp() where c.artifact_id=v_artifact and c.actor_kind='owner' and c.owner_account_id=v_actor and c.consumed_at is null and c.revoked_at is null;
 insert into public.privacy_export_download_capabilities(id,artifact_id,job_id,token_hash,actor_kind,owner_account_id,expires_at,correlation_id) values(gen_random_uuid(),v_artifact,p_job,p_token_hash,'owner',v_actor,transaction_timestamp()+interval '10 minutes',p_correlation);
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details,correlation_id) values(gen_random_uuid(),p_job,'capability_issued','owner',v_actor,jsonb_build_object('artifactId',v_artifact),p_correlation); return query select true,null::text,v_artifact;
end $$;

create or replace function public.site_admin_consume_export_capability(p_session_hash text,p_token_hash text)
returns table(job_id uuid,object_key text,key_version text,ciphertext_checksum text,plaintext_checksum text,archive_bytes bigint,encrypted_bytes bigint) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; w record; begin select * into v from public.site_admin_resolve_session(p_session_hash); if v.account_id is null then return; end if;
 update public.privacy_export_download_capabilities c set consumed_at=statement_timestamp() from public.privacy_export_artifacts a where c.artifact_id=a.id and c.token_hash=p_token_hash and c.actor_kind='site_admin' and c.site_id=v.site_id and c.site_admin_account_id=v.account_id and c.consumed_at is null and c.revoked_at is null and c.expires_at>statement_timestamp() and a.status='ready' and a.expires_at>statement_timestamp() returning a.job_id,a.object_key,a.key_version,a.ciphertext_checksum,a.plaintext_checksum,a.archive_bytes,a.encrypted_bytes into w;
 if w.job_id is null then return; end if;
 return query select w.job_id,w.object_key,w.key_version,w.ciphertext_checksum,w.plaintext_checksum,w.archive_bytes,w.encrypted_bytes;
end $$;

create or replace function public.owner_consume_self_export_capability(p_session_hash text,p_token_hash text)
returns table(job_id uuid,object_key text,key_version text,ciphertext_checksum text,plaintext_checksum text,archive_bytes bigint,encrypted_bytes bigint) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; w record; begin select * into v from public.owner_auth_resolve_session(p_session_hash,null); if v.owner_id is null then return; end if;
 update public.privacy_export_download_capabilities c set consumed_at=statement_timestamp() from public.privacy_export_artifacts a where c.artifact_id=a.id and c.token_hash=p_token_hash and c.actor_kind='owner' and c.owner_account_id=v.owner_id and c.consumed_at is null and c.revoked_at is null and c.expires_at>statement_timestamp() and a.status='ready' and a.expires_at>statement_timestamp() returning a.job_id,a.object_key,a.key_version,a.ciphertext_checksum,a.plaintext_checksum,a.archive_bytes,a.encrypted_bytes into w;
 if w.job_id is null then return; end if;
 return query select w.job_id,w.object_key,w.key_version,w.ciphertext_checksum,w.plaintext_checksum,w.archive_bytes,w.encrypted_bytes;
end $$;

create or replace function public.site_admin_record_export_download(p_session_hash text,p_job uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin select * into v from public.site_admin_resolve_session(p_session_hash); if v.account_id is null or not exists(select 1 from public.privacy_jobs j join public.privacy_export_artifacts a on a.job_id=j.id join public.privacy_export_download_capabilities c on c.artifact_id=a.id where j.id=p_job and j.site_admin_account_id=v.account_id and j.site_id=v.site_id and c.consumed_at is not null) then return false; end if; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details) values(gen_random_uuid(),p_job,case when p_success then 'download_completed' else 'download_denied' end,'site_admin',v.account_id,case when p_success then '{}' else jsonb_build_object('reasonCode','controlled_failure') end);return true;end $$;
create or replace function public.owner_record_self_export_download(p_session_hash text,p_job uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; begin select * into v from public.owner_auth_resolve_session(p_session_hash,null); if v.owner_id is null or not exists(select 1 from public.privacy_jobs j join public.privacy_export_artifacts a on a.job_id=j.id join public.privacy_export_download_capabilities c on c.artifact_id=a.id where j.id=p_job and j.owner_account_id=v.owner_id and c.consumed_at is not null) then return false; end if; insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details) values(gen_random_uuid(),p_job,case when p_success then 'download_completed' else 'download_denied' end,'owner',v.owner_id,case when p_success then '{}' else jsonb_build_object('reasonCode','controlled_failure') end);return true;end $$;

create or replace function public.privacy_system_expired_artifacts(p_limit integer default 25)
returns table(id uuid,object_key text) language sql security definer set search_path=pg_catalog as $$
 select id,object_key from public.privacy_export_artifacts where status in('ready','delete_retry') and expires_at<=statement_timestamp() order by expires_at for update skip locked limit least(greatest(p_limit,1),100)
$$;
create or replace function public.privacy_system_mark_artifact_deleted(p_id uuid,p_deleted boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin update public.privacy_export_artifacts set status=case when p_deleted then 'deleted' else 'delete_retry' end,deleted_at=case when p_deleted then statement_timestamp() end,failure_code=case when p_deleted then null else 'store_delete_failed' end,delete_attempts=delete_attempts+1,updated_at=statement_timestamp() where id=p_id and status in('ready','delete_retry'); return found; end $$;

alter table public.privacy_export_artifacts enable row level security;
alter table public.privacy_export_artifacts force row level security;
alter table public.privacy_export_download_capabilities enable row level security;
alter table public.privacy_export_download_capabilities force row level security;
revoke all on table public.privacy_export_artifacts,public.privacy_export_download_capabilities from public;
revoke all on all functions in schema public from public;

create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=63 and count(*) filter(where c.relrowsecurity)=60 and count(*) filter(where c.relforcerowsecurity)=60 and count(distinct c.relowner)=1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p'))
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('public',p.oid,'execute'))
  and (select count(distinct p.proowner)=4 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prosecdef and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;
