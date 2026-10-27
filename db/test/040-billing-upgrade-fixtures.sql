-- Synthetic disposable fixtures for the 040 -> 041 data-preservation check.
insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,site_kind)
values
 ('10000000-0000-4000-8000-000000000001','b3b-upgrade-active','public','public','{}',now()-interval '30 days',now()+interval '1 day',now()-interval '20 days','business'),
 ('10000000-0000-4000-8000-000000000002','b3b-upgrade-grace','public','public','{}',now()-interval '30 days',now()+interval '1 day',now()-interval '20 days','business'),
 ('10000000-0000-4000-8000-000000000003','b3b-upgrade-canceled','private','public','{}',now()-interval '30 days',now()+interval '1 day',now()-interval '20 days','business'),
 ('10000000-0000-4000-8000-000000000004','b3b-upgrade-trial','private','public','{}',now()-interval '40 days',now()-interval '10 days',null,'business'),
 ('10000000-0000-4000-8000-000000000005','b3b-upgrade-pending','private','public','{}',now()+interval '10 days',now()+interval '40 days',null,'business'),
 ('10000000-0000-4000-8000-000000000006','b3b-upgrade-paddle','private','public','{}',now()-interval '30 days',now()+interval '1 day',now()-interval '20 days','business'),
 ('10000000-0000-4000-8000-000000000007','b3b-upgrade-social','private','public','{}',now()-interval '30 days',now()+interval '1 day',now()-interval '20 days','business');

insert into site_admin_accounts(id,site_id,email,password_hash,preferred_locale)
values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','upgrade-en@example.test','hash','en'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','upgrade-de@example.test','hash','de');

insert into customer_business_identities(id,site_id,version,legal_business_name,country_code,business_type)
values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'Upgrade EN','DE','company'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005',1,'Upgrade DE','DE','company');

insert into subscriber_intakes(id,email,business_name,demo_site_id,site_admin_account_id,plan_key,billing_provider,checkout_price_id,business_identity_id,status)
values
 ('40000000-0000-4000-8000-000000000001','upgrade-en@example.test','Upgrade EN','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','starter','stripe','price_upgrade_en','30000000-0000-4000-8000-000000000001','paid'),
 ('40000000-0000-4000-8000-000000000002','upgrade-de@example.test','Upgrade DE','10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','starter','stripe','price_upgrade_de','30000000-0000-4000-8000-000000000002','pending_payment');

insert into contract_acceptances(
 id,intake_id,checkout_attempt,site_id,actor_account_id,business_identity_id,
 terms_document_key,terms_version,terms_content_hash,privacy_document_key,privacy_version,privacy_content_hash,
 b2b_attestation_version,authority_attestation_version,automatic_renewal_version,privacy_acknowledgement_version,
 platform_legal_config_version,plan_key,billing_provider,checkout_price_id,currency,tax_display_mode,
 price_tax_label_snapshot,normal_price_display_snapshot,trial_duration_days,billing_interval,locale,source
) values
 ('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','terms','en-v1',repeat('a',64),'privacy','en-v1',repeat('b',64),'b2b-v1','authority-v1','renewal-v1','privacy-v1',1,'starter','stripe','price_upgrade_en','EUR','net_plus_tax','plus VAT','EUR 29 / month',14,'month','en','site_admin_checkout'),
 ('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002',1,'10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','terms','de-v1',repeat('c',64),'privacy','de-v1',repeat('d',64),'b2b-v1','authority-v1','renewal-v1','privacy-v1',1,'starter','stripe','price_upgrade_de','EUR','net_plus_tax','plus VAT','EUR 29 / month',14,'month','de','site_admin_checkout');
update subscriber_intakes i set contract_acceptance_id=a.id from contract_acceptances a where a.intake_id=i.id;

insert into site_subscriptions(site_id,billing_provider,provider_customer_id,provider_subscription_id,provider_price_id,plan_key,status,first_past_due_at,payment_grace_ends_at,suspended_at,read_only_ends_at,contract_acceptance_state)
values
 ('10000000-0000-4000-8000-000000000001','stripe','cus_active','sub_active','price_active','starter','active',null,null,null,null,'accepted'),
 ('10000000-0000-4000-8000-000000000002','stripe','cus_grace','sub_grace','price_grace','starter','past_due',now()-interval '2 days',now()+interval '5 days',now()+interval '5 days',now()+interval '35 days','acceptance_unknown'),
 ('10000000-0000-4000-8000-000000000003','stripe','cus_cancel','sub_cancel','price_cancel','starter','canceled',null,null,now()-interval '2 days',now()+interval '28 days','acceptance_unknown'),
 ('10000000-0000-4000-8000-000000000006','paddle','ctm_paddle','sub_paddle','pri_paddle','starter','canceled',null,null,now()-interval '2 days',now()+interval '28 days','acceptance_unknown');
insert into site_addon_subscriptions(site_id,addon_key,stripe_subscription_id,stripe_price_id,status)
values('10000000-0000-4000-8000-000000000007','social_media','sub_social','price_social','canceled');
insert into payment_webhook_events(event_id,provider,event_type,provider_created_at,site_id,disposition)
values('evt_upgrade_duplicate','stripe','invoice.paid',now()-interval '1 day','10000000-0000-4000-8000-000000000001','accepted');
