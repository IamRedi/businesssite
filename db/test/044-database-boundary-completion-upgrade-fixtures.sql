-- Synthetic disposable-only fixture for the 044 -> 045 preservation check.
insert into public.leads(id,name,source,payload,external_id,category,address)
values('b3c4-upgrade-lead','Boundary fixture','fixture','{}','b3c4-upgrade-place','services','Fixture street')
on conflict(id) do nothing;

insert into public.prepared_business_profiles(id,lead_id,version,profile,status)
values('b3c4-upgrade-profile','b3c4-upgrade-lead',1,'{"fixture":true}','ready_for_handoff')
on conflict(id) do nothing;

insert into public.sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,
  demo_expires_at,trial_recovery_ends_at,activated_at,custom_domain,custom_domain_status,custom_domain_verification)
values('45454545-4545-4545-8545-454545454545','b3c4-upgrade','public','public',
  '{"id":"45454545-4545-4545-8545-454545454545","slug":"b3c4-upgrade","locale":"en"}',
  'b3c4-upgrade-lead','b3c4-upgrade-profile',now()+interval '14 days',now()+interval '44 days',now(),
  'b3c4-upgrade.example.test','verified','{"provider":"fixture","ready":true}')
on conflict(id) do nothing;

insert into public.site_subscriptions(site_id,status,plan_key)
values('45454545-4545-4545-8545-454545454545','active','starter') on conflict(site_id) do nothing;
insert into public.site_features(site_id,feature_key,enabled) values
  ('45454545-4545-4545-8545-454545454545','website',true),
  ('45454545-4545-4545-8545-454545454545','media',true),
  ('45454545-4545-4545-8545-454545454545','ai_rewrite',true),
  ('45454545-4545-4545-8545-454545454545','custom_domain_existing',true)
on conflict(site_id,feature_key) do update set enabled=excluded.enabled;
insert into public.site_admin_accounts(id,site_id,email,password_hash)
values('45454545-4545-4545-8545-454545454546','45454545-4545-4545-8545-454545454545','b3c4-upgrade@example.test','fixture-hash')
on conflict(id) do nothing;
insert into public.site_media_blobs(id,site_id,filename,content_type,data)
values('45454545-4545-4545-8545-454545454547','45454545-4545-4545-8545-454545454545','fixture.webp','image/webp','\x010203')
on conflict(id) do nothing;
insert into public.ai_runs(id,actor_type,actor_id,operation,site_id,provider,model,input,status,usage)
values('45454545-4545-4545-8545-454545454548','site_admin','45454545-4545-4545-8545-454545454546','text_rewrite',
  '45454545-4545-4545-8545-454545454545','fixture','fixture-model','{"field":"aboutBody"}','completed','{"tokens":7}')
on conflict(id) do nothing;
insert into public.tenant_usage_states(site_id,state) values('45454545-4545-4545-8545-454545454545','warning') on conflict(site_id) do nothing;
insert into public.tenant_usage_counters(site_id,metric,window_type,window_start,quantity)
values('45454545-4545-4545-8545-454545454545','client_ai_rewrite','month',date_trunc('month',now()),7)
on conflict(site_id,metric,window_type,window_start) do nothing;
insert into public.tenant_usage_events(id,site_id,metric,decision,reason_code)
values('45454545-4545-4545-8545-454545454549','45454545-4545-4545-8545-454545454545','client_ai_rewrite','warning','fixture_warning')
on conflict(id) do nothing;
insert into public.tenant_concurrency_leases(id,site_id,operation,expires_at)
values('45454545-4545-4545-8545-454545454550','45454545-4545-4545-8545-454545454545','client_ai_rewrite',now()+interval '1 hour')
on conflict(id) do nothing;
insert into public.site_external_integrations(id,site_id,provider,status,metadata)
values('45454545-4545-4545-8545-454545454551','45454545-4545-4545-8545-454545454545','redi_control','disconnected','{"fixture":true}')
on conflict(id) do nothing;
insert into public.site_integration_events(id,site_id,provider,action,details)
values('45454545-4545-4545-8545-454545454552','45454545-4545-4545-8545-454545454545','redi_control','provisioning_started','{"fixture":true}')
on conflict(id) do nothing;
insert into public.site_preview_tokens(token_id,site_id,expires_at)
values('45454545-4545-4545-8545-454545454553','45454545-4545-4545-8545-454545454545',now()+interval '1 hour')
on conflict(token_id) do nothing;
