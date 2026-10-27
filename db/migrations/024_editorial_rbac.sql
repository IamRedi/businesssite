-- Explicit editorial roles. Existing information-site administrators retain
-- full access; ordinary business sites receive no editorial membership.
alter table site_admin_accounts
  add constraint site_admin_accounts_id_site_unique unique (id, site_id);

create table site_editorial_memberships (
  account_id uuid not null,
  site_id text not null,
  role text not null check (role in ('editor','publisher','administrator')),
  granted_by text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, site_id),
  foreign key (account_id, site_id)
    references site_admin_accounts(id, site_id) on delete cascade
);

create index site_editorial_memberships_site_role_idx
  on site_editorial_memberships(site_id, role);

insert into site_editorial_memberships(account_id,site_id,role,granted_by)
select account.id,account.site_id,'administrator','migration-024'
from site_admin_accounts account
join sites site on site.id=account.site_id
where site.site_kind='information'
on conflict(account_id,site_id) do nothing;
