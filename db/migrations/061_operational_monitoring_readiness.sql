-- migrate-as-owner-of: public.database_enforced_readiness()
-- Extend the exact enforced catalog invariant for the B6A heartbeat table.
create or replace function public.database_enforced_readiness()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog
as $$
 select
  (select count(*)=67
     and count(*) filter(where c.relrowsecurity)=64
     and count(*) filter(where c.relforcerowsecurity)=64
     and count(distinct c.relowner)=1
   from pg_class c
   join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in('r','p'))
  and not exists(
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    where n.nspname='public' and c.relkind in('r','p') and x.grantee=0
  )
  and not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and has_function_privilege('public',p.oid,'execute')
      and not exists(
        select 1
        from pg_depend d
        join pg_extension e on e.oid=d.refobjid
        where d.classid='pg_proc'::regclass
          and d.objid=p.oid
          and d.refclassid='pg_extension'::regclass
          and d.deptype='e'
      )
  )
  and (select count(distinct p.proowner)=4
       from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       join pg_roles r on r.oid=p.proowner
       where n.nspname='public'
         and p.prosecdef
         and not r.rolcanlogin
         and not r.rolsuper
         and not r.rolbypassrls
         and not r.rolcreatedb
         and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;

revoke all on function public.database_enforced_readiness() from public;
