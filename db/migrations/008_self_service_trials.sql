-- Distinguish owner-created outreach demos from customer-created trials.
alter table sites add column if not exists onboarding_source text not null default 'owner_outreach'
  check (onboarding_source in ('owner_outreach', 'self_service'));
alter table sites add column if not exists trial_email text;
create index if not exists sites_trial_email_idx on sites(trial_email) where trial_email is not null;
