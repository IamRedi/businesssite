-- Task Group 3-B3C1: procedure-only platform-owner boundary. FORCE RLS is
-- intentionally deferred. Role grants are provisioned out of band.

alter table public.owner_accounts enable row level security;
alter table public.owner_sessions enable row level security;
alter table public.owner_auth_challenges enable row level security;
alter table public.owner_mfa_recovery_codes enable row level security;
alter table public.owner_invitations enable row level security;
alter table public.owner_auth_audit_events enable row level security;

create or replace function public.owner_permission_allowed(p_role text,p_permission text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select case p_role
  when 'owner' then p_permission=any(array['team.manage','security.self','security.accounts','finder.read','finder.write','demos.manage','websites.read','websites.manage','subscriptions.read','billing.manage','ai.manage','information.manage','audit.read','platform.configure'])
  when 'admin' then p_permission=any(array['security.self','finder.read','finder.write','demos.manage','websites.read','websites.manage','subscriptions.read','billing.manage','ai.manage','information.manage','audit.read'])
  when 'operator' then p_permission=any(array['security.self','finder.read','finder.write','demos.manage','websites.read','websites.manage','subscriptions.read','ai.manage'])
  when 'viewer' then p_permission=any(array['security.self','finder.read','websites.read','subscriptions.read'])
  else false end
$$;

create or replace function public.owner_auth_resolve_session(p_token_hash text,p_permission text default null)
returns table(session_id uuid,owner_id uuid,email text,role text,mfa_completed_at timestamptz,expires_at timestamptz,last_used_at timestamptz)
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' then return; end if;
 return query
 update public.owner_sessions s set last_used_at=statement_timestamp()
 from public.owner_accounts a
 where s.owner_id=a.id and s.token_hash=p_token_hash and s.revoked_at is null
   and s.expires_at>statement_timestamp() and a.status='active'
   and a.mfa_enrolled_at is not null
   and (p_permission is null or public.owner_permission_allowed(a.role,p_permission))
 returning s.id,a.id,a.email,a.role,s.mfa_completed_at,s.expires_at,s.last_used_at;
end $$;

create or replace function public.owner_auth_login_lookup(p_email text)
returns table(id uuid,email text,password_hash text,status text,role text,mfa_secret_encrypted text,mfa_enrolled_at timestamptz,mfa_last_used_step bigint,password_changed_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
 select a.id,a.email,a.password_hash,a.status,a.role,a.mfa_secret_encrypted,a.mfa_enrolled_at,a.mfa_last_used_step,a.password_changed_at
 from public.owner_accounts a where lower(btrim(a.email))=lower(btrim(p_email)) limit 1
$$;
create or replace function public.owner_auth_count()
returns integer language sql stable security definer set search_path=pg_catalog as $$ select count(*)::integer from public.owner_accounts $$;

create or replace function public.owner_auth_challenge_lookup(p_token_hash text)
returns table(owner_id uuid,email text,role text,password_hash text,purpose text,pending_mfa_secret_encrypted text,mfa_secret_encrypted text,expires_at timestamptz)
language sql stable security definer set search_path=pg_catalog as $$
 select c.owner_id,a.email,a.role,a.password_hash,c.purpose,c.pending_mfa_secret_encrypted,a.mfa_secret_encrypted,c.expires_at
 from public.owner_auth_challenges c join public.owner_accounts a on a.id=c.owner_id
 where p_token_hash ~ '^[a-f0-9]{64}$' and c.token_hash=p_token_hash and c.used_at is null
   and c.expires_at>statement_timestamp()
   and (a.status='active' or (a.status='pending' and c.purpose='mfa_enroll')) limit 1
$$;

create or replace function public.owner_auth_record_audit(p_event jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare d jsonb;
begin
 if p_event->>'action' is null or not (p_event->>'action'=any(array[
  'owner.bootstrap','owner.password_login','owner.mfa_enrollment','owner.mfa_verification',
  'owner.recovery_code_use','owner.logout','owner.password_change','owner.sessions_revoked',
  'owner.administrative_recovery','owner.account_status_change','owner.account_disabled_denial',
  'owner.recovery_codes_regenerated','owner.invitation_created','owner.invitation_resent',
  'owner.invitation_revoked','owner.invitation_accepted','owner.last_owner_action',
  'owner.role_changed','owner.account_status_changed','owner.permission_denied','owner.team_access',
  'owner.team_fresh_auth','owner.legal_console_access','owner.legal_fresh_auth',
  'owner.legal_config_version_created','owner.legal_config_activated','owner.legal_document_registered',
  'owner.legal_document_activated','owner.business_identity_reviewed','owner.usage_override'
 ])) then return false; end if;
 select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into d
 from jsonb_each(coalesce(p_event->'details','{}'::jsonb)) e
 where e.key=any(array['category','purpose','method','reason','sessionsRevoked','mfaReset','permission','roleBefore','roleAfter','statusBefore','statusAfter','delivery','version','documentKey','locale','state']);
 insert into public.owner_auth_audit_events(id,owner_id,target_owner_id,invitation_id,correlation_id,action,outcome,identity_hash,source,details)
 values(gen_random_uuid(),nullif(p_event->>'ownerId','')::uuid,nullif(p_event->>'targetOwnerId','')::uuid,
 nullif(p_event->>'invitationId','')::uuid,left(nullif(p_event->>'correlationId',''),128),left(p_event->>'action',100),
 case when p_event->>'outcome'=any(array['success','failure','denied']) then p_event->>'outcome' else 'failure' end,
 case when p_event->>'identityHash' ~ '^[a-f0-9]{64}$' then p_event->>'identityHash' end,
 case when p_event->>'source'='cli' then 'cli' else 'web' end,d);
 return true;
exception when invalid_text_representation or foreign_key_violation then return false;
end $$;

create or replace function public.owner_auth_create_challenge(p_input jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_owner uuid:=nullif(p_input->>'ownerId','')::uuid; v_purpose text:=p_input->>'purpose';
begin
 if p_input->>'tokenHash' !~ '^[a-f0-9]{64}$' or v_purpose not in ('mfa_enroll','mfa_verify')
   or (p_input->>'expiresAt')::timestamptz>statement_timestamp()+interval '5 minutes 5 seconds'
   then return false; end if;
 if not exists(select 1 from public.owner_accounts a where a.id=v_owner and
   (a.status='active' or (a.status='pending' and v_purpose='mfa_enroll'))) then return false; end if;
 delete from public.owner_auth_challenges where expires_at<=statement_timestamp() or used_at is not null;
 update public.owner_auth_challenges set used_at=statement_timestamp() where owner_id=v_owner and used_at is null;
 insert into public.owner_auth_challenges(id,owner_id,token_hash,purpose,pending_mfa_secret_encrypted,expires_at)
 values(gen_random_uuid(),v_owner,p_input->>'tokenHash',v_purpose,nullif(p_input->>'pendingMfaSecretEncrypted',''),(p_input->>'expiresAt')::timestamptz);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.password_login','outcome','success','identityHash',p_input->>'identityHash','details',jsonb_build_object('purpose',v_purpose)));
 return true;
exception when invalid_text_representation or check_violation or unique_violation then return false;
end $$;

create or replace function public.owner_auth_complete_enrollment(p_input jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_owner uuid; v_codes jsonb; v_code text;
begin
 select c.owner_id into v_owner from public.owner_auth_challenges c join public.owner_accounts a on a.id=c.owner_id
 where c.token_hash=p_input->>'challengeHash' and c.purpose='mfa_enroll' and c.used_at is null
 and c.expires_at>statement_timestamp() and a.status in('active','pending') and a.mfa_enrolled_at is null for update of c,a;
 if v_owner is null or p_input->>'sessionHash' !~ '^[a-f0-9]{64}$'
   or (p_input->>'sessionExpiresAt')::timestamptz>statement_timestamp()+interval '12 hours 5 seconds' then return null; end if;
 update public.owner_accounts a set mfa_secret_encrypted=c.pending_mfa_secret_encrypted,mfa_enrolled_at=statement_timestamp(),
 mfa_last_used_step=(p_input->>'totpStep')::bigint,status='active',updated_at=statement_timestamp()
 from public.owner_auth_challenges c where a.id=v_owner and c.token_hash=p_input->>'challengeHash';
 update public.owner_auth_challenges set used_at=statement_timestamp() where owner_id=v_owner and used_at is null;
 delete from public.owner_mfa_recovery_codes where owner_id=v_owner;
 v_codes:=coalesce(p_input->'recoveryCodeHashes','[]'::jsonb);
 if jsonb_array_length(v_codes)<1 or jsonb_array_length(v_codes)>20 then raise exception 'invalid recovery code count'; end if;
 for v_code in select jsonb_array_elements_text(v_codes) loop
  if v_code !~ '^[a-f0-9]{64}$' then raise exception 'invalid recovery hash'; end if;
  insert into public.owner_mfa_recovery_codes(id,owner_id,code_hash) values(gen_random_uuid(),v_owner,v_code);
 end loop;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where token_hash=nullif(p_input->>'previousSessionHash','');
 insert into public.owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at)
 values(gen_random_uuid(),v_owner,p_input->>'sessionHash',statement_timestamp(),(p_input->>'sessionExpiresAt')::timestamptz);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.mfa_enrollment','outcome','success'));
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.mfa_verification','outcome','success','details',jsonb_build_object('method','totp')));
 return v_owner;
exception when invalid_text_representation or check_violation or unique_violation then return null;
end $$;

create or replace function public.owner_auth_complete_verification(p_input jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_owner uuid;
begin
 select c.owner_id into v_owner from public.owner_auth_challenges c join public.owner_accounts a on a.id=c.owner_id
 where c.token_hash=p_input->>'challengeHash' and c.purpose='mfa_verify' and c.used_at is null and c.expires_at>statement_timestamp()
 and a.status='active' and a.mfa_enrolled_at is not null and (a.mfa_last_used_step is null or a.mfa_last_used_step<(p_input->>'totpStep')::bigint)
 for update of c,a;
 if v_owner is null or p_input->>'sessionHash' !~ '^[a-f0-9]{64}$' then return null; end if;
 update public.owner_accounts set mfa_last_used_step=(p_input->>'totpStep')::bigint,updated_at=statement_timestamp() where id=v_owner;
 update public.owner_auth_challenges set used_at=statement_timestamp() where owner_id=v_owner and used_at is null;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where token_hash=nullif(p_input->>'previousSessionHash','');
 insert into public.owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),v_owner,p_input->>'sessionHash',statement_timestamp(),(p_input->>'sessionExpiresAt')::timestamptz);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.mfa_verification','outcome','success','details',jsonb_build_object('method','totp')));
 return v_owner;
exception when invalid_text_representation or unique_violation then return null;
end $$;

create or replace function public.owner_auth_complete_recovery(p_input jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_owner uuid; v_code uuid;
begin
 select c.owner_id,r.id into v_owner,v_code from public.owner_auth_challenges c join public.owner_accounts a on a.id=c.owner_id
 join public.owner_mfa_recovery_codes r on r.owner_id=a.id and r.code_hash=p_input->>'recoveryCodeHash' and r.used_at is null
 where c.token_hash=p_input->>'challengeHash' and c.purpose='mfa_verify' and c.used_at is null and c.expires_at>statement_timestamp()
 and a.status='active' and a.mfa_enrolled_at is not null for update of c,a,r;
 if v_owner is null or p_input->>'sessionHash' !~ '^[a-f0-9]{64}$' then return null; end if;
 update public.owner_mfa_recovery_codes set used_at=statement_timestamp() where id=v_code and used_at is null;
 update public.owner_auth_challenges set used_at=statement_timestamp() where owner_id=v_owner and used_at is null;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where token_hash=nullif(p_input->>'previousSessionHash','');
 insert into public.owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at) values(gen_random_uuid(),v_owner,p_input->>'sessionHash',statement_timestamp(),(p_input->>'sessionExpiresAt')::timestamptz);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.recovery_code_use','outcome','success'));
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_owner,'action','owner.mfa_verification','outcome','success','details',jsonb_build_object('method','recovery_code')));
 return v_owner;
exception when invalid_text_representation or unique_violation then return null;
end $$;

create or replace function public.owner_auth_revoke_session(p_token_hash text)
returns boolean language sql security definer set search_path=pg_catalog as $$
 with changed as(update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp())
 where p_token_hash ~ '^[a-f0-9]{64}$' and token_hash=p_token_hash returning owner_id)
 select coalesce((select public.owner_auth_record_audit(jsonb_build_object('ownerId',owner_id,'action','owner.logout','outcome','success')) from changed limit 1),true)
