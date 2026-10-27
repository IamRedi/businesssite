-- Emergency rollback for Task Group 3-B2. Deploy DATABASE_RLS_MODE=off first,
-- then run this with the migration/admin connection. It is idempotent and does
-- not drop policies, routines, columns, migration history, or customer data.
alter table sites disable row level security;
alter table site_media disable row level security;
alter table site_media_blobs disable row level security;
alter table site_appointments disable row level security;
alter table ai_runs disable row level security;
alter table tenant_usage_counters disable row level security;
alter table tenant_usage_states disable row level security;
alter table tenant_usage_events disable row level security;
alter table tenant_concurrency_leases disable row level security;
alter table site_external_integrations disable row level security;
alter table site_integration_events disable row level security;
alter table site_admin_accounts disable row level security;
alter table site_admin_sessions disable row level security;
alter table site_admin_password_resets disable row level security;
alter table site_features disable row level security;
alter table site_information_ad_slots disable row level security;
