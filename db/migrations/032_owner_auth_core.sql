-- Database-backed platform-owner identity, MFA challenges, recovery codes,
-- revocable sessions and security audit evidence. Multi-user roles/invitations
-- are intentionally deferred and can extend owner_accounts additively.
create table if not exists owner_accounts (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  mfa_secret_encrypted text,
  mfa_enrolled_at timestamptz,
  mfa_last_used_step bigint,
  password_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(btrim(email))),
  check ((mfa_secret_encrypted is null) = (mfa_enrolled_at is null))
);

create unique index if not exists owner_accounts_normalized_email_idx
  on owner_accounts(lower(btrim(email)));

create table if not exists owner_auth_challenges (
  id uuid primary key,
  owner_id uuid not null references owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('mfa_enroll', 'mfa_verify')),
  pending_mfa_secret_encrypted text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (purpose = 'mfa_enroll' and pending_mfa_secret_encrypted is not null) or
    (purpose = 'mfa_verify' and pending_mfa_secret_encrypted is null)
  )
);

create index if not exists owner_auth_challenges_active_idx
  on owner_auth_challenges(owner_id, expires_at)
  where used_at is null;

create table if not exists owner_sessions (
  id uuid primary key,
  owner_id uuid not null references owner_accounts(id) on delete cascade,
  token_hash text not null unique,
  mfa_completed_at timestamptz not null,
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists owner_sessions_active_idx
  on owner_sessions(token_hash, expires_at)
  where revoked_at is null;
create index if not exists owner_sessions_owner_idx
  on owner_sessions(owner_id, created_at desc);
create index if not exists owner_sessions_expiry_idx
  on owner_sessions(expires_at);

create table if not exists owner_mfa_recovery_codes (
  id uuid primary key,
  owner_id uuid not null references owner_accounts(id) on delete cascade,
  code_hash text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists owner_mfa_recovery_codes_owner_idx
  on owner_mfa_recovery_codes(owner_id, created_at desc);

create table if not exists owner_auth_audit_events (
  id uuid primary key,
  owner_id uuid references owner_accounts(id) on delete set null,
  action text not null,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  identity_hash text,
  source text not null default 'web' check (source in ('web', 'cli')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists owner_auth_audit_owner_idx
  on owner_auth_audit_events(owner_id, created_at desc);
create index if not exists owner_auth_audit_action_idx
  on owner_auth_audit_events(action, created_at desc);
