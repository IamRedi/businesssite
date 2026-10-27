-- Non-destructive Task Group 4-B1 application rollback.
-- First disable the privacy scheduler and set
-- PRIVACY_RETENTION_EXECUTION_ENABLED=false in every deployment. This script
-- preserves policies, rules, jobs, items, events, holds and migration history.

revoke execute on function owner_privacy_snapshot(text) from bsrc_owner_ops;
revoke execute on function owner_privacy_job_items(text,uuid) from bsrc_owner_ops;
revoke execute on function owner_privacy_start_dry_run(text,text,bigint,text,text,text) from bsrc_owner_ops;
revoke execute on function owner_privacy_create_hold(text,text,bigint,text,text,text[],text,text,timestamp with time zone,text) from bsrc_owner_ops;
revoke execute on function owner_privacy_release_hold(text,text,bigint,uuid,text) from bsrc_owner_ops;
revoke execute on function owner_privacy_clone_policy(text,text,bigint,integer,text) from bsrc_owner_ops;
revoke execute on function owner_privacy_activate_policy(text,text,bigint,uuid,text) from bsrc_owner_ops;
revoke execute on function owner_privacy_control_job(text,text,bigint,uuid,text,text) from bsrc_owner_ops;
revoke execute on function privacy_system_enqueue_retention_scan(text,text,text) from bsrc_system;
revoke execute on function privacy_system_claim_retention_job(text,integer) from bsrc_system;
revoke execute on function privacy_system_plan_retention_job(uuid,text) from bsrc_system;
revoke execute on function privacy_system_transition_retention_job(uuid,text,text,text) from bsrc_system;
revoke execute on function privacy_system_recover_stuck_jobs() from bsrc_system;

alter table privacy_policy_versions no force row level security;
alter table privacy_retention_rules no force row level security;
alter table privacy_jobs no force row level security;
alter table privacy_job_items no force row level security;
alter table privacy_job_events no force row level security;
alter table privacy_legal_holds no force row level security;

-- Do not disable or alter Task Group 3 RLS/FORCE protections. Do not drop any
-- B1 table, function, trigger, policy, row or migration-ledger entry. Active
-- jobs remain paused and visible for a compatible re-deployment/reprovision.
