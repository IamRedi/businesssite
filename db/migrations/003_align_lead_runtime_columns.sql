-- Finder repository stores the current score beside the current normalized lead.
alter table leads add column if not exists score integer not null default 0 check (score between 0 and 100);