$$;

create or replace function public.owner_auth_change_password(p_session_hash text,p_current_hash text,p_new_hash text,p_totp_step bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_revoked integer;
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'security.self');
 if v_actor.owner_id is null then return false; end if;
 update public.owner_accounts set password_hash=p_new_hash,password_changed_at=statement_timestamp(),mfa_last_used_step=p_totp_step,updated_at=statement_timestamp()
 where id=v_actor.owner_id and password_hash=p_current_hash and status='active' and mfa_enrolled_at is not null
 and (mfa_last_used_step is null or mfa_last_used_step<p_totp_step);
 if not found then return false; end if;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where owner_id=v_actor.owner_id and revoked_at is null;
 get diagnostics v_revoked=row_count;
 update public.owner_auth_challenges set used_at=coalesce(used_at,statement_timestamp()) where owner_id=v_actor.owner_id;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor.owner_id,'action','owner.password_change','outcome','success'));
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor.owner_id,'action','owner.sessions_revoked','outcome','success','details',jsonb_build_object('reason','password_change','sessionsRevoked',v_revoked)));
 return true;
end $$;

create or replace function public.owner_auth_regenerate_recovery_codes(p_session_hash text,p_current_hash text,p_totp_step bigint,p_hashes text[])
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_hash text;
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'security.self');
 if v_actor.owner_id is null or cardinality(p_hashes)<>10 then return false; end if;
 update public.owner_accounts set mfa_last_used_step=p_totp_step,updated_at=statement_timestamp()
 where id=v_actor.owner_id and password_hash=p_current_hash and status='active' and mfa_enrolled_at is not null
 and (mfa_last_used_step is null or mfa_last_used_step<p_totp_step);
 if not found then return false; end if;
 if exists(select 1 from unnest(p_hashes) h where h !~ '^[a-f0-9]{64}$') then return false; end if;
 delete from public.owner_mfa_recovery_codes where owner_id=v_actor.owner_id;
 foreach v_hash in array p_hashes loop insert into public.owner_mfa_recovery_codes(id,owner_id,code_hash) values(gen_random_uuid(),v_actor.owner_id,v_hash); end loop;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor.owner_id,'action','owner.recovery_codes_regenerated','outcome','success'));
 return true;
