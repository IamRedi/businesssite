-- Task Group 3-B3C2: Information/News and REDI CONTROL inbound boundaries.
-- RLS is deliberately non-FORCE. Role grants remain an explicit provisioning step.

alter table public.site_editorial_settings enable row level security;
alter table public.site_editorial_memberships enable row level security;
alter table public.site_article_categories enable row level security;
alter table public.site_articles enable row level security;
alter table public.site_article_sources enable row level security;
alter table public.site_article_media enable row level security;
alter table public.site_media_assets enable row level security;
alter table public.site_content_audit_events enable row level security;
alter table public.integration_nonces enable row level security;
alter table public.integration_api_requests enable row level security;

-- Existing publication editors remain a canonical, tenant-scoped CMS actor.
-- The platform-owner role controls publication provisioning and REDI grants.
create or replace function public.information_editorial_role()
returns text language sql stable security definer set search_path=pg_catalog as $$
 select m.role from public.site_editorial_memberships m
 join public.site_admin_accounts a on a.id=m.account_id and a.site_id=m.site_id
 join public.sites s on s.id=m.site_id and s.site_kind='information'
 where public.app_context_is_valid_site_admin() and m.site_id=public.app_context_site_id()::text
   and a.id=(select r.account_id from public.site_admin_resolve_session(nullif(current_setting('app.session_hash',true),'')) r limit 1)
 limit 1
$$;

create or replace function public.information_editorial_allowed(p_permission text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select case public.information_editorial_role()
  when 'administrator' then p_permission=any(array['read','write','publish','delete','settings'])
  when 'publisher' then p_permission=any(array['read','write','publish'])
  when 'editor' then p_permission=any(array['read','write'])
  else false end
$$;

revoke all on function public.information_editorial_role() from public;
revoke all on function public.information_editorial_allowed(text) from public;

create or replace function public.information_editorial_install_context(p_session_hash text,p_expected_site text)
returns table(account_id uuid,site_id text,role text)
language plpgsql security definer set search_path=pg_catalog as $$
declare v record;
begin
 select a.account_id,a.site_id,m.role into v from public.site_admin_resolve_session(p_session_hash) a
 join public.site_editorial_memberships m on m.account_id=a.account_id and m.site_id=a.site_id
 join public.sites s on s.id=a.site_id and s.site_kind='information'
 where a.site_id=p_expected_site limit 1;
 if v.account_id is null then return; end if;
 perform set_config('app.actor_kind','site_admin',true),set_config('app.site_id',v.site_id,true),
  set_config('app.owner_id','',true),set_config('app.request_id','',true),set_config('app.system_purpose','',true),
  set_config('app.owner_role','',true),set_config('app.owner_permission','',true),set_config('app.session_hash',p_session_hash,true);
 return query select v.account_id,v.site_id,v.role;
end $$;
revoke all on function public.information_editorial_install_context(text,text) from public;

drop policy if exists information_settings_editorial_select on public.site_editorial_settings;
create policy information_settings_editorial_select on public.site_editorial_settings for select
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text);
drop policy if exists information_settings_editorial_update on public.site_editorial_settings;
create policy information_settings_editorial_update on public.site_editorial_settings for update
 using(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);

drop policy if exists information_memberships_editorial_select on public.site_editorial_memberships;
create policy information_memberships_editorial_select on public.site_editorial_memberships for select
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text);

drop policy if exists information_categories_editorial_all on public.site_article_categories;
drop policy if exists information_categories_editorial_select on public.site_article_categories;
drop policy if exists information_categories_editorial_insert on public.site_article_categories;
drop policy if exists information_categories_editorial_update on public.site_article_categories;
drop policy if exists information_categories_editorial_delete on public.site_article_categories;
create policy information_categories_editorial_select on public.site_article_categories for select
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text);
create policy information_categories_editorial_insert on public.site_article_categories for insert
 with check(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);
create policy information_categories_editorial_update on public.site_article_categories for update
 using(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);
create policy information_categories_editorial_delete on public.site_article_categories for delete
 using(public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);

drop policy if exists information_articles_editorial_all on public.site_articles;
create policy information_articles_editorial_all on public.site_articles
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('write') and site_id=public.app_context_site_id()::text);

drop policy if exists information_sources_editorial_all on public.site_article_sources;
create policy information_sources_editorial_all on public.site_article_sources
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('write') and site_id=public.app_context_site_id()::text);

drop policy if exists information_article_media_editorial_all on public.site_article_media;
create policy information_article_media_editorial_all on public.site_article_media
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('write') and site_id=public.app_context_site_id()::text);

drop policy if exists information_media_editorial_all on public.site_media_assets;
create policy information_media_editorial_all on public.site_media_assets
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text)
 with check(public.information_editorial_allowed('write') and site_id=public.app_context_site_id()::text);

