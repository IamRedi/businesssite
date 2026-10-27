-- Additive R2 media adapter. No existing media, provider authority or URLs
-- are copied, relabelled or deleted. Both R2 buckets remain private.
alter table public.site_media_assets drop constraint site_media_assets_storage_provider_check;
alter table public.site_media_assets add constraint site_media_assets_storage_provider_check
 check (storage_provider in ('vercel_blob','postgres','r2'));
alter table public.site_media_assets drop constraint site_media_assets_provider_authority_check;
alter table public.site_media_assets add constraint site_media_assets_provider_authority_check
 check (provider_authority is null or provider_authority ~ '^store_[A-Za-z0-9]{16}$'
   or (storage_provider='r2' and provider_authority ~ '^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'));
alter table public.site_media_assets add constraint site_media_assets_r2_binding_check check
 (storage_provider<>'r2' or (provider_authority is not null
   and provider_authority ~ '^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
   and provider_authority !~ '(backup|recovery)'
   and storage_key like 'sites/'||site_id||'/%'
   and length(storage_key)<=500 and storage_key !~ '[%?#[:space:]\\]' and position('..' in storage_key)=0
   and ((storage_access='private' and storage_key like 'sites/'||site_id||'/editorial/%' and mime_type='image/webp')
     or (storage_access='public' and storage_key not like 'sites/'||site_id||'/editorial/%'
       and public_url='/api/media/r2/'||storage_key and mime_type in ('image/webp','video/mp4')))));

create or replace function public.owner_custom_media_register(p_session text,p_slug text,p_authority text,p_key text,p_url text,p_mime text,p_bytes integer,p_width integer,p_height integer,p_duration double precision)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; v_id uuid; v_site text; v_provider text; begin
 c:=public.owner_custom_media_context(p_session,p_slug);
 if c is null then return null; end if;
 v_site:=c->>'siteId';
 -- Serialize with custom-design/site lifecycle mutation and recheck authority.
 perform 1 from public.sites where id=v_site for update;
 c:=public.owner_custom_media_context(p_session,p_slug);
 if c is null or c->>'siteId' is distinct from v_site then return null; end if;
 v_provider:=case when coalesce(p_authority,'') ~ '^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and p_authority !~ '(backup|recovery)' then 'r2' else 'vercel_blob' end;
 if p_authority is null or (v_provider='vercel_blob' and p_authority !~ '^store_[A-Za-z0-9]{16}$')
   or p_key is null or length(p_key)>500
   or left(p_key,length('sites/'||v_site||'/custom/')) is distinct from ('sites/'||v_site||'/custom/')
   or substring(p_key from length('sites/'||v_site||'/custom/')+1) !~ '^[a-f0-9-]{36}-[A-Za-z0-9_-]{1,64}\.(webp|mp4)$'
   or position('..' in p_key)>0
   or p_url is distinct from (case when v_provider='r2' then '/api/media/r2/'||p_key else 'https://'||lower(substring(p_authority from 7))||'.public.blob.vercel-storage.com/'||p_key end)
   or p_mime is null or p_mime not in ('image/webp','video/mp4')
   or p_bytes is null or p_bytes<1 or p_bytes>(case when p_mime='image/webp' then 4194304 else 4000000 end)
   or p_width is null or p_height is null or p_width<1 or p_height<1
   or p_width>(case when p_mime='image/webp' then 2000 else 3840 end)
   or p_height>(case when p_mime='image/webp' then 2000 else 3840 end)
   or (p_mime='image/webp' and (p_duration is not null or right(p_key,5)<>'.webp'))
   or (p_mime='video/mp4' and (right(p_key,4)<>'.mp4' or p_duration is null
     or not (p_duration>=1 and p_duration<=(c->>'maxDurationSeconds')::integer))) then return null; end if;
 insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size,width,height)
 values(gen_random_uuid(),v_site,v_provider,p_key,'public',p_authority,p_url,p_mime,p_bytes,p_width,p_height)
 on conflict(site_id,storage_provider,storage_key) do nothing returning id into v_id;
 -- A replay must match every immutable binding, including dimensions.
 if v_id is null then select id into v_id from public.site_media_assets
   where site_id=v_site and storage_provider=v_provider and storage_key=p_key
     and storage_access='public' and provider_authority=p_authority and public_url=p_url
     and mime_type=p_mime and byte_size=p_bytes and width=p_width and height=p_height; end if;
 return v_id;
end $$;

