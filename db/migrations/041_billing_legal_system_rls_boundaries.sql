-- Task Group 3-B3B: authenticated billing/legal evidence and provider-system
-- boundaries. FORCE ROW LEVEL SECURITY remains intentionally disabled.

alter table public.subscriber_intakes enable row level security;
alter table public.site_subscriptions enable row level security;
alter table public.site_addon_subscriptions enable row level security;
alter table public.subscription_lifecycle_events enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.customer_business_identities enable row level security;
alter table public.contract_acceptances enable row level security;
alter table public.platform_legal_config_versions enable row level security;
alter table public.platform_legal_document_versions enable row level security;

-- The 036 binding trigger must remain safe when invoked from a fixed-path
-- SECURITY DEFINER checkout routine.
create or replace function public.validate_contract_acceptance_binding()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if not exists (
    select 1 from public.subscriber_intakes intake
    join public.site_admin_accounts account
      on account.id=intake.site_admin_account_id
     and account.site_id=intake.demo_site_id
     and account.email=intake.email
    where intake.id=new.intake_id and intake.demo_site_id=new.site_id
      and intake.site_admin_account_id=new.actor_account_id
      and intake.business_identity_id=new.business_identity_id
      and intake.checkout_attempt=new.checkout_attempt
      and intake.plan_key=new.plan_key
      and intake.billing_provider=new.billing_provider
      and intake.checkout_price_id=new.checkout_price_id
  ) then raise exception 'Contract acceptance ownership binding is invalid'; end if;
  if new.terms_document_key<>'terms' or new.privacy_document_key<>'privacy' then
    raise exception 'Contract acceptance document binding is invalid';
  end if;
  return new;
end
$$;

create or replace function public.billing_checkout_legal_context(
  p_session_hash text, p_locale text, p_currency text
)
returns table(
  config_version integer, tax_display_mode text, price_tax_label text,
  special_tax_note text, terms_version text, terms_content_hash text,
  privacy_version text, privacy_content_hash text
)
language sql stable security definer set search_path=pg_catalog
as $$
  select c.version,c.tax_display_mode,c.price_tax_label,c.special_tax_note,
         t.version,t.content_hash,p.version,p.content_hash
  from public.site_admin_resolve_session(p_session_hash) a
  join public.platform_legal_config_versions c
    on c.status='active' and c.legal_review_status='reviewed'
   and c.effective_from <= statement_timestamp() and c.currency=p_currency
  join public.platform_legal_document_versions t
    on t.document_key='terms' and t.locale=p_locale and t.status='active'
   and t.reviewed_at is not null and t.effective_from <= statement_timestamp()
  join public.platform_legal_document_versions p
    on p.document_key='privacy' and p.locale=p_locale and p.status='active'
   and p.reviewed_at is not null and p.effective_from <= statement_timestamp()
  where p_locale in ('en','de') and a.preferred_locale=p_locale
  limit 1
$$;

create or replace function public.billing_customer_snapshot(p_session_hash text, p_expected_site_id text)
returns table(
  site_id text, plan_key text, billing_provider text, provider_customer_id text,
  stripe_customer_id text, subscription_status text, cancel_at_period_end boolean,
  current_period_end timestamptz, first_past_due_at timestamptz,
  payment_grace_ends_at timestamptz, suspended_at timestamptz,
  read_only_ends_at timestamptz, portal_allowed boolean
)
language sql stable security definer set search_path=pg_catalog
as $$
  select a.site_id,s.plan_key,s.billing_provider,s.provider_customer_id,
         s.stripe_customer_id,s.status,s.cancel_at_period_end,s.current_period_end,
         s.first_past_due_at,s.payment_grace_ends_at,s.suspended_at,s.read_only_ends_at,
         (s.plan_key='starter' and s.billing_provider='stripe'
          and s.provider_customer_id is not null
          and s.status in ('trialing','active','past_due','unpaid','canceled','incomplete','incomplete_expired'))
  from public.site_admin_resolve_session(p_session_hash) a
  left join public.site_subscriptions s on s.site_id=a.site_id
  where a.site_id=p_expected_site_id
  limit 1
$$;