drop policy if exists information_audit_editorial_select on public.site_content_audit_events;
create policy information_audit_editorial_select on public.site_content_audit_events for select
 using(public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text);
drop policy if exists information_audit_editorial_insert on public.site_content_audit_events;
create policy information_audit_editorial_insert on public.site_content_audit_events for insert
 with check(public.information_editorial_allowed('write') and site_id=public.app_context_site_id()::text
  and actor_type='site_admin' and actor_id=(select r.account_id::text from public.site_admin_resolve_session(nullif(current_setting('app.session_hash',true),'')) r limit 1));

create or replace function public.information_editorial_article_guard()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if not row_security_active('public.site_articles'::regclass) then return case when tg_op='DELETE' then old else new end; end if;
 if public.app_context_actor_kind()<>'site_admin' then raise exception 'Editorial database context required'; end if;
 if tg_op='DELETE' then
  if not public.information_editorial_allowed('delete') then raise exception 'Editorial delete permission denied'; end if; return old;
 end if;
 if tg_op='INSERT' and new.status not in('draft','pending') then raise exception 'Browser publication state denied'; end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if not ((old.status='draft' and new.status='pending' and public.information_editorial_allowed('write'))
    or (old.status='pending' and new.status in('published','archived') and public.information_editorial_allowed('publish'))
    or (old.status='published' and new.status='archived' and public.information_editorial_allowed('publish'))) then
   raise exception 'Invalid editorial article transition';
  end if;
 end if;
 if new.status='published' and (btrim(new.title)='' or jsonb_array_length(new.body->'blocks')=0) then raise exception 'Published article is incomplete'; end if;
 if tg_op='UPDATE' then new.updated_at:=statement_timestamp(); end if;
 return new;
end $$;
revoke all on function public.information_editorial_article_guard() from public;
drop trigger if exists information_editorial_article_guard_trigger on public.site_articles;
create trigger information_editorial_article_guard_trigger before insert or update or delete on public.site_articles
for each row execute function public.information_editorial_article_guard();

-- A public resolver returns one reviewed projection, never raw rows or storage keys.
create or replace function public.resolve_public_information_site(p_kind text,p_identity text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object(
  'siteId',s.id,'slug',s.slug,'publicationName',e.publication_name,'tagline',e.tagline,
  'subcategory',e.subcategory,'locale',e.locale,'themeKey',e.theme_key,'navigation',e.navigation,
  'updatedAt',e.updated_at,
  'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'description',c.description,'sortOrder',c.sort_order) order by c.sort_order,c.name)
    from public.site_article_categories c where c.site_id=s.id),'[]'::jsonb),
  'adSlots',coalesce((select jsonb_agg(jsonb_build_object('siteId',a.site_id,'slotKey',a.slot_key,'format',a.format,'enabled',a.enabled,'updatedAt',a.updated_at) order by a.slot_key)
    from public.site_information_ad_slots a where a.site_id=s.id and a.enabled),'[]'::jsonb))
 from public.sites s join public.site_editorial_settings e on e.site_id=s.id
 where p_kind in('slug','domain') and length(p_identity) between 1 and 253
   and s.site_kind='information' and s.visibility='public' and s.activated_at is not null
   and ((p_kind='slug' and s.slug=p_identity) or
        (p_kind='domain' and s.custom_domain=lower(p_identity) and s.custom_domain_status='verified'))
 limit 1
$$;

create or replace function public.resolve_public_information_articles(p_kind text,p_identity text,p_filter jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with target as(
  select s.id from public.sites s where p_kind in('slug','domain') and s.site_kind='information'
   and s.visibility='public' and s.activated_at is not null
   and ((p_kind='slug' and s.slug=p_identity) or (p_kind='domain' and s.custom_domain=lower(p_identity) and s.custom_domain_status='verified')) limit 1
 ), rows as(
  select a.id,a.slug,a.title,a.excerpt,a.tags,a.display_author,a.featured,a.published_at,a.featured_image_alt,
   c.id category_id,c.name category_name,c.slug category_slug,c.description category_description,c.sort_order category_sort_order,
   case when m.id is not null then '/api/media/'||m.id end featured_image_url
  from target t join public.site_articles a on a.site_id=t.id
  left join public.site_article_categories c on c.site_id=a.site_id and c.id=a.category_id
  left join public.site_media_assets m on m.site_id=a.site_id and m.id=a.featured_media_id
  where a.status='published' and a.published_at is not null and (a.publish_at is null or a.publish_at<=statement_timestamp())
   and (nullif(p_filter->>'categorySlug','') is null or c.slug=p_filter->>'categorySlug')
   and (nullif(p_filter->>'tag','') is null or lower(p_filter->>'tag')=any(a.tags))
   and (nullif(p_filter->>'query','') is null or a.title ilike '%'||left(p_filter->>'query',120)||'%' or a.excerpt ilike '%'||left(p_filter->>'query',120)||'%')
   and ((p_filter->>'publishedAt') is null or (a.published_at,a.id)<((p_filter->>'publishedAt')::timestamptz,(p_filter->>'id')::uuid))
  order by case when coalesce((p_filter->>'featuredFirst')::boolean,false) then a.featured::int else 0 end desc,a.published_at desc,a.id desc
  limit least(greatest(coalesce((p_filter->>'limit')::integer,25),1),100)+1
 )
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(r) order by (case when coalesce((p_filter->>'featuredFirst')::boolean,false) then r.featured::int else 0 end) desc,r.published_at desc,r.id desc),'[]'::jsonb)) from rows r
$$;

