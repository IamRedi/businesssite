begin;

do $role_handoff$
begin
  if to_regrole('bsrc_owner_executor') is not null then
    execute 'grant create on schema public to bsrc_owner_executor';
    execute 'set local role bsrc_owner_executor';
  end if;
end
$role_handoff$;

create or replace function public.owner_finder_list_workspace(
  p_session text,
  p_limit integer default 250,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  a record;
begin
  select * into a
  from public.owner_auth_resolve_session(p_session,'finder.read');
  if a.owner_id is null then
    return null;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'lead', public.finder_lead_json(x.l),
          'latestProfile', case
            when x.profile_id is null then null
            else jsonb_build_object(
              'id', x.profile_id,
              'leadId', (x.l).id,
              'version', x.profile_version,
              'profile', x.profile,
              'status', x.profile_status,
              'createdAt', x.profile_created_at
            )
          end,
          'profileCount', x.profile_count,
          'latestStatus', x.pipeline_status,
          'latestWebsiteChange', case
            when x.change_type is null then null
            else jsonb_build_object(
              'type', x.change_type,
              'previousWebsite', x.previous_website,
              'currentWebsite', x.current_website,
              'observedAt', x.observed_at
            )
          end
        )
        order by (x.l).updated_at desc, (x.l).id
      ),
      '[]'::jsonb
    )
    from (
      select
        l,
        p.id profile_id,
        p.version profile_version,
        p.profile,
        p.status profile_status,
        p.created_at profile_created_at,
        (
          select count(*)::int
          from public.prepared_business_profiles pc
          where pc.lead_id=l.id
        ) profile_count,
        (
          select pe.status
          from public.lead_pipeline_events pe
          where pe.lead_id=l.id
          order by pe.created_at desc,pe.id desc
          limit 1
        ) pipeline_status,
        wh.previous_website,
        wh.current_website,
        wh.change_type,
        wh.observed_at
      from public.leads l
      left join lateral (
        select pp.*
        from public.prepared_business_profiles pp
        where pp.lead_id=l.id
        order by pp.version desc
        limit 1
      ) p on true
      left join lateral (
        select h.previous_website,h.current_website,h.change_type,h.observed_at
        from public.lead_website_history h
        where h.lead_id=l.id and h.change_type<>'first_seen'
        order by h.observed_at desc,h.id desc
        limit 1
      ) wh on true
      order by l.updated_at desc,l.id
      limit least(greatest(p_limit,1),250)
      offset least(greatest(p_offset,0),10000)
    ) x
  );
end
$$;

reset role;

do $role_cleanup$
begin
  if to_regrole('bsrc_owner_executor') is not null then
    execute 'revoke create on schema public from bsrc_owner_executor';
  end if;
end
$role_cleanup$;

commit;
