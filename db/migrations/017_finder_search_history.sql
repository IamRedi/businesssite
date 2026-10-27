-- Durable owner-visible history for fresh and cached Finder searches.
alter table finder_searches add column if not exists cache_key text;
alter table finder_searches add column if not exists result_count integer not null default 0;
alter table finder_searches add column if not exists lead_ids jsonb not null default '[]'::jsonb;
alter table finder_searches add column if not exists cached boolean not null default false;
alter table finder_searches add column if not exists status text not null default 'pending'
  check (status in ('pending', 'completed', 'failed'));
alter table finder_searches add column if not exists completed_at timestamptz;

update finder_searches
set status = 'completed', completed_at = coalesce(completed_at, created_at)
where status = 'pending' and completed_at is null;

create index if not exists finder_searches_created_idx
  on finder_searches(created_at desc);
create index if not exists finder_searches_cache_key_idx
  on finder_searches(cache_key, created_at desc)
  where cache_key is not null;
