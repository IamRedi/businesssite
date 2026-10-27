-- Preserve material website-status changes when a known Google Places lead is observed again.
create table if not exists lead_website_history (
  id uuid primary key,
  lead_id text not null references leads(id) on delete cascade,
  previous_website text,
  current_website text,
  change_type text not null check (change_type in ('first_seen','website_added','website_removed','website_changed')),
  observed_at timestamptz not null default now()
);

create index if not exists lead_website_history_lead_observed_idx
  on lead_website_history(lead_id, observed_at desc);
