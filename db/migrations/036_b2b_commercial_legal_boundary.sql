-- B2B commercial/legal truth boundary. Additive only: historical subscriptions
-- remain acceptance_unknown and no legal acceptance is manufactured by migration.

create table if not exists platform_legal_config_versions (
  id uuid primary key,
  version integer not null unique check (version > 0),
  legal_business_name text not null,
  legal_form text,
  street text not null,
  address_line_2 text,
  postal_code text not null,
  city text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  authorized_representative text,
  contact_email text not null check (contact_email = lower(btrim(contact_email))),
  support_email text not null check (support_email = lower(btrim(support_email))),
  phone text,
  register_name text,
  register_court text,
  register_number text,
  vat_id text,
  supervisory_authority text,
  editorial_responsible_person text,
  dispute_metadata text,
  tax_display_mode text not null check (tax_display_mode in ('gross_inclusive','net_plus_tax','tax_exempt_or_special_note')),
  currency text not null check (currency in ('EUR','USD','ALL')),
  price_tax_label text not null,
  special_tax_note text,
  legal_review_status text not null default 'legal_review_required'
    check (legal_review_status in ('legal_review_required','reviewed')),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  reviewed_at timestamptz,
  reviewed_by uuid references owner_accounts(id) on delete set null,
  effective_from timestamptz,
  created_by uuid references owner_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status <> 'active') or (legal_review_status='reviewed' and reviewed_at is not null and effective_from is not null)),
  check ((tax_display_mode <> 'tax_exempt_or_special_note') or nullif(btrim(special_tax_note),'') is not null)
);
create unique index if not exists platform_legal_config_one_active_idx
  on platform_legal_config_versions((true)) where status='active';

create or replace function prevent_platform_legal_config_evidence_change()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['status','legal_review_status','reviewed_at','reviewed_by','effective_from']::text[])
     is distinct from
     (to_jsonb(old) - array['status','legal_review_status','reviewed_at','reviewed_by','effective_from']::text[]) then
    raise exception 'Platform legal/commercial version evidence is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists platform_legal_config_evidence_immutable on platform_legal_config_versions;
create trigger platform_legal_config_evidence_immutable
before update on platform_legal_config_versions
for each row execute function prevent_platform_legal_config_evidence_change();

create table if not exists platform_legal_document_versions (
  id uuid primary key,
  document_key text not null check (document_key in ('terms','privacy','imprint','cancellation')),
  locale text not null check (locale in ('de','en','fr','es','it','sq')),
  version text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'legal_review_required'
    check (status in ('draft','legal_review_required','reviewed','active','retired')),
  effective_from timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references owner_accounts(id) on delete set null,
  reviewer_reference text,
  created_by uuid references owner_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_key,locale,version),
  check ((status <> 'active') or (reviewed_at is not null and effective_from is not null))
);
create unique index if not exists platform_legal_document_one_active_idx
  on platform_legal_document_versions(document_key,locale) where status='active';

create or replace function prevent_legal_document_identity_change()
returns trigger language plpgsql as $$
begin
  if new.document_key <> old.document_key or new.locale <> old.locale
    or new.version <> old.version or new.content_hash <> old.content_hash
    or new.created_at <> old.created_at then
    raise exception 'Legal document identity and content evidence are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists platform_legal_document_identity_immutable on platform_legal_document_versions;
create trigger platform_legal_document_identity_immutable
before update on platform_legal_document_versions
for each row execute function prevent_legal_document_identity_change();

create table if not exists customer_business_identities (
  id uuid primary key,
  site_id text not null references sites(id) on delete restrict,
  version integer not null check (version > 0),
  is_current boolean not null default true,
  legal_business_name text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  business_type text not null check (business_type in ('company','sole_proprietor','other_business')),
  vat_id_normalized text,
  verification_state text not null default 'self_attested'
    check (verification_state in ('self_attested','provider_verified','manually_verified','rejected','review_required')),
  verification_source text not null default 'checkout_self_attestation'
    check (verification_source in ('checkout_self_attestation','manual_owner_review','external_provider')),
  review_reason_code text,
  verified_at timestamptz,
  verified_by uuid references owner_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id,version)
);
create unique index if not exists customer_business_identity_one_current_idx
  on customer_business_identities(site_id) where is_current;

