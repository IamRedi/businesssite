-- Additive Clouvider domain authority. No legacy row is relabelled.
alter table public.sites drop constraint sites_custom_domain_provider_authority_check;
alter table public.sites add constraint sites_custom_domain_provider_authority_check
 check (custom_domain_provider_authority is null or custom_domain_provider_authority ~
 '^(vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}|clouvider-service:[1-9][0-9]{0,15})$');

create or replace function public.site_admin_domain_persist(
  p_session_hash text,p_site_id text,p_domain text,p_status text,p_verification jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_current_domain text; v_current_authority text; v_authority text;
begin
  select a.site_id,s.custom_domain,s.custom_domain_provider_authority
    into v_site,v_current_domain,v_current_authority
  from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id
  where a.site_id=p_site_id and public.database_site_admin_mutation_allowed(p_session_hash,a.site_id,'custom_domain_existing');
  if v_site is null or p_domain<>lower(p_domain) or p_domain like 'www.%'
     or p_domain !~ '^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$'
     or p_status not in('pending_dns','verified','failed') or jsonb_typeof(p_verification)<>'object'
     or octet_length(p_verification::text)>32768 then return false; end if;

  if p_status='failed' then
    if v_current_domain is distinct from p_domain or
       coalesce(v_current_authority,'') !~ '^(vercel-project:team_[A-Za-z0-9]{20,64}:prj_[A-Za-z0-9]{20,64}|clouvider-service:[1-9][0-9]{0,15})$'
      then return false; end if;
    update public.sites set custom_domain_status='failed',custom_domain_verification=p_verification,
      custom_domain_checked_at=statement_timestamp() where id=v_site and custom_domain=p_domain;
    return found;
  end if;

  -- Provider records retain separate authority; no legacy row is relabelled.
  if (p_verification->>'provider')='clouvider' then
    if (p_verification->>'siteId') is distinct from v_site
      or coalesce(p_verification->>'serviceId','') !~ '^[1-9][0-9]{0,15}$'
      or (p_verification->>'domain') is distinct from p_domain
      or jsonb_typeof(p_verification->'ownershipVerified') is distinct from 'boolean'
      or jsonb_typeof(p_verification->'dnsConfigured') is distinct from 'boolean'
      or jsonb_typeof(p_verification->'ready') is distinct from 'boolean'
      or (p_verification->>'ready') is distinct from (p_status='verified')::text
      or jsonb_typeof(p_verification->'checkedAt') is distinct from 'string'
      or length(coalesce(p_verification->>'checkedAt','')) not between 10 and 64
      or jsonb_typeof(p_verification->'records') is distinct from 'array'
      or jsonb_array_length(p_verification->'records')>20
      or not (p_verification ? 'attestationFingerprint')
      or ((p_verification->>'attestationFingerprint') is not null and coalesce(p_verification->>'attestationFingerprint','') !~ '^[a-f0-9]{64}$')
      or (p_status='verified' and ((p_verification->>'ownershipVerified') is distinct from 'true'
        or (p_verification->>'dnsConfigured') is distinct from 'true'
        or coalesce(p_verification->>'attestationFingerprint','') !~ '^[a-f0-9]{64}$'))
      or p_verification-array['provider','domain','siteId','serviceId','ownershipVerified','dnsConfigured','ready','records','checkedAt','attestationFingerprint']::text[]<>'{}'::jsonb
      or exists(select 1 from jsonb_array_elements(p_verification->'records') r
        where jsonb_typeof(r)<>'object' or r-array['type','name','value','purpose']::text[]<>'{}'::jsonb
          or coalesce(r->>'purpose','') not in('ownership','routing')
          or length(coalesce(r->>'type','')) not between 1 and 16 or length(coalesce(r->>'name','')) not between 1 and 253
          or length(coalesce(r->>'value','')) not between 1 and 1024) then return false; end if;
    v_authority:='clouvider-service:'||(p_verification->>'serviceId');
    update public.sites set custom_domain=p_domain,custom_domain_status=p_status,
      custom_domain_provider_authority=v_authority,custom_domain_verification=p_verification,
      custom_domain_checked_at=statement_timestamp() where id=v_site;
    return found;
  end if;

  if (p_verification->>'provider') is distinct from 'vercel'
     or (p_verification->>'domain') is distinct from p_domain
     or coalesce(p_verification->>'projectId','') !~ '^prj_[A-Za-z0-9]{20,64}$'
     or coalesce(p_verification->>'teamId','') !~ '^team_[A-Za-z0-9]{20,64}$'
     or jsonb_typeof(p_verification->'ownershipVerified') is distinct from 'boolean'
     or jsonb_typeof(p_verification->'dnsConfigured') is distinct from 'boolean'
     or jsonb_typeof(p_verification->'ready') is distinct from 'boolean'
     or (p_verification->>'ready') is distinct from (p_status='verified')::text
     or jsonb_typeof(p_verification->'checkedAt') is distinct from 'string'
     or length(coalesce(p_verification->>'checkedAt','')) not between 10 and 64
     or jsonb_typeof(p_verification->'records') is distinct from 'array'
     or jsonb_array_length(p_verification->'records')>20
     or p_verification-array['provider','domain','projectId','teamId','ownershipVerified','dnsConfigured','ready','records','checkedAt']::text[]<>'{}'::jsonb
     or exists(select 1 from jsonb_array_elements(p_verification->'records') r
       where jsonb_typeof(r)<>'object' or r-array['type','name','value','purpose']::text[]<>'{}'::jsonb
         or coalesce(r->>'purpose','') not in('ownership','routing')
         or length(coalesce(r->>'type','')) not between 1 and 16 or length(coalesce(r->>'name','')) not between 1 and 253
         or length(coalesce(r->>'value','')) not between 1 and 1024)
    then return false; end if;
  v_authority:='vercel-project:'||(p_verification->>'teamId')||':'||(p_verification->>'projectId');
  update public.sites set custom_domain=p_domain,custom_domain_status=p_status,
    custom_domain_provider_authority=v_authority,custom_domain_verification=p_verification,
    custom_domain_checked_at=statement_timestamp() where id=v_site;
  return found;
exception when unique_violation then return false;
end $$;
revoke all on function public.site_admin_domain_persist(text,text,text,text,jsonb) from public;
