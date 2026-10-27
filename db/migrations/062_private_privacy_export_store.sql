-- Task Group 4-B6C: bind privacy exports to an exact private provider store,
-- environment and object. A durable reservation closes the provider-write / DB
-- persistence ambiguity window. Legacy artifacts without authority fail closed.
-- migrate-as-migrator

alter table public.privacy_export_artifacts
  add column if not exists provider text;
alter table public.privacy_export_artifacts
  add column if not exists store_authority text;
alter table public.privacy_export_artifacts
  add column if not exists environment_identity text;

alter table public.privacy_export_artifacts
  drop constraint if exists privacy_export_artifacts_provider_check;
alter table public.privacy_export_artifacts
  add constraint privacy_export_artifacts_provider_check
  check (provider is null or provider in ('memory_test','vercel_blob'));
alter table public.privacy_export_artifacts
  drop constraint if exists privacy_export_artifacts_store_authority_check;
alter table public.privacy_export_artifacts
  add constraint privacy_export_artifacts_store_authority_check
  check (store_authority is null or store_authority='memory_test' or store_authority~'^store_[A-Za-z0-9]{16}$');
alter table public.privacy_export_artifacts
  drop constraint if exists privacy_export_artifacts_environment_identity_check;
alter table public.privacy_export_artifacts
  add constraint privacy_export_artifacts_environment_identity_check
  check (environment_identity is null or environment_identity~'^[a-z0-9][a-z0-9-]{0,39}$');

alter table public.privacy_export_artifacts
  drop constraint if exists privacy_export_artifacts_object_key_check;
alter table public.privacy_export_artifacts
  add constraint privacy_export_artifacts_object_key_check check (
    object_key~'^privacy-exports/[a-f0-9]{2}/[a-f0-9-]{36}\.enc$'
    or object_key~'^privacy-exports/[a-z0-9][a-z0-9-]{0,39}/[a-f0-9]{4}/[a-f0-9-]{36}\.enc$'
  );
alter table public.privacy_export_artifacts
  drop constraint if exists privacy_export_artifacts_status_check;
alter table public.privacy_export_artifacts
  add constraint privacy_export_artifacts_status_check
  check (status in ('uploading','ready','delete_retry','deleted'));

alter table public.privacy_jobs drop constraint privacy_jobs_error_code_check;
alter table public.privacy_jobs add constraint privacy_jobs_error_code_check check (error_code is null or error_code in
 ('invalid_subject','policy_unavailable','legal_hold','manual_review','active_subscription','attempt_limit','item_failed','lease_expired','execution_disabled','controlled_failure','export_limit_exceeded','artifact_store_failed','artifact_persistence_uncertain','archive_failed','encryption_failed','recovery_window','cooling_period','provider_cleanup','provider_binding_invalid','policy_mismatch'));
alter table public.privacy_job_events drop constraint privacy_job_events_event_type_check;
alter table public.privacy_job_events add constraint privacy_job_events_event_type_check check (event_type in
 ('job_requested','planning_started','plan_created','job_claimed','state_changed','job_blocked','retry_scheduled','job_failed','job_completed','job_canceled','hold_detected','artifact_reserved','artifact_created','capability_issued','download_completed','download_denied','artifact_deleted','eligibility_result','cooling_started','cooling_completed','deletion_approved','deletion_rejected','execution_started','disposition_completed','provider_cleanup_blocked','provider_cleanup_completed'));

create or replace function public.privacy_export_artifact_binding_valid(
  p_artifact public.privacy_export_artifacts
) returns boolean language sql immutable set search_path=pg_catalog as $$
 select p_artifact.provider is not null
   and p_artifact.store_authority is not null
   and p_artifact.environment_identity is not null
   and ((p_artifact.storage_adapter='memory_test' and p_artifact.provider='memory_test' and p_artifact.store_authority='memory_test')
     or (p_artifact.storage_adapter='vercel_blob_private' and p_artifact.provider='vercel_blob' and p_artifact.store_authority~'^store_[A-Za-z0-9]{16}$'))
   and p_artifact.object_key~('^privacy-exports/'||p_artifact.environment_identity||'/[a-f0-9]{4}/'||p_artifact.id::text||'\.enc$')
$$;

revoke all on function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) from public;

