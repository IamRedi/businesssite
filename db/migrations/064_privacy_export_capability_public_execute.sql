-- Task Group 4-B6F2: keep the hosted readiness contract fail-closed after
-- migration 062 recreated these capability consumers.
-- migrate-as-migrator

revoke all on function public.site_admin_consume_export_capability(text,text) from public;
revoke all on function public.owner_consume_self_export_capability(text,text) from public;
