-- migrate-as-owner-of: public.owner_provider_usage_snapshot(text)
-- Migration 068 can also be applied directly by a managed-provider database
-- owner. In that path RESET ROLE returns to the login role before the REVOKE,
-- so PostgreSQL may retain the default PUBLIC EXECUTE ACL. Resolve and assume
-- the existing classified routine owner before correcting the exact ACL.
do $provider_usage_acl$
declare
  v_record_owner oid;
  v_snapshot_owner oid;
  v_owner_name text;
begin
  select p.proowner into v_record_owner
  from pg_catalog.pg_proc p
  where p.oid=to_regprocedure(
    'public.owner_provider_usage_record(text,text,text,bigint,text,date)'
  );

  select p.proowner into v_snapshot_owner
  from pg_catalog.pg_proc p
  where p.oid=to_regprocedure('public.owner_provider_usage_snapshot(text)');

  if v_record_owner is null
     or v_snapshot_owner is null
     or v_record_owner<>v_snapshot_owner then
    raise exception 'provider_usage_routine_owner_drift';
  end if;

  if to_regrole('bsrc_owner_executor') is not null
     and v_record_owner<>to_regrole('bsrc_owner_executor') then
    raise exception 'provider_usage_routine_owner_not_canonical';
  end if;

  v_owner_name:=pg_get_userbyid(v_record_owner);
  if current_user<>v_owner_name then
    if not pg_has_role(current_user,v_owner_name,'member') then
      raise exception 'provider_usage_routine_owner_not_assumable';
    end if;
    execute format('set local role %I',v_owner_name);
  end if;

  execute 'revoke all on function public.owner_provider_usage_record(text,text,text,bigint,text,date) from public';
  execute 'revoke all on function public.owner_provider_usage_snapshot(text) from public';

  if to_regrole('bsrc_owner_ops') is not null then
    execute 'grant execute on function public.owner_provider_usage_record(text,text,text,bigint,text,date) to bsrc_owner_ops';
    execute 'grant execute on function public.owner_provider_usage_snapshot(text) to bsrc_owner_ops';
  end if;
end
$provider_usage_acl$;