create or replace function public.site_admin_custom_media_register(p_session text,p_slug text,p_authority text,p_key text,p_url text,p_mime text,p_bytes integer,p_width integer,p_height integer,p_duration double precision)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; v_id uuid; v_site text; v_provider text; begin
 c:=public.site_admin_custom_context(p_session,p_slug,true);
 if c is null then return null; end if;
 v_site:=c->>'siteId';
 -- Serialize with custom-design/site lifecycle mutation and recheck authority.
 perform 1 from public.sites where id=v_site for update;
 c:=public.site_admin_custom_context(p_session,p_slug,true);
 if c is null or c->>'siteId' is distinct from v_site then return null; end if;
 v_provider:=case when coalesce(p_authority,'') ~ '^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and p_authority !~ '(backup|recovery)' then 'r2' else 'vercel_blob' end;
 if p_authority is null or (v_provider='vercel_blob' and p_authority !~ '^store_[A-Za-z0-9]{16}$')
   or p_key is null or length(p_key)>500
   or left(p_key,length('sites/'||v_site||'/custom/')) is distinct from ('sites/'||v_site||'/custom/')
   or substring(p_key from length('sites/'||v_site||'/custom/')+1) !~ '^[a-f0-9-]{36}-[A-Za-z0-9_-]{1,64}\.(webp|mp4)$'
   or position('..' in p_key)>0
   or p_url is distinct from (case when v_provider='r2' then '/api/media/r2/'||p_key else 'https://'||lower(substring(p_authority from 7))||'.public.blob.vercel-storage.com/'||p_key end)
   or p_mime is null or p_mime not in ('image/webp','video/mp4')
   or p_bytes is null or p_bytes<1 or p_bytes>(case when p_mime='image/webp' then 4194304 else 4000000 end)
   or p_width is null or p_height is null or p_width<1 or p_height<1
   or p_width>(case when p_mime='image/webp' then 2000 else 3840 end)
   or p_height>(case when p_mime='image/webp' then 2000 else 3840 end)
   or (p_mime='image/webp' and (p_duration is not null or right(p_key,5)<>'.webp'))
   or (p_mime='video/mp4' and (right(p_key,4)<>'.mp4' or p_duration is null
     or not (p_duration>=1 and p_duration<=(c->>'maxDurationSeconds')::integer))) then return null; end if;
 insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size,width,height)
 values(gen_random_uuid(),v_site,v_provider,p_key,'public',p_authority,p_url,p_mime,p_bytes,p_width,p_height)
 on conflict(site_id,storage_provider,storage_key) do nothing returning id into v_id;
 -- A replay must match every immutable binding, including dimensions.
 if v_id is null then select id into v_id from public.site_media_assets
   where site_id=v_site and storage_provider=v_provider and storage_key=p_key
     and storage_access='public' and provider_authority=p_authority and public_url=p_url
     and mime_type=p_mime and byte_size=p_bytes and width=p_width and height=p_height; end if;
 return v_id;
end $$;

