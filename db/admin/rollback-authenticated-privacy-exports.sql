-- Non-destructive Task Group 4-B2 application rollback.
-- First set PRIVACY_EXPORT_ENABLED=false and stop the scheduler.
revoke execute on function public.site_admin_request_privacy_export(text,text,text),public.site_admin_privacy_export_status(text),public.site_admin_issue_export_capability(text,text,uuid,text,text),public.site_admin_consume_export_capability(text,text) from bsrc_runtime;
revoke execute on function public.owner_request_self_privacy_export(text,text,bigint,text),public.owner_self_privacy_export_status(text),public.owner_issue_self_export_capability(text,text,bigint,uuid,text,text),public.owner_consume_self_export_capability(text,text) from bsrc_owner_ops;
revoke execute on function public.privacy_system_claim_export(text,integer),public.privacy_system_export_snapshot(uuid,text),public.privacy_system_complete_export(uuid,text,uuid,text,text,text,text,text,bigint,bigint,integer),public.privacy_system_fail_export(uuid,text,text),public.privacy_system_expired_artifacts(integer),public.privacy_system_mark_artifact_deleted(uuid,boolean) from bsrc_system;
-- Keep tables, FORCE RLS, jobs, events, artifacts and capabilities as evidence.
-- Delete only explicitly identified local/test objects through the configured
-- private store. Never delete customer source rows. NO FORCE is not required;
-- if an older application cannot tolerate these tables, change only the two
-- B2 table flags under a separately approved migrator runbook.