-- migrate-as-owner-of: public.privacy_export_artifact_guard()
create or replace function public.privacy_export_artifact_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status='deleted' then raise exception 'privacy_export_artifact_terminal'; end if;
 if row(old.id,old.job_id,old.subject_kind,old.subject_reference,old.storage_adapter,old.provider,old.store_authority,old.environment_identity,old.object_key,old.encryption_algorithm,old.key_version,old.ciphertext_checksum,old.plaintext_checksum,old.archive_bytes,old.encrypted_bytes,old.file_count,old.schema_version,old.created_at,old.expires_at)
  is distinct from row(new.id,new.job_id,new.subject_kind,new.subject_reference,new.storage_adapter,new.provider,new.store_authority,new.environment_identity,new.object_key,new.encryption_algorithm,new.key_version,new.ciphertext_checksum,new.plaintext_checksum,new.archive_bytes,new.encrypted_bytes,new.file_count,new.schema_version,new.created_at,new.expires_at) then raise exception 'privacy_export_artifact_identity_immutable'; end if;
 if new.status<>old.status and not ((old.status='uploading' and new.status in('ready','delete_retry','deleted'))
   or (old.status='ready' and new.status in('delete_retry','deleted'))
   or (old.status='delete_retry' and new.status in('delete_retry','deleted'))) then raise exception 'privacy_export_artifact_transition_denied'; end if;
 if (new.status='ready' and not public.privacy_export_artifact_binding_valid(new))
   or (new.status='deleted')<>(new.deleted_at is not null) then raise exception 'privacy_export_artifact_transition_denied'; end if;
 return new;
end $$;

-- migrate-as-migrator
drop trigger privacy_export_artifact_guard on public.privacy_export_artifacts;
create trigger privacy_export_artifact_guard before update on public.privacy_export_artifacts
for each row execute function public.privacy_export_artifact_guard();

-- migrate-as-owner-of: public.privacy_system_complete_export(uuid,text,uuid,text,text,text,text,text,bigint,bigint,integer)
create or replace function public.privacy_system_reserve_export(
  p_job uuid,p_worker text,p_artifact uuid,p_adapter text,p_provider text,
  p_store_authority text,p_environment_identity text,p_object_key text,
  p_key_version text,p_cipher_checksum text,p_plain_checksum text,
  p_archive_bytes bigint,p_encrypted_bytes bigint,p_file_count integer
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_expires timestamptz:=transaction_timestamp()+interval '24 hours';
begin
 select * into v from public.privacy_jobs where id=p_job and kind='export' and status='running'
   and worker_reference=p_worker and lease_expires_at>statement_timestamp() for update;
 if v.id is null or p_environment_identity!~'^[a-z0-9][a-z0-9-]{0,39}$'
   or p_object_key!~('^privacy-exports/'||p_environment_identity||'/[a-f0-9]{4}/'||p_artifact::text||'\.enc$')
   or not ((p_adapter='memory_test' and p_provider='memory_test' and p_store_authority='memory_test')
     or (p_adapter='vercel_blob_private' and p_provider='vercel_blob' and p_store_authority~'^store_[A-Za-z0-9]{16}$')) then return false; end if;
 insert into public.privacy_export_artifacts(
   id,job_id,subject_kind,subject_reference,storage_adapter,provider,store_authority,
   environment_identity,object_key,encryption_algorithm,key_version,ciphertext_checksum,
   plaintext_checksum,archive_bytes,encrypted_bytes,file_count,schema_version,status,expires_at
 ) values(
   p_artifact,p_job,v.subject_kind,v.subject_reference,p_adapter,p_provider,p_store_authority,
   p_environment_identity,p_object_key,'AES-256-GCM',p_key_version,p_cipher_checksum,
   p_plain_checksum,p_archive_bytes,p_encrypted_bytes,p_file_count,1,'uploading',v_expires
 );
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id)
 values(gen_random_uuid(),p_job,'artifact_reserved','system','running','running',jsonb_build_object('artifactId',p_artifact,'archiveBytes',p_archive_bytes,'fileCount',p_file_count,'expiresAt',v_expires),v.correlation_id);
 return true;
exception when unique_violation or check_violation then return false;
end $$;

