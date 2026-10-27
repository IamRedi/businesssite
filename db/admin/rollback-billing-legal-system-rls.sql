-- Operational rollback for Task Group 3-B3B. Deploy DATABASE_RLS_MODE=off
-- compatibility code first, then execute as the migrator. No data, routines or
-- migration-ledger rows are deleted.
revoke execute on function billing_checkout_legal_context(text,text,text) from bsrc_runtime;
revoke execute on function billing_customer_snapshot(text,text) from bsrc_runtime;
revoke execute on function billing_prepare_starter_checkout(text,text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text,integer) from bsrc_runtime;
revoke execute on function billing_attach_checkout_session(text,uuid,text) from bsrc_runtime;
revoke execute on function billing_system_is_addon_subscription(text) from bsrc_system;
revoke execute on function billing_system_cache_identities(text) from bsrc_system;
revoke execute on function billing_system_process_subscription_event(jsonb) from bsrc_system;

alter table subscriber_intakes disable row level security;
alter table site_subscriptions disable row level security;
alter table site_addon_subscriptions disable row level security;
alter table subscription_lifecycle_events disable row level security;
alter table payment_webhook_events disable row level security;
alter table customer_business_identities disable row level security;
alter table contract_acceptances disable row level security;
alter table platform_legal_config_versions disable row level security;
alter table platform_legal_document_versions disable row level security;