end $$;

create or replace function public.owner_auth_revoke_all_sessions(p_session_hash text,p_target uuid,p_reason text)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; v_count integer;
begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,case when p_target is null then 'security.self' else 'security.accounts' end);
 if v_actor.owner_id is null then return -1; end if;
 p_target:=coalesce(p_target,v_actor.owner_id);
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where owner_id=p_target and revoked_at is null;
 get diagnostics v_count=row_count;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor.owner_id,'targetOwnerId',p_target,'action','owner.sessions_revoked','outcome','success','details',jsonb_build_object('reason',p_reason,'sessionsRevoked',v_count)));
 return v_count;
end $$;

create or replace function public.owner_auth_cleanup_sessions()
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare v_count integer; begin
 delete from public.owner_sessions where expires_at<=statement_timestamp() or (revoked_at is not null and revoked_at<statement_timestamp()-interval '30 days');
 get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.owner_auth_bootstrap_first(p_email text,p_password_hash text,p_identity_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_id uuid:=gen_random_uuid(); begin
 lock table public.owner_accounts in exclusive mode;
 if exists(select 1 from public.owner_accounts) then
  perform public.owner_auth_record_audit(jsonb_build_object('action','owner.bootstrap','outcome','denied','identityHash',p_identity_hash,'source','cli','details',jsonb_build_object('category','owner_exists'))); return null;
 end if;
 insert into public.owner_accounts(id,email,password_hash) values(v_id,lower(btrim(p_email)),p_password_hash);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_id,'action','owner.bootstrap','outcome','success','identityHash',p_identity_hash,'source','cli'));
 return v_id;
end $$;