create or replace function public.resolve_public_information_article(p_kind text,p_identity text,p_slug text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select to_jsonb(x) from(
  select a.id,a.site_id,a.slug,a.title,a.excerpt,a.body,a.tags,a.display_author,a.featured,a.published_at,
   a.featured_image_alt,a.seo_title,a.seo_description,a.canonical_url,
   case when fm.id is not null then '/api/media/'||fm.id end featured_image_url,
   case when c.id is null then null else jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'description',c.description,'sortOrder',c.sort_order) end category,
   coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'url','/api/media/'||m.id,'altText',m.alt_text,'sortOrder',am.sort_order) order by am.sort_order)
     from public.site_article_media am join public.site_media_assets m on m.site_id=am.site_id and m.id=am.media_id where am.site_id=a.site_id and am.article_id=a.id),'[]'::jsonb) article_media,
   coalesce((select jsonb_agg(jsonb_build_object('label',src.label,'url',src.url,'sortOrder',src.sort_order) order by src.sort_order)
     from public.site_article_sources src where src.site_id=a.site_id and src.article_id=a.id),'[]'::jsonb) sources
  from public.sites s join public.site_articles a on a.site_id=s.id
  left join public.site_article_categories c on c.site_id=a.site_id and c.id=a.category_id
  left join public.site_media_assets fm on fm.site_id=a.site_id and fm.id=a.featured_media_id
  where p_kind in('slug','domain') and a.slug=p_slug and s.site_kind='information' and s.visibility='public' and s.activated_at is not null
   and a.status='published' and a.published_at is not null and (a.publish_at is null or a.publish_at<=statement_timestamp())
   and ((p_kind='slug' and s.slug=p_identity) or (p_kind='domain' and s.custom_domain=lower(p_identity) and s.custom_domain_status='verified')) limit 1
 ) x
$$;

