-- migrate-as-owner-of: public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)
-- Keep the binding helper on the same classified owner boundary as its guard.
-- An unexpected owner is not reassigned here: migration execution must fail
-- closed until an authorized operator verifies and repairs that exact object.
do $$
declare
  v_binding_owner oid;
  v_guard_owner oid;
begin
  select p.proowner into v_binding_owner
  from pg_proc p
  where p.oid=to_regprocedure('public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)');

  select p.proowner into v_guard_owner
  from pg_proc p
  where p.oid=to_regprocedure('public.privacy_export_artifact_guard()');

  if v_binding_owner is null or v_guard_owner is null or v_binding_owner<>v_guard_owner then
    raise exception 'privacy_export_artifact_binding_owner_drift';
  end if;
end $$;

revoke all on function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) from public;

-- Ownership transfer preserves explicit ACL entries. Remove every historical
-- non-owner grantee; exact migrator/runtime/system executor grants are restored
-- immediately afterward by role provisioning.
do $$
declare
  v_grantee text;
begin
  for v_grantee in
    select pg_get_userbyid(x.grantee)
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
    where p.oid=to_regprocedure('public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts)')
      and x.grantee<>0
      and x.grantee<>p.proowner
  loop
    execute format(
      'revoke all on function public.privacy_export_artifact_binding_valid(public.privacy_export_artifacts) from %I',
      v_grantee
    );
  end loop;
end $$;
