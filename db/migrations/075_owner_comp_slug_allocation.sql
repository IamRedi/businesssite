-- Canonical sequential slug allocation for owner complimentary creation.
-- Previously a taken slug raised complimentary_slug_taken and the create
-- failed; now the routine allocates base, base-2, base-3, ... under the
-- existing transaction advisory lock (race-safe), with the unique constraint
-- on sites.slug as the final guard and a bounded random fallback. The email
-- uniqueness boundary is unchanged (Release 2 territory).
-- migrate-as-owner-of: public.owner_comp_create_customer(text,jsonb,text,timestamptz,text)
create or replace function public.owner_comp_create_customer(
  p_session_hash text, p_input jsonb,
  p_reset_hash text, p_reset_expires timestamptz, p_correlation text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_actor record; v_site text; v_slug text; v_email text;
  v_account uuid:=gen_random_uuid(); v_plan text; v_features jsonb; v_doc jsonb;
  v_base text; v_attempt integer;
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
  -- Canonical slug allocation: base, base-2, base-3, ... The advisory lock
  -- serializes complimentary provisioning and the unique constraint on
  -- sites.slug stays the final guard; the bounded random fallback mirrors the
  -- self-service trial allocator for pathological cases.
  v_base:=left(v_slug,176);
  if exists(select 1 from public.sites where slug=v_slug) then
    for v_attempt in 2..50 loop
      v_slug:=v_base||'-'||v_attempt;
      exit when not exists(select 1 from public.sites where slug=v_slug);
    end loop;
  end if;
  if exists(select 1 from public.sites where slug=v_slug) then
    v_slug:=left(v_base,165)||'-'||substr(md5(v_site),1,8);
  end if;
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
      jsonb_build_object('planKey',v_plan,'locale',p_input->>'locale','slug',v_slug,'requestedSlug',v_base),v_actor.owner_id,left(p_correlation,128));
  return jsonb_build_object('siteId',v_site,'slug',v_slug,'accountId',v_account,'email',v_email,'planKey',v_plan);
exception when unique_violation then raise exception 'complimentary_email_taken';
  when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation then return null;
end $$;

revoke all on function public.owner_comp_create_customer(text,jsonb,text,timestamptz,text) from public;
