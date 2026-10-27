-- Additive Owner-only media boundary. No table/data changes; existing Site
-- Admin WebP routine, public delivery and cleanup bindings remain unchanged.
create function public.owner_custom_media_context(p_session text,p_slug text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; s record; v_duration integer; begin
 select * into a from public.owner_auth_resolve_session(p_session,'websites.manage');
 if a.owner_id is null then return null; end if;
 select * into s from public.sites where slug=p_slug and site_kind='business';
 if s.id is null then return null; end if;
 if not exists(select 1 from public.site_features f where f.site_id=s.id and f.feature_key='editor' and f.enabled)
   or not exists(select 1 from public.site_features f where f.site_id=s.id and f.feature_key='media' and f.enabled)
   or not (
     (s.activated_at is null and s.demo_expires_at>statement_timestamp())
     or exists(select 1 from public.site_complimentary_access c where c.site_id=s.id and c.status='complimentary_active')
     or exists(select 1 from public.site_subscriptions sub where sub.site_id=s.id and (
       (sub.status in('active','trialing') and (not sub.cancel_at_period_end or sub.current_period_end>statement_timestamp()))
       or (sub.status='past_due' and sub.payment_grace_ends_at>statement_timestamp())))
   ) then return null; end if;
 v_duration:=30;
 if coalesce(s.generated_document#>>'{customDesign,video,maxDurationSeconds}','') ~ '^[0-9]{1,2}$' then
   v_duration:=greatest(1,least(60,(s.generated_document#>>'{customDesign,video,maxDurationSeconds}')::integer));
 end if;
 if s.generated_document#>>'{customDesign,video,mode}'='decorative-loop' then v_duration:=least(12,v_duration); end if;
 return jsonb_build_object('siteId',s.id,'maxDurationSeconds',v_duration);
end $$;
revoke all on function public.owner_custom_media_context(text,text) from public;

create function public.owner_custom_media_register(p_session text,p_slug text,p_authority text,p_key text,p_url text,p_mime text,p_bytes integer,p_width integer,p_height integer,p_duration double precision)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb; v_id uuid; v_site text; begin
 c:=public.owner_custom_media_context(p_session,p_slug);
 if c is null then return null; end if;
 v_site:=c->>'siteId';
 -- Serialize with custom-design/site lifecycle mutation and recheck authority.
 perform 1 from public.sites where id=v_site for update;
 c:=public.owner_custom_media_context(p_session,p_slug);
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
revoke all on function public.owner_custom_media_register(text,text,text,text,text,text,integer,integer,integer,double precision) from public;
