-- Disposable-only fixture applied after migration 042 and before 043.
insert into sites(id,slug,visibility,publication_intent,generated_document,demo_expires_at,trial_recovery_ends_at,activated_at,site_kind)
values('d3000000-0000-4000-8000-000000000001','upgrade-information-a','public','public','{}',now(),now(),now(),'information'),
      ('d3000000-0000-4000-8000-000000000002','upgrade-information-b','private','private','{}',now(),now(),null,'information');
insert into site_admin_accounts(id,site_id,email,password_hash) values
 ('d3100000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','upgrade-editor-a@example.test','hash'),
 ('d3100000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','upgrade-editor-b@example.test','hash');
insert into site_editorial_memberships(account_id,site_id,role,granted_by) values
 ('d3100000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','administrator','upgrade-fixture'),
 ('d3100000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','editor','upgrade-fixture');
insert into site_editorial_settings(site_id,publication_name,subcategory,locale) values
 ('d3000000-0000-4000-8000-000000000001','Upgrade A','news','en'),
 ('d3000000-0000-4000-8000-000000000002','Upgrade B','local_news','de');
insert into site_article_categories(id,site_id,name,slug) values('d3200000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','News','news');
insert into site_media_assets(id,site_id,storage_provider,storage_key,storage_access,public_url,mime_type,width,height,byte_size) values
 ('d3300000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','postgres','d3400000-0000-4000-8000-000000000001','private','/api/media/d3300000-0000-4000-8000-000000000001','image/webp',10,10,10);
insert into site_media_blobs(id,site_id,filename,content_type,data) values('d3400000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','upgrade.webp','image/webp','\x01');
insert into site_articles(id,site_id,category_id,slug,title,body,status,featured_media_id,published_at) values
 ('d3500000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3200000-0000-4000-8000-000000000001','draft','Draft','{"version":1,"blocks":[]}','draft','d3300000-0000-4000-8000-000000000001',null),
 ('d3500000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001','d3200000-0000-4000-8000-000000000001','published','Published','{"version":1,"blocks":[{"type":"paragraph","text":"Preserved"}]}','published','d3300000-0000-4000-8000-000000000001',now()),
 ('d3500000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000001',null,'archived','Archived','{"version":1,"blocks":[]}','archived',null,null);
insert into site_article_sources(id,site_id,article_id,url) values('d3600000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3500000-0000-4000-8000-000000000002','https://example.test/source');
insert into site_article_media(site_id,article_id,media_id,sort_order) values('d3000000-0000-4000-8000-000000000001','d3500000-0000-4000-8000-000000000002','d3300000-0000-4000-8000-000000000001',0);
insert into site_information_ad_slots(site_id,slot_key,format,enabled) values('d3000000-0000-4000-8000-000000000001','article_sidebar','rectangle',true);
insert into site_content_audit_events(id,site_id,article_id,actor_type,actor_id,action) values('d3700000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d3500000-0000-4000-8000-000000000002','owner','upgrade-owner','article.published');
insert into site_external_integrations(id,site_id,provider,external_installation_id,status,inbound_enabled,inbound_permissions,inbound_approved_at,inbound_approved_by,metadata) values
 ('d3800000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','redi_control','upgrade-installation-a','active',true,array['articles:read'],now(),'upgrade-owner','{}'),
 ('d3800000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','redi_control','upgrade-installation-b','suspended',false,'{}',null,null,'{}');
insert into integration_nonces(integration_id,site_id,nonce,signed_at,expires_at) values
 ('d3800000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','upgrade-unused-nonce',now(),now()+interval '5 minutes'),
 ('d3800000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','upgrade-expired-nonce',now()-interval '1 hour',now()-interval '55 minutes');
insert into integration_api_requests(integration_id,site_id,idempotency_key,operation,request_hash,state,response_status,response_body,expires_at) values
 ('d3800000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','upgrade-request','articles.create',repeat('a',64),'completed',201,'{"preserved":true}',now()+interval '1 day');
