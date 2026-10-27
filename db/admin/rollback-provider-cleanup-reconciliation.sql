-- B4 operational rollback: first disable all PRIVACY_PROVIDER_* worker flags and stop schedulers.
-- This preserves jobs, bindings, evidence, and legal-retention records; it never calls a provider.
begin;
update public.privacy_provider_cleanup_items
set status='retry_wait', failure_code='rollback_paused', result_code='retryable_failure',
    next_attempt_at=statement_timestamp()+interval '24 hours', lease_expires_at=null,
    worker_reference=null, updated_at=statement_timestamp()
where status in ('running','reconciling');
revoke execute on function public.privacy_system_claim_provider_cleanup_work(text,integer) from bsrc_system_executor;
revoke execute on function public.privacy_system_record_provider_cleanup_result(uuid,text,text,text,text,integer) from bsrc_system_executor;
commit;

-- Re-enable only through the normal role-provisioning and staging-acceptance process.
