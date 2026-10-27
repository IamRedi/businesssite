-- Durable replay and idempotency controls for future versioned inbound APIs.
-- This migration exposes no route and grants no integration permission by itself.
alter table site_external_integrations
  add constraint site_external_integrations_id_site_unique unique (id, site_id);

create table integration_nonces (
  integration_id uuid not null,
  site_id text not null,
  nonce text not null check (char_length(nonce) between 16 and 200),
  signed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (integration_id, nonce),
  foreign key (integration_id, site_id)
    references site_external_integrations(id, site_id) on delete cascade,
  check (expires_at > signed_at)
);

create index integration_nonces_expiry_idx on integration_nonces(expires_at);

create table integration_api_requests (
  integration_id uuid not null,
  site_id text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  operation text not null check (char_length(operation) between 1 and 120),
  request_hash text not null check (char_length(request_hash) = 64),
  state text not null default 'processing'
    check (state in ('processing', 'completed', 'failed')),
  response_status integer check (response_status is null or response_status between 100 and 599),
  response_body jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (integration_id, idempotency_key),
  foreign key (integration_id, site_id)
    references site_external_integrations(id, site_id) on delete cascade,
  check (expires_at > created_at)
);

create index integration_api_requests_expiry_idx
  on integration_api_requests(expires_at);