create or replace function public.resolve_public_information_media(p_asset uuid)
returns table(site_id text,storage_provider text,storage_key text,storage_access text,mime_type text,byte_size integer,custom_domain text,custom_domain_verified boolean,publicly_available boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select m.site_id,m.storage_provider,m.storage_key,m.storage_access,m.mime_type,m.byte_size,s.custom_domain,s.custom_domain_status='verified',true
 from public.site_media_assets m join public.sites s on s.id=m.site_id
 where m.id=p_asset and s.site_kind='information' and s.visibility='public' and s.activated_at is not null
 and exists(select 1 from public.site_articles a where a.site_id=m.site_id and a.status='published' and a.published_at is not null
   and (a.publish_at is null or a.publish_at<=statement_timestamp()) and (a.featured_media_id=m.id or exists(select 1 from public.site_article_media am where am.site_id=a.site_id and am.article_id=a.id and am.media_id=m.id)))
 limit 1
$$;

create or replace function public.resolve_editor_information_media(p_session_hash text,p_asset uuid)
returns table(site_id text,storage_provider text,storage_key text,storage_access text,mime_type text,byte_size integer,custom_domain text,custom_domain_verified boolean,publicly_available boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select m.site_id,m.storage_provider,m.storage_key,m.storage_access,m.mime_type,m.byte_size,s.custom_domain,s.custom_domain_status='verified',false
 from public.site_admin_resolve_session(p_session_hash) a
 join public.site_editorial_memberships em on em.account_id=a.account_id and em.site_id=a.site_id
 join public.sites s on s.id=a.site_id and s.site_kind='information'
 join public.site_media_assets m on m.site_id=a.site_id and m.id=p_asset limit 1
$$;

create or replace function public.resolve_information_media_blob(p_asset uuid,p_session_hash text default null)
returns table(content_type text,data bytea) language sql stable security definer set search_path=pg_catalog as $$
 select b.content_type,b.data from public.site_media_assets m join public.site_media_blobs b on b.site_id=m.site_id and b.id::text=m.storage_key
 where m.id=p_asset and m.storage_provider='postgres' and (
  exists(select 1 from public.resolve_public_information_media(p_asset)) or
  exists(select 1 from public.resolve_editor_information_media(p_session_hash,p_asset))) limit 1
$$;

-- Platform owner/admin publication provisioning. Role and actor are always DB-derived.
create or replace function public.owner_information_create_publication(p_session_hash text,p_input jsonb,p_password_hash text,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_site text:=p_input->>'id'; v_slug text:=lower(p_input->>'slug'); v_email text:=lower(btrim(p_input->>'email')); v_account uuid:=gen_random_uuid();
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'information.manage');
 if v_actor.owner_id is null then return null; end if;
 if v_site is null or length(v_site)>160 or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug)>180
  or position('@' in v_email)<2 or p_password_hash is null or length(p_password_hash)>1000
  or p_input->>'visibility'<>'public' or p_input->>'subcategory' not in('news','technology_ai','science','magazine','blog','local_news','industry_news','general_information')
  or p_input->>'locale' not in('en','de','fr','es','it','sq') then return null; end if;
 -- Provisioning is rare; one transaction lock makes the friendly uniqueness
 -- checks race-safe across both slug and administrator email.
 perform pg_advisory_xact_lock(7310431);
 if exists(select 1 from public.sites where slug=v_slug) then raise exception 'publication_slug_taken'; end if;
 if exists(select 1 from public.site_admin_accounts where email=v_email) then raise exception 'publication_admin_email_taken'; end if;
 insert into public.sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,onboarding_source,trial_email,site_kind)
 values(v_site,v_slug,'public','public',p_input->'document',statement_timestamp(),statement_timestamp(),statement_timestamp(),'owner_outreach',v_email,'information');
 insert into public.site_admin_accounts(id,site_id,email,password_hash) values(v_account,v_site,v_email,p_password_hash);
 insert into public.site_editorial_settings(site_id,publication_name,tagline,subcategory,locale,theme_key,navigation)
 values(v_site,btrim(p_input->>'publicationName'),nullif(btrim(p_input->>'tagline'),''),p_input->>'subcategory',p_input->>'locale',coalesce(nullif(p_input->>'themeKey',''),'auto'),'[]'::jsonb);
 insert into public.site_editorial_memberships(account_id,site_id,role,granted_by) values(v_account,v_site,'administrator','owner-publication-create');
 insert into public.site_content_audit_events(id,site_id,actor_type,actor_id,action,details) values(gen_random_uuid(),v_site,'owner',v_actor.owner_id::text,'information_site.created',jsonb_build_object('slug',v_slug,'correlationId',left(p_correlation,128)));
 return jsonb_build_object('siteId',v_site,'slug',v_slug,'accountId',v_account,'email',v_email);
exception when unique_violation then raise; when check_violation or foreign_key_violation then return null;
end $$;

create or replace function public.owner_information_configure_redi(p_session_hash text,p_slug text,p_enabled boolean,p_permissions text[],p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_site text; v record;
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'information.manage'); if v_actor.owner_id is null then return null; end if;
 if p_permissions is null or not p_permissions <@ array['articles:read','articles:create','articles:update','articles:submit','articles:publish','articles:archive','media:read','media:write']::text[] then return null; end if;
 select id into v_site from public.sites where slug=p_slug and site_kind='information' for update; if v_site is null then return null; end if;
 update public.site_external_integrations set inbound_enabled=p_enabled,inbound_permissions=(select array_agg(distinct x order by x) from unnest(p_permissions) x),
  inbound_approved_at=case when p_enabled then statement_timestamp() end,inbound_approved_by=case when p_enabled then v_actor.owner_id::text end,updated_at=statement_timestamp()
 where site_id=v_site and provider='redi_control' and status='active' and external_installation_id is not null returning * into v;
 if v.id is null then return null; end if;
 insert into public.site_content_audit_events(id,site_id,actor_type,actor_id,action,details) values(gen_random_uuid(),v_site,'owner',v_actor.owner_id::text,'integration.inbound_grant_changed',jsonb_build_object('enabled',p_enabled,'permissions',p_permissions,'correlationId',left(p_correlation,128)));
 return jsonb_build_object('externalInstallationId',v.external_installation_id,'enabled',v.inbound_enabled,'permissions',v.inbound_permissions,'approvedAt',v.inbound_approved_at,'approvedBy',v.inbound_approved_by);
end $$;

