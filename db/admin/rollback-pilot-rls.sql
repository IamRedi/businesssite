-- Incident rollback for Task Group 3-B1. Run only with the migration/admin
-- connection after DATABASE_RLS_MODE has been returned to `off`.
alter table site_features disable row level security;
alter table site_information_ad_slots disable row level security;

-- Policies and helper functions remain installed so migration history is not
-- rewritten and a later controlled re-enable is non-destructive.