create or replace function public.owner_auth_administrative_recovery(p_email text,p_password_hash text,p_identity_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer; v_revoked integer;
begin
 perform pg_advisory_xact_lock(7310331);
 select id,status,role,mfa_enrolled_at into v from public.owner_accounts where lower(btrim(email))=lower(btrim(p_email)) for update;
 if v.id is null or v.status<>'active' then
  perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v.id,'action','owner.administrative_recovery','outcome','denied','identityHash',p_identity_hash,'source','cli','details',jsonb_build_object('category',case when v.id is null then 'not_found' else 'disabled' end))); return false;
 end if;
 if v.role='owner' and v.mfa_enrolled_at is not null then
  select count(*) into v_count from public.owner_accounts where role='owner' and status='active' and mfa_enrolled_at is not null;
  if v_count<=1 then perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v.id,'targetOwnerId',v.id,'action','owner.last_owner_action','outcome','denied','identityHash',p_identity_hash,'source','cli','details',jsonb_build_object('category','administrative_recovery'))); return false; end if;
 end if;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where owner_id=v.id and revoked_at is null; get diagnostics v_revoked=row_count;
 update public.owner_auth_challenges set used_at=coalesce(used_at,statement_timestamp()) where owner_id=v.id;
 delete from public.owner_mfa_recovery_codes where owner_id=v.id;
 update public.owner_accounts set password_hash=p_password_hash,password_changed_at=statement_timestamp(),mfa_secret_encrypted=null,mfa_enrolled_at=null,mfa_last_used_step=null,updated_at=statement_timestamp() where id=v.id;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v.id,'action','owner.administrative_recovery','outcome','success','identityHash',p_identity_hash,'source','cli','details',jsonb_build_object('mfaReset',true,'sessionsRevoked',v_revoked)));
 return true;
end $$;

create or replace function public.owner_auth_set_status(p_owner uuid,p_status text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_count integer; begin
 if p_status not in('active','pending','disabled') then return false; end if;
 perform pg_advisory_xact_lock(7310331);
 select role,status,mfa_enrolled_at into v from public.owner_accounts where id=p_owner for update; if v.role is null then return false; end if;
 if p_status<>'active' and v.role='owner' and v.status='active' and v.mfa_enrolled_at is not null then
  select count(*) into v_count from public.owner_accounts where role='owner' and status='active' and mfa_enrolled_at is not null;
  if v_count<=1 then return false; end if;
 end if;
 update public.owner_accounts set status=p_status,updated_at=statement_timestamp() where id=p_owner;
 if p_status<>'active' then update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where owner_id=p_owner and revoked_at is null; update public.owner_auth_challenges set used_at=coalesce(used_at,statement_timestamp()) where owner_id=p_owner; end if;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',p_owner,'targetOwnerId',p_owner,'action','owner.account_status_change','outcome','success','details',jsonb_build_object('statusAfter',p_status)));
 return true;
end $$;

revoke all on function public.owner_auth_create_challenge(jsonb) from public;
revoke all on function public.owner_auth_complete_enrollment(jsonb) from public;
revoke all on function public.owner_auth_complete_verification(jsonb) from public;
revoke all on function public.owner_auth_complete_recovery(jsonb) from public;
revoke all on function public.owner_auth_revoke_session(text) from public;
revoke all on function public.owner_auth_change_password(text,text,text,bigint) from public;
revoke all on function public.owner_auth_regenerate_recovery_codes(text,text,bigint,text[]) from public;
revoke all on function public.owner_auth_revoke_all_sessions(text,uuid,text) from public;
revoke all on function public.owner_auth_cleanup_sessions() from public;
revoke all on function public.owner_auth_bootstrap_first(text,text,text) from public;
revoke all on function public.owner_auth_administrative_recovery(text,text,text) from public;
revoke all on function public.owner_auth_count() from public;
revoke all on function public.owner_auth_set_status(uuid,text) from public;

create or replace function public.owner_team_list(p_session_hash text)
returns table(id uuid,email text,role text,status text,mfa_enrolled boolean,created_at timestamptz,last_activity_at timestamptz,active_sessions integer)
language sql security definer set search_path=pg_catalog as $$
 select a.id,a.email,a.role,a.status,a.mfa_enrolled_at is not null,a.created_at,max(s.last_used_at),
 count(s.id) filter(where s.revoked_at is null and s.expires_at>statement_timestamp())::integer
 from public.owner_auth_resolve_session(p_session_hash,'team.manage') actor
 cross join public.owner_accounts a left join public.owner_sessions s on s.owner_id=a.id
 group by a.id order by a.created_at,a.email
$$;

create or replace function public.owner_invitation_list(p_session_hash text)
returns table(id uuid,email text,role text,created_by uuid,created_at timestamptz,expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz,delivery_status text,recipient_locale text,active boolean)
language sql security definer set search_path=pg_catalog as $$
 select i.id,i.email,i.role,i.created_by,i.created_at,i.expires_at,i.accepted_at,i.revoked_at,i.delivery_status,i.recipient_locale,
 i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp()
 from public.owner_auth_resolve_session(p_session_hash,'team.manage') actor cross join public.owner_invitations i
 order by i.created_at desc limit 200
$$;

create or replace function public.owner_invitation_lookup(p_token_hash text)
returns table(id uuid,email text,role text,created_by uuid,created_at timestamptz,expires_at timestamptz,accepted_at timestamptz,revoked_at timestamptz,delivery_status text,recipient_locale text,active boolean)
language sql stable security definer set search_path=pg_catalog as $$
 select i.id,i.email,i.role,i.created_by,i.created_at,i.expires_at,i.accepted_at,i.revoked_at,i.delivery_status,i.recipient_locale,true
 from public.owner_invitations i where p_token_hash ~ '^[a-f0-9]{64}$' and i.token_hash=p_token_hash
 and i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp() limit 1
$$;

create or replace function public.owner_fresh_actor(p_session_hash text,p_password_hash text,p_totp_step bigint,p_permission text default 'team.manage')
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,p_permission);
 if v_actor.owner_id is null then return null; end if;
 update public.owner_accounts set mfa_last_used_step=p_totp_step,updated_at=statement_timestamp()
 where id=v_actor.owner_id and role='owner' and status='active' and mfa_enrolled_at is not null
 and password_hash=p_password_hash and (mfa_last_used_step is null or mfa_last_used_step<p_totp_step);
 return case when found then v_actor.owner_id else null end;
end $$;

