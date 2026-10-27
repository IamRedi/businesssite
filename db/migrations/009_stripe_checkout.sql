alter table subscriber_intakes add column if not exists checkout_session_id text unique;
alter table subscriber_intakes add column if not exists paid_at timestamptz;
alter table subscriber_intakes add column if not exists updated_at timestamptz not null default now();

create table if not exists payment_webhook_events (
  event_id text primary key,
  provider text not null,
  event_type text not null,
  processed_at timestamptz not null default now()
);
