-- Owner-created complimentary permanent business access (owner_comp).
-- The commercial plan stays a Stripe/Paddle contract; this table records only
-- that an owner granted permanent, billing-free access for one site.
-- migrate-as-migrator
alter table public.sites drop constraint sites_onboarding_source_check;
alter table public.sites add constraint sites_onboarding_source_check
  check (onboarding_source in ('owner_outreach', 'self_service', 'owner_comp'));

create table public.site_complimentary_access (
  id uuid primary key,
  site_id text not null unique references public.sites(id) on delete cascade,
  status text not null default 'complimentary_active'
    check (status in ('complimentary_active', 'revoked', 'converted')),
  plan_key text not null check (plan_key in ('starter', 'professional', 'premium')),
  reason text not null default '' check (char_length(btrim(reason)) <= 500),
  granted_by uuid not null references public.owner_accounts(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.owner_accounts(id) on delete restrict,
  revoked_at timestamptz,
  converted_to_paid_at timestamptz,
  lock_version integer not null default 1 check (lock_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.site_complimentary_access enable row level security;
revoke all on public.site_complimentary_access from public;

-- The deterministic conversion of an owner grant into a paid subscription is
-- a first-class lifecycle action.
alter table public.subscription_lifecycle_events drop constraint subscription_lifecycle_events_action_check;
alter table public.subscription_lifecycle_events add constraint subscription_lifecycle_events_action_check
  check (action = any (array['entered_payment_grace','grace_expired','entered_read_only','entered_locked','trial_expired',
    'provider_event_ignored_stale','reactivated','billing_forced_private','publication_intent_restored','complimentary_converted']));

-- Platform owner provisioning. Role and actor are always DB-derived; the
-- administrator starts without a usable password and sets one through the
-- single-use reset token the owner receives once.
create or replace function public.owner_comp_create_customer(
  p_session_hash text, p_input jsonb,
  p_reset_hash text, p_reset_expires timestamptz, p_correlation text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor record; v_site text; v_slug text; v_email text;
  v_account uuid:=gen_random_uuid(); v_plan text; v_features jsonb; v_doc jsonb;
begin
  select * into v_actor from public.owner_auth_resolve_session(p_session_hash, 'websites.manage');
  if v_actor.owner_id is null then return null; end if;
  v_site:=p_input->>'id'; v_slug:=lower(btrim(p_input->>'slug')); v_email:=lower(btrim(p_input->>'email'));
  v_plan:=p_input->>'planKey'; v_features:=p_input->'features'; v_doc:=p_input->'document';
  if v_site is null or length(v_site)>160 or v_site !~ '^[a-z0-9][a-z0-9-]{0,158}[a-z0-9]$'
    or v_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug)>180
    or position('@' in v_email)<2 or length(v_email)>320
    or v_plan not in ('starter','professional','premium')
    or jsonb_typeof(v_features)<>'array'
    or not v_features <@ '["website","editor","media","ai_rewrite","appointment_requests","booking","booking_calendar","custom_domain","custom_domain_existing","social_media"]'::jsonb
    or not v_features @> '["website"]'::jsonb
    or jsonb_typeof(v_doc)<>'object'
    or length(btrim(coalesce(p_input->>'businessName',''))) not between 1 and 200
    or p_input->>'locale' not in ('en','de')
    or length(btrim(coalesce(p_input->>'reason','')))>500
    or p_reset_hash!~'^[a-f0-9]{64}$'
    or p_reset_expires<=statement_timestamp() or p_reset_expires>statement_timestamp()+interval '1 hour 5 seconds'
    or pg_column_size(p_input)>786432 then return null; end if;
  -- Provisioning is rare; one transaction lock makes the friendly uniqueness
  -- checks race-safe across both slug and administrator email.
  perform pg_advisory_xact_lock(7310445);
  if exists(select 1 from public.sites where slug=v_slug) then raise exception 'complimentary_slug_taken'; end if;
  if exists(select 1 from public.site_admin_accounts where lower(btrim(email))=v_email) then raise exception 'complimentary_email_taken'; end if;
  v_doc:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_doc,'{id}',to_jsonb(v_site),true),'{slug}',to_jsonb(v_slug),true),'{visibility}','"public"'::jsonb,true),'{profileId}','null'::jsonb,true);
  insert into public.sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,onboarding_source,trial_email,site_kind)
  values(v_site,v_slug,'public','public',v_doc,statement_timestamp(),statement_timestamp(),statement_timestamp(),'owner_comp',v_email,'business');
  insert into public.site_features(site_id,feature_key,enabled)
    select v_site,x.key,true from jsonb_array_elements_text(v_features) x(key)
    on conflict(site_id,feature_key) do update set enabled=excluded.enabled;
  -- The administrator starts without any usable password (the stored value is
  -- outside the scrypt password format and can never verify); the single-use
  -- reset token is the only path to a first login.
  insert into public.site_admin_accounts(id,site_id,email,password_hash,preferred_locale)
    values(v_account,v_site,v_email,'unusable:'||md5(gen_random_uuid()::text||statement_timestamp()::text),p_input->>'locale');
  update public.site_admin_password_resets set used_at=statement_timestamp() where account_id=v_account and used_at is null;
  insert into public.site_admin_password_resets(id,account_id,token_hash,expires_at)
    values(gen_random_uuid(),v_account,p_reset_hash,p_reset_expires);
  insert into public.site_complimentary_access(id,site_id,status,plan_key,reason,granted_by)
    values(gen_random_uuid(),v_site,'complimentary_active',v_plan,btrim(coalesce(p_input->>'reason','')),v_actor.owner_id);
  insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id)
    values(gen_random_uuid(),'subscription',v_site,'complimentary_granted',
      jsonb_build_object('planKey',v_plan,'locale',p_input->>'locale','slug',v_slug),v_actor.owner_id,left(p_correlation,128));
  return jsonb_build_object('siteId',v_site,'slug',v_slug,'accountId',v_account,'email',v_email,'planKey',v_plan);
