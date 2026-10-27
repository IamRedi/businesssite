-- migrate-as-owner-of: public.public_trial_create(jsonb,text,text,text,timestamp with time zone,integer,integer)
-- Enforced site-admin RLS stores the authenticated site actor as a UUID. Keep
-- the public trial transaction atomic while issuing a canonical site identity.
create or replace function public.public_trial_create(p_input jsonb,p_password_hash text,p_session_hash text,p_previous_hash text,p_session_expires timestamptz,p_trial_days integer,p_recovery_days integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_email text:=lower(btrim(p_input->>'email')); v_profile jsonb:=p_input->'profile'; v_doc jsonb:=p_input->'site'; v_lead text:='self-'||gen_random_uuid(); v_profile_id text; v_site text:=gen_random_uuid()::text; v_slug text; v_account uuid:=gen_random_uuid(); v_preview uuid; v_expires timestamptz; begin
 if position('@' in v_email)<2 or length(v_email)>320 or length(p_password_hash)>1000 or p_session_hash!~'^[a-f0-9]{64}$'
  or (p_previous_hash is not null and p_previous_hash!~'^[a-f0-9]{64}$') or p_session_expires<=statement_timestamp() or p_session_expires>statement_timestamp()+interval '91 days'
  or p_trial_days not between 1 and 90 or p_recovery_days not between 1 and 180 or p_input->>'preferredLocale' not in('en','de')
  or jsonb_typeof(v_profile)<>'object' or jsonb_typeof(v_doc)<>'object' or length(btrim(v_profile#>>'{business,name}')) not between 1 and 200
  or pg_column_size(p_input)>786432 then return null; end if;
 perform pg_advisory_xact_lock(7310441); if exists(select 1 from public.site_admin_accounts where lower(btrim(email))=v_email) then raise exception 'trial_conflict'; end if;
 v_profile_id:='prepared-'||v_lead||'-v1'; v_slug=lower(v_doc->>'slug');
 if v_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug)>180 then return null; end if;
 if exists(select 1 from public.sites where slug=v_slug) then v_slug:=left(v_slug,165)||'-'||substr(md5(v_site),1,8); end if;
 v_profile:=jsonb_set(jsonb_set(jsonb_set(v_profile,'{id}',to_jsonb(v_profile_id),true),'{sourceLeadId}',to_jsonb(v_lead),true),'{version}','1'::jsonb,true);
 v_doc:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(v_doc,'{id}',to_jsonb(v_site),true),'{profileId}',to_jsonb(v_profile_id),true),'{slug}',to_jsonb(v_slug),true),'{visibility}','"private"'::jsonb,true);
 insert into public.leads(id,name,source,payload,category,address,phone,score,score_reasons,signals) values(v_lead,left(v_profile#>>'{business,name}',200),'self-service',coalesce(v_profile->'business','{}'),nullif(left(v_profile#>>'{business,category}',160),''),nullif(left(v_profile#>>'{business,address}',500),''),nullif(left(v_profile#>>'{business,phone}',80),''),100,'["self-service website trial"]',jsonb_build_object('hasWebsite',false,'hasEmail',true,'hasPhone',coalesce(v_profile#>>'{business,phone}','')<>'','isActive',true));
 insert into public.prepared_business_profiles(id,lead_id,version,profile,status) values(v_profile_id,v_lead,1,v_profile,'ready_for_handoff');
 v_expires:=statement_timestamp()+p_trial_days*interval '1 day';
 insert into public.sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,demo_expires_at,trial_recovery_ends_at,onboarding_source,trial_email)
 values(v_site,v_slug,'private','public',v_doc,v_lead,v_profile_id,v_expires,statement_timestamp()+(p_trial_days+p_recovery_days)*interval '1 day','self_service',v_email);
 insert into public.demo_sites(site_id,prepared_profile_id) values(v_site,v_profile_id);
 insert into public.site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values(v_account,v_site,v_email,p_password_hash,p_input->>'preferredLocale');
 if p_previous_hash is not null then delete from public.site_admin_sessions where token_hash=p_previous_hash; end if;
 delete from public.site_admin_sessions where expires_at<=statement_timestamp();
 insert into public.site_admin_sessions(id,account_id,token_hash,expires_at) values(gen_random_uuid(),v_account,p_session_hash,p_session_expires);
 insert into public.site_preview_tokens(token_id,site_id,expires_at) values(gen_random_uuid(),v_site,v_expires) returning token_id into v_preview;
 insert into public.audit_events(id,entity_type,entity_id,action,details) values(gen_random_uuid(),'demo',v_site,'self_service_trial_created',jsonb_build_object('category','public_trial'));
 return jsonb_build_object('site',v_doc,'accountId',v_account,'expiresAt',v_expires,'previewTokenId',v_preview);
exception when unique_violation then raise exception 'trial_conflict'; when check_violation or not_null_violation or foreign_key_violation or invalid_text_representation then return null;
end $$;

revoke all on function public.public_trial_create(jsonb,text,text,text,timestamptz,integer,integer) from public;
