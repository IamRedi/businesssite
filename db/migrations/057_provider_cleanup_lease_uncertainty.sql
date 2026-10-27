-- Task Group 4-B5C: permit the guarded reconciliation state machine to retain
-- uncertainty when a reconciliation lease itself expires.

create or replace function public.privacy_provider_cleanup_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if old.status in('completed','already_absent','detached','retained_by_policy','permanent_failure','manual_review_required','unsupported','canceled') and new is distinct from old then raise exception 'privacy_provider_cleanup_terminal'; end if;
 if row(new.id,new.job_id,new.provider,new.source_kind,new.reference_hash,new.created_at) is distinct from row(old.id,old.job_id,old.provider,old.source_kind,old.reference_hash,old.created_at) then raise exception 'privacy_provider_cleanup_identity_immutable'; end if;
 if new.status<>old.status and not ((old.status='pending' and new.status in('running','retained_by_policy','manual_review_required','unsupported','canceled') or (old.status='pending' and new.status='completed' and not new.required)) or (old.status='running' and new.status in('completed','already_absent','detached','retained_by_policy','blocked','retry_wait','uncertain','permanent_failure','manual_review_required')) or (old.status='retry_wait' and new.status in('running','reconciling','manual_review_required','canceled')) or (old.status='uncertain' and new.status in('reconciling','manual_review_required')) or (old.status='reconciling' and new.status in('completed','already_absent','detached','retained_by_policy','blocked','retry_wait','uncertain','permanent_failure','manual_review_required'))) then raise exception 'privacy_provider_cleanup_transition_denied'; end if;
 if new.attempts<old.attempts or new.attempts>old.attempts+1 then raise exception 'privacy_provider_cleanup_attempt_invalid'; end if;
 return new;
end $$;
