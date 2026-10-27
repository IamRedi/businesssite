-- Postgres-backed media for the standalone website owner portal.
create table if not exists site_media_blobs (
  id uuid primary key,
  site_id text not null references sites(id) on delete cascade,
  filename text not null,
  content_type text not null check (content_type = 'image/webp'),
  data bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists site_media_blobs_site_idx on site_media_blobs(site_id, created_at desc);
