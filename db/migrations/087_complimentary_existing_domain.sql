-- Existing-domain management follows the already granted complimentary plan.
-- Only this capability is added to the complimentary lifecycle branch; feature,
-- session, tenant and business-kind checks remain mandatory. No billing write.
-- migrate-as-owner-of: public.database_site_admin_mutation_allowed(text,text,text)
create or replace function public.database_site_admin_mutation_allowed(
  p_session_hash text, p_site_id text, p_capability text
) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
  select exists(
    select 1
    from public.site_admin_resolve_session(p_session_hash) a
    join public.sites s on s.id=a.site_id
    join public.site_features f on f.site_id=s.id and f.feature_key=p_capability and f.enabled
    left join public.site_subscriptions sub on sub.site_id=s.id
    left join public.site_complimentary_access comp on comp.site_id=s.id
    where a.site_id=p_site_id and s.site_kind='business'
      and (
        (p_capability='custom_domain_existing' and s.activated_at is not null
          and comp.status='complimentary_active')
        or (s.activated_at is null and s.demo_expires_at>statement_timestamp())
        or (sub.status in ('active','trialing') and (
          not sub.cancel_at_period_end or sub.current_period_end>statement_timestamp()
        ))
        or (sub.status='past_due' and sub.payment_grace_ends_at>statement_timestamp())
      )
  )
$$;
