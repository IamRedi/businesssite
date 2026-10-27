-- Disposable-only fixture applied after migration 043 and before 044.
insert into leads(id,external_id,name,source,payload,category,website,score,score_reasons,signals,created_at,updated_at) values
 ('upgrade-finder-lead','upgrade-place','Upgrade Finder','google-places','{}','Locksmith',null,91,'["preserve score"]','{"hasWebsite":false}',now()-interval '20 days',now()-interval '2 days'),
 ('upgrade-expired-lead',null,'Upgrade Expired Trial','self-service','{}','Test',null,100,'["self-service website trial"]','{"hasWebsite":false}',now()-interval '60 days',now()-interval '60 days'),
 ('upgrade-paid-lead',null,'Upgrade Paid Site','self-service','{}','Test',null,100,'["self-service website trial"]','{"hasWebsite":false}',now()-interval '60 days',now()-interval '60 days'),
 ('upgrade-pending-lead',null,'Upgrade Pending Site','self-service','{}','Test',null,100,'["self-service website trial"]','{"hasWebsite":false}',now()-interval '60 days',now()-interval '60 days');
insert into lead_scores(lead_id,score,reasons,updated_at) values('upgrade-finder-lead',91,'["preserve score"]',now()-interval '2 days');
insert into lead_pipeline_events(id,lead_id,status,details,notes,created_at) values
 ('e1000000-0000-4000-8000-000000000001','upgrade-finder-lead','qualified','{"preserved":true}','upgrade history',now()-interval '3 days');
insert into lead_website_history(id,lead_id,previous_website,current_website,change_type,observed_at) values
 ('e1100000-0000-4000-8000-000000000001','upgrade-finder-lead',null,null,'first_seen',now()-interval '20 days');

insert into prepared_business_profiles(id,lead_id,version,profile,status,created_at) values
 ('upgrade-profile-finder','upgrade-finder-lead',7,'{"id":"upgrade-profile-finder","version":7,"sourceLeadId":"upgrade-finder-lead","business":{"name":"Upgrade Finder"}}','demo_created',now()-interval '10 days'),
 ('upgrade-profile-expired','upgrade-expired-lead',1,'{"id":"upgrade-profile-expired","version":1,"sourceLeadId":"upgrade-expired-lead","business":{"name":"Upgrade Expired Trial"}}','ready_for_handoff',now()-interval '60 days'),
 ('upgrade-profile-paid','upgrade-paid-lead',1,'{"id":"upgrade-profile-paid","version":1,"sourceLeadId":"upgrade-paid-lead","business":{"name":"Upgrade Paid Site"}}','demo_created',now()-interval '60 days'),
 ('upgrade-profile-pending','upgrade-pending-lead',1,'{"id":"upgrade-profile-pending","version":1,"sourceLeadId":"upgrade-pending-lead","business":{"name":"Upgrade Pending Site"}}','ready_for_handoff',now()-interval '60 days');

insert into sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,demo_expires_at,trial_recovery_ends_at,activated_at,onboarding_source,trial_email) values
 ('upgrade-demo-finder','upgrade-demo-finder','private','public','{"id":"upgrade-demo-finder","slug":"upgrade-demo-finder","visibility":"private"}','upgrade-finder-lead','upgrade-profile-finder',now()+interval '2 days',now()+interval '32 days',null,'owner_outreach',null),
 ('upgrade-demo-expired','upgrade-demo-expired','private','public','{"id":"upgrade-demo-expired","slug":"upgrade-demo-expired","visibility":"private"}','upgrade-expired-lead','upgrade-profile-expired',now()-interval '40 days',now()-interval '10 days',null,'self_service','upgrade-expired@example.test'),
 ('upgrade-demo-paid','upgrade-demo-paid','public','public','{"id":"upgrade-demo-paid","slug":"upgrade-demo-paid","visibility":"public"}','upgrade-paid-lead','upgrade-profile-paid',now()-interval '40 days',now()-interval '10 days',now()-interval '20 days','self_service','upgrade-paid@example.test'),
 ('upgrade-demo-pending','upgrade-demo-pending','private','public','{"id":"upgrade-demo-pending","slug":"upgrade-demo-pending","visibility":"private"}','upgrade-pending-lead','upgrade-profile-pending',now()-interval '40 days',now()-interval '10 days',null,'self_service','upgrade-pending@example.test');
insert into demo_sites(site_id,prepared_profile_id,created_at) values
 ('upgrade-demo-finder','upgrade-profile-finder',now()-interval '10 days'),
 ('upgrade-demo-expired','upgrade-profile-expired',now()-interval '60 days'),
 ('upgrade-demo-paid','upgrade-profile-paid',now()-interval '60 days'),
 ('upgrade-demo-pending','upgrade-profile-pending',now()-interval '60 days');
insert into site_preview_tokens(token_id,site_id,expires_at,revoked_at,created_at) values
 ('e1200000-0000-4000-8000-000000000001','upgrade-demo-finder',now()+interval '2 days',null,now()-interval '1 day'),
 ('e1200000-0000-4000-8000-000000000002','upgrade-demo-expired',now()-interval '20 days',now()-interval '20 days',now()-interval '40 days');

insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values
 ('e1300000-0000-4000-8000-000000000001','upgrade-demo-pending','upgrade-pending@example.test','hash','de');
insert into site_subscriptions(site_id,billing_provider,status,plan_key,provider_customer_id,provider_subscription_id,provider_price_id) values
 ('upgrade-demo-paid','stripe','active','starter','cus_upgrade','sub_upgrade','price_upgrade');
insert into subscriber_intakes(id,email,business_name,demo_site_id,site_admin_account_id,plan_key,billing_provider,status,updated_at) values
 ('e1400000-0000-4000-8000-000000000001','upgrade-pending@example.test','Upgrade Pending Site','upgrade-demo-pending','e1300000-0000-4000-8000-000000000001','starter','stripe','pending_payment',now());

insert into finder_searches(id,query,filters,cache_key,result_count,lead_ids,cached,status,created_at,completed_at) values
 ('e1500000-0000-4000-8000-000000000001','locksmith berlin','{"radius":10}','upgrade-cache-key-0000000000000001',1,'["upgrade-finder-lead"]',false,'completed',now()-interval '2 days',now()-interval '2 days');
insert into finder_search_cache(cache_key,lead_ids,expires_at,updated_at) values
 ('upgrade-cache-key-0000000000000001','["upgrade-finder-lead"]',now()+interval '29 days',now()-interval '1 day');
insert into api_rate_limits(scope,subject_key,window_start,request_count,updated_at) values
 ('public-trial',repeat('a',64),date_trunc('minute',now()),3,now());
insert into audit_events(id,entity_type,entity_id,action,details,created_at) values
 ('e1600000-0000-4000-8000-000000000001','lead','upgrade-finder-lead','upgrade_preserved','{"preserved":true}',now()-interval '1 day');
