-- Additive customer boundary: existing lifecycle/capability checks and managed
-- assets. No Owner authority, table change, visibility change or physical deletion.
create function public.site_admin_custom_context(p_session text,p_slug text,p_media boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare s record; begin
 select site.* into s from public.site_admin_resolve_session(p_session) a
 join public.sites site on site.id=a.site_id and site.slug=p_slug and site.site_kind='business';
 if s.id is null or p_media is null
   or not public.database_site_admin_mutation_allowed(p_session,s.id,'editor')
   or (p_media and not public.database_site_admin_mutation_allowed(p_session,s.id,'media'))
   or s.generated_document#>>'{customDesign,version}' is distinct from 'custom/1'
   or jsonb_typeof(s.generated_document->'customMedia') is distinct from 'object' then return null; end if;
 return jsonb_build_object('siteId',s.id,'document',s.generated_document,'customDomain',s.custom_domain,
   'maxDurationSeconds',least(case when s.generated_document#>>'{customDesign,video,mode}'='decorative-loop' then 12 else 60 end,
     greatest(1,coalesce((s.generated_document#>>'{customDesign,video,maxDurationSeconds}')::integer,30))));
end $$;
revoke all on function public.site_admin_custom_context(text,text,boolean) from public;

create function public.site_admin_custom_media_register(p_session text,p_slug text,p_authority text,p_key text,p_url text,p_mime text,p_bytes integer,p_width integer,p_height integer,p_duration double precision)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; v_id uuid; v_site text; begin
 c:=public.site_admin_custom_context(p_session,p_slug,true);
 if c is null then return null; end if;
 v_site:=c->>'siteId';
 -- Serialize with custom-design/site lifecycle mutation and recheck authority.
 perform 1 from public.sites where id=v_site for update;
 c:=public.site_admin_custom_context(p_session,p_slug,true);
 if c is null or c->>'siteId' is distinct from v_site then return null; end if;
 if p_authority is null or p_authority !~ '^store_[A-Za-z0-9]{16}$'
   or p_key is null or length(p_key)>500
   or left(p_key,length('sites/'||v_site||'/custom/')) is distinct from ('sites/'||v_site||'/custom/')
   or substring(p_key from length('sites/'||v_site||'/custom/')+1) !~ '^[a-f0-9-]{36}-[A-Za-z0-9_-]{1,64}\.(webp|mp4)$'
   or position('..' in p_key)>0
   or p_url is distinct from ('https://'||lower(substring(p_authority from 7))||'.public.blob.vercel-storage.com/'||p_key)
   or p_mime is null or p_mime not in ('image/webp','video/mp4')
   or p_bytes is null or p_bytes<1 or p_bytes>(case when p_mime='image/webp' then 4194304 else 4000000 end)
   or p_width is null or p_height is null or p_width<1 or p_height<1
   or p_width>(case when p_mime='image/webp' then 2000 else 3840 end)
   or p_height>(case when p_mime='image/webp' then 2000 else 3840 end)
   or (p_mime='image/webp' and (p_duration is not null or right(p_key,5)<>'.webp'))
   or (p_mime='video/mp4' and (right(p_key,4)<>'.mp4' or p_duration is null
     or not (p_duration>=1 and p_duration<=(c->>'maxDurationSeconds')::integer))) then return null; end if;
 insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,provider_authority,public_url,mime_type,byte_size,width,height)
 values(gen_random_uuid(),v_site,'vercel_blob',p_key,'public',p_authority,p_url,p_mime,p_bytes,p_width,p_height)
 on conflict(site_id,storage_provider,storage_key) do nothing returning id into v_id;
 -- A replay must match every immutable binding, including dimensions.
 if v_id is null then select id into v_id from public.site_media_assets
   where site_id=v_site and storage_provider='vercel_blob' and storage_key=p_key
     and storage_access='public' and provider_authority=p_authority and public_url=p_url
     and mime_type=p_mime and byte_size=p_bytes and width=p_width and height=p_height; end if;
 return v_id;
end $$;
revoke all on function public.site_admin_custom_media_register(text,text,text,text,text,text,integer,integer,integer,double precision) from public;

-- Compare only the edited field and design. Preserve concurrent hours/contact,
-- booking data, publication state, restore slot and all other document fields.
create function public.site_admin_custom_apply(p_session text,p_slug text,p_field text,p_expected jsonb,p_design jsonb,p_value jsonb)
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
       and not exists(select 1 from public.site_media_assets a where a.site_id=s.id and a.storage_provider='vercel_blob'
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
         and not exists(select 1 from public.site_media_assets a where a.site_id=s.id and a.storage_provider='vercel_blob'
           and a.storage_access='public' and a.provider_authority is not null and a.public_url=source->>'src'
           and a.mime_type='video/mp4' and source->>'type'='video/mp4' and to_jsonb(a.byte_size)=source->'bytes'
           and to_jsonb(a.width)=item->'width' and to_jsonb(a.height)=item->'height') then return null; end if;
     end loop;
   end loop;
 end if;
 update public.sites set generated_document=jsonb_set(generated_document,array[p_field],p_value) where id=s.id;
 return p_value;
end $$;
revoke all on function public.site_admin_custom_apply(text,text,text,jsonb,jsonb,jsonb) from public;
