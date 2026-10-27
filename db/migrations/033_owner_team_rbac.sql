-- Additive multi-user owner-panel RBAC, invitations and audit attribution.
-- The existing bootstrap identity is backfilled as the first `owner`.
alter table owner_accounts
  add column if not exists role text not null default 'owner';

alter table owner_accounts
  drop constraint if exists owner_accounts_status_check;
alter table owner_accounts
  add constraint owner_accounts_status_check
  check (status in ('pending', 'active', 'disabled'));

alter table owner_accounts
  drop constraint if exists owner_accounts_role_check;
alter table owner_accounts
  add constraint owner_accounts_role_check
  check (role in ('owner', 'admin', 'operator', 'viewer'));

create index if not exists owner_accounts_active_role_idx
  on owner_accounts(role, status)
  where status = 'active';

create table if not exists owner_invitations (
  id uuid primary key,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'operator', 'viewer')),
  token_hash text not null unique,
  created_by uuid not null references owner_accounts(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'provider_not_configured', 'provider_error')),
  delivery_error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(btrim(email))),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);

create unique index if not exists owner_invitations_active_email_idx
  on owner_invitations(lower(btrim(email)))
  where accepted_at is null and revoked_at is null;
create index if not exists owner_invitations_active_lookup_idx
  on owner_invitations(token_hash, expires_at)
  where accepted_at is null and revoked_at is null;
create index if not exists owner_invitations_created_idx
  on owner_invitations(created_at desc);

alter table owner_auth_audit_events
  add column if not exists target_owner_id uuid references owner_accounts(id) on delete set null,
  add column if not exists invitation_id uuid references owner_invitations(id) on delete set null,
  add column if not exists correlation_id text;

create index if not exists owner_auth_audit_target_idx
  on owner_auth_audit_events(target_owner_id, created_at desc);
create index if not exists owner_auth_audit_invitation_idx
  on owner_auth_audit_events(invitation_id, created_at desc);
