-- Task Group 4-B6C: authorize the authenticated customer export request scope
-- in the database-owned rate-limit allowlist. Unknown scopes remain fail closed.
-- migrate-as-owner-of: public.consume_api_rate_limit(text,text,integer,integer)
create or replace function public.consume_api_rate_limit(
  p_scope text,p_subject text,p_limit integer,p_window integer
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_start timestamptz; v_count integer; v_retry integer; begin
 if p_scope<>all(array['password_reset_network','password_reset_account','manual_password_change_network','manual_password_change_account','password_change_network','password_change_token','site_admin_login_network','site_admin_login_account','subscription-checkout','subscription_resource','owner-google-places-provider-call','owner-device-geocode','owner_invitation_accept_network','owner_invitation_accept_token','owner_password_change','public-appointment','appointment_site_network','appointment_replay','owner_team_session_revoke','public-trial','public_trial_email','owner_team_role_change','owner_login_network','owner_login_identity','owner_team_status_change','owner_team_invite_revoke','owner_team_invite_create','owner_team_invite_resend','owner_mfa_challenge','owner_recovery_regeneration','privacy_deletion_customer','privacy_export_customer'])
  or p_subject!~'^[a-f0-9]{64}$' or p_limit not between 1 and 10000 or p_window not between 10 and 86400 then return null; end if;
 v_start:=to_timestamp(floor(extract(epoch from statement_timestamp())/p_window)*p_window);
 insert into public.api_rate_limits(scope,subject_key,window_start,request_count) values(p_scope,p_subject,v_start,1)
 on conflict(scope,subject_key,window_start) do update set request_count=public.api_rate_limits.request_count+1,updated_at=statement_timestamp()
 where public.api_rate_limits.request_count<p_limit returning request_count into v_count;
 v_retry:=greatest(1,p_window-floor(extract(epoch from statement_timestamp()-v_start))::integer);
 return jsonb_build_object('allowed',v_count is not null,'retryAfterSeconds',v_retry); end $$;

revoke all on function public.consume_api_rate_limit(text,text,integer,integer) from public;