create or replace function public.owner_invitation_create(p_session_hash text,p_password_hash text,p_totp_step bigint,p_email text,p_role text,p_token_hash text,p_expires_at timestamptz,p_locale text,p_correlation text)
returns table(ok boolean,reason text,invitation_id uuid) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid:=gen_random_uuid(); v_email text:=lower(btrim(p_email));
begin
 perform pg_advisory_xact_lock(hashtextextended(v_email,0));
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'team.manage');
 if v_actor is null then return query select false,'forbidden'::text,null::uuid; return; end if;
 if p_role not in('owner','admin','operator','viewer') or p_token_hash !~ '^[a-f0-9]{64}$' or p_locale not in('en','de') or p_expires_at<=statement_timestamp() or p_expires_at>statement_timestamp()+interval '24 hours 5 seconds' then return query select false,'invalid_state'::text,null::uuid; return; end if;
 update public.owner_invitations set revoked_at=statement_timestamp(),updated_at=statement_timestamp() where lower(btrim(email))=v_email and accepted_at is null and revoked_at is null and expires_at<=statement_timestamp();
 if exists(select 1 from public.owner_accounts where lower(btrim(email))=v_email) or exists(select 1 from public.owner_invitations where lower(btrim(email))=v_email and accepted_at is null and revoked_at is null and expires_at>statement_timestamp()) then
  perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.invitation_created','outcome','denied','correlationId',p_correlation,'details',jsonb_build_object('category','conflict'))); return query select false,'conflict'::text,null::uuid; return;
 end if;
 insert into public.owner_invitations(id,email,role,token_hash,created_by,expires_at,recipient_locale) values(v_id,v_email,p_role,p_token_hash,v_actor,p_expires_at,p_locale);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'invitationId',v_id,'action','owner.invitation_created','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('roleAfter',p_role)));
 return query select true,null::text,v_id;
end $$;

create or replace function public.owner_invitation_resend(p_session_hash text,p_password_hash text,p_totp_step bigint,p_invitation uuid,p_token_hash text,p_expires_at timestamptz,p_correlation text)
returns table(ok boolean,reason text,replacement_id uuid,email text,role text,recipient_locale text) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; v_id uuid:=gen_random_uuid();
begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'team.manage');
 if v_actor is null then return query select false,'forbidden'::text,null::uuid,null::text,null::text,null::text; return; end if;
 select i.id,i.email,i.role,i.recipient_locale into v from public.owner_invitations i where i.id=p_invitation and i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp() for update;
 if v.id is null then return query select false,'not_found'::text,null::uuid,null::text,null::text,null::text; return; end if;
 update public.owner_invitations set revoked_at=statement_timestamp(),updated_at=statement_timestamp() where id=v.id;
 insert into public.owner_invitations(id,email,role,token_hash,created_by,expires_at,recipient_locale) values(v_id,v.email,v.role,p_token_hash,v_actor,p_expires_at,v.recipient_locale);
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'invitationId',v_id,'action','owner.invitation_resent','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('roleAfter',v.role)));
 return query select true,null::text,v_id,v.email,v.role,v.recipient_locale;
end $$;

create or replace function public.owner_invitation_revoke(p_session_hash text,p_password_hash text,p_totp_step bigint,p_invitation uuid,p_correlation text)
returns table(ok boolean,reason text) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'team.manage');
 if v_actor is null then return query select false,'forbidden'::text; return; end if;
 update public.owner_invitations set revoked_at=statement_timestamp(),updated_at=statement_timestamp() where id=p_invitation and accepted_at is null and revoked_at is null;
 if not found then return query select false,'not_found'::text; return; end if;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'invitationId',p_invitation,'action','owner.invitation_revoked','outcome','success','correlationId',p_correlation));
 return query select true,null::text;
end $$;

