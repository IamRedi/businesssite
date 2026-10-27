-- First deploy an application version with Information public/editorial paths
-- in compatibility/off mode and REDI inbound disabled. This rollback preserves
-- every publication, article, media row, audit event, integration, nonce,
-- request, routine and schema_migrations entry.
begin;

revoke select, update on public.site_editorial_settings from bsrc_runtime;
revoke select on public.site_editorial_memberships from bsrc_runtime;
revoke select, insert, update, delete on public.site_article_categories from bsrc_runtime;
revoke select, insert, update, delete on public.site_articles from bsrc_runtime;
revoke select, insert, update, delete on public.site_article_sources from bsrc_runtime;
revoke select, insert, update, delete on public.site_article_media from bsrc_runtime;
revoke select, insert, update, delete on public.site_media_assets from bsrc_runtime;
revoke select, insert on public.site_content_audit_events from bsrc_runtime;

revoke execute on function public.resolve_public_information_site(text,text) from bsrc_runtime;
revoke execute on function public.resolve_public_information_articles(text,text,jsonb) from bsrc_runtime;
revoke execute on function public.resolve_public_information_article(text,text,text) from bsrc_runtime;
revoke execute on function public.resolve_public_information_media(uuid) from bsrc_runtime;
revoke execute on function public.resolve_editor_information_media(text,uuid) from bsrc_runtime;
revoke execute on function public.resolve_information_media_blob(uuid,text) from bsrc_runtime;
revoke execute on function public.information_editorial_role() from bsrc_runtime;
revoke execute on function public.information_editorial_allowed(text) from bsrc_runtime;
revoke execute on function public.information_editorial_install_context(text,text) from bsrc_runtime;

revoke execute on function public.owner_information_create_publication(text,jsonb,text,text) from bsrc_owner_ops;
revoke execute on function public.owner_information_configure_redi(text,text,boolean,text[],text) from bsrc_owner_ops;
revoke execute on function public.owner_information_configure_ad_slots(text,text,jsonb,text) from bsrc_owner_ops;

revoke execute on function public.information_redi_bootstrap(text,text) from bsrc_system;
revoke execute on function public.information_redi_reserve_nonce(uuid,text,text,timestamptz,integer) from bsrc_system;
revoke execute on function public.information_redi_begin_request(uuid,text,text,text,text,integer) from bsrc_system;
revoke execute on function public.information_redi_finish_request(uuid,text,text,text,integer,jsonb) from bsrc_system;
revoke execute on function public.information_redi_allowed(uuid,text,text) from bsrc_system;
revoke execute on function public.information_redi_article_json(uuid,text,uuid,text) from bsrc_system;
revoke execute on function public.information_redi_list_articles(uuid,text,jsonb) from bsrc_system;
revoke execute on function public.information_redi_external_article(uuid,text,text) from bsrc_system;
revoke execute on function public.information_redi_create_article(uuid,text,jsonb) from bsrc_system;
revoke execute on function public.information_redi_update_article(uuid,text,uuid,integer,jsonb) from bsrc_system;
revoke execute on function public.information_redi_transition_article(uuid,text,uuid,integer,text) from bsrc_system;
revoke execute on function public.information_redi_list_media(uuid,text,jsonb) from bsrc_system;
revoke execute on function public.information_redi_register_media(uuid,text,jsonb) from bsrc_system;

alter table public.site_editorial_settings disable row level security;
alter table public.site_editorial_memberships disable row level security;
alter table public.site_article_categories disable row level security;
alter table public.site_articles disable row level security;
alter table public.site_article_sources disable row level security;
alter table public.site_article_media disable row level security;
alter table public.site_media_assets disable row level security;
alter table public.site_content_audit_events disable row level security;
alter table public.integration_nonces disable row level security;
alter table public.integration_api_requests disable row level security;

commit;
