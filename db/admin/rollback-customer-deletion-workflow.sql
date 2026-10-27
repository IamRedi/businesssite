-- Non-destructive Task Group 4-B3 pause. Set both application flags false
-- before running. Evidence, source data, migration history, RLS and FORCE stay intact.
begin;
revoke execute on function site_admin_request_customer_deletion(text,text,text,text,boolean,text) from bsrc_runtime;
revoke execute on function site_admin_customer_deletion_status(text) from bsrc_runtime;
revoke execute on function site_admin_cancel_customer_deletion(text,text,uuid,text) from bsrc_runtime;
revoke execute on function owner_review_customer_deletion(text,text,bigint,uuid,text,text,text) from bsrc_owner_ops;
revoke execute on function privacy_system_claim_deletion_plan(text,integer) from bsrc_system;
revoke execute on function privacy_system_plan_customer_deletion(uuid,text) from bsrc_system;
revoke execute on function privacy_system_record_deletion_legal_review(uuid,text) from bsrc_system;
revoke execute on function privacy_system_claim_deletion_provider_item(text,integer) from bsrc_system;
revoke execute on function privacy_system_finish_deletion_provider_item(uuid,text,boolean,text) from bsrc_system;
revoke execute on function privacy_system_claim_deletion_execution(text,integer) from bsrc_system;
revoke execute on function privacy_system_execute_customer_deletion(uuid,text) from bsrc_system;
revoke execute on function privacy_system_fail_customer_deletion(uuid,text,text) from bsrc_system;
revoke execute on function privacy_system_recover_customer_deletions() from bsrc_system;
commit;
