-- Task Group 3-B4A. This migration hardens the routines used by enforced mode
-- and changes no customer data. The transactional role-provisioning step
-- installs executor ownership/policies/grants and enables FORCE last, avoiding
-- a fail-open or application-breaking gap between those operations.

-- A custom GUC is transaction transport, never authority. Re-resolve the
-- opaque session hash on every policy evaluation so app.site_id cannot be
-- spoofed by arbitrary SQL under the runtime identity.
create or replace function app_context_is_valid_site_admin()
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select public.app_context_actor_kind() = 'site_admin'
    and public.app_context_site_id() is not null
    and exists (
      select 1
      from public.site_admin_resolve_session(nullif(current_setting('app.session_hash', true), '')) resolved
      where resolved.site_id = public.app_context_site_id()::text
    )
$$;

revoke all on function app_context_is_valid_site_admin() from public;

create or replace function database_enforced_readiness()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    (select count(*) = 55 and count(*) filter (where c.relrowsecurity) = 52
       and count(*) filter (where c.relforcerowsecurity) = 52
       and count(distinct c.relowner) = 1
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p'))
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
      where n.nspname='public' and c.relkind in ('r','p') and x.grantee=0
    )
    and not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and has_function_privilege('public',p.oid,'execute')
    )
    and (select count(distinct p.proowner)=4
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         join pg_roles r on r.oid=p.proowner
         where n.nspname='public' and p.prosecdef
           and not r.rolcanlogin and not r.rolsuper and not r.rolbypassrls
           and not r.rolcreatedb and not r.rolcreaterole)
$$;

revoke all on function database_enforced_readiness() from public;
