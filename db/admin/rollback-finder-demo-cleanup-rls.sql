-- Emergency B3C3 rollback. First switch Finder/demo/trial/preview/rate-limit
-- application paths to compatibility/off and disable the cleanup scheduler.
-- This script preserves every row, routine, index and migration ledger entry.
begin;

revoke execute on function public.consume_api_rate_limit(text,text,integer,integer) from bsrc_runtime;
revoke execute on function public.public_trial_create(jsonb,text,text,text,timestamp with time zone,integer,integer) from bsrc_runtime;
revoke execute on function public.site_admin_preview_issue(text,boolean) from bsrc_runtime;
revoke execute on function public.cleanup_expired_demo_batch(text,integer) from bsrc_system;

revoke execute on function public.owner_finder_list_leads(text,integer,integer) from bsrc_owner_ops;
revoke execute on function public.owner_finder_get_lead(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_list_workspace(text,integer,integer) from bsrc_owner_ops;
revoke execute on function public.owner_finder_create_search(text,jsonb,text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_complete_search(text,uuid,jsonb,boolean) from bsrc_owner_ops;
revoke execute on function public.owner_finder_fail_search(text,uuid) from bsrc_owner_ops;
revoke execute on function public.owner_finder_list_searches(text,integer) from bsrc_owner_ops;
revoke execute on function public.owner_finder_get_cache(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_save_cache(text,text,jsonb) from bsrc_owner_ops;
revoke execute on function public.owner_finder_upsert_lead(text,jsonb,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_add_pipeline(text,text,text,text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_list_pipeline(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_create_profile(text,text,jsonb,text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_list_profiles(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_append_audit(text,text,text,text,jsonb,text) from bsrc_owner_ops;
revoke execute on function public.owner_finder_list_audit(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_create(text,text,jsonb,integer,integer,text) from bsrc_owner_ops;
revoke execute on function public.owner_preview_issue(text,text,boolean,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_site_by_lead(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_site_identity(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_site_identity_by_slug(text,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_configure_admin(text,text,text,text,text,text) from bsrc_owner_ops;
revoke execute on function public.owner_demo_invitation_prepare(text,text,text,timestamp with time zone,text) from bsrc_owner_ops;

alter table public.leads disable row level security;
alter table public.lead_scores disable row level security;
alter table public.lead_pipeline_events disable row level security;
alter table public.lead_website_history disable row level security;
alter table public.prepared_business_profiles disable row level security;
alter table public.finder_searches disable row level security;
alter table public.finder_search_cache disable row level security;
alter table public.demo_sites disable row level security;
alter table public.site_preview_tokens disable row level security;
alter table public.api_rate_limits disable row level security;
alter table public.audit_events disable row level security;

commit;