create or replace function public.owner_invitation_delivery(p_session_hash text,p_invitation uuid,p_status text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor record; begin
 select * into v_actor from public.owner_auth_resolve_session(p_session_hash,'team.manage'); if v_actor.owner_id is null then return false; end if;
 if p_status not in('pending','sent','provider_not_configured','provider_error') then return false; end if;
 update public.owner_invitations set delivery_status=p_status,delivery_error_category=case when p_status='sent' then null else p_status end,updated_at=statement_timestamp() where id=p_invitation and created_by=v_actor.owner_id;
 return found;
end $$;

create or replace function public.owner_invitation_accept(p_input jsonb)
returns table(owner_id uuid,email text,role text) language plpgsql security definer set search_path=pg_catalog as $$
declare v record; v_owner uuid:=gen_random_uuid(); begin
 select i.id,i.email,i.role into v from public.owner_invitations i where i.token_hash=p_input->>'tokenHash' and i.accepted_at is null and i.revoked_at is null and i.expires_at>statement_timestamp() for update;
 if v.id is null or exists(select 1 from public.owner_accounts a where lower(btrim(a.email))=v.email) then return; end if;
 insert into public.owner_accounts(id,email,password_hash,status,role) values(v_owner,v.email,p_input->>'passwordHash','pending',v.role);
 insert into public.owner_auth_challenges(id,owner_id,token_hash,purpose,pending_mfa_secret_encrypted,expires_at) values(gen_random_uuid(),v_owner,p_input->>'challengeHash','mfa_enroll',p_input->>'pendingMfaSecretEncrypted',(p_input->>'challengeExpiresAt')::timestamptz);
 update public.owner_invitations set accepted_at=statement_timestamp(),updated_at=statement_timestamp() where id=v.id;
 perform public.owner_auth_record_audit(jsonb_build_object('targetOwnerId',v_owner,'invitationId',v.id,'action','owner.invitation_accepted','outcome','success','details',jsonb_build_object('roleAfter',v.role,'statusAfter','pending')));
 return query select v_owner,v.email,v.role;
exception when unique_violation or invalid_text_representation then return;
end $$;

create or replace function public.owner_team_change(p_session_hash text,p_password_hash text,p_totp_step bigint,p_target uuid,p_kind text,p_value text,p_correlation text)
returns table(ok boolean,reason text,sessions_revoked integer,status text) language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; v_count integer; v_eligible integer; v_next text;
begin
 perform pg_advisory_xact_lock(7310331);
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'team.manage');
 if v_actor is null then return query select false,'forbidden'::text,0,null::text; return; end if;
 select a.id,a.role,a.status,a.mfa_enrolled_at into v from public.owner_accounts a where a.id=p_target for update;
 if v.id is null then return query select false,'not_found'::text,0,null::text; return; end if;
 select count(*) into v_eligible from public.owner_accounts a where a.role='owner' and a.status='active' and a.mfa_enrolled_at is not null;
 if p_kind='role' then
  if p_value not in('owner','admin','operator','viewer') or p_value=v.role then return query select false,'invalid_state'::text,0,null::text; return; end if;
  if v.role='owner' and p_value<>'owner' and v.status='active' and v.mfa_enrolled_at is not null and v_eligible<=1 then perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'targetOwnerId',v.id,'action','owner.last_owner_action','outcome','denied','correlationId',p_correlation,'details',jsonb_build_object('category','role_change'))); return query select false,'last_owner'::text,0,null::text; return; end if;
  update public.owner_accounts set role=p_value,updated_at=statement_timestamp() where id=v.id;
  v_next:=v.status;
 elsif p_kind='status' then
  if p_value not in('active','disabled') then return query select false,'invalid_state'::text,0,null::text; return; end if;
  v_next:=case when p_value='active' and v.mfa_enrolled_at is null then 'pending' else p_value end;
  if v_next=v.status then return query select false,'invalid_state'::text,0,null::text; return; end if;
  if v_next='disabled' and v.role='owner' and v.status='active' and v.mfa_enrolled_at is not null and v_eligible<=1 then perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'targetOwnerId',v.id,'action','owner.last_owner_action','outcome','denied','correlationId',p_correlation,'details',jsonb_build_object('category','account_disable'))); return query select false,'last_owner'::text,0,null::text; return; end if;
  update public.owner_accounts set status=v_next,updated_at=statement_timestamp() where id=v.id;
 elsif p_kind='sessions' then v_next:=v.status;
 else return query select false,'invalid_state'::text,0,null::text; return; end if;
 update public.owner_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()) where owner_id=v.id and revoked_at is null; get diagnostics v_count=row_count;
 update public.owner_auth_challenges set used_at=coalesce(used_at,statement_timestamp()) where owner_id=v.id;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'targetOwnerId',v.id,'action',case p_kind when 'role' then 'owner.role_changed' when 'status' then 'owner.account_status_changed' else 'owner.sessions_revoked' end,'outcome','success','correlationId',p_correlation,'details',jsonb_build_object('sessionsRevoked',v_count,'roleBefore',v.role,'roleAfter',case when p_kind='role' then p_value else v.role end,'statusBefore',v.status,'statusAfter',v_next)));
 return query select true,null::text,v_count,v_next;
end $$;

revoke all on function public.owner_fresh_actor(text,text,bigint,text) from public;
revoke all on function public.owner_invitation_create(text,text,bigint,text,text,text,timestamptz,text,text) from public;
revoke all on function public.owner_invitation_resend(text,text,bigint,uuid,text,timestamptz,text) from public;
revoke all on function public.owner_invitation_revoke(text,text,bigint,uuid,text) from public;
revoke all on function public.owner_invitation_delivery(text,uuid,text) from public;
revoke all on function public.owner_invitation_accept(jsonb) from public;
revoke all on function public.owner_team_change(text,text,bigint,uuid,text,text,text) from public;

create or replace function public.owner_customer_list(p_session_hash text,p_limit integer default 200,p_offset integer default 0)
returns table(site_id text,slug text,business_name text,visibility text,onboarding_source text,email text,demo_expires_at timestamptz,activated_at timestamptz,created_at timestamptz,custom_domain text,custom_domain_status text,plan_key text,subscription_status text,current_period_end timestamptz,cancel_at_period_end boolean,billing_provider text,intake_status text,social_control_status text,social_addon_status text,first_past_due_at timestamptz,payment_grace_ends_at timestamptz,suspended_at timestamptz,read_only_ends_at timestamptz,last_active_at timestamptz,publication_intent text,trial_recovery_ends_at timestamptz)
language sql security definer set search_path=pg_catalog as $$
 select s.id,s.slug,coalesce(s.generated_document#>>'{content,name}',s.slug),s.visibility,s.onboarding_source,
 coalesce(admin.email,s.trial_email,intake.email),s.demo_expires_at,s.activated_at,s.created_at,s.custom_domain,s.custom_domain_status,
 coalesce(sub.plan_key,intake.plan_key),sub.status,sub.current_period_end,coalesce(sub.cancel_at_period_end,false),sub.billing_provider,
 intake.status,social.status,social_addon.status,sub.first_past_due_at,sub.payment_grace_ends_at,sub.suspended_at,sub.read_only_ends_at,sub.last_active_at,s.publication_intent,s.trial_recovery_ends_at
 from public.owner_auth_resolve_session(p_session_hash,'subscriptions.read') actor cross join public.sites s
 left join lateral(select a.email from public.site_admin_accounts a where a.site_id=s.id order by a.created_at limit 1) admin on true
 left join public.site_subscriptions sub on sub.site_id=s.id
 left join lateral(select i.status,i.email,i.plan_key from public.subscriber_intakes i where i.demo_site_id=s.id order by i.created_at desc limit 1) intake on true
 left join public.site_external_integrations social on social.site_id=s.id and social.provider='redi_control'
 left join public.site_addon_subscriptions social_addon on social_addon.site_id=s.id and social_addon.addon_key='social_media'
 order by coalesce(sub.updated_at,s.created_at) desc,s.id limit least(greatest(p_limit,1),200) offset greatest(p_offset,0)
$$;

create or replace function public.owner_usage_snapshot(p_session_hash text,p_slug text)
returns jsonb language sql security definer set search_path=pg_catalog as $$
 select jsonb_build_object(
  'state',coalesce(state.state,'normal'),'reasonCode',state.reason_code,'stateUntil',state.state_until,
  'overrideState',state.owner_override_state,'overrideReason',state.owner_override_reason,'overrideUntil',state.owner_override_until,
  'counters',coalesce((select jsonb_agg(jsonb_build_object('metric',c.metric,'window',c.window_type,'windowStart',c.window_start,'quantity',c.quantity) order by c.metric,c.window_type)
                       from public.tenant_usage_counters c where c.site_id=s.id and c.window_start>=date_trunc('month',statement_timestamp())),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'metric',e.metric,'decision',e.decision,'reasonCode',e.reason_code,'createdAt',e.created_at) order by e.created_at desc)
                     from (select e.id,e.metric,e.decision,e.reason_code,e.created_at from public.tenant_usage_events e where e.site_id=s.id order by e.created_at desc limit 50) e),'[]'::jsonb)
 )
 from public.owner_auth_resolve_session(p_session_hash,'subscriptions.read') actor
 join public.sites s on s.slug=p_slug and s.site_kind='business'
 left join public.tenant_usage_states state on state.site_id=s.id