create or replace function public.owner_information_configure_ad_slots(p_session_hash text,p_site text,p_slots jsonb,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_slot jsonb;
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'information.manage'); if v_actor.owner_id is null then return null; end if;
 if not exists(select 1 from public.sites where id=p_site and site_kind='information') or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots)>4 then return null; end if;
 if exists(select 1 from jsonb_array_elements(p_slots) x where x->>'slotKey' not in('home_after_featured','category_before_feed','article_after_media','article_sidebar') or x->>'format' not in('auto','leaderboard','rectangle','in_feed') or jsonb_typeof(x->'enabled')<>'boolean') then return null; end if;
 for v_slot in select value from jsonb_array_elements(p_slots) loop
  insert into public.site_information_ad_slots(site_id,slot_key,format,enabled) values(p_site,v_slot->>'slotKey',v_slot->>'format',(v_slot->>'enabled')::boolean)
  on conflict(site_id,slot_key) do update set format=excluded.format,enabled=excluded.enabled,updated_at=statement_timestamp();
 end loop;
 insert into public.site_content_audit_events(id,site_id,actor_type,actor_id,action,details) values(gen_random_uuid(),p_site,'owner',v_actor.owner_id::text,'information_ad_slots.configured',jsonb_build_object('slots',p_slots,'correlationId',left(p_correlation,128)));
 return (select coalesce(jsonb_agg(jsonb_build_object('siteId',a.site_id,'slotKey',a.slot_key,'format',a.format,'enabled',a.enabled,'updatedAt',a.updated_at) order by a.slot_key),'[]'::jsonb) from public.site_information_ad_slots a where a.site_id=p_site);
end $$;

-- REDI bootstrap is exact, disabled by default in application configuration, and
-- never trusts a site or permission supplied by the request body.
create or replace function public.information_redi_bootstrap(p_installation text,p_permission text)
returns table(integration_id uuid,site_id text,permissions text[],approved_at timestamptz,approved_by text)
language sql stable security definer set search_path=pg_catalog as $$
 select i.id,i.site_id,i.inbound_permissions,i.inbound_approved_at,i.inbound_approved_by
 from public.site_external_integrations i join public.sites s on s.id=i.site_id and s.site_kind='information'
 where i.provider='redi_control' and i.external_installation_id=p_installation and i.status='active' and i.inbound_enabled
  and i.inbound_approved_at is not null and i.inbound_approved_by is not null and p_permission=any(i.inbound_permissions) limit 1
$$;

create or replace function public.information_redi_reserve_nonce(p_integration uuid,p_site text,p_nonce text,p_signed_at timestamptz,p_tolerance integer)
returns boolean language sql security definer set search_path=pg_catalog as $$
 with valid as(select 1 from public.site_external_integrations i join public.sites s on s.id=i.site_id and s.site_kind='information'
  where i.id=p_integration and i.site_id=p_site and i.provider='redi_control' and i.status='active' and i.inbound_enabled), ins as(
 insert into public.integration_nonces(integration_id,site_id,nonce,signed_at,expires_at)
 select p_integration,p_site,p_nonce,p_signed_at,p_signed_at+(least(greatest(p_tolerance,30),900)*interval '1 second') from valid
 where length(p_nonce) between 16 and 200 and abs(extract(epoch from(statement_timestamp()-p_signed_at)))<=least(greatest(p_tolerance,30),900)
 on conflict do nothing returning 1) select exists(select 1 from ins)
$$;

