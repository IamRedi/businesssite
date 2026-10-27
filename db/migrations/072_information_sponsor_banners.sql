-- First-party Information sponsor cards. Activation remains explicit and off by default.
-- migrate-as-migrator
create table public.site_information_sponsor_banners (
  id uuid primary key,
  site_id text not null references public.sites(id) on delete cascade,
  slot_key text not null check (slot_key in
    ('home_after_featured','category_before_feed','article_after_media','article_sidebar')),
  sponsor_name text not null check (char_length(btrim(sponsor_name)) between 1 and 160),
  headline text not null check (char_length(btrim(headline)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 300),
  call_to_action text not null check (char_length(btrim(call_to_action)) between 1 and 60),
  destination_url text not null check (char_length(destination_url) between 9 and 2048 and destination_url ~ '^https://'),
  image_media_id uuid,
  enabled boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id,id),
  foreign key (site_id,image_media_id) references public.site_media_assets(site_id,id) on delete restrict,
  constraint active_sponsor_has_image check (not enabled or image_media_id is not null)
);
create index site_information_sponsor_banners_active_idx
  on public.site_information_sponsor_banners(site_id,slot_key,sort_order,created_at) where enabled;
alter table public.site_information_sponsor_banners enable row level security;
create policy information_sponsors_editorial_select on public.site_information_sponsor_banners for select
  using (public.information_editorial_allowed('read') and site_id=public.app_context_site_id()::text);
create policy information_sponsors_editorial_insert on public.site_information_sponsor_banners for insert
  with check (public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);
create policy information_sponsors_editorial_update on public.site_information_sponsor_banners for update
  using (public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text)
  with check (public.information_editorial_allowed('settings') and site_id=public.app_context_site_id()::text);
revoke all on public.site_information_sponsor_banners from public;
-- Existing provisioned environments must receive the same runtime role as editorial settings.
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid
    where p.polrelid='public.site_editorial_settings'::regclass and p.polname='information_settings_editorial_select'
  loop
    execute format('alter policy information_sponsors_editorial_select on public.site_information_sponsor_banners to %I',v_role);
    execute format('alter policy information_sponsors_editorial_insert on public.site_information_sponsor_banners to %I',v_role);
    execute format('alter policy information_sponsors_editorial_update on public.site_information_sponsor_banners to %I',v_role);
    execute format('grant select,insert,update on public.site_information_sponsor_banners to %I',v_role);
  end loop;
end $$;

-- Public caller receives only enabled cards belonging to an activated publication.
create function public.resolve_public_information_sponsors(p_kind text,p_identity text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',b.id,'siteId',b.site_id,'slotKey',b.slot_key,'sponsorName',b.sponsor_name,
   'headline',b.headline,'description',b.description,'callToAction',b.call_to_action,
   'destinationUrl',b.destination_url,'imageUrl','/api/media/'||b.image_media_id,
   'enabled',true,'sortOrder',b.sort_order,'version',b.lock_version)
   order by b.slot_key,b.sort_order,b.created_at,b.id),'[]'::jsonb)
 from public.sites s join public.site_information_sponsor_banners b on b.site_id=s.id
 join public.site_media_assets m on m.site_id=b.site_id and m.id=b.image_media_id
 where p_kind in('slug','domain') and length(p_identity) between 1 and 253
   and s.site_kind='information' and s.visibility='public' and s.activated_at is not null
   and b.enabled and b.destination_url ~ '^https://'
   and ((p_kind='slug' and s.slug=p_identity) or
     (p_kind='domain' and s.custom_domain=lower(p_identity) and s.custom_domain_status='verified'))
$$;
revoke all on function public.resolve_public_information_sponsors(text,text) from public;
do $$ declare v_role name; begin
  for v_role in select r.rolname from pg_policy p cross join lateral unnest(p.polroles) pr(role_oid)
    join pg_roles r on r.oid=pr.role_oid
    where p.polrelid='public.site_editorial_settings'::regclass and p.polname='information_settings_editorial_select'
  loop execute format('grant execute on function public.resolve_public_information_sponsors(text,text) to %I',v_role);
  end loop;
end $$;

create function public.information_sponsor_media_active(p_asset uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.site_information_sponsor_banners b
   where b.image_media_id=p_asset and b.enabled)