exception when unique_violation then raise exception 'complimentary_email_taken';
  when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation then return null;
end $$;

create or replace function public.owner_comp_revoke(p_session_hash text,p_slug text,p_reason text,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_site text; v_record record;
begin
  select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'websites.manage');
  if v_actor.owner_id is null then return false; end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 500 then return false; end if;
  select s.id into v_site from public.sites s where s.slug=p_slug and s.site_kind='business' for update;
  if v_site is null then return false; end if;
  update public.site_complimentary_access
    set status='revoked',revoked_by=v_actor.owner_id,revoked_at=statement_timestamp(),
        reason=btrim(p_reason),lock_version=lock_version+1,updated_at=statement_timestamp()
    where site_id=v_site and status='complimentary_active'
    returning * into v_record;
  if v_record.id is null then return false; end if;
  update public.sites set publication_intent='private',visibility='private' where id=v_site;
  delete from public.site_admin_sessions where account_id in (select id from public.site_admin_accounts where site_id=v_site);
  insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id)
    values(gen_random_uuid(),'subscription',v_site,'complimentary_revoked',
      jsonb_build_object('slug',p_slug,'reason',btrim(p_reason)),v_actor.owner_id,left(p_correlation,128));
  return true;
end $$;

create or replace function public.owner_comp_list(p_session_hash text)
returns table(site_id text,slug text,business_name text,email text,status text,plan_key text,reason text,granted_at timestamptz,revoked_at timestamptz,converted_to_paid_at timestamptz)
language sql security definer set search_path=pg_catalog as $$
  select c.site_id,s.slug,coalesce(s.generated_document#>>'{content,name}',s.slug),a.email,c.status,c.plan_key,c.reason,c.granted_at,c.revoked_at,c.converted_to_paid_at
  from public.owner_auth_resolve_session(p_session_hash,'websites.manage') actor
  cross join public.site_complimentary_access c
  join public.sites s on s.id=c.site_id
  left join public.site_admin_accounts a on a.site_id=c.site_id
  order by c.granted_at desc,c.site_id
$$;

revoke all on function public.owner_comp_create_customer(text,jsonb,text,timestamptz,text) from public;
revoke all on function public.owner_comp_revoke(text,text,text,text) from public;
revoke all on function public.owner_comp_list(text) from public;


-- migrate-as-owner-of: public.owner_customer_list(text,integer,integer)
-- The owner customer list gains the entitlement columns so the operations
-- view can show complimentary, paid and trial customers side by side.
drop function if exists public.owner_customer_list(text,integer,integer);
create or replace function public.owner_customer_list(p_session_hash text,p_limit integer default 200,p_offset integer default 0)
returns table(site_id text,slug text,business_name text,visibility text,onboarding_source text,email text,demo_expires_at timestamptz,activated_at timestamptz,created_at timestamptz,custom_domain text,custom_domain_status text,plan_key text,subscription_status text,current_period_end timestamptz,cancel_at_period_end boolean,billing_provider text,intake_status text,social_control_status text,social_addon_status text,first_past_due_at timestamptz,payment_grace_ends_at timestamptz,suspended_at timestamptz,read_only_ends_at timestamptz,last_active_at timestamptz,publication_intent text,trial_recovery_ends_at timestamptz,complimentary_status text,complimentary_granted_at timestamptz,complimentary_plan_key text)
language sql security definer set search_path=pg_catalog as $$
 select s.id,s.slug,coalesce(s.generated_document#>>'{content,name}',s.slug),s.visibility,s.onboarding_source,
 coalesce(admin.email,s.trial_email,intake.email),s.demo_expires_at,s.activated_at,s.created_at,s.custom_domain,s.custom_domain_status,
 coalesce(sub.plan_key,intake.plan_key),sub.status,sub.current_period_end,coalesce(sub.cancel_at_period_end,false),sub.billing_provider,
 intake.status,social.status,social_addon.status,sub.first_past_due_at,sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,s.publication_intent,s.trial_recovery_ends_at,
 comp.status,comp.granted_at,comp.plan_key
 from public.owner_auth_resolve_session(p_session_hash,'subscriptions.read') actor cross join public.sites s
 left join lateral(select a.email from public.site_admin_accounts a where a.site_id=s.id order by a.created_at limit 1) admin on true
 left join public.site_subscriptions sub on sub.site_id=s.id
 left join lateral(select i.status,i.email,i.plan_key from public.subscriber_intakes i where i.demo_site_id=s.id order by i.created_at desc limit 1) intake on true
 left join public.site_external_integrations social on social.site_id=s.id and social.provider='redi_control'
 left join public.site_addon_subscriptions social_addon on social_addon.site_id=s.id and social_addon.addon_key='social_media'
 left join public.site_complimentary_access comp on comp.site_id=s.id
 order by coalesce(sub.updated_at,s.created_at) desc,s.id limit least(greatest(p_limit,1),200) offset greatest(p_offset,0)
$$;
revoke all on function public.owner_customer_list(text,integer,integer) from public;

-- migrate-as-owner-of: public.site_admin_access_snapshot()
-- The site-admin snapshot gains the entitlement state so the whole access
-- policy resolves complimentary sites without touching billing tables.
drop function if exists public.site_admin_access_snapshot();
create or replace function site_admin_access_snapshot()
returns table(
  activated_at timestamptz, demo_expires_at timestamptz,
  trial_recovery_ends_at timestamptz, publication_intent text,
  subscription_status text, cancel_at_period_end boolean,
  current_period_end timestamptz, first_past_due_at timestamptz,
  payment_grace_ends_at timestamptz, suspended_at timestamptz,
  read_only_ends_at timestamptz, last_active_at timestamptz,
  complimentary_status text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.activated_at,s.demo_expires_at,s.trial_recovery_ends_at,s.publication_intent,
         sub.status,sub.cancel_at_period_end,sub.current_period_end,sub.first_past_due_at,
         sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,
         comp.status
  from public.sites s
  left join public.site_subscriptions sub on sub.site_id=s.id
  left join public.site_complimentary_access comp on comp.site_id=s.id
  where public.app_context_is_valid_site_admin()
    and s.id=public.app_context_site_id()::text
  limit 1
$$;
revoke all on function site_admin_access_snapshot() from public;

-- migrate-as-owner-of: public.site_admin_site_available()
create or replace function site_admin_site_available()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.sites s
    left join public.site_subscriptions sub on sub.site_id=s.id
    left join public.site_complimentary_access comp on comp.site_id=s.id
    where public.app_context_is_valid_site_admin()
      and s.id=public.app_context_site_id()::text
      and (
        s.site_kind='information'
        or comp.status='complimentary_active'
        or s.trial_recovery_ends_at > statement_timestamp()
        or sub.status in ('active','trialing','past_due','unpaid','paused','canceled','incomplete','incomplete_expired')
      )
  )
$$;
revoke all on function site_admin_site_available() from public;


-- migrate-as-owner-of: public.public_site_lifecycle_allows(text)
create or replace function public_site_lifecycle_allows(p_site_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.sites s
    left join public.site_subscriptions sub on sub.site_id=s.id
    left join public.site_complimentary_access comp on comp.site_id=s.id
    where s.id=p_site_id
      and s.site_kind='business'
      and s.visibility='public'
      and s.publication_intent='public'
      and s.activated_at is not null
      and (
        comp.status='complimentary_active'
        or (
          sub.status in ('active','trialing') and (
            not sub.cancel_at_period_end
            or (sub.current_period_end is not null and sub.current_period_end > statement_timestamp())
          )
        )
        or (
          sub.status='past_due'
          and sub.first_past_due_at is not null
          and sub.payment_grace_ends_at is not null
          and sub.read_only_ends_at is not null
          and sub.payment_grace_ends_at > statement_timestamp()
        )
      )
  )
$$;
revoke all on function public_site_lifecycle_allows(text) from public;

revoke all on function public_site_lifecycle_allows(text) from public;

-- migrate-as-owner-of: public.billing_system_process_subscription_event(jsonb)
-- A verified paid activation deterministically retires the entitlement; the
-- write is idempotent and keeps the first conversion timestamp.
do $$ declare v_definition text; v_marker text:='select * into v_site from public.sites where id=v_site_id for update;'; begin
  select pg_get_functiondef('public.billing_system_process_subscription_event(jsonb)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'complimentary_conversion_projection_drift'; end if;
  execute replace(v_definition,v_marker,
    v_marker||' '||
    'with converted as (update public.site_complimentary_access set status=''converted'',converted_to_paid_at=coalesce(converted_to_paid_at,statement_timestamp()),updated_at=statement_timestamp() where site_id=v_site_id and status=''complimentary_active'' returning site_id) '||
    'insert into public.subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at) '||
    'select gen_random_uuid(),v_site_id||'':complimentary_converted:''||v_event_id,v_site_id,''complimentary_converted'',v_event_id,v_previous,v_status,jsonb_build_object(''planKey'',v_plan),v_observed_at from converted '||
    'on conflict(event_key) do nothing;');
end $$;
revoke all on function public.billing_system_process_subscription_event(jsonb) from public;

-- The privacy executor can reach the table only through this classified helper.
create function public.complimentary_access_export(p_site text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('status',status,'planKey',plan_key,'reason',reason,'grantedAt',granted_at,'revokedAt',revoked_at,'convertedToPaidAt',converted_to_paid_at)
  from public.site_complimentary_access where site_id=p_site
$$;
revoke all on function public.complimentary_access_export(text) from public;
do $$ declare v_role name; begin
  select pg_get_userbyid(proowner) into strict v_role from pg_proc
    where oid='public.privacy_system_export_snapshot(uuid,text)'::regprocedure;
  execute format('grant execute on function public.complimentary_access_export(text) to %I',v_role);
end $$;

-- migrate-as-owner-of: public.privacy_system_export_snapshot(uuid,text)
-- Keep the customer export workflow complete for the new data class.
do $$ declare v_definition text; v_marker text:='''contractAcceptances'''; begin
  select pg_get_functiondef('public.privacy_system_export_snapshot(uuid,text)'::regprocedure) into v_definition;
  if position(v_marker in v_definition)=0 then raise exception 'complimentary_export_projection_drift'; end if;
  execute replace(v_definition,v_marker,'''complimentary'',public.complimentary_access_export(v.site_id),'||v_marker);
end $$;
revoke all on function public.privacy_system_export_snapshot(uuid,text) from public;

-- migrate-as-owner-of: public.database_enforced_readiness()
-- One additional tenant table is RLS protected after role provisioning.
create or replace function public.database_enforced_readiness()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select
  (select count(*)=69
     and count(*) filter(where c.relrowsecurity)=66
     and count(*) filter(where c.relforcerowsecurity)=66
     and count(distinct c.relowner)=1
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in('r','p'))
  and not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    where n.nspname='public' and c.relkind in('r','p') and x.grantee=0)
  and not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('public',p.oid,'execute')
      and not exists(select 1 from pg_depend d join pg_extension e on e.oid=d.refobjid
        where d.classid='pg_proc'::regclass and d.objid=p.oid
          and d.refclassid='pg_extension'::regclass and d.deptype='e'))
  and (select count(distinct p.proowner)=4
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       join pg_roles r on r.oid=p.proowner
       where n.nspname='public' and p.prosecdef and not r.rolcanlogin
         and not r.rolsuper and not r.rolbypassrls
         and not r.rolcreatedb and not r.rolcreaterole)
  and public.privacy_active_policy_valid()
$$;
revoke all on function public.database_enforced_readiness() from public;
