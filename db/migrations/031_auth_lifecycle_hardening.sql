-- Enforce the normalized site-admin identity used by every authentication flow
-- and support bounded cleanup of expired server-side sessions.
create unique index if not exists site_admin_accounts_normalized_email_idx
  on site_admin_accounts(lower(btrim(email)));

create index if not exists site_admin_sessions_expiry_idx
  on site_admin_sessions(expires_at);
