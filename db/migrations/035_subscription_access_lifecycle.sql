-- Durable customer-access lifecycle and provider-event ordering. Additive only.
alter table sites
  add column if not exists trial_recovery_ends_at timestamptz,
  add column if not exists publication_intent text;

update sites
set trial_recovery_ends_at=coalesce(trial_recovery_ends_at,demo_expires_at + interval '30 days'),
    publication_intent=coalesce(
      publication_intent,
      case
        when site_kind='information' then visibility
        when activated_at is null then 'public'
        when exists (
          select 1 from site_subscriptions sub
          where sub.site_id=sites.id and sub.status in ('active','trialing')
        ) then visibility
        else 'private'
      end
    );

alter table sites alter column trial_recovery_ends_at set not null;
alter table sites alter column publication_intent set not null;
alter table sites alter column publication_intent set default 'public';
alter table sites drop constraint if exists sites_trial_recovery_window_check;
alter table sites add constraint sites_trial_recovery_window_check
  check (trial_recovery_ends_at >= demo_expires_at);
alter table sites drop constraint if exists sites_publication_intent_check;
alter table sites add constraint sites_publication_intent_check
  check (publication_intent in ('private','public'));
create index if not exists sites_trial_recovery_cleanup_idx
  on sites(trial_recovery_ends_at) where activated_at is null;

alter table site_subscriptions
  add column if not exists provider_status_observed_at timestamptz,
  add column if not exists first_past_due_at timestamptz,
  add column if not exists payment_grace_ends_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists read_only_ends_at timestamptz,
  add column if not exists last_active_at timestamptz,
  add column if not exists latest_provider_event_at timestamptz,
  add column if not exists latest_provider_event_id text;

update site_subscriptions
set provider_status_observed_at=coalesce(provider_status_observed_at,updated_at,created_at),
    latest_provider_event_at=coalesce(latest_provider_event_at,updated_at,created_at),
    latest_provider_event_id=coalesce(latest_provider_event_id,last_processed_event_id),
    last_active_at=case
      when status in ('active','trialing') then coalesce(last_active_at,updated_at,created_at)
      else last_active_at
    end,
    first_past_due_at=case
      when status='past_due' then coalesce(first_past_due_at,updated_at,created_at)
      else first_past_due_at
    end,
    payment_grace_ends_at=case
      when status='past_due' then coalesce(payment_grace_ends_at,coalesce(first_past_due_at,updated_at,created_at) + interval '7 days')
      else payment_grace_ends_at
    end,
    suspended_at=case
      when status='past_due' then coalesce(suspended_at,coalesce(payment_grace_ends_at,coalesce(first_past_due_at,updated_at,created_at) + interval '7 days'))
      when status in ('unpaid','paused','canceled','incomplete','incomplete_expired') then coalesce(suspended_at,cancelled_at,updated_at,created_at)
      when status in ('active','trialing') and cancel_at_period_end and current_period_end is not null then coalesce(suspended_at,current_period_end)
      else suspended_at
    end,
    read_only_ends_at=case
      when status='past_due' then coalesce(read_only_ends_at,coalesce(payment_grace_ends_at,coalesce(first_past_due_at,updated_at,created_at) + interval '7 days') + interval '30 days')
      when status in ('unpaid','paused','canceled','incomplete','incomplete_expired') then coalesce(read_only_ends_at,coalesce(suspended_at,cancelled_at,updated_at,created_at) + interval '30 days')
      when status in ('active','trialing') and cancel_at_period_end and current_period_end is not null then coalesce(read_only_ends_at,current_period_end + interval '30 days')
      else read_only_ends_at
    end;

alter table site_subscriptions drop constraint if exists site_subscriptions_payment_grace_window_check;
alter table site_subscriptions add constraint site_subscriptions_payment_grace_window_check
  check (payment_grace_ends_at is null or first_past_due_at is not null and payment_grace_ends_at >= first_past_due_at);
alter table site_subscriptions drop constraint if exists site_subscriptions_read_only_window_check;
alter table site_subscriptions add constraint site_subscriptions_read_only_window_check
  check (read_only_ends_at is null or suspended_at is not null and read_only_ends_at >= suspended_at);
create index if not exists site_subscriptions_access_transition_idx
  on site_subscriptions(status,payment_grace_ends_at,read_only_ends_at);

alter table subscriber_intakes
  add column if not exists checkout_attempt integer not null default 1;
alter table subscriber_intakes drop constraint if exists subscriber_intakes_checkout_attempt_check;
alter table subscriber_intakes add constraint subscriber_intakes_checkout_attempt_check
  check (checkout_attempt > 0);

alter table payment_webhook_events
  add column if not exists provider_created_at timestamptz,
  add column if not exists site_id text,
  add column if not exists disposition text not null default 'accepted';
alter table payment_webhook_events drop constraint if exists payment_webhook_events_disposition_check;
alter table payment_webhook_events add constraint payment_webhook_events_disposition_check
  check (disposition in ('accepted','duplicate','ignored_unbound','ignored_stale','ignored_invalid'));

create table if not exists subscription_lifecycle_events (
  id uuid primary key,
  event_key text not null unique,
  site_id text not null,
  action text not null check (action in (
    'entered_payment_grace','grace_expired','entered_read_only','entered_locked',
    'trial_expired','provider_event_ignored_stale','reactivated',
    'billing_forced_private','publication_intent_restored'
  )),
  provider_event_id text,
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists subscription_lifecycle_events_site_idx
  on subscription_lifecycle_events(site_id,occurred_at desc);
