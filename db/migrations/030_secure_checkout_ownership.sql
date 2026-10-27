-- Bind every new base-plan checkout to the authenticated site administrator.
-- Existing unbound intakes are retained for audit/history but cannot activate a site.
alter table subscriber_intakes
  add column if not exists site_admin_account_id uuid references site_admin_accounts(id) on delete set null,
  add column if not exists checkout_price_id text;

create index if not exists subscriber_intakes_checkout_owner_idx
  on subscriber_intakes(site_admin_account_id, demo_site_id);
