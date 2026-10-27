-- Emergency B3C4 rollback. Stop request traffic and deploy compatibility/off
-- application code first. This preserves data, routines and migration ledger.
revoke all on function public.site_admin_site_projection(text,text) from bsrc_runtime;
revoke all on function public.site_admin_capability_allowed(text,text,text) from bsrc_runtime;
revoke all on function public.site_admin_site_plan(text,text) from bsrc_runtime;
revoke all on function public.site_admin_cache_identities(text,text) from bsrc_runtime;
revoke all on function public.site_admin_reserve_usage(text,text,text,bigint,jsonb,numeric) from bsrc_runtime;
revoke all on function public.site_admin_concurrency_acquire(text,text,text,integer,integer) from bsrc_runtime;
revoke all on function public.site_admin_concurrency_release(text,text,uuid) from bsrc_runtime;
revoke all on function public.site_admin_ai_start(text,text,text,text,jsonb) from bsrc_runtime;
revoke all on function public.site_admin_ai_finish(text,uuid,text,jsonb) from bsrc_runtime;
revoke all on function public.site_admin_domain_preflight(text,text) from bsrc_runtime;
revoke all on function public.site_admin_domain_persist(text,text,text,text,jsonb) from bsrc_runtime;
revoke all on function public.resolve_public_business_media_blob(uuid) from bsrc_runtime;
revoke all on function public.resolve_public_legal_config() from bsrc_runtime;
revoke all on function public.resolve_public_legal_documents() from bsrc_runtime;
revoke all on function public.owner_ai_start(text,text,text,text,jsonb) from bsrc_owner_ops;
revoke all on function public.owner_ai_finish(text,uuid,text,jsonb) from bsrc_owner_ops;
revoke all on function public.owner_ai_get(text,uuid) from bsrc_owner_ops;
revoke all on function public.owner_ai_apply(text,uuid,text) from bsrc_owner_ops;
revoke all on function public.information_redi_site_plan(uuid,text) from bsrc_system;
revoke all on function public.information_redi_media_blob_insert(uuid,text,text,bytea) from bsrc_system;
revoke all on function public.information_redi_usage_reserve(uuid,text,text,bigint,jsonb,numeric) from bsrc_system;
revoke all on function public.information_redi_concurrency_acquire(uuid,text,integer,integer) from bsrc_system;
revoke all on function public.information_redi_concurrency_release(uuid,text,uuid) from bsrc_system;