create or replace function public.information_redi_begin_request(p_integration uuid,p_site text,p_key text,p_operation text,p_hash text,p_ttl integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_inserted boolean:=false;
begin
 if p_operation not in('articles.create','articles.update','articles.submit','articles.publish','articles.archive','media.create') or p_hash !~ '^[a-f0-9]{64}$' or length(p_key) not between 8 and 200 then return jsonb_build_object('outcome','conflict'); end if;
 if not exists(select 1 from public.site_external_integrations i where i.id=p_integration and i.site_id=p_site and i.provider='redi_control' and i.status='active' and i.inbound_enabled) then return jsonb_build_object('outcome','conflict'); end if;
 insert into public.integration_api_requests as r(integration_id,site_id,idempotency_key,operation,request_hash,expires_at)
 values(p_integration,p_site,p_key,p_operation,p_hash,statement_timestamp()+(least(greatest(p_ttl,300),604800)*interval '1 second'))
 on conflict(integration_id,idempotency_key) do update set site_id=excluded.site_id,operation=excluded.operation,request_hash=excluded.request_hash,state='processing',response_status=null,response_body=null,expires_at=excluded.expires_at,updated_at=statement_timestamp()
 where r.expires_at<=statement_timestamp() or (r.state='failed' and r.site_id=excluded.site_id and r.operation=excluded.operation and r.request_hash=excluded.request_hash)
 returning *,true into v; v_inserted:=found;
 if not v_inserted then select *,false into v from public.integration_api_requests where integration_id=p_integration and idempotency_key=p_key; end if;
 if v.site_id<>p_site or v.operation<>p_operation or v.request_hash<>p_hash then return jsonb_build_object('outcome','conflict'); end if;
 if v_inserted then return jsonb_build_object('outcome','claimed','requestHash',p_hash); end if;
 if v.state='completed' then return jsonb_build_object('outcome','replay','requestHash',p_hash,'responseStatus',v.response_status,'responseBody',v.response_body); end if;
 return jsonb_build_object('outcome','in_progress','requestHash',p_hash);
end $$;

create or replace function public.information_redi_finish_request(p_integration uuid,p_key text,p_hash text,p_state text,p_status integer,p_body jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_state not in('completed','failed') or p_status not between 100 and 599 then return false; end if;
 update public.integration_api_requests set state=p_state,response_status=p_status,response_body=p_body,updated_at=statement_timestamp()
 where integration_id=p_integration and idempotency_key=p_key and request_hash=p_hash and state='processing';
 return found;
end $$;

create or replace function public.information_redi_allowed(p_integration uuid,p_site text,p_permission text)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.site_external_integrations i join public.sites s on s.id=i.site_id and s.site_kind='information'
  where i.id=p_integration and i.site_id=p_site and i.provider='redi_control' and i.status='active' and i.inbound_enabled
   and i.inbound_approved_at is not null and i.inbound_approved_by is not null and p_permission=any(i.inbound_permissions))
$$;

create or replace function public.information_redi_article_json(p_integration uuid,p_site text,p_article uuid,p_permission text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select to_jsonb(a)||jsonb_build_object(
  'sources',coalesce((select jsonb_agg(jsonb_build_object('label',s.label,'url',s.url,'sort_order',s.sort_order) order by s.sort_order) from public.site_article_sources s where s.site_id=a.site_id and s.article_id=a.id),'[]'::jsonb),
  'article_media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'url','/api/media/'||m.id,'alt_text',m.alt_text,'sort_order',am.sort_order) order by am.sort_order) from public.site_article_media am join public.site_media_assets m on m.site_id=am.site_id and m.id=am.media_id where am.site_id=a.site_id and am.article_id=a.id),'[]'::jsonb))
 from public.site_articles a where public.information_redi_allowed(p_integration,p_site,p_permission) and a.site_id=p_site and a.id=p_article
$$;

create or replace function public.information_redi_list_articles(p_integration uuid,p_site text,p_filter jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc),'[]'::jsonb) from(
  select a.* from public.site_articles a where public.information_redi_allowed(p_integration,p_site,'articles:read') and a.site_id=p_site
   and (nullif(p_filter->>'status','') is null or a.status=p_filter->>'status')
   and (nullif(p_filter->>'categoryId','') is null or a.category_id=(p_filter->>'categoryId')::uuid)
   and (nullif(p_filter->>'tag','') is null or lower(p_filter->>'tag')=any(a.tags))
   and (nullif(p_filter->>'query','') is null or a.title ilike '%'||left(p_filter->>'query',120)||'%' or a.excerpt ilike '%'||left(p_filter->>'query',120)||'%')
   and ((p_filter->>'createdAt') is null or (a.created_at,a.id)<((p_filter->>'createdAt')::timestamptz,(p_filter->>'id')::uuid))
  order by a.created_at desc,a.id desc limit least(greatest(coalesce((p_filter->>'limit')::integer,25),1),100)+1
 ) a
$$;

create or replace function public.information_redi_external_article(p_integration uuid,p_site text,p_reference text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select public.information_redi_article_json(p_integration,p_site,a.id,'articles:create') from public.site_articles a
 where public.information_redi_allowed(p_integration,p_site,'articles:create') and a.site_id=p_site and a.external_source='redi_control' and a.external_reference=p_reference limit 1
$$;

create or replace function public.information_redi_create_article(p_integration uuid,p_site text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); v_media uuid; v_source jsonb; v_index integer:=0;
begin
 if not public.information_redi_allowed(p_integration,p_site,'articles:create') or p_input->>'externalSource'<>'redi_control'
  or coalesce(p_input->>'status','draft') not in('draft','pending') then return null; end if;
 if nullif(p_input->>'featuredMediaId','') is not null and not exists(select 1 from public.site_media_assets where site_id=p_site and id=(p_input->>'featuredMediaId')::uuid) then return null; end if;
 insert into public.site_articles(id,site_id,category_id,external_source,external_reference,slug,title,excerpt,body,featured_media_id,featured_image_alt,tags,display_author,status,featured,publish_at,seo_title,seo_description,canonical_url)
 values(v_id,p_site,nullif(p_input->>'categoryId','')::uuid,'redi_control',nullif(p_input->>'externalReference',''),lower(p_input->>'slug'),p_input->>'title',coalesce(p_input->>'excerpt',''),p_input->'body',nullif(p_input->>'featuredMediaId','')::uuid,nullif(p_input->>'featuredImageAlt',''),
  coalesce(array(select jsonb_array_elements_text(coalesce(p_input->'tags','[]'::jsonb))),'{}'),nullif(p_input->>'displayAuthor',''),coalesce(p_input->>'status','draft'),coalesce((p_input->>'featured')::boolean,false),nullif(p_input->>'publishAt','')::timestamptz,nullif(p_input->>'seoTitle',''),nullif(p_input->>'seoDescription',''),nullif(p_input->>'canonicalUrl',''));
 for v_source in select value from jsonb_array_elements(coalesce(p_input->'sources','[]'::jsonb)) loop
  insert into public.site_article_sources(id,site_id,article_id,label,url,sort_order) values(gen_random_uuid(),p_site,v_id,nullif(v_source->>'label',''),v_source->>'url',v_index); v_index:=v_index+1;
 end loop;
 v_index:=0; for v_media in select value::text::uuid from jsonb_array_elements(coalesce(p_input->'articleMediaIds','[]'::jsonb)) loop
  insert into public.site_article_media(site_id,article_id,media_id,sort_order) values(p_site,v_id,v_media,v_index); v_index:=v_index+1;
 end loop;
 insert into public.site_content_audit_events(id,site_id,article_id,actor_type,actor_id,action,details) values(gen_random_uuid(),p_site,v_id,'integration',p_integration::text,'article.created','{}');
 return public.information_redi_article_json(p_integration,p_site,v_id,'articles:create');
end $$;

create or replace function public.information_redi_update_article(p_integration uuid,p_site text,p_article uuid,p_version integer,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_current public.site_articles; v_source jsonb; v_media uuid; v_index integer:=0;
begin
 if not public.information_redi_allowed(p_integration,p_site,'articles:update') then return null; end if;
 select * into v_current from public.site_articles where site_id=p_site and id=p_article for update;
 if v_current.id is null then return null; end if; if v_current.lock_version<>p_version then raise exception 'article_version_conflict'; end if;
 if v_current.status<>'draft' then raise exception 'draft_required'; end if;
 update public.site_articles set category_id=case when p_patch?'categoryId' then nullif(p_patch->>'categoryId','')::uuid else category_id end,
  slug=case when p_patch?'slug' then lower(p_patch->>'slug') else slug end,title=case when p_patch?'title' then p_patch->>'title' else title end,
  excerpt=case when p_patch?'excerpt' then p_patch->>'excerpt' else excerpt end,body=case when p_patch?'body' then p_patch->'body' else body end,
  featured_media_id=case when p_patch?'featuredMediaId' then nullif(p_patch->>'featuredMediaId','')::uuid else featured_media_id end,
  featured_image_alt=case when p_patch?'featuredImageAlt' then nullif(p_patch->>'featuredImageAlt','') else featured_image_alt end,
  tags=case when p_patch?'tags' then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end,
  display_author=case when p_patch?'displayAuthor' then nullif(p_patch->>'displayAuthor','') else display_author end,
  featured=case when p_patch?'featured' then (p_patch->>'featured')::boolean else featured end,
  publish_at=case when p_patch?'publishAt' then nullif(p_patch->>'publishAt','')::timestamptz else publish_at end,
  seo_title=case when p_patch?'seoTitle' then nullif(p_patch->>'seoTitle','') else seo_title end,
  seo_description=case when p_patch?'seoDescription' then nullif(p_patch->>'seoDescription','') else seo_description end,
  canonical_url=case when p_patch?'canonicalUrl' then nullif(p_patch->>'canonicalUrl','') else canonical_url end,
  lock_version=lock_version+1,updated_at=statement_timestamp() where site_id=p_site and id=p_article;
 if p_patch?'sources' then delete from public.site_article_sources where site_id=p_site and article_id=p_article; for v_source in select value from jsonb_array_elements(p_patch->'sources') loop insert into public.site_article_sources(id,site_id,article_id,label,url,sort_order) values(gen_random_uuid(),p_site,p_article,nullif(v_source->>'label',''),v_source->>'url',v_index);v_index:=v_index+1;end loop; end if;
 if p_patch?'articleMediaIds' then v_index:=0;delete from public.site_article_media where site_id=p_site and article_id=p_article;for v_media in select value::text::uuid from jsonb_array_elements(p_patch->'articleMediaIds') loop insert into public.site_article_media(site_id,article_id,media_id,sort_order) values(p_site,p_article,v_media,v_index);v_index:=v_index+1;end loop;end if;
 insert into public.site_content_audit_events(id,site_id,article_id,actor_type,actor_id,action,details) values(gen_random_uuid(),p_site,p_article,'integration',p_integration::text,'article.updated',jsonb_build_object('fromVersion',p_version));
 return public.information_redi_article_json(p_integration,p_site,p_article,'articles:update');
end $$;

create or replace function public.information_redi_transition_article(p_integration uuid,p_site text,p_article uuid,p_version integer,p_target text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_current public.site_articles; v_permission text:='articles:'||case p_target when 'pending' then 'submit' else p_target end;
begin
 if p_target not in('pending','published','archived') or not public.information_redi_allowed(p_integration,p_site,v_permission) then return null; end if;
 select * into v_current from public.site_articles where site_id=p_site and id=p_article for update; if v_current.id is null then return null; end if;
 if v_current.lock_version<>p_version then raise exception 'article_version_conflict'; end if;
 if not ((v_current.status='draft' and p_target='pending') or (v_current.status='pending' and p_target in('published','archived')) or (v_current.status='published' and p_target='archived')) then raise exception 'invalid_article_transition'; end if;
 if p_target='published' and (btrim(v_current.title)='' or jsonb_array_length(v_current.body->'blocks')=0) then raise exception 'published_article_incomplete'; end if;
 update public.site_articles set status=p_target,published_at=case when p_target='published' then coalesce(published_at,statement_timestamp()) else published_at end,lock_version=lock_version+1,updated_at=statement_timestamp() where site_id=p_site and id=p_article;
 insert into public.site_content_audit_events(id,site_id,article_id,actor_type,actor_id,action,details) values(gen_random_uuid(),p_site,p_article,'integration',p_integration::text,'article.'||p_target,jsonb_build_object('fromStatus',v_current.status));
 return public.information_redi_article_json(p_integration,p_site,p_article,v_permission);
end $$;

create or replace function public.information_redi_list_media(p_integration uuid,p_site text,p_filter jsonb)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(m)-'storage_key'-'public_url' order by m.created_at desc,m.id desc),'[]'::jsonb) from(
 select * from public.site_media_assets m where public.information_redi_allowed(p_integration,p_site,'media:read') and m.site_id=p_site
 and ((p_filter->>'createdAt') is null or (m.created_at,m.id)<((p_filter->>'createdAt')::timestamptz,(p_filter->>'id')::uuid))
 order by m.created_at desc,m.id desc limit least(greatest(coalesce((p_filter->>'limit')::integer,25),1),100)+1) m
$$;

create or replace function public.information_redi_register_media(p_integration uuid,p_site text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v public.site_media_assets;
begin
 if not public.information_redi_allowed(p_integration,p_site,'media:write') or p_input->>'mimeType'<>'image/webp' or p_input->>'storageAccess'<>'private' then return null; end if;
 insert into public.site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,alt_text,width,height,byte_size)
 values(gen_random_uuid(),p_site,p_input->>'storageProvider',p_input->>'storageKey','private','/api/media/'||gen_random_uuid(),p_input->>'mimeType',nullif(p_input->>'altText',''),(p_input->>'width')::integer,(p_input->>'height')::integer,(p_input->>'byteSize')::integer) returning * into v;
 update public.site_media_assets set public_url='/api/media/'||id where id=v.id returning * into v;
 insert into public.site_content_audit_events(id,site_id,actor_type,actor_id,action,details) values(gen_random_uuid(),p_site,'integration',p_integration::text,'media.registered',jsonb_build_object('mediaId',v.id,'byteSize',v.byte_size));
 return to_jsonb(v)-'storage_key';
end $$;

revoke all on function public.resolve_public_information_site(text,text) from public;
revoke all on function public.resolve_public_information_articles(text,text,jsonb) from public;
revoke all on function public.resolve_public_information_article(text,text,text) from public;
revoke all on function public.resolve_public_information_media(uuid) from public;
revoke all on function public.resolve_editor_information_media(text,uuid) from public;
revoke all on function public.resolve_information_media_blob(uuid,text) from public;
revoke all on function public.owner_information_create_publication(text,jsonb,text,text) from public;
revoke all on function public.owner_information_configure_redi(text,text,boolean,text[],text) from public;
revoke all on function public.owner_information_configure_ad_slots(text,text,jsonb,text) from public;
revoke all on function public.information_redi_bootstrap(text,text) from public;
revoke all on function public.information_redi_reserve_nonce(uuid,text,text,timestamptz,integer) from public;
revoke all on function public.information_redi_begin_request(uuid,text,text,text,text,integer) from public;
revoke all on function public.information_redi_finish_request(uuid,text,text,text,integer,jsonb) from public;
revoke all on function public.information_redi_allowed(uuid,text,text) from public;
revoke all on function public.information_redi_article_json(uuid,text,uuid,text) from public;
revoke all on function public.information_redi_list_articles(uuid,text,jsonb) from public;
revoke all on function public.information_redi_external_article(uuid,text,text) from public;
revoke all on function public.information_redi_create_article(uuid,text,jsonb) from public;
revoke all on function public.information_redi_update_article(uuid,text,uuid,integer,jsonb) from public;
revoke all on function public.information_redi_transition_article(uuid,text,uuid,integer,text) from public;
revoke all on function public.information_redi_list_media(uuid,text,jsonb) from public;
revoke all on function public.information_redi_register_media(uuid,text,jsonb) from public;