$$;

create or replace function public.owner_usage_override(p_session_hash text,p_slug text,p_state text,p_reason text,p_expires_at timestamptz,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_site_id text; v_reason text:=btrim(coalesce(p_reason,''));
begin
 select owner_id into v_actor from public.owner_auth_resolve_session(p_session_hash,'websites.manage');
 if v_actor is null or p_state is not null and p_state not in('normal','temporarily_restricted') or length(v_reason) not between 1 and 240 then return false; end if;
 if p_state is not null and (p_expires_at is null or p_expires_at<=statement_timestamp() or p_expires_at>statement_timestamp()+interval '7 days') then return false; end if;
 select s.id into v_site_id from public.sites s where s.slug=p_slug and s.site_kind='business' for update;
 if v_site_id is null then return false; end if;
 insert into public.tenant_usage_states(site_id,owner_override_state,owner_override_reason,owner_override_until)
 values(v_site_id,p_state,v_reason,case when p_state is null then null else p_expires_at end)
 on conflict(site_id) do update set owner_override_state=excluded.owner_override_state,owner_override_reason=excluded.owner_override_reason,
 owner_override_until=excluded.owner_override_until,updated_at=statement_timestamp();
 insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code,details)
 values(gen_random_uuid(),v_site_id,'owner_override','override',case when p_state is null then 'owner_override_cleared' else 'owner_'||p_state end,
        jsonb_build_object('expiresAt',case when p_state is null then null else p_expires_at end));
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.usage_override','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('category','usage_override')));
 return true;
end $$;

revoke all on function public.owner_usage_snapshot(text,text) from public;
revoke all on function public.owner_usage_override(text,text,text,text,timestamptz,text) from public;

create or replace function public.owner_legal_configs(p_session_hash text)
returns setof public.platform_legal_config_versions language sql security definer set search_path=pg_catalog as $$
 select c.* from public.owner_auth_resolve_session(p_session_hash,'audit.read') actor cross join public.platform_legal_config_versions c order by c.version desc limit 50
$$;
create or replace function public.owner_legal_documents(p_session_hash text)
returns setof public.platform_legal_document_versions language sql security definer set search_path=pg_catalog as $$
 select d.* from public.owner_auth_resolve_session(p_session_hash,'audit.read') actor cross join public.platform_legal_document_versions d order by d.document_key,d.locale,d.created_at desc
$$;

create or replace function public.owner_legal_acceptances(p_session_hash text)
returns table(id uuid,site_id text,intake_id uuid,accepted_at timestamptz,locale text,source text,terms_version text,privacy_version text,promotion_terms_version text,platform_legal_config_version integer,plan_key text,currency text,tax_display_mode text,price_tax_label_snapshot text,normal_price_display_snapshot text,trial_duration_days integer,billing_interval text,legal_business_name text,country_code text,business_identity_id uuid,business_type text,verification_state text)
language sql security definer set search_path=pg_catalog as $$
 select a.id,a.site_id,a.intake_id,a.accepted_at,a.locale,a.source,a.terms_version,a.privacy_version,a.promotion_terms_version,a.platform_legal_config_version,a.plan_key,a.currency,a.tax_display_mode,a.price_tax_label_snapshot,a.normal_price_display_snapshot,a.trial_duration_days,a.billing_interval,b.legal_business_name,b.country_code,b.id,b.business_type,b.verification_state
 from public.owner_auth_resolve_session(p_session_hash,'audit.read') actor cross join public.contract_acceptances a join public.customer_business_identities b on b.id=a.business_identity_id
 order by a.accepted_at desc limit 200
$$;

create or replace function public.owner_legal_create_config(p_session_hash text,p_password_hash text,p_totp_step bigint,p_input jsonb,p_correlation text)
returns setof public.platform_legal_config_versions language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_id uuid:=gen_random_uuid(); begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('platform-legal-config-version',0));
 return query insert into public.platform_legal_config_versions(id,version,legal_business_name,legal_form,street,address_line_2,postal_code,city,country_code,country_name,authorized_representative,contact_email,support_email,phone,register_name,register_court,register_number,vat_id,supervisory_authority,editorial_responsible_person,dispute_metadata,tax_display_mode,currency,price_tax_label,special_tax_note,created_by)
 values(v_id,(select coalesce(max(version),0)+1 from public.platform_legal_config_versions),p_input->>'legalBusinessName',nullif(p_input->>'legalForm',''),p_input->>'street',nullif(p_input->>'addressLine2',''),p_input->>'postalCode',p_input->>'city',upper(p_input->>'countryCode'),p_input->>'countryName',nullif(p_input->>'authorizedRepresentative',''),lower(p_input->>'contactEmail'),lower(p_input->>'supportEmail'),nullif(p_input->>'phone',''),nullif(p_input->>'registerName',''),nullif(p_input->>'registerCourt',''),nullif(p_input->>'registerNumber',''),nullif(p_input->>'vatId',''),nullif(p_input->>'supervisoryAuthority',''),nullif(p_input->>'editorialResponsiblePerson',''),nullif(p_input->>'disputeMetadata',''),p_input->>'taxDisplayMode',p_input->>'currency',p_input->>'priceTaxLabel',nullif(p_input->>'specialTaxNote',''),v_actor) returning *;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.legal_config_version_created','outcome','success','correlationId',p_correlation));
