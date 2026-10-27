-- AI website-understanding analysis cache for the existing-website import
-- pipeline. Keyed by a content hash of the declared source website, so
-- re-importing the same website does not repeat paid AI analysis. Payloads
-- hold only public source-site content and model output (no customer PII).
-- Procedure-only boundary (mirrors api_rate_limits): no runtime table grants;
-- the runtime role reaches the cache only through the two definer routines.
-- migrate-as-migrator
create table public.website_import_analysis_cache (
  cache_key text primary key,
  source_url text not null,
  model text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.website_import_analysis_cache enable row level security;
alter table public.website_import_analysis_cache force row level security;
revoke all on public.website_import_analysis_cache from public;

create or replace function public.website_import_cache_read(p_cache_key text)
returns table(cache_key text, source_url text, model text, payload jsonb, created_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
  select c.cache_key, c.source_url, c.model, c.payload, c.created_at
  from public.website_import_analysis_cache c
  where c.cache_key = left(p_cache_key, 128)
$$;

create or replace function public.website_import_cache_write(
  p_cache_key text, p_source_url text, p_model text, p_payload jsonb
)
returns boolean
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if p_cache_key !~ '^[a-f0-9]{64}$'
    or p_source_url !~ '^https?://[a-z0-9.-]+/' or length(p_source_url) > 500
    or length(btrim(p_model)) not between 1 and 120
    or pg_column_size(p_payload) > 524288 then return false; end if;
  insert into public.website_import_analysis_cache(cache_key,source_url,model,payload)
  values(left(p_cache_key,128),p_source_url,btrim(p_model),p_payload)
  on conflict(cache_key) do nothing;
  return true;
end $$;

revoke all on function public.website_import_cache_read(text) from public;
revoke all on function public.website_import_cache_write(text,text,text,jsonb) from public;

-- migrate-as-owner-of: public.database_enforced_readiness()
create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=70
     and count(*) filter(where c.relrowsecurity)=67
     and count(*) filter(where c.relforcerowsecurity)=67
     and count(distinct c.relowner)=1
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in('r','p'))
  and not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('public',p.oid,'execute')
      and not exists(select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
        where d.classid='pg_proc'::regclass and d.objid=p.oid
          and d.refclassid='pg_extension'::regclass and d.deptype='e'))
  and (select count(distinct p.proowner)=4
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       join pg_roles r on r.oid=p.proowner
       where n.nspname='public' and p.prosecdef and not r.rolcanlogin
         and not r.rolsuper and not r.rolbypassrls
         and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;
