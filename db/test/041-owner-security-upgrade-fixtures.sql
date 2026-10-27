-- Disposable-only fixture applied after migration 041 and before 042.
insert into owner_accounts(id,email,password_hash,status,role,mfa_secret_encrypted,mfa_enrolled_at,mfa_last_used_step)
values
 ('c1000000-0000-4000-8000-000000000001','upgrade-owner@example.test','owner-hash','active','owner','v1.owner',now(),100),
 ('c1000000-0000-4000-8000-000000000002','upgrade-admin@example.test','admin-hash','active','admin','v1.admin',now(),100),
 ('c1000000-0000-4000-8000-000000000003','upgrade-operator@example.test','operator-hash','active','operator','v1.operator',now(),100),
 ('c1000000-0000-4000-8000-000000000004','upgrade-viewer@example.test','viewer-hash','active','viewer','v1.viewer',now(),100),
 ('c1000000-0000-4000-8000-000000000005','upgrade-pending@example.test','pending-hash','pending','viewer',null,null,null),
 ('c1000000-0000-4000-8000-000000000006','upgrade-disabled@example.test','disabled-hash','disabled','operator','v1.disabled',now(),100);
insert into owner_sessions(id,owner_id,token_hash,mfa_completed_at,expires_at,revoked_at,created_at) values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',repeat('1',64),now(),now()+interval '12 hours',null,now()),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002',repeat('2',64),now()-interval '2 hours',now()-interval '1 minute',null,now()-interval '2 hours'),
 ('c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000003',repeat('3',64),now(),now()+interval '12 hours',now(),now());
insert into owner_mfa_recovery_codes(id,owner_id,code_hash) values
 ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',repeat('a',64));
insert into owner_invitations(id,email,role,token_hash,created_by,expires_at,revoked_at,created_at,updated_at) values
 ('c4000000-0000-4000-8000-000000000001','upgrade-invite@example.test','viewer',repeat('b',64),'c1000000-0000-4000-8000-000000000001',now()+interval '24 hours',null,now(),now()),
 ('c4000000-0000-4000-8000-000000000002','upgrade-revoked@example.test','operator',repeat('c',64),'c1000000-0000-4000-8000-000000000001',now()+interval '24 hours',now(),now(),now()),
 ('c4000000-0000-4000-8000-000000000003','upgrade-expired@example.test','admin',repeat('d',64),'c1000000-0000-4000-8000-000000000001',now()-interval '1 minute',null,now()-interval '25 hours',now()-interval '25 hours');

insert into platform_legal_config_versions(id,version,legal_business_name,street,postal_code,city,country_code,country_name,contact_email,support_email,tax_display_mode,currency,price_tax_label,legal_review_status,status,reviewed_at,reviewed_by,effective_from,created_by)
values('c5000000-0000-4000-8000-000000000001',1,'Upgrade Legal GmbH','Teststrasse 1','10115','Berlin','DE','Germany','legal-upgrade@example.test','support-upgrade@example.test','net_plus_tax','EUR','plus VAT','reviewed','active',now(),'c1000000-0000-4000-8000-000000000001',now(),'c1000000-0000-4000-8000-000000000001');

insert into platform_legal_document_versions(id,document_key,locale,version,content_hash,status,effective_from,reviewed_at,reviewed_by,created_by) values
 ('c6000000-0000-4000-8000-000000000001','terms','en','upgrade-v1',repeat('e',64),'active',now(),now(),'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000002','terms','de','upgrade-v1',repeat('f',64),'active',now(),now(),'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000003','privacy','en','upgrade-v1',repeat('8',64),'active',now(),now(),'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'),
 ('c6000000-0000-4000-8000-000000000004','privacy','de','upgrade-v1',repeat('9',64),'active',now(),now(),'c1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001');