end $$;

create or replace function public.owner_legal_activate_config(p_session_hash text,p_password_hash text,p_totp_step bigint,p_id uuid,p_correlation text)
returns setof public.platform_legal_config_versions language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return; end if;
 select * into v from public.platform_legal_config_versions where id=p_id and status='draft' for update; if v.id is null then return; end if;
 update public.platform_legal_config_versions set status='retired' where status='active';
 return query update public.platform_legal_config_versions set status='active',legal_review_status='reviewed',reviewed_at=statement_timestamp(),reviewed_by=v_actor,effective_from=statement_timestamp() where id=p_id returning *;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.legal_config_activated','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('version',v.version)));
end $$;

create or replace function public.owner_legal_register_document(p_session_hash text,p_password_hash text,p_totp_step bigint,p_key text,p_locale text,p_version text,p_hash text,p_correlation text)
returns setof public.platform_legal_document_versions language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v_existing record; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null or p_key not in('terms','privacy','imprint','cancellation') or p_locale not in('en','de') or p_hash !~ '^[a-f0-9]{64}$' then return; end if;
 select * into v_existing from public.platform_legal_document_versions where document_key=p_key and locale=p_locale and version=p_version;
 if v_existing.id is not null then if v_existing.content_hash<>p_hash then raise exception 'immutable legal hash mismatch'; end if; return query select v_existing.*; return; end if;
 return query insert into public.platform_legal_document_versions(id,document_key,locale,version,content_hash,created_by) values(gen_random_uuid(),p_key,p_locale,p_version,p_hash,v_actor) returning *;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.legal_document_registered','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('documentKey',p_key,'locale',p_locale,'version',p_version)));
end $$;

create or replace function public.owner_legal_activate_document(p_session_hash text,p_password_hash text,p_totp_step bigint,p_id uuid,p_reviewer text,p_correlation text)
returns setof public.platform_legal_document_versions language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; v record; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null then return; end if;
 select * into v from public.platform_legal_document_versions where id=p_id and status in('legal_review_required','reviewed') and locale in('en','de') for update; if v.id is null then return; end if;
 update public.platform_legal_document_versions set status='retired' where document_key=v.document_key and locale=v.locale and status='active';
 return query update public.platform_legal_document_versions set status='active',effective_from=statement_timestamp(),reviewed_at=statement_timestamp(),reviewed_by=v_actor,reviewer_reference=coalesce(nullif(left(btrim(p_reviewer),120),''),'operator_review_recorded') where id=p_id returning *;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.legal_document_activated','outcome','success','correlationId',p_correlation,'details',jsonb_build_object('documentKey',v.document_key,'locale',v.locale,'version',v.version)));
end $$;

create or replace function public.owner_legal_verify_business(p_session_hash text,p_password_hash text,p_totp_step bigint,p_id uuid,p_state text,p_reason text,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare v_actor uuid; begin
 v_actor:=public.owner_fresh_actor(p_session_hash,p_password_hash,p_totp_step,'platform.configure'); if v_actor is null or p_state not in('manually_verified','review_required','rejected') then return false; end if;
 update public.customer_business_identities set verification_state=p_state,verification_source='manual_owner_review',review_reason_code=nullif(left(btrim(p_reason),80),''),verified_at=case when p_state='manually_verified' then statement_timestamp() else null end,verified_by=v_actor,updated_at=statement_timestamp() where id=p_id;
 perform public.owner_auth_record_audit(jsonb_build_object('ownerId',v_actor,'action','owner.business_identity_reviewed','outcome',case when found then 'success' else 'denied' end,'correlationId',p_correlation,'details',jsonb_build_object('state',p_state,'reason',case when found then 'manual_review' else 'not_found' end)));
 return found;
end $$;

revoke all on function public.owner_legal_acceptances(text) from public;
revoke all on function public.owner_legal_create_config(text,text,bigint,jsonb,text) from public;
revoke all on function public.owner_legal_activate_config(text,text,bigint,uuid,text) from public;
revoke all on function public.owner_legal_register_document(text,text,bigint,text,text,text,text,text) from public;
revoke all on function public.owner_legal_activate_document(text,text,bigint,uuid,text,text) from public;
revoke all on function public.owner_legal_verify_business(text,text,bigint,uuid,text,text,text) from public;

revoke all on function public.owner_permission_allowed(text,text) from public;
revoke all on function public.owner_auth_resolve_session(text,text) from public;
revoke all on function public.owner_auth_login_lookup(text) from public;
revoke all on function public.owner_auth_challenge_lookup(text) from public;
revoke all on function public.owner_auth_record_audit(jsonb) from public;
revoke all on function public.owner_team_list(text) from public;
revoke all on function public.owner_invitation_list(text) from public;
revoke all on function public.owner_invitation_lookup(text) from public;
revoke all on function public.owner_customer_list(text,integer,integer) from public;
revoke all on function public.owner_legal_configs(text) from public;
revoke all on function public.owner_legal_documents(text) from public;
