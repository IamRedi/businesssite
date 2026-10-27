-- Non-destructive B6A rollback. Disable MONITORING_STAGING_SCHEDULER_ENABLED
-- and stop the external monitors before running this as an authorized owner.
-- The aggregate heartbeat row, migrations, RLS/FORCE and evidence are preserved.
revoke execute on function public.monitoring_system_begin(text) from bsrc_system;
revoke execute on function public.monitoring_system_complete(uuid,text,integer,boolean) from bsrc_system;
revoke execute on function public.monitoring_system_heartbeat(integer,integer) from bsrc_system;