create or replace function public.billing_prepare_starter_checkout(
  p_session_hash text, p_expected_site_id text, p_expected_slug text,
  p_price_id text, p_legal_business_name text, p_country_code text,
  p_business_type text, p_vat_id_normalized text, p_vat_syntax_plausible boolean,
  p_locale text, p_b2b_attestation_version text, p_authority_attestation_version text,
  p_automatic_renewal_version text, p_privacy_acknowledgement_version text,
  p_promotion_terms_version text, p_currency text, p_price_tax_label_snapshot text,
  p_normal_price_display_snapshot text, p_trial_duration_days integer
)
returns table(
  intake_id uuid, checkout_attempt integer, business_identity_id uuid,
  contract_acceptance_id uuid, intake_status text, email text,
  terms_version text, terms_content_hash text, privacy_version text,
  privacy_content_hash text, commercial_config_version integer
)
language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_admin record; v_legal record; v_identity record; v_intake record; v_acceptance record;
  v_identity_id uuid; v_acceptance_id uuid; v_tax_label text;
begin
  if p_price_id is null or char_length(p_price_id) not between 1 and 255
     or p_expected_slug is null or p_expected_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$'
     or p_legal_business_name is null or char_length(btrim(p_legal_business_name)) not between 1 and 200
     or p_country_code !~ '^[A-Z]{2}$'
     or p_business_type not in ('company','sole_proprietor','other_business')
     or p_locale not in ('en','de') or p_currency not in ('EUR','USD','ALL')
     or p_trial_duration_days not between 1 and 90
     or nullif(btrim(p_b2b_attestation_version),'') is null
     or nullif(btrim(p_authority_attestation_version),'') is null
     or nullif(btrim(p_automatic_renewal_version),'') is null
     or nullif(btrim(p_privacy_acknowledgement_version),'') is null
     or nullif(btrim(p_price_tax_label_snapshot),'') is null
     or nullif(btrim(p_normal_price_display_snapshot),'') is null then
    raise exception 'Checkout input is invalid';
  end if;

  select a.* into v_admin from public.site_admin_resolve_session(p_session_hash) a;
  if v_admin.account_id is null or v_admin.site_id<>p_expected_site_id
     or v_admin.preferred_locale<>p_locale
     or not exists(select 1 from public.sites s where s.id=v_admin.site_id and s.slug=p_expected_slug and s.site_kind='business') then
    raise exception 'Checkout ownership binding is invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('b2b-checkout:'||v_admin.site_id,0));

  select * into v_legal from public.billing_checkout_legal_context(p_session_hash,p_locale,p_currency);
  if v_legal.config_version is null then raise exception 'Checkout legal evidence is unavailable'; end if;
  v_tax_label := coalesce(nullif(v_legal.special_tax_note,''),v_legal.price_tax_label);
  if v_tax_label<>p_price_tax_label_snapshot then raise exception 'Checkout commercial evidence is stale'; end if;

  select * into v_identity from public.customer_business_identities
   where site_id=v_admin.site_id and is_current for update;
  if v_identity.id is not null and v_identity.verification_state='rejected'
     and v_identity.legal_business_name=btrim(p_legal_business_name)
     and v_identity.country_code=p_country_code and v_identity.business_type=p_business_type
     and v_identity.vat_id_normalized is not distinct from nullif(p_vat_id_normalized,'') then
    raise exception 'Business identity is unavailable for checkout';
  end if;
  if v_identity.id is not null
     and v_identity.legal_business_name=btrim(p_legal_business_name)
     and v_identity.country_code=p_country_code and v_identity.business_type=p_business_type
     and v_identity.vat_id_normalized is not distinct from nullif(p_vat_id_normalized,'') then
    v_identity_id:=v_identity.id;
  else
    if v_identity.id is not null then
      update public.customer_business_identities set is_current=false,updated_at=statement_timestamp() where id=v_identity.id;
    end if;
    v_identity_id:=gen_random_uuid();
    insert into public.customer_business_identities(
      id,site_id,version,legal_business_name,country_code,business_type,vat_id_normalized,
      verification_state,review_reason_code
    ) values(
      v_identity_id,v_admin.site_id,
      (select coalesce(max(i.version),0)+1 from public.customer_business_identities i where i.site_id=v_admin.site_id),
      btrim(p_legal_business_name),p_country_code,p_business_type,nullif(p_vat_id_normalized,''),
      case when p_vat_syntax_plausible then 'self_attested' else 'review_required' end,
      case when p_vat_syntax_plausible then null else 'vat_syntax_review' end
    );
  end if;

  insert into public.subscriber_intakes as target(
    id,email,business_name,demo_site_id,site_admin_account_id,plan_key,billing_provider,
    checkout_price_id,business_identity_id
  ) values(
    gen_random_uuid(),v_admin.email,btrim(p_legal_business_name),v_admin.site_id,v_admin.account_id,
    'starter','stripe',p_price_id,v_identity_id
  ) on conflict on constraint subscriber_intakes_email_demo_site_id_key do update set
    business_name=excluded.business_name,site_admin_account_id=excluded.site_admin_account_id,
    plan_key='starter',billing_provider='stripe',checkout_price_id=excluded.checkout_price_id,
    business_identity_id=excluded.business_identity_id,
    checkout_attempt=case when target.status in ('paid','cancelled') then target.checkout_attempt+1 else target.checkout_attempt end,
    checkout_session_id=case when target.status in ('paid','cancelled') then null else target.checkout_session_id end,
    paid_at=case when target.status in ('paid','cancelled') then null else target.paid_at end,
    status='pending_payment',updated_at=statement_timestamp()
  returning * into v_intake;

  select * into v_acceptance from public.contract_acceptances a
   where a.intake_id=v_intake.id and a.checkout_attempt=v_intake.checkout_attempt and a.source='site_admin_checkout';
  if v_acceptance.id is not null and not (
    v_acceptance.business_identity_id=v_identity_id
    and v_acceptance.terms_version=v_legal.terms_version and v_acceptance.terms_content_hash=v_legal.terms_content_hash
    and v_acceptance.privacy_version=v_legal.privacy_version and v_acceptance.privacy_content_hash=v_legal.privacy_content_hash
    and v_acceptance.b2b_attestation_version=p_b2b_attestation_version
    and v_acceptance.authority_attestation_version=p_authority_attestation_version
    and v_acceptance.automatic_renewal_version=p_automatic_renewal_version
    and v_acceptance.privacy_acknowledgement_version=p_privacy_acknowledgement_version
    and v_acceptance.promotion_terms_version is not distinct from nullif(p_promotion_terms_version,'')
    and v_acceptance.platform_legal_config_version=v_legal.config_version
    and v_acceptance.checkout_price_id=p_price_id and v_acceptance.currency=p_currency
    and v_acceptance.price_tax_label_snapshot=p_price_tax_label_snapshot
    and v_acceptance.normal_price_display_snapshot=p_normal_price_display_snapshot
    and v_acceptance.trial_duration_days=p_trial_duration_days
  ) then
    update public.subscriber_intakes set checkout_attempt=checkout_attempt+1,
      checkout_session_id=null,contract_acceptance_id=null,updated_at=statement_timestamp()
      where id=v_intake.id returning * into v_intake;
    v_acceptance:=null;
  end if;

  if v_acceptance.id is null then
    v_acceptance_id:=gen_random_uuid();
    insert into public.contract_acceptances(
      id,intake_id,checkout_attempt,site_id,actor_account_id,business_identity_id,
      terms_document_key,terms_version,terms_content_hash,privacy_document_key,privacy_version,privacy_content_hash,
      b2b_attestation_version,authority_attestation_version,automatic_renewal_version,
      privacy_acknowledgement_version,promotion_terms_version,platform_legal_config_version,
      plan_key,billing_provider,checkout_price_id,currency,tax_display_mode,price_tax_label_snapshot,
      normal_price_display_snapshot,trial_duration_days,billing_interval,locale,source
    ) values(
      v_acceptance_id,v_intake.id,v_intake.checkout_attempt,v_admin.site_id,v_admin.account_id,v_identity_id,
      'terms',v_legal.terms_version,v_legal.terms_content_hash,'privacy',v_legal.privacy_version,v_legal.privacy_content_hash,
      p_b2b_attestation_version,p_authority_attestation_version,p_automatic_renewal_version,
      p_privacy_acknowledgement_version,nullif(p_promotion_terms_version,''),v_legal.config_version,
      'starter','stripe',p_price_id,p_currency,v_legal.tax_display_mode,p_price_tax_label_snapshot,
      p_normal_price_display_snapshot,p_trial_duration_days,'month',p_locale,'site_admin_checkout'
    );
  else v_acceptance_id:=v_acceptance.id; end if;
  update public.subscriber_intakes set business_identity_id=v_identity_id,contract_acceptance_id=v_acceptance_id
   where id=v_intake.id;

  return query select v_intake.id,v_intake.checkout_attempt,v_identity_id,v_acceptance_id,
    v_intake.status,v_admin.email,v_legal.terms_version,v_legal.terms_content_hash,
    v_legal.privacy_version,v_legal.privacy_content_hash,v_legal.config_version;
