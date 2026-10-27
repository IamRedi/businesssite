-- Production-safe media ownership and article-media relations for information sites.
-- Existing business media tables and delivery behavior remain unchanged.
alter table site_media_assets
  add column if not exists storage_access text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'site_media_assets_storage_access_check'
  ) then
    alter table site_media_assets add constraint site_media_assets_storage_access_check
      check (storage_access in ('public','private'));
  end if;
end $$;

-- Database-backed objects have never had an independently reachable object URL.
update site_media_assets
set storage_access='private',public_url='/api/media/' || id
where storage_provider='postgres';

-- Route all registered assets through the application delivery policy. Historical
-- public Blob objects retain storage_access='public' until operationally rotated.
update site_media_assets
set public_url='/api/media/' || id
where public_url is distinct from '/api/media/' || id;

create table if not exists site_article_media (
  site_id text not null,
  article_id uuid not null,
  media_id uuid not null,
  sort_order integer not null check (sort_order >= 0 and sort_order < 50),
  created_at timestamptz not null default now(),
  primary key (article_id, sort_order),
  unique (article_id, media_id),
  foreign key (site_id, article_id)
    references site_articles(site_id, id) on delete cascade,
  foreign key (site_id, media_id)
    references site_media_assets(site_id, id) on delete restrict
);

create index if not exists site_article_media_asset_idx
  on site_article_media(site_id, media_id, article_id);
