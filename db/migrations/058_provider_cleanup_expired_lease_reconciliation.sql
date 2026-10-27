-- migrate-as-owner-of: public.privacy_system_recover_customer_deletions()
-- Task Group 4-B5C: a provider operation whose lease expires has an unknown
-- external outcome. Force reconciliation instead of replaying the destructive
-- operation as an ordinary retry.

create or replace function public.privacy_system_recover_customer_deletions()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 for v in select i.id from public.privacy_provider_cleanup_items i where i.status in('running','reconciling') and i.lease_expires_at<=statement_timestamp() for update skip locked loop
   update public.privacy_provider_cleanup_items i set status='uncertain',failure_code='provider_uncertain',result_code='uncertain',next_attempt_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp() where i.id=v.id;
   v_count:=v_count+1;
 end loop;
 for v in select w.job_id,j.worker_reference from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.phase='executing' and j.status='running' and j.lease_expires_at<=statement_timestamp() for update of w,j skip locked loop
   if public.privacy_system_fail_customer_deletion(v.job_id,v.worker_reference,'lease_expired') then v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;

revoke all on function public.privacy_system_recover_customer_deletions() from public;