end
$$;

create or replace function public.billing_attach_checkout_session(
  p_session_hash text,p_intake_id uuid,p_checkout_session_id text
) returns boolean language plpgsql security definer set search_path=pg_catalog
as $$
declare v_site_id text;
begin
  select a.site_id into v_site_id from public.site_admin_resolve_session(p_session_hash) a;
  if v_site_id is null or p_checkout_session_id is null or char_length(p_checkout_session_id) not between 1 and 255 then return false; end if;
  update public.subscriber_intakes i set checkout_session_id=p_checkout_session_id,updated_at=statement_timestamp()
   where i.id=p_intake_id and i.site_admin_account_id is not null and i.demo_site_id=v_site_id
     and i.status='pending_payment' and i.contract_acceptance_id is not null
     and (i.checkout_session_id is null or i.checkout_session_id=p_checkout_session_id);
  return found;
end
$$;

create or replace function public.billing_system_is_addon_subscription(p_provider_subscription_id text)
returns boolean language sql stable security definer set search_path=pg_catalog
as $$ select exists(select 1 from public.site_addon_subscriptions a where a.stripe_subscription_id=p_provider_subscription_id) $$;

create or replace function public.billing_system_cache_identities(p_site_id text)
returns table(slug text,custom_domain text)
language sql stable security definer set search_path=pg_catalog
as $$ select s.slug,s.custom_domain from public.sites s where s.id=p_site_id limit 1 $$;