create or replace function public.privacy_system_complete_export(
  p_job uuid,p_worker text,p_artifact uuid,p_adapter text,p_object_key text,
  p_key_version text,p_cipher_checksum text,p_plain_checksum text,
  p_archive_bytes bigint,p_encrypted_bytes bigint,p_file_count integer
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_artifact public.privacy_export_artifacts;
begin
 select * into v from public.privacy_jobs where id=p_job and kind='export' and status='running'
   and worker_reference=p_worker and lease_expires_at>statement_timestamp() for update;
 select * into v_artifact from public.privacy_export_artifacts where id=p_artifact and job_id=p_job for update;
 if v.id is null or v_artifact.id is null or v_artifact.status<>'uploading'
   or not public.privacy_export_artifact_binding_valid(v_artifact)
   or row(v_artifact.storage_adapter,v_artifact.object_key,v_artifact.key_version,v_artifact.ciphertext_checksum,v_artifact.plaintext_checksum,v_artifact.archive_bytes,v_artifact.encrypted_bytes,v_artifact.file_count)
      is distinct from row(p_adapter,p_object_key,p_key_version,p_cipher_checksum,p_plain_checksum,p_archive_bytes,p_encrypted_bytes,p_file_count) then return false; end if;
 update public.privacy_export_artifacts set status='ready',updated_at=statement_timestamp() where id=p_artifact;
 update public.privacy_jobs set status='completed',completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,error_code=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id)
 values(gen_random_uuid(),p_job,'artifact_created','system','running','completed',jsonb_build_object('artifactId',p_artifact,'archiveBytes',p_archive_bytes,'fileCount',p_file_count,'expiresAt',v_artifact.expires_at),v.correlation_id);
 return true;
end $$;

create or replace function public.privacy_system_fail_export(p_job uuid,p_worker text,p_error text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v public.privacy_jobs; v_next text; begin
 select * into v from public.privacy_jobs where id=p_job and kind='export' and status in('planning','running') and worker_reference=p_worker for update;
 if v.id is null or p_error not in('export_limit_exceeded','artifact_store_failed','artifact_persistence_uncertain','archive_failed','encryption_failed','policy_unavailable','controlled_failure') then return false; end if;
 v_next:=case when v.attempts>=v.max_attempts or p_error in('export_limit_exceeded','policy_unavailable') then 'failed' else 'retry_wait' end;
 update public.privacy_jobs set status=v_next,error_code=p_error,next_attempt_at=case when v_next='retry_wait' then statement_timestamp()+make_interval(secs=>least(3600,30*(2^v.attempts))) end,completed_at=case when v_next='failed' then statement_timestamp() end,lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where id=p_job;
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,previous_state,next_state,details,correlation_id) values(gen_random_uuid(),p_job,case when v_next='failed' then 'job_failed' else 'retry_scheduled' end,'system',v.status,v_next,jsonb_build_object('reasonCode',p_error,'attempt',v.attempts,'maxAttempts',v.max_attempts),v.correlation_id);
 return true;
end $$;

drop function public.privacy_system_expired_artifacts(integer);
create function public.privacy_system_expired_artifacts(p_limit integer default 25)
returns table(id uuid,job_id uuid,provider text,store_authority text,environment_identity text,object_key text)
language sql security definer set search_path=pg_catalog as $$
 select a.id,a.job_id,a.provider,a.store_authority,a.environment_identity,a.object_key
 from public.privacy_export_artifacts a join public.privacy_jobs j on j.id=a.job_id
 where (a.status='ready' and a.expires_at<=statement_timestamp())
    or a.status='delete_retry'
    or (a.status='uploading' and j.lease_expires_at<=statement_timestamp())
 order by case when a.status='delete_retry' then 0 when a.status='uploading' then 1 else 2 end,a.updated_at
 for update of a skip locked limit least(greatest(p_limit,1),100)
$$;

