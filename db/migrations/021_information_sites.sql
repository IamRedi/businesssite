-- Additive editorial data model. Existing sites remain business sites and their
-- generated_document contract is unchanged.
alter table sites add column if not exists site_kind text not null default 'business';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sites_site_kind_check'
  ) then
    alter table sites add constraint sites_site_kind_check
      check (site_kind in ('business', 'information'));
  end if;
end $$;

create index if not exists sites_site_kind_idx on sites(site_kind);

create table if not exists site_editorial_settings (
  site_id text primary key references sites(id) on delete cascade,
  publication_name text not null check (char_length(publication_name) between 1 and 160),
  tagline text,
  subcategory text not null check (subcategory in (
    'news','technology_ai','science','magazine','blog','local_news',
    'industry_news','general_information'
  )),
  locale text not null check (locale in ('en','de','fr','es','it','sq')),
  theme_key text not null default 'auto',
  navigation jsonb not null default '[]'::jsonb check (jsonb_typeof(navigation) = 'array'),
  settings_version integer not null default 1 check (settings_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_article_categories (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (char_length(slug) between 1 and 160),
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (site_id, id)
);

create index if not exists site_article_categories_order_idx
  on site_article_categories(site_id, sort_order, name);

create table if not exists site_media_assets (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  storage_provider text not null check (storage_provider in ('vercel_blob', 'postgres')),
  storage_key text not null,
  public_url text,
  mime_type text not null,
  alt_text text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  byte_size integer not null check (byte_size > 0),
  created_at timestamptz not null default now(),
  unique (site_id, storage_provider, storage_key),
  unique (site_id, id)
);

create index if not exists site_media_assets_site_created_idx
  on site_media_assets(site_id, created_at desc);

create table if not exists site_articles (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  category_id uuid,
  external_source text not null default 'site_admin'
    check (external_source in ('site_admin', 'owner', 'redi_control')),
  external_reference text,
  slug text not null check (char_length(slug) between 1 and 180),
  title text not null check (char_length(title) between 1 and 240),
  excerpt text not null default '',
  body jsonb not null check (
    jsonb_typeof(body) = 'object'
    and body->>'version' = '1'
    and jsonb_typeof(body->'blocks') = 'array'
  ),
  featured_media_id uuid,
  featured_image_alt text,
  tags text[] not null default '{}',
  display_author text,
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'published', 'archived')),
  featured boolean not null default false,
  publish_at timestamptz,
  published_at timestamptz,
  seo_title text,
  seo_description text,
  canonical_url text,
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (site_id, id),
  foreign key (site_id, category_id)
    references site_article_categories(site_id, id) on delete restrict,
  foreign key (site_id, featured_media_id)
    references site_media_assets(site_id, id) on delete restrict
);

create unique index if not exists site_articles_external_reference_unique
  on site_articles(site_id, external_source, external_reference)
  where external_reference is not null;

create index if not exists site_articles_status_created_idx
  on site_articles(site_id, status, created_at desc, id desc);

create index if not exists site_articles_category_published_idx
  on site_articles(site_id, category_id, status, published_at desc, id desc);

create index if not exists site_articles_featured_published_idx
  on site_articles(site_id, featured, published_at desc, id desc)
  where status = 'published';

create index if not exists site_articles_tags_idx on site_articles using gin(tags);

create table if not exists site_article_sources (
  id uuid primary key,
  site_id text not null,
  article_id uuid not null,
  label text,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (article_id, sort_order),
  foreign key (site_id, article_id)
    references site_articles(site_id, id) on delete cascade
);

create index if not exists site_article_sources_article_idx
  on site_article_sources(site_id, article_id, sort_order);

create table if not exists site_content_audit_events (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  article_id uuid references site_articles(id) on delete set null,
  actor_type text not null check (actor_type in ('owner','site_admin','integration','system')),
  actor_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists site_content_audit_site_created_idx
  on site_content_audit_events(site_id, created_at desc);

create index if not exists site_content_audit_article_created_idx
  on site_content_audit_events(article_id, created_at desc)
  where article_id is not null;
