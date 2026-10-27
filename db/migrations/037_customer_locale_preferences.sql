-- Durable customer and recipient locale preferences. Website content locale
-- remains in SiteDocument and is intentionally independent from these fields.
alter table site_admin_accounts
  add column if not exists preferred_locale text not null default 'en';
alter table site_admin_accounts drop constraint if exists site_admin_accounts_preferred_locale_check;
alter table site_admin_accounts add constraint site_admin_accounts_preferred_locale_check
  check (preferred_locale in ('en','de'));

alter table owner_invitations
  add column if not exists recipient_locale text not null default 'en';
alter table owner_invitations drop constraint if exists owner_invitations_recipient_locale_check;
alter table owner_invitations add constraint owner_invitations_recipient_locale_check
  check (recipient_locale in ('en','de'));