$$;
revoke all on function public.information_sponsor_media_active(uuid) from public;
do $$ declare v_role name; begin
  select pg_get_userbyid(proowner) into strict v_role from pg_proc
    where oid='public.resolve_public_information_media(uuid)'::regprocedure;
  execute format('grant execute on function public.information_sponsor_media_active(uuid) to %I',v_role);
end $$;

-- migrate-as-owner-of: public.resolve_public_information_media(uuid)
create or replace function public.resolve_public_information_media(p_asset uuid)
returns table(site_id text,storage_provider text,storage_key text,storage_access text,mime_type text,byte_size integer,custom_domain text,custom_domain_verified boolean,publicly_available boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select m.site_id,m.storage_provider,m.storage_key,m.storage_access,m.mime_type,m.byte_size,s.custom_domain,s.custom_domain_status='verified',true
 from public.site_media_assets m join public.sites s on s.id=m.site_id
 where m.id=p_asset and s.site_kind='information' and s.visibility='public' and s.activated_at is not null
 and (exists(select 1 from public.site_articles a where a.site_id=m.site_id and a.status='published' and a.published_at is not null
   and (a.publish_at is null or a.publish_at<=statement_timestamp()) and (a.featured_media_id=m.id or exists(select 1 from public.site_article_media am where am.site_id=a.site_id and am.article_id=a.id and am.media_id=m.id)))
   or public.information_sponsor_media_active(m.id))
 limit 1
$$;
revoke all on function public.resolve_public_information_media(uuid) from public;

-- migrate-as-migrator
-- The privacy executor can reach the table only through these classified helpers.
create function public.information_sponsors_export(p_site text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',id,'slotKey',slot_key,'sponsorName',sponsor_name,'headline',headline,
   'description',description,'callToAction',call_to_action,'destinationUrl',destination_url,
   'imageMediaId',image_media_id,'enabled',enabled,'sortOrder',sort_order,
   'version',lock_version,'createdAt',created_at,'updatedAt',updated_at)
   order by created_at,id),'[]'::jsonb)
 from public.site_information_sponsor_banners where site_id=p_site
$$;
create function public.information_sponsors_delete(p_site text)
returns void language sql volatile security definer set search_path=pg_catalog as $$
 delete from public.site_information_sponsor_banners where site_id=p_site
$$;
revoke all on function public.information_sponsors_export(text) from public;
revoke all on function public.information_sponsors_delete(text) from public;
do $$ declare v_role name; begin
  select pg_get_userbyid(proowner) into strict v_role from pg_proc
    where oid='public.privacy_system_export_snapshot(uuid,text)'::regprocedure;
  execute format('grant execute on function public.information_sponsors_export(text) to %I',v_role);
  select pg_get_userbyid(proowner) into strict v_role from pg_proc
    where oid='public.privacy_system_execute_customer_deletion(uuid,text)'::regprocedure;
  execute format('grant execute on function public.information_sponsors_delete(text) to %I',v_role);
end $$;

-- Keep the customer export and deletion workflows complete for the new data class.
-- migrate-as-owner-of: public.privacy_system_export_snapshot(uuid,text)
do $$ declare v_definition text; v_marker text:='''editorial'',jsonb_build_object(''settings'''; begin
  select pg_get_functiondef('public.privacy_system_export_snapshot(uuid,text)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'sponsor_export_projection_drift'; end if;
  execute replace(v_definition,v_marker,
    '''editorial'',jsonb_build_object(''sponsors'',public.information_sponsors_export(v.site_id),''settings''');
end $$;
revoke all on function public.privacy_system_export_snapshot(uuid,text) from public;

-- migrate-as-owner-of: public.privacy_system_execute_customer_deletion(uuid,text)
do $$ declare v_definition text; v_marker text:='delete from public.site_information_ad_slots where site_id=v.site_id;'; begin
  select pg_get_functiondef('public.privacy_system_execute_customer_deletion(uuid,text)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'sponsor_deletion_projection_drift'; end if;
  execute replace(v_definition,v_marker,
    'perform public.information_sponsors_delete(v.site_id); '||v_marker);
end $$;
revoke all on function public.privacy_system_execute_customer_deletion(uuid,text) from public;

-- migrate-as-owner-of: public.database_enforced_readiness()
-- One additional tenant table is RLS+FORCE protected after role provisioning.
create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=68
     and count(*) filter(where c.relrowsecurity)=65
     and count(*) filter(where c.relforcerowsecurity)=65
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