create or replace function public.site_admin_register_business_provider_media(
  p_session_hash text,p_slug text,p_authority text,p_storage_key text,p_public_url text,
  p_content_type text,p_byte_size integer
) returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_site text; v_id uuid:=gen_random_uuid(); v_store text; v_provider text;
begin
  select s.id into v_site from public.site_admin_resolve_session(p_session_hash) a
  join public.sites s on s.id=a.site_id and s.slug=p_slug and s.site_kind='business'
  where public.database_site_admin_mutation_allowed(p_session_hash,s.id,'media') limit 1;
  v_store:=replace(coalesce(p_authority,''),'store_','');
  v_provider:=case when coalesce(p_authority,'') ~ '^r2-bucket:[a-f0-9]{32}:[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' and p_authority !~ '(backup|recovery)' then 'r2' else 'vercel_blob' end;
  if v_site is null or p_authority is null or (v_provider='vercel_blob' and p_authority!~'^store_[A-Za-z0-9]{16}$')
    or left(p_storage_key,length('sites/'||v_site||'/'))<>'sites/'||v_site||'/'
    or char_length(p_storage_key) not between 1 and 500
    or p_storage_key!~'^[A-Za-z0-9._/-]+$'
    or p_storage_key like '%..%' or p_storage_key like '%/editorial/%'
    or p_public_url is distinct from (case when v_provider='r2' then '/api/media/r2/'||p_storage_key else 'https://'||lower(v_store)||'.public.blob.vercel-storage.com/'||p_storage_key end)
    or p_content_type<>'image/webp' or p_byte_size not between 1 and 4194304 then return null; end if;
  insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size)
  values(v_id,v_site,v_provider,p_storage_key,'public',p_authority,p_public_url,p_content_type,p_byte_size)
  on conflict(site_id,storage_provider,storage_key) do update
    set provider_authority=site_media_assets.provider_authority
    where site_media_assets.provider_authority=excluded.provider_authority
      and site_media_assets.storage_access=excluded.storage_access
      and site_media_assets.public_url=excluded.public_url
      and site_media_assets.mime_type=excluded.mime_type
      and site_media_assets.byte_size=excluded.byte_size
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.site_admin_custom_apply(p_session text,p_slug text,p_field text,p_expected jsonb,p_design jsonb,p_value jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; s record; item jsonb; source jsonb; begin
 if p_field is null or p_field not in ('priceList','customMedia') or p_value is null or pg_column_size(p_value)>393216 then return null; end if;
 c:=public.site_admin_custom_context(p_session,p_slug,p_field='customMedia');
 if c is null then return null; end if;
 select * into s from public.sites where id=c->>'siteId' for update;
 c:=public.site_admin_custom_context(p_session,p_slug,p_field='customMedia');
 if c is null then return null; end if;
 if s.generated_document->p_field is distinct from p_expected or s.generated_document->'customDesign' is distinct from p_design then raise exception 'custom_content_conflict'; end if;
 if p_field='priceList' then
   if jsonb_typeof(p_value) is distinct from 'object' or p_value->>'currency' is distinct from 'EUR'
     or jsonb_typeof(p_value->'groups') is distinct from 'array' then return null; end if;
 else
   if jsonb_typeof(p_value->'images') is distinct from 'array' or jsonb_typeof(p_value->'videos') is distinct from 'array'
     or jsonb_array_length(p_value->'images')>60 or jsonb_array_length(p_value->'videos')>8 then return null; end if;
   for item in select value from jsonb_array_elements(p_value->'images') loop
     if not exists(select 1 from jsonb_array_elements(s.generated_document#>'{customMedia,images}') old
       where old->>'src'=item->>'src' and old->'width'=item->'width' and old->'height'=item->'height')
       and not exists(select 1 from public.site_media_assets a where a.site_id=s.id and a.storage_provider in ('vercel_blob','r2')
         and a.storage_access='public' and a.provider_authority is not null and a.public_url=item->>'src'
         and a.mime_type='image/webp' and to_jsonb(a.width)=item->'width' and to_jsonb(a.height)=item->'height') then return null; end if;
   end loop;
   for item in select value from jsonb_array_elements(p_value->'videos') loop
     if not ((item->>'durationSeconds')::double precision between 1 and (c->>'maxDurationSeconds')::integer)
       or jsonb_typeof(item->'sources') is distinct from 'array' or jsonb_array_length(item->'sources') not between 1 and 2 then return null; end if;
     for source in select value from jsonb_array_elements(item->'sources') loop
       if not exists(select 1 from jsonb_array_elements(s.generated_document#>'{customMedia,videos}') old,
           jsonb_array_elements(old->'sources') src
         where src=source and old->'width'=item->'width' and old->'height'=item->'height' and old->'durationSeconds'=item->'durationSeconds')
         and not exists(select 1 from public.site_media_assets a where a.site_id=s.id and a.storage_provider in ('vercel_blob','r2')
           and a.storage_access='public' and a.provider_authority is not null and a.public_url=source->>'src'
           and a.mime_type='video/mp4' and source->>'type'='video/mp4' and to_jsonb(a.byte_size)=source->'bytes'
           and to_jsonb(a.width)=item->'width' and to_jsonb(a.height)=item->'height') then return null; end if;
     end loop;
   end loop;
 end if;
 update public.sites set generated_document=jsonb_set(generated_document,array[p_field],p_value) where id=s.id;
 return p_value;
end $$;

-- Public business assets retain their existing public-Blob semantics (including
-- preview images). This never makes a private editorial object or site public.
-- HTTP delivery additionally binds a customer Host to this exact site/domain.
create function public.resolve_public_r2_business_media(p_key text)
returns table(site_id text,storage_key text,provider_authority text,mime_type text,byte_size integer,custom_domain text,custom_domain_verified boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select m.site_id,m.storage_key,m.provider_authority,m.mime_type,m.byte_size,s.custom_domain,s.custom_domain_status='verified'
 from public.site_media_assets m join public.sites s on s.id=m.site_id and s.site_kind='business'
 where m.storage_provider='r2' and m.storage_access='public' and m.storage_key=p_key
   and left(m.storage_key,length('sites/'||m.site_id||'/'))='sites/'||m.site_id||'/'
 limit 1
$$;
revoke all on function public.resolve_public_r2_business_media(text) from public;

-- Authority is returned only after the existing publication/editor ACL resolves
-- this exact asset. Existing public/editor projections keep their signatures.
create function public.resolve_information_r2_authority(p_asset uuid,p_session text)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select m.provider_authority from public.site_media_assets m where m.id=p_asset and m.storage_provider='r2' and
 (exists(select 1 from public.resolve_public_information_media(p_asset)) or
  exists(select 1 from public.resolve_editor_information_media(p_session,p_asset))) limit 1
$$;
revoke all on function public.resolve_information_r2_authority(uuid,text) from public;

create or replace function public.privacy_system_expand_provider_cleanup(p_job uuid)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer:=0; begin
 select w.*,j.policy_version_id into v from public.customer_deletion_workflows w join public.privacy_jobs j on j.id=w.job_id where w.job_id=p_job for update of w,j;
 if v.job_id is null or v.phase not in('awaiting_provider_cleanup','cooling_period') then return 0; end if;
 if exists(select 1 from public.site_media_assets m where m.site_id=v.site_id and m.storage_provider='r2')
   or exists(select 1 from public.sites s where s.id=v.site_id and s.custom_domain_provider_authority like 'clouvider-service:%') then
   -- Unsupported destructive cleanup is operator-blocked, never silently skipped
   -- or misclassified as a Vercel attachment. No new destructive flag is enabled.
   update public.customer_deletion_workflows set phase='blocked',updated_at=statement_timestamp() where job_id=p_job;
   update public.privacy_jobs set status='blocked',error_code='provider_binding_invalid',updated_at=statement_timestamp() where id=p_job;
   return 0;
 end if;

 update public.privacy_provider_cleanup_items i set status='completed',required=false,result_code='unsupported',completed_at=statement_timestamp(),lease_expires_at=null,worker_reference=null,updated_at=statement_timestamp()
 where i.job_id=p_job and i.status='pending' and not exists(select 1 from public.privacy_provider_cleanup_bindings b where b.item_id=i.id);
 for v in select a.storage_key,a.provider_authority from public.site_media_assets a where a.site_id=(select site_id from public.customer_deletion_workflows where job_id=p_job) and a.storage_provider='vercel_blob' loop
   perform public.privacy_provider_cleanup_add_authorized_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_blob','media','blob_object','delete_exact',v.provider_authority,v.storage_key,true); v_count:=v_count+1;
 end loop;
 select s.id site_id,s.custom_domain,s.custom_domain_status,s.custom_domain_provider_authority into v from public.sites s join public.customer_deletion_workflows w on w.site_id=s.id where w.job_id=p_job;
 if v.custom_domain is not null and v.custom_domain<>'' and v.custom_domain_status='verified' then perform public.privacy_provider_cleanup_add_authorized_binding(p_job,v.site_id,(select policy_version_id from public.privacy_jobs where id=p_job),'vercel_domains','domain','project_domain_attachment','detach_exact',v.custom_domain_provider_authority,v.custom_domain,true); v_count:=v_count+1; end if;
 select s.billing_provider,s.provider_subscription_id into v from public.site_subscriptions s join public.customer_deletion_workflows w on w.site_id=s.site_id where w.job_id=p_job;
 if v.provider_subscription_id is not null then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),v.billing_provider,'subscription','subscription_retained','retain',v.provider_subscription_id,true); v_count:=v_count+1; end if;
 perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'resend','email','transactional_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':transactional',true); v_count:=v_count+1;
 if exists(select 1 from public.ai_runs a join public.customer_deletion_workflows w on w.site_id=a.site_id or w.site_id=a.applied_site_id where w.job_id=p_job) then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'openai','ai','stateless_ai_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':stateless',true); v_count:=v_count+1; end if;
 if exists(select 1 from public.sites s join public.customer_deletion_workflows w on w.site_id=s.id where w.job_id=p_job and s.lead_id is not null) then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'google','finder','finder_no_customer_object','retain',(select site_id from public.customer_deletion_workflows where job_id=p_job)||':finder',true); v_count:=v_count+1; end if;
 for v in select i.external_workspace_id from public.site_external_integrations i join public.customer_deletion_workflows w on w.site_id=i.site_id where w.job_id=p_job and i.provider='redi_control' loop
   if v.external_workspace_id is not null and v.external_workspace_id<>'' then perform public.privacy_provider_cleanup_add_binding(p_job,(select site_id from public.customer_deletion_workflows where job_id=p_job),(select policy_version_id from public.privacy_jobs where id=p_job),'redi_control','integration','redi_workspace','detach_exact',v.external_workspace_id,true); v_count:=v_count+1; end if;
 end loop;
 return v_count;
end $$;