create or replace function prevent_business_identity_evidence_change()
returns trigger language plpgsql as $$
begin
  if new.site_id <> old.site_id or new.version <> old.version
    or new.legal_business_name <> old.legal_business_name
    or new.country_code <> old.country_code or new.business_type <> old.business_type
    or new.vat_id_normalized is distinct from old.vat_id_normalized
    or new.created_at <> old.created_at then
    raise exception 'Accepted business identity evidence is immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists customer_business_identity_evidence_immutable on customer_business_identities;
create trigger customer_business_identity_evidence_immutable
before update on customer_business_identities
for each row execute function prevent_business_identity_evidence_change();

create table if not exists contract_acceptances (
  id uuid primary key,
  intake_id uuid not null references subscriber_intakes(id) on delete restrict,
  checkout_attempt integer not null check (checkout_attempt > 0),
  site_id text not null,
  actor_account_id uuid not null references site_admin_accounts(id) on delete restrict,
  business_identity_id uuid not null references customer_business_identities(id) on delete restrict,
  terms_document_key text not null,
  terms_version text not null,
  terms_content_hash text not null check (terms_content_hash ~ '^[a-f0-9]{64}$'),
  privacy_document_key text not null,
  privacy_version text not null,
  privacy_content_hash text not null check (privacy_content_hash ~ '^[a-f0-9]{64}$'),
  b2b_attestation_version text not null,
  authority_attestation_version text not null,
  automatic_renewal_version text not null,
  privacy_acknowledgement_version text not null,
  promotion_terms_version text,
  platform_legal_config_version integer not null check (platform_legal_config_version >= 0),
  plan_key text not null check (plan_key in ('starter','professional','premium')),
  billing_provider text not null check (billing_provider in ('stripe','paddle')),
  checkout_price_id text not null,
  currency text not null check (currency in ('EUR','USD','ALL')),
  tax_display_mode text not null check (tax_display_mode in ('gross_inclusive','net_plus_tax','tax_exempt_or_special_note')),
  price_tax_label_snapshot text not null,
  normal_price_display_snapshot text not null,
  trial_duration_days integer not null check (trial_duration_days > 0),
  billing_interval text not null check (billing_interval = 'month'),
  accepted_at timestamptz not null default now(),
  locale text not null check (locale in ('de','en','fr','es','it','sq')),
  source text not null check (source = 'site_admin_checkout'),
  unique(intake_id,checkout_attempt,source)
);

create or replace function validate_contract_acceptance_binding()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from subscriber_intakes intake
    join site_admin_accounts account
      on account.id=intake.site_admin_account_id
     and account.site_id=intake.demo_site_id
     and account.email=intake.email
    where intake.id=new.intake_id and intake.demo_site_id=new.site_id
      and intake.site_admin_account_id=new.actor_account_id
      and intake.business_identity_id=new.business_identity_id
      and intake.checkout_attempt=new.checkout_attempt
      and intake.plan_key=new.plan_key
      and intake.billing_provider=new.billing_provider
      and intake.checkout_price_id=new.checkout_price_id
  ) then
    raise exception 'Contract acceptance ownership binding is invalid';
  end if;
  if new.terms_document_key <> 'terms' or new.privacy_document_key <> 'privacy' then
    raise exception 'Contract acceptance document binding is invalid';
  end if;
  return new;
end;
$$;
drop trigger if exists contract_acceptance_binding on contract_acceptances;
create trigger contract_acceptance_binding
before insert on contract_acceptances
for each row execute function validate_contract_acceptance_binding();

create or replace function reject_contract_acceptance_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Contract acceptance evidence is immutable';
end;
$$;
drop trigger if exists contract_acceptance_immutable on contract_acceptances;
create trigger contract_acceptance_immutable
before update or delete on contract_acceptances
for each row execute function reject_contract_acceptance_mutation();

alter table subscriber_intakes
  add column if not exists business_identity_id uuid references customer_business_identities(id) on delete restrict,
  add column if not exists contract_acceptance_id uuid references contract_acceptances(id) on delete restrict;

alter table site_subscriptions
  add column if not exists contract_acceptance_state text not null default 'acceptance_unknown';
alter table site_subscriptions drop constraint if exists site_subscriptions_contract_acceptance_state_check;
alter table site_subscriptions add constraint site_subscriptions_contract_acceptance_state_check
  check (contract_acceptance_state in ('acceptance_unknown','accepted','legacy'));

create index if not exists contract_acceptances_site_idx
  on contract_acceptances(site_id,accepted_at desc);
create index if not exists customer_business_identity_verification_idx
  on customer_business_identities(verification_state,updated_at desc);