create or replace function public.billing_system_process_subscription_event(p_event jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_provider text:=p_event->>'provider'; v_event_id text:=p_event->>'eventId';
  v_event_type text:=p_event->>'eventType'; v_status text:=p_event->>'status';
  v_subscription_id text:=nullif(p_event->>'providerSubscriptionId','');
  v_customer_id text:=nullif(p_event->>'providerCustomerId','');
  v_price_id text:=nullif(p_event->>'providerPriceId',''); v_intake_id uuid;
  v_site_id text; v_plan text; v_observed_at timestamptz; v_period_end timestamptz;
  v_existing record; v_intake record; v_site record; v_previous text; v_active boolean;
  v_cancel boolean:=coalesce((p_event->>'cancelAtPeriodEnd')::boolean,false);
  v_grace_days integer:=coalesce((p_event->>'paymentGraceDays')::integer,7);
  v_read_only_days integer:=coalesce((p_event->>'paidReadOnlyDays')::integer,30);
  v_first_past_due timestamptz; v_grace_end timestamptz; v_suspended timestamptz; v_read_only_end timestamptz;
begin
  if v_provider not in ('stripe','paddle') or nullif(v_event_id,'') is null
     or (v_provider='stripe' and v_event_type not in (
       'checkout.session.completed','checkout.session.async_payment_succeeded',
       'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted',
       'invoice.paid','invoice.payment_failed'))
     or (v_provider='paddle' and v_event_type not in (
       'subscription.activated','subscription.canceled','subscription.created','subscription.past_due',
       'subscription.paused','subscription.resumed','subscription.trialing','subscription.updated',
       'transaction.payment_failed'))
     or v_grace_days not between 1 and 30 or v_read_only_days not between 1 and 180 then
    raise exception 'Provider event is invalid';
  end if;
  begin v_observed_at:=(p_event->>'providerEventCreatedAt')::timestamptz;
  exception when others then raise exception 'Provider event timestamp is invalid'; end;
  if v_observed_at is null then raise exception 'Provider event timestamp is invalid'; end if;
  if nullif(p_event->>'currentPeriodEnd','') is not null then
    begin v_period_end:=(p_event->>'currentPeriodEnd')::timestamptz;
    exception when others then raise exception 'Provider lifecycle timestamp is invalid'; end;
  end if;
  if nullif(p_event->>'intakeId','') is not null then
    begin v_intake_id:=(p_event->>'intakeId')::uuid;
    exception when others then raise exception 'Provider intake binding is invalid'; end;
  end if;

  insert into public.payment_webhook_events(event_id,provider,event_type,provider_created_at)
   values(v_event_id,v_provider,v_event_type,v_observed_at) on conflict do nothing;
  if not found then return jsonb_build_object('processed',false); end if;
  if v_status is null or v_status not in ('trialing','active','paused','past_due','unpaid','canceled','incomplete','incomplete_expired') then
    update public.payment_webhook_events set disposition='ignored_invalid' where event_id=v_event_id;
    return jsonb_build_object('processed',true,'ignored',true,'invalid',true);
  end if;

  if v_subscription_id is not null then
    select * into v_existing from public.site_subscriptions s
     where s.billing_provider=v_provider and s.provider_subscription_id=v_subscription_id for update;
    v_site_id:=v_existing.site_id; v_plan:=v_existing.plan_key;
    if v_site_id is not null and (
      nullif(p_event->>'siteId','') is not null and p_event->>'siteId'<>v_site_id
      or nullif(p_event->>'planKey','') is not null and p_event->>'planKey'<>v_plan
      or v_customer_id is not null and v_existing.provider_customer_id is not null and v_customer_id<>v_existing.provider_customer_id
      or v_price_id is not null and v_existing.provider_price_id is not null and v_price_id<>v_existing.provider_price_id
    ) then raise exception 'Subscription activation target does not match.'; end if;
  end if;

  if v_site_id is null and v_provider='stripe' and v_intake_id is not null then
    select i.* into v_intake from public.subscriber_intakes i
    join public.site_admin_accounts a on a.id=i.site_admin_account_id and a.site_id=i.demo_site_id and a.email=i.email
    where i.id=v_intake_id for update of i;
    if v_intake.id is null or v_intake.plan_key<>'starter' or v_intake.billing_provider<>'stripe'
       or v_intake.contract_acceptance_id is null or v_intake.checkout_session_id is null
       or p_event->>'siteId'<>v_intake.demo_site_id or p_event->>'planKey'<>'starter'
       or v_price_id is distinct from v_intake.checkout_price_id
       or nullif(p_event->>'checkoutSessionId','') is distinct from v_intake.checkout_session_id
       or v_subscription_id is null or v_status not in ('active','trialing') then
      raise exception 'Subscription activation target does not match.';
    end if;
    v_site_id:=v_intake.demo_site_id; v_plan:='starter';
    select * into v_existing from public.site_subscriptions s where s.site_id=v_site_id for update;
    if v_existing.site_id is not null and (
      v_existing.billing_provider<>'stripe' or v_existing.plan_key<>'starter'
      or v_existing.provider_subscription_id is not null and v_existing.provider_subscription_id<>v_subscription_id
    ) then raise exception 'Subscription activation target does not match.'; end if;
  elsif v_site_id is null and v_provider='paddle' then
    update public.payment_webhook_events set disposition='ignored_unbound' where event_id=v_event_id;
    return jsonb_build_object('processed',true,'ignored',true);
  end if;
  if v_site_id is null then
    update public.payment_webhook_events set disposition='ignored_unbound' where event_id=v_event_id;
    return jsonb_build_object('processed',true,'ignored',true);
  end if;
  if v_provider='paddle' and (v_existing.site_id is null or v_existing.billing_provider<>'paddle') then
    update public.payment_webhook_events set site_id=v_site_id,disposition='ignored_invalid' where event_id=v_event_id;
    return jsonb_build_object('processed',true,'ignored',true,'invalid',true,'siteId',v_site_id);
  end if;

  v_previous:=v_existing.status;
  if v_existing.latest_provider_event_at is not null and (
    v_observed_at<v_existing.latest_provider_event_at or
    (v_observed_at=v_existing.latest_provider_event_at and
      (case when v_status in ('active','trialing') then case when v_cancel then 1 else 0 end when v_status='past_due' then 2 else 3 end)
      <= (case when v_previous in ('active','trialing') then case when v_existing.cancel_at_period_end then 1 else 0 end when v_previous='past_due' then 2 else 3 end))
  ) then
    update public.payment_webhook_events set site_id=v_site_id,disposition='ignored_stale' where event_id=v_event_id;
    insert into public.subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at)
      values(gen_random_uuid(),v_site_id||':provider_event_ignored_stale:'||v_event_id,v_site_id,'provider_event_ignored_stale',v_event_id,v_previous,v_status,'{}',v_observed_at)
      on conflict(event_key) do nothing;
    return jsonb_build_object('processed',true,'ignored',true,'stale',true,'siteId',v_site_id);
  end if;
  if v_previous in ('unpaid','paused','canceled','incomplete','incomplete_expired') and v_status='past_due' then
    update public.payment_webhook_events set site_id=v_site_id,disposition='ignored_invalid' where event_id=v_event_id;
    return jsonb_build_object('processed',true,'ignored',true,'invalid',true,'siteId',v_site_id);
  end if;

  v_active:=v_status in ('active','trialing');
  if v_status='past_due' then
    v_first_past_due:=case when v_previous='past_due' then v_existing.first_past_due_at else v_observed_at end;
    v_grace_end:=case when v_previous='past_due' then v_existing.payment_grace_ends_at else v_observed_at+(v_grace_days||' days')::interval end;
    v_suspended:=v_grace_end;
    v_read_only_end:=case when v_previous='past_due' then v_existing.read_only_ends_at else v_grace_end+(v_read_only_days||' days')::interval end;
  elsif not v_active then
    v_suspended:=case when v_previous in ('unpaid','paused','canceled','incomplete','incomplete_expired') then v_existing.suspended_at else v_observed_at end;
    v_read_only_end:=case when v_previous in ('unpaid','paused','canceled','incomplete','incomplete_expired') then v_existing.read_only_ends_at else v_suspended+(v_read_only_days||' days')::interval end;
  elsif v_cancel then
    if v_period_end is null then raise exception 'Provider lifecycle timestamp is invalid'; end if;
    v_suspended:=v_period_end; v_read_only_end:=v_period_end+(v_read_only_days||' days')::interval;
  end if;

  if v_intake_id is not null then
    update public.subscriber_intakes set status='paid',paid_at=coalesce(paid_at,statement_timestamp()),updated_at=statement_timestamp()
     where id=v_intake_id and contract_acceptance_id is not null;
    if not found then raise exception 'Subscription activation requires bound B2B contract acceptance'; end if;
  end if;

  insert into public.site_subscriptions as target(
    site_id,billing_provider,provider_customer_id,provider_subscription_id,provider_price_id,
    stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_key,status,current_period_end,
    cancel_at_period_end,cancelled_at,last_processed_event_id,provider_status_observed_at,
    first_past_due_at,payment_grace_ends_at,suspended_at,read_only_ends_at,last_active_at,
    latest_provider_event_at,latest_provider_event_id,contract_acceptance_state
  ) values(
    v_site_id,v_provider,v_customer_id,v_subscription_id,v_price_id,
    case when v_provider='stripe' then v_customer_id end,case when v_provider='stripe' then v_subscription_id end,
    case when v_provider='stripe' then v_price_id end,v_plan,v_status,v_period_end,v_cancel,
    case when v_status='canceled' then v_observed_at end,v_event_id,v_observed_at,
    v_first_past_due,v_grace_end,v_suspended,v_read_only_end,case when v_active then v_observed_at end,
    v_observed_at,v_event_id,case when v_intake_id is not null then 'accepted' else coalesce(v_existing.contract_acceptance_state,'acceptance_unknown') end
  ) on conflict(site_id) do update set
    provider_customer_id=coalesce(excluded.provider_customer_id,target.provider_customer_id),
    provider_subscription_id=coalesce(excluded.provider_subscription_id,target.provider_subscription_id),
    provider_price_id=coalesce(excluded.provider_price_id,target.provider_price_id),
    stripe_customer_id=coalesce(excluded.stripe_customer_id,target.stripe_customer_id),
    stripe_subscription_id=coalesce(excluded.stripe_subscription_id,target.stripe_subscription_id),
    stripe_price_id=coalesce(excluded.stripe_price_id,target.stripe_price_id),
    status=excluded.status,current_period_end=coalesce(excluded.current_period_end,target.current_period_end),
    cancel_at_period_end=excluded.cancel_at_period_end,
    cancelled_at=case when excluded.status='canceled' then coalesce(target.cancelled_at,excluded.cancelled_at) else null end,
    last_processed_event_id=excluded.last_processed_event_id,provider_status_observed_at=excluded.provider_status_observed_at,
    first_past_due_at=excluded.first_past_due_at,payment_grace_ends_at=excluded.payment_grace_ends_at,
    suspended_at=excluded.suspended_at,read_only_ends_at=excluded.read_only_ends_at,
    last_active_at=coalesce(excluded.last_active_at,target.last_active_at),
    latest_provider_event_at=excluded.latest_provider_event_at,latest_provider_event_id=excluded.latest_provider_event_id,
    contract_acceptance_state=case when excluded.contract_acceptance_state='accepted' then 'accepted' else target.contract_acceptance_state end,
    updated_at=statement_timestamp();

  select * into v_site from public.sites where id=v_site_id for update;
  update public.sites set
    activated_at=case when v_active then coalesce(activated_at,v_observed_at) else activated_at end,
    visibility=case when v_active then publication_intent when v_status in ('unpaid','paused','canceled','incomplete','incomplete_expired') then 'private' else visibility end
    where id=v_site_id;
  if v_plan='starter' then
    insert into public.site_features(site_id,feature_key,enabled)
    select v_site_id,x.key,x.enabled from (values
      ('website',true),('editor',true),('media',true),('ai_rewrite',true),
      ('appointment_requests',true),('booking',true),('booking_calendar',false),
      ('custom_domain',true),('custom_domain_existing',true)
    ) x(key,enabled) on conflict(site_id,feature_key) do update set enabled=excluded.enabled;
  end if;
  if v_status='past_due' and v_previous is distinct from 'past_due' then
    insert into public.subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at)
      values(gen_random_uuid(),v_site_id||':entered_payment_grace:'||v_event_id,v_site_id,'entered_payment_grace',v_event_id,v_previous,v_status,
      jsonb_build_object('graceEndsAt',v_grace_end),v_observed_at) on conflict(event_key) do nothing;
  end if;
  if v_active and v_previous is not null and v_previous not in ('active','trialing') then
    insert into public.subscription_lifecycle_events(id,event_key,site_id,action,provider_event_id,from_status,to_status,details,occurred_at)
      values(gen_random_uuid(),v_site_id||':reactivated:'||v_event_id,v_site_id,'reactivated',v_event_id,v_previous,v_status,
      jsonb_build_object('preservedOwnership',true),v_observed_at) on conflict(event_key) do nothing;
  end if;
  update public.payment_webhook_events set site_id=v_site_id,disposition='accepted' where event_id=v_event_id;
  return jsonb_build_object('processed',true,'siteId',v_site_id,'active',v_active);
end
$$;

revoke all on function public.billing_checkout_legal_context(text,text,text) from public;
revoke all on function public.billing_customer_snapshot(text,text) from public;
revoke all on function public.billing_prepare_starter_checkout(text,text,text,text,text,text,text,text,boolean,text,text,text,text,text,text,text,text,text,integer) from public;
revoke all on function public.billing_attach_checkout_session(text,uuid,text) from public;
revoke all on function public.billing_system_is_addon_subscription(text) from public;
revoke all on function public.billing_system_cache_identities(text) from public;
revoke all on function public.billing_system_process_subscription_event(jsonb) from public;