create or replace function public.privacy_system_mark_artifact_deleted(p_id uuid,p_deleted boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_job uuid; begin
 update public.privacy_export_artifacts set status=case when p_deleted then 'deleted' else 'delete_retry' end,
   deleted_at=case when p_deleted then statement_timestamp() end,
   failure_code=case when p_deleted then null else 'store_delete_failed' end,
   delete_attempts=least(delete_attempts+1,20),updated_at=statement_timestamp()
 where id=p_id and status in('uploading','ready','delete_retry') returning job_id into v_job;
 if found and p_deleted then
   insert into public.privacy_job_events(id,job_id,event_type,actor_kind,details)
   values(gen_random_uuid(),v_job,'artifact_deleted','system',jsonb_build_object('artifactId',p_id));
 end if;
 return found;
end $$;

create or replace function public.privacy_system_recover_stuck_exports()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_count integer:=0; begin
 with candidates as(
   select j.id,j.status,j.attempts,j.max_attempts from public.privacy_jobs j
   where j.kind='export' and j.status in('planning','running') and j.lease_expires_at<=statement_timestamp()
     and not exists(select 1 from public.privacy_export_artifacts a where a.job_id=j.id and a.status in('uploading','delete_retry','ready'))
   for update skip locked
 ), changed as(
   update public.privacy_jobs j set
     status=case when c.attempts>=c.max_attempts then 'failed' else 'retry_wait' end,
     error_code='lease_expired',
     next_attempt_at=case when c.attempts<c.max_attempts then statement_timestamp()+interval '30 seconds' end,
     completed_at=case when c.attempts>=c.max_attempts then statement_timestamp() end,
     lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp()
   from candidates c where j.id=c.id returning j.id
 ) select count(*) into v_count from changed;
 return v_count;
end $$;

revoke all on function public.privacy_system_reserve_export(uuid,text,uuid,text,text,text,text,text,text,text,text,bigint,bigint,integer) from public;
revoke all on function public.privacy_system_expired_artifacts(integer) from public;
revoke all on function public.privacy_system_recover_stuck_exports() from public;

-- migrate-as-owner-of: public.site_admin_issue_export_capability(text,text,uuid,text,text)
create or replace function public.site_admin_issue_export_capability(p_session_hash text,p_password_hash text,p_job uuid,p_token_hash text,p_correlation text)
returns table(ok boolean,reason text,artifact_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_artifact uuid; begin select r.account_id,r.site_id,a.password_hash into v from public.site_admin_resolve_session(p_session_hash)r join public.site_admin_accounts a on a.id=r.account_id;
 if v.account_id is null or v.password_hash<>p_password_hash or p_token_hash!~'^[a-f0-9]{64}$' then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 select a.id into v_artifact from public.privacy_export_artifacts a join public.privacy_jobs j on j.id=a.job_id where j.id=p_job and j.site_admin_account_id=v.account_id and j.site_id=v.site_id and a.status='ready' and a.expires_at>statement_timestamp() and public.privacy_export_artifact_binding_valid(a);
 if v_artifact is null then return query select false,'unavailable'::text,null::uuid; return; end if;
 update public.privacy_export_download_capabilities c set revoked_at=statement_timestamp() where c.artifact_id=v_artifact and c.actor_kind='site_admin' and c.site_admin_account_id=v.account_id and c.consumed_at is null and c.revoked_at is null;
 insert into public.privacy_export_download_capabilities(id,artifact_id,job_id,token_hash,actor_kind,site_id,site_admin_account_id,expires_at,correlation_id) values(gen_random_uuid(),v_artifact,p_job,p_token_hash,'site_admin',v.site_id,v.account_id,transaction_timestamp()+interval '10 minutes',p_correlation);
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details,correlation_id) values(gen_random_uuid(),p_job,'capability_issued','site_admin',v.account_id,jsonb_build_object('artifactId',v_artifact),p_correlation); return query select true,null::text,v_artifact;
end $$;

-- migrate-as-owner-of: public.owner_issue_self_export_capability(text,text,bigint,uuid,text,text)
create or replace function public.owner_issue_self_export_capability(p_session_hash text,p_password_hash text,p_totp_step bigint,p_job uuid,p_token_hash text,p_correlation text)
returns table(ok boolean,reason text,artifact_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_artifact uuid; begin v_actor:=public.owner_export_fresh_actor(p_session_hash,p_password_hash,p_totp_step); if v_actor is null or p_token_hash!~'^[a-f0-9]{64}$' then return query select false,'fresh_auth_denied'::text,null::uuid; return; end if;
 select a.id into v_artifact from public.privacy_export_artifacts a join public.privacy_jobs j on j.id=a.job_id where j.id=p_job and j.owner_account_id=v_actor and a.status='ready' and a.expires_at>statement_timestamp() and public.privacy_export_artifact_binding_valid(a); if v_artifact is null then return query select false,'unavailable'::text,null::uuid; return; end if;
 update public.privacy_export_download_capabilities c set revoked_at=statement_timestamp() where c.artifact_id=v_artifact and c.actor_kind='owner' and c.owner_account_id=v_actor and c.consumed_at is null and c.revoked_at is null;
 insert into public.privacy_export_download_capabilities(id,artifact_id,job_id,token_hash,actor_kind,owner_account_id,expires_at,correlation_id) values(gen_random_uuid(),v_artifact,p_job,p_token_hash,'owner',v_actor,transaction_timestamp()+interval '10 minutes',p_correlation);
 insert into public.privacy_job_events(id,job_id,event_type,actor_kind,actor_reference,details,correlation_id) values(gen_random_uuid(),p_job,'capability_issued','owner',v_actor,jsonb_build_object('artifactId',v_artifact),p_correlation); return query select true,null::text,v_artifact;
end $$;

-- migrate-as-owner-of: public.site_admin_consume_export_capability(text,text)
drop function public.site_admin_consume_export_capability(text,text);
create function public.site_admin_consume_export_capability(p_session_hash text,p_token_hash text)
returns table(artifact_id uuid,job_id uuid,provider text,store_authority text,environment_identity text,object_key text,key_version text,ciphertext_checksum text,plaintext_checksum text,archive_bytes bigint,encrypted_bytes bigint)
language plpgsql security definer set search_path=pg_catalog as $$
declare v record; w record; begin select * into v from public.site_admin_resolve_session(p_session_hash); if v.account_id is null then return; end if;
 update public.privacy_export_download_capabilities c set consumed_at=statement_timestamp() from public.privacy_export_artifacts a where c.artifact_id=a.id and c.token_hash=p_token_hash and c.actor_kind='site_admin' and c.site_id=v.site_id and c.site_admin_account_id=v.account_id and c.consumed_at is null and c.revoked_at is null and c.expires_at>statement_timestamp() and a.status='ready' and a.expires_at>statement_timestamp() and public.privacy_export_artifact_binding_valid(a) returning a.id,a.job_id,a.provider,a.store_authority,a.environment_identity,a.object_key,a.key_version,a.ciphertext_checksum,a.plaintext_checksum,a.archive_bytes,a.encrypted_bytes into w;
 if w.job_id is null then return; end if;
 return query select w.id,w.job_id,w.provider,w.store_authority,w.environment_identity,w.object_key,w.key_version,w.ciphertext_checksum,w.plaintext_checksum,w.archive_bytes,w.encrypted_bytes;
end $$;

-- migrate-as-owner-of: public.owner_consume_self_export_capability(text,text)
drop function public.owner_consume_self_export_capability(text,text);
create function public.owner_consume_self_export_capability(p_session_hash text,p_token_hash text)
returns table(artifact_id uuid,job_id uuid,provider text,store_authority text,environment_identity text,object_key text,key_version text,ciphertext_checksum text,plaintext_checksum text,archive_bytes bigint,encrypted_bytes bigint)
language plpgsql security definer set search_path=pg_catalog as $$
declare v record; w record; begin select * into v from public.owner_auth_resolve_session(p_session_hash,null); if v.owner_id is null then return; end if;
 update public.privacy_export_download_capabilities c set consumed_at=statement_timestamp() from public.privacy_export_artifacts a where c.artifact_id=a.id and c.token_hash=p_token_hash and c.actor_kind='owner' and c.owner_account_id=v.owner_id and c.consumed_at is null and c.revoked_at is null and c.expires_at>statement_timestamp() and a.status='ready' and a.expires_at>statement_timestamp() and public.privacy_export_artifact_binding_valid(a) returning a.id,a.job_id,a.provider,a.store_authority,a.environment_identity,a.object_key,a.key_version,a.ciphertext_checksum,a.plaintext_checksum,a.archive_bytes,a.encrypted_bytes into w;
 if w.job_id is null then return; end if;
 return query select w.id,w.job_id,w.provider,w.store_authority,w.environment_identity,w.object_key,w.key_version,w.ciphertext_checksum,w.plaintext_checksum,w.archive_bytes,w.encrypted_bytes;
end $$;
