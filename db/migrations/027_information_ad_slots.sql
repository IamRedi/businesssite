-- Provider-agnostic advertising placements for Information/News sites.
-- No executable markup, scripts, credentials or provider-specific configuration
-- is stored in this phase.
create table if not exists site_information_ad_slots (
  site_id text not null references sites(id) on delete cascade,
  slot_key text not null check (slot_key in (
    'home_after_featured',
    'category_before_feed',
    'article_after_media',
    'article_sidebar'
  )),
  format text not null default 'auto' check (format in (
    'auto','leaderboard','rectangle','in_feed'
  )),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, slot_key)
);

create index if not exists site_information_ad_slots_enabled_idx
  on site_information_ad_slots(site_id, slot_key)
  where enabled;
