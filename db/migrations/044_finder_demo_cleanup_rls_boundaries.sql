-- Task Group 3-B3C3: procedure-only Finder, trial, preview, rate-limit and cleanup boundaries.
-- Existing rows are preserved; RLS is deliberately non-FORCE until B4.
alter table public.leads enable row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_pipeline_events enable row level security;
alter table public.lead_website_history enable row level security;
alter table public.prepared_business_profiles enable row level security;
alter table public.finder_searches enable row level security;
alter table public.finder_search_cache enable row level security;
alter table public.demo_sites enable row level security;
alter table public.site_preview_tokens enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.audit_events enable row level security;

alter table public.finder_searches add column if not exists schema_version integer not null default 1 check(schema_version=1);
alter table public.finder_searches add column if not exists created_by_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.finder_searches add column if not exists correlation_id text;
alter table public.finder_search_cache add column if not exists schema_version integer not null default 1 check(schema_version=1);
alter table public.finder_search_cache add column if not exists updated_by_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.leads add column if not exists updated_by_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.lead_pipeline_events add column if not exists actor_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.prepared_business_profiles add column if not exists created_by_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.demo_sites add column if not exists created_by_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.audit_events add column if not exists actor_owner_id uuid references public.owner_accounts(id) on delete set null;
alter table public.audit_events add column if not exists correlation_id text;

create index if not exists finder_search_cache_expiry_idx on public.finder_search_cache(expires_at,cache_key);
create index if not exists leads_updated_paging_idx on public.leads(updated_at desc,id);
create index if not exists demo_sites_profile_created_idx on public.demo_sites(prepared_profile_id,created_at,site_id);
create index if not exists site_preview_tokens_cleanup_idx on public.site_preview_tokens(expires_at,revoked_at);

create or replace function public.finder_lead_json(p public.leads)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',p.id,'externalId',p.external_id,'name',p.name,'category',p.category,
  'address',p.address,'phone',p.phone,'website',p.website,'rating',p.rating,'reviewCount',p.review_count,
  'source',p.source,'score',p.score,'reasons',p.score_reasons,'signals',p.signals,
  'createdAt',p.created_at,'updatedAt',p.updated_at)
$$;

create or replace function public.finder_profile_json(p public.prepared_business_profiles)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',p.id,'leadId',p.lead_id,'version',p.version,'profile',p.profile,
  'status',p.status,'createdAt',p.created_at)
$$;

create or replace function public.finder_pipeline_json(p public.lead_pipeline_events)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',p.id,'leadId',p.lead_id,'status',p.status,'notes',p.notes,'createdAt',p.created_at)
$$;

create or replace function public.finder_audit_json(p public.audit_events)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('id',p.id,'entityType',p.entity_type,'entityId',p.entity_id,
  'action',p.action,'details',p.details,'createdAt',p.created_at)
$$;

create or replace function public.owner_finder_list_leads(p_session text,p_limit integer default 250,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return (select coalesce(jsonb_agg(public.finder_lead_json(x) order by x.updated_at desc,x.id),'[]'::jsonb)
  from (select * from public.leads order by updated_at desc,id limit least(greatest(p_limit,1),250) offset least(greatest(p_offset,0),10000)) x);
end $$;

create or replace function public.owner_finder_get_lead(p_session text,p_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; v public.leads; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null or length(p_id)>240 then return null; end if;
 select * into v from public.leads where id=p_id; return case when v.id is null then null else public.finder_lead_json(v) end;
end $$;

create or replace function public.owner_finder_list_workspace(p_session text,p_limit integer default 250,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('lead',public.finder_lead_json(x.l),
   'latestProfile',case when x.profile_id is null then null else jsonb_build_object('id',x.profile_id,'leadId',x.l.id,'version',x.profile_version,'profile',x.profile,'status',x.profile_status,'createdAt',x.profile_created_at) end,
   'profileCount',x.profile_count,'latestStatus',x.pipeline_status,
   'latestWebsiteChange',case when x.change_type is null then null else jsonb_build_object('type',x.change_type,'previousWebsite',x.previous_website,'currentWebsite',x.current_website,'observedAt',x.observed_at) end)
   order by x.l.updated_at desc,x.l.id),'[]'::jsonb) from (
  select l,p.id profile_id,p.version profile_version,p.profile,p.status profile_status,p.created_at profile_created_at,
   (select count(*)::int from public.prepared_business_profiles pc where pc.lead_id=l.id) profile_count,
   (select pe.status from public.lead_pipeline_events pe where pe.lead_id=l.id order by pe.created_at desc,pe.id desc limit 1) pipeline_status,
   wh.previous_website,wh.current_website,wh.change_type,wh.observed_at
  from public.leads l
  left join lateral(select pp.* from public.prepared_business_profiles pp where pp.lead_id=l.id order by pp.version desc limit 1)p on true
  left join lateral(select h.previous_website,h.current_website,h.change_type,h.observed_at from public.lead_website_history h where h.lead_id=l.id and h.change_type<>'first_seen' order by h.observed_at desc,h.id desc limit 1)wh on true
  order by l.updated_at desc,l.id limit least(greatest(p_limit,1),250) offset least(greatest(p_offset,0),10000))x);
end $$;

create or replace function public.owner_finder_create_search(p_session text,p_input jsonb,p_cache_key text,p_correlation text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare a record; v_id uuid:=gen_random_uuid(); v_filters jsonb:=coalesce(p_input->'filters','{}'::jsonb); begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return null; end if;
 if jsonb_typeof(v_filters)<>'object' or length(p_input->>'query') not between 1 and 160 or length(p_cache_key) not between 16 and 512
  or pg_column_size(v_filters)>4096 or coalesce((v_filters->>'radius')::numeric,1) not between 0.1 and 100
  or coalesce((v_filters->>'minRating')::numeric,0) not between 0 and 5
  or coalesce((v_filters->>'maxResults')::integer,20) not between 1 and 20 then return null; end if;
 insert into public.finder_searches(id,query,filters,cache_key,schema_version,created_by_owner_id,correlation_id)
 values(v_id,btrim(p_input->>'query'),v_filters,p_cache_key,1,a.owner_id,left(p_correlation,128)); return v_id;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

create or replace function public.owner_finder_complete_search(p_session text,p_id uuid,p_leads jsonb,p_cached boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return false; end if;
 if jsonb_typeof(p_leads)<>'array' or jsonb_array_length(p_leads)>20 or exists(select 1 from jsonb_array_elements_text(p_leads)x where length(x)>240 or not exists(select 1 from public.leads l where l.id=x)) then return false; end if;
 update public.finder_searches set lead_ids=p_leads,result_count=jsonb_array_length(p_leads),cached=p_cached,status='completed',completed_at=statement_timestamp()
 where id=p_id and status='pending'; return found;
end $$;

create or replace function public.owner_finder_fail_search(p_session text,p_id uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return false; end if;
 update public.finder_searches set status='failed',completed_at=statement_timestamp() where id=p_id and status='pending'; return found; end $$;

create or replace function public.owner_finder_list_searches(p_session text,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'query',s.query,'filters',s.filters,'cacheKey',s.cache_key,
  'resultCount',s.result_count,'leadIds',s.lead_ids,'cached',s.cached,'status',s.status,'createdAt',s.created_at,'completedAt',s.completed_at)
  order by s.created_at desc,s.id),'[]'::jsonb) from(select * from public.finder_searches order by created_at desc,id limit least(greatest(p_limit,1),250))s); end $$;

create or replace function public.owner_finder_get_cache(p_session text,p_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null or length(p_key) not between 16 and 512 then return null; end if;
 return(select c.lead_ids from public.finder_search_cache c where c.cache_key=p_key and c.schema_version=1 and c.expires_at>statement_timestamp()); end $$;

create or replace function public.owner_finder_save_cache(p_session text,p_key text,p_ids jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return false; end if;
 if length(p_key) not between 16 and 512 or jsonb_typeof(p_ids)<>'array' or jsonb_array_length(p_ids)>20
  or exists(select 1 from jsonb_array_elements_text(p_ids)x where length(x)>240 or not exists(select 1 from public.leads l where l.id=x)) then return false; end if;
 insert into public.finder_search_cache(cache_key,lead_ids,expires_at,updated_at,schema_version,updated_by_owner_id)
 values(p_key,p_ids,statement_timestamp()+interval '30 days',statement_timestamp(),1,a.owner_id)
 on conflict(cache_key) do update set lead_ids=excluded.lead_ids,expires_at=excluded.expires_at,updated_at=excluded.updated_at,schema_version=1,updated_by_owner_id=a.owner_id;
 return true; end $$;

create or replace function public.owner_finder_upsert_lead(p_session text,p_input jsonb,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; v public.leads; v_id text:=p_input->>'id'; v_external text:=p_input->>'externalId'; v_previous text; v_current text:=nullif(btrim(p_input->>'website'),''); v_change text; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return null; end if;
 if length(v_id) not between 1 and 240 or length(v_external) not between 1 and 300 or p_input->>'source'<>'google-places'
  or length(p_input->>'name') not between 1 and 200 or coalesce((p_input->>'score')::integer,-1) not between 0 and 100
  or coalesce((p_input->>'rating')::numeric,0) not between 0 and 5 or coalesce((p_input->>'reviewCount')::integer,0) not between 0 and 10000000
  or jsonb_typeof(p_input->'reasons')<>'array' or jsonb_array_length(p_input->'reasons')>20 or pg_column_size(p_input)>65536 then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('finder-lead:'||v_external,0));
 select id,website into v_id,v_previous from public.leads where external_id=v_external for update;
 v_id:=coalesce(v_id,p_input->>'id');
 insert into public.leads(id,external_id,name,category,address,phone,website,rating,review_count,source,score,score_reasons,signals,updated_by_owner_id)
 values(v_id,v_external,left(btrim(p_input->>'name'),200),nullif(left(btrim(p_input->>'category'),160),''),nullif(left(btrim(p_input->>'address'),500),''),
  nullif(left(btrim(p_input->>'phone'),80),''),v_current,nullif(p_input->>'rating','')::numeric,nullif(p_input->>'reviewCount','')::integer,
  'google-places',(p_input->>'score')::integer,p_input->'reasons',coalesce(p_input->'signals','{}'::jsonb),a.owner_id)
 on conflict(id) do update set name=excluded.name,category=excluded.category,address=excluded.address,phone=excluded.phone,website=excluded.website,
  rating=excluded.rating,review_count=excluded.review_count,score=excluded.score,score_reasons=excluded.score_reasons,signals=excluded.signals,updated_by_owner_id=a.owner_id,updated_at=statement_timestamp()
 returning * into v;
 if v_previous is null and not exists(select 1 from public.lead_website_history where lead_id=v.id) then v_change:='first_seen';
 elsif lower(regexp_replace(coalesce(v_previous,''),'^https?://(www\.)?','','i'))<>lower(regexp_replace(coalesce(v_current,''),'^https?://(www\.)?','','i')) then
  v_change:=case when v_previous is null then 'website_added' when v_current is null then 'website_removed' else 'website_changed' end; end if;
 if v_change is not null then
  insert into public.lead_website_history(id,lead_id,previous_website,current_website,change_type) values(gen_random_uuid(),v.id,v_previous,v_current,v_change);
  if v_change<>'first_seen' then insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id)
   values(gen_random_uuid(),'lead',v.id,'website_status_changed',jsonb_build_object('previousWebsite',v_previous,'currentWebsite',v_current,'changeType',v_change),a.owner_id,left(p_correlation,128)); end if;
 end if; return public.finder_lead_json(v);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then return null;
end $$;

create or replace function public.owner_finder_add_pipeline(p_session text,p_lead text,p_status text,p_notes text,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; v public.lead_pipeline_events; current_status text; statuses text[]:=array['discovered','analyzed','qualified','profile_prepared','demo_ready','contacted','interested','converted','rejected','archived']; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null or not(p_status=any(statuses)) or length(p_notes)>1000 then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('finder-pipeline:'||p_lead,0));
 if not exists(select 1 from public.leads where id=p_lead) then return null; end if;
 select status into current_status from public.lead_pipeline_events where lead_id=p_lead order by created_at desc,id desc limit 1;
 if current_status=p_status then select * into v from public.lead_pipeline_events where lead_id=p_lead order by created_at desc,id desc limit 1; return public.finder_pipeline_json(v); end if;
 if current_status is not null and array_position(statuses,p_status)<array_position(statuses,current_status) then return null; end if;
 insert into public.lead_pipeline_events(id,lead_id,status,notes,actor_owner_id) values(gen_random_uuid(),p_lead,p_status,nullif(left(btrim(p_notes),1000),''),a.owner_id) returning * into v;
 return public.finder_pipeline_json(v); end $$;

create or replace function public.owner_finder_list_pipeline(p_session text,p_lead text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return(select coalesce(jsonb_agg(public.finder_pipeline_json(e) order by e.created_at,e.id),'[]'::jsonb) from public.lead_pipeline_events e where e.lead_id=p_lead); end $$;

create or replace function public.owner_finder_create_profile(p_session text,p_lead text,p_profile jsonb,p_status text,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; v public.prepared_business_profiles; v_version integer; v_id text; begin
 select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return null; end if;
 v_version:=nullif(p_profile->>'version','')::integer; v_id:='prepared-'||p_lead||'-v'||v_version;
 if not exists(select 1 from public.leads where id=p_lead) or v_version not between 1 and 10000 or p_status not in('draft','ready_for_handoff','demo_created')
  or p_profile->>'sourceLeadId'<>p_lead or pg_column_size(p_profile)>262144 then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('finder-profile:'||p_lead,0));
 select * into v from public.prepared_business_profiles where lead_id=p_lead and version=v_version;
 if v.id is not null then if v.profile<>p_profile then return null; end if; return public.finder_profile_json(v); end if;
 insert into public.prepared_business_profiles(id,lead_id,version,profile,status,created_by_owner_id) values(v_id,p_lead,v_version,p_profile,p_status,a.owner_id) returning * into v;
 perform public.owner_finder_add_pipeline(p_session,p_lead,'profile_prepared','',p_correlation); return public.finder_profile_json(v);
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

create or replace function public.owner_finder_list_profiles(p_session text,p_lead text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return(select coalesce(jsonb_agg(public.finder_profile_json(p) order by p.version),'[]'::jsonb) from public.prepared_business_profiles p where p.lead_id=p_lead); end $$;

create or replace function public.owner_finder_append_audit(p_session text,p_entity text,p_id text,p_action text,p_details jsonb,p_correlation text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.write'); if a.owner_id is null then return false; end if;
 if (p_entity,p_action) not in (('search','google_places_discovered'),('demo','private_demo_created'),('demo','ai_private_demo_created'),('lead','ai_website_blueprint_created'))
  or length(p_id)>512 or jsonb_typeof(coalesce(p_details,'{}'::jsonb))<>'object' or pg_column_size(p_details)>16384 then return false; end if;
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id)
 values(gen_random_uuid(),p_entity,p_id,p_action,coalesce(p_details,'{}'::jsonb),a.owner_id,left(p_correlation,128)); return true; end $$;

create or replace function public.owner_finder_list_audit(p_session text,p_entity_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return(select coalesce(jsonb_agg(public.finder_audit_json(e) order by e.created_at desc,e.id),'[]'::jsonb) from(select * from public.audit_events where entity_id=p_entity_id order by created_at desc,id limit 200)e); end $$;

create or replace function public.issue_preview_for_site(p_site text,p_regenerate boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare v uuid; begin perform pg_advisory_xact_lock(hashtextextended('preview:'||p_site,0));
 if not p_regenerate then select token_id into v from public.site_preview_tokens where site_id=p_site and revoked_at is null and expires_at>statement_timestamp() for update; end if;
 if v is not null then return v; end if;
 update public.site_preview_tokens set revoked_at=statement_timestamp() where site_id=p_site and revoked_at is null;
 insert into public.site_preview_tokens(token_id,site_id,expires_at) select gen_random_uuid(),s.id,s.demo_expires_at from public.sites s
  where s.id=p_site and s.visibility='private' and (s.activated_at is not null or s.demo_expires_at>statement_timestamp()) returning token_id into v;
 return v; end $$;

create or replace function public.owner_demo_create(p_session text,p_profile text,p_document jsonb,p_trial_days integer,p_recovery_days integer,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; pr record; existing record; v_id text; v_slug text; v_doc jsonb; v_token uuid; begin
 select * into a from public.owner_auth_resolve_session(p_session,'demos.manage'); if a.owner_id is null then return null; end if;
 select * into pr from public.prepared_business_profiles where id=p_profile; if pr.id is null then return null; end if;
 v_id:='site-'||pr.id||'-v'||pr.version; v_slug=lower(p_document->>'slug');
 if v_slug!~'^[a-z0-9]+(?:-[a-z0-9]+)*$' or length(v_slug)>180
  or pg_column_size(p_document)>524288 or p_trial_days not between 1 and 90 or p_recovery_days not between 1 and 180 then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('demo-profile:'||pr.id,0));
 select s.id,s.slug,s.generated_document into existing from public.demo_sites d join public.sites s on s.id=d.site_id where d.prepared_profile_id=pr.id order by d.created_at,d.site_id limit 1 for update of s;
 if existing.id is not null then v_token:=public.issue_preview_for_site(existing.id,false); return jsonb_build_object('site',existing.generated_document,'siteId',existing.id,'slug',existing.slug,'previewTokenId',v_token,'idempotent',true); end if;
 if exists(select 1 from public.sites where slug=v_slug) then v_slug:=left(v_slug,165)||'-'||substr(md5(pr.id),1,8); end if;
 v_doc:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(p_document,'{id}',to_jsonb(v_id),true),'{profileId}',to_jsonb(pr.id),true),'{slug}',to_jsonb(v_slug),true),'{visibility}','"private"'::jsonb,true);
 insert into public.sites(id,slug,visibility,publication_intent,generated_document,lead_id,prepared_profile_id,demo_expires_at,trial_recovery_ends_at,onboarding_source)
 values(v_id,v_slug,'private','public',v_doc,pr.lead_id,pr.id,statement_timestamp()+p_trial_days*interval '1 day',statement_timestamp()+(p_trial_days+p_recovery_days)*interval '1 day','owner_outreach');
 insert into public.demo_sites(site_id,prepared_profile_id,created_by_owner_id) values(v_id,pr.id,a.owner_id);
 update public.prepared_business_profiles set status='demo_created' where id=pr.id;
 perform public.owner_finder_add_pipeline(p_session,pr.lead_id,'demo_ready','',p_correlation);
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id) values(gen_random_uuid(),'demo',v_id,'private_demo_created',jsonb_build_object('leadId',pr.lead_id,'profileId',pr.id,'templateKey',v_doc->>'templateKey','themeKey',v_doc->>'themeKey'),a.owner_id,left(p_correlation,128));
 v_token:=public.issue_preview_for_site(v_id,false); return jsonb_build_object('site',v_doc,'siteId',v_id,'slug',v_slug,'previewTokenId',v_token,'idempotent',false);
end $$;

create or replace function public.owner_preview_issue(p_session text,p_slug text,p_regenerate boolean,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; s record; v uuid; begin select * into a from public.owner_auth_resolve_session(p_session,'websites.manage'); if a.owner_id is null then return null; end if;
 select id,slug into s from public.sites where slug=p_slug and exists(select 1 from public.demo_sites d where d.site_id=sites.id); if s.id is null then return null; end if;
 v:=public.issue_preview_for_site(s.id,p_regenerate); if v is null then return null; end if;
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id) values(gen_random_uuid(),'demo',s.id,case when p_regenerate then 'preview_regenerated' else 'preview_issued' end,'{}',a.owner_id,left(p_correlation,128));
 return jsonb_build_object('siteId',s.id,'slug',s.slug,'previewTokenId',v); end $$;

create or replace function public.site_admin_preview_issue(p_session text,p_regenerate boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.site_admin_resolve_session(p_session); if a.account_id is null then return null; end if;
 return public.issue_preview_for_site(a.site_id,p_regenerate); end $$;

create or replace function public.owner_demo_site_by_lead(p_session text,p_lead text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'finder.read'); if a.owner_id is null then return null; end if;
 return(select jsonb_build_object('id',s.id,'slug',s.slug) from public.sites s where s.lead_id=p_lead order by s.created_at desc limit 1); end $$;

create or replace function public.owner_demo_site_identity(p_session text,p_site text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'demos.manage'); if a.owner_id is null then return null; end if;
 return(select jsonb_build_object('id',s.id,'slug',s.slug,'document',s.generated_document) from public.sites s where s.id=p_site and exists(select 1 from public.demo_sites d where d.site_id=s.id)); end $$;

create or replace function public.owner_demo_site_identity_by_slug(p_session text,p_slug text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin select * into a from public.owner_auth_resolve_session(p_session,'websites.manage'); if a.owner_id is null then return null; end if;
 return(select jsonb_build_object('id',s.id,'slug',s.slug,'document',s.generated_document) from public.sites s where s.slug=p_slug and exists(select 1 from public.demo_sites d where d.site_id=s.id)); end $$;

create or replace function public.owner_demo_configure_admin(p_session text,p_slug text,p_email text,p_password_hash text,p_locale text,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; s record; v record; begin select * into a from public.owner_auth_resolve_session(p_session,'websites.manage'); if a.owner_id is null then return null; end if;
 select id into s from public.sites where slug=p_slug and exists(select 1 from public.demo_sites d where d.site_id=sites.id) for update; if s.id is null or position('@' in p_email)<2 or length(p_email)>320 or length(p_password_hash)>1000 or p_locale not in('en','de') then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('site-admin-email:'||lower(btrim(p_email)),0));
 if exists(select 1 from public.site_admin_accounts x where lower(btrim(x.email))=lower(btrim(p_email)) and x.site_id<>s.id) then raise exception 'site_admin_email_conflict'; end if;
 insert into public.site_admin_accounts(id,site_id,email,password_hash,preferred_locale) values(gen_random_uuid(),s.id,lower(btrim(p_email)),p_password_hash,p_locale)
 on conflict(site_id) do update set email=excluded.email,password_hash=excluded.password_hash,preferred_locale=excluded.preferred_locale,updated_at=statement_timestamp() returning * into v;
 delete from public.site_admin_sessions where account_id=v.id;
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id) values(gen_random_uuid(),'demo',s.id,'site_admin_configured',jsonb_build_object('preferredLocale',p_locale),a.owner_id,left(p_correlation,128));
 return jsonb_build_object('id',v.id,'siteId',v.site_id,'email',v.email,'preferredLocale',v.preferred_locale); end $$;

create or replace function public.owner_demo_invitation_prepare(p_session text,p_slug text,p_reset_hash text,p_reset_expires timestamptz,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; s record; admin record; token uuid; begin select * into a from public.owner_auth_resolve_session(p_session,'websites.manage'); if a.owner_id is null then return null; end if;
 select id,slug,generated_document,demo_expires_at into s from public.sites where slug=p_slug and exists(select 1 from public.demo_sites d where d.site_id=sites.id) for update;
 select * into admin from public.site_admin_accounts where site_id=s.id; if s.id is null or admin.id is null or p_reset_hash!~'^[a-f0-9]{64}$' or p_reset_expires>statement_timestamp()+interval '1 hour 5 seconds' then return null; end if;
 update public.site_admin_password_resets set used_at=statement_timestamp() where account_id=admin.id and used_at is null;
 insert into public.site_admin_password_resets(id,account_id,token_hash,expires_at) values(gen_random_uuid(),admin.id,p_reset_hash,p_reset_expires);
 token:=public.issue_preview_for_site(s.id,false);
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id) values(gen_random_uuid(),'demo',s.id,'invitation_prepared','{}',a.owner_id,left(p_correlation,128));
 return jsonb_build_object('siteId',s.id,'slug',s.slug,'document',s.generated_document,'demoExpiresAt',s.demo_expires_at,'accountId',admin.id,'email',admin.email,'preferredLocale',admin.preferred_locale,'previewTokenId',token); end $$;

create or replace function public.consume_api_rate_limit(p_scope text,p_subject text,p_limit integer,p_window integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_start timestamptz; v_count integer; v_retry integer; begin
 if p_scope<>all(array['password_reset_network','password_reset_account','manual_password_change_network','manual_password_change_account','password_change_network','password_change_token','site_admin_login_network','site_admin_login_account','subscription-checkout','subscription_resource','owner-google-places-provider-call','owner-device-geocode','owner_invitation_accept_network','owner_invitation_accept_token','owner_password_change','public-appointment','appointment_site_network','appointment_replay','owner_team_session_revoke','public-trial','public_trial_email','owner_team_role_change','owner_login_network','owner_login_identity','owner_team_status_change','owner_team_invite_revoke','owner_team_invite_create','owner_team_invite_resend','owner_mfa_challenge','owner_recovery_regeneration'])
  or p_subject!~'^[a-f0-9]{64}$' or p_limit not between 1 and 10000 or p_window not between 10 and 86400 then return null; end if;
 v_start:=to_timestamp(floor(extract(epoch from statement_timestamp())/p_window)*p_window);
 insert into public.api_rate_limits(scope,subject_key,window_start,request_count) values(p_scope,p_subject,v_start,1)
 on conflict(scope,subject_key,window_start) do update set request_count=public.api_rate_limits.request_count+1,updated_at=statement_timestamp()
 where public.api_rate_limits.request_count<p_limit returning request_count into v_count;
 v_retry:=greatest(1,p_window-floor(extract(epoch from statement_timestamp()-v_start))::integer);
 return jsonb_build_object('allowed',v_count is not null,'retryAfterSeconds',v_retry); end $$;

create or replace function public.public_trial_create(p_input jsonb,p_password_hash text,p_session_hash text,p_previous_hash text,p_session_expires timestamptz,p_trial_days integer,p_recovery_days integer)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_email text:=lower(btrim(p_input->>'email')); v_profile jsonb:=p_input->'profile'; v_doc jsonb:=p_input->'site'; v_lead text:='self-'||gen_random_uuid(); v_profile_id text; v_site text; v_slug text; v_account uuid:=gen_random_uuid(); v_preview uuid; v_expires timestamptz; begin
 if position('@' in v_email)<2 or length(v_email)>320 or length(p_password_hash)>1000 or p_session_hash!~'^[a-f0-9]{64}$'
  or (p_previous_hash is not null and p_previous_hash!~'^[a-f0-9]{64}$') or p_session_expires<=statement_timestamp() or p_session_expires>statement_timestamp()+interval '91 days'
  or p_trial_days not between 1 and 90 or p_recovery_days not between 1 and 180 or p_input->>'preferredLocale' not in('en','de')
  or jsonb_typeof(v_profile)<>'object' or jsonb_typeof(v_doc)<>'object' or length(btrim(v_profile#>>'{business,name}')) not between 1 and 200
  or pg_column_size(p_input)>786432 then return null; end if;
 perform pg_advisory_xact_lock(7310441); if exists(select 1 from public.site_admin_accounts where lower(btrim(email))=v_email) then raise exception 'trial_conflict'; end if;
 v_profile_id:='prepared-'||v_lead||'-v1'; v_site:='site-'||v_profile_id||'-v1'; v_slug=lower(v_doc->>'slug');
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

create or replace function public.cleanup_expired_demo_batch(p_purpose text,p_batch integer default 100)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ids text[]; profiles text[]; leads_to_check text[]; deleted_sites integer:=0; deleted_previews integer:=0; deleted_limits integer:=0; begin
 if p_purpose<>'expired_demo_maintenance' or p_batch not between 1 and 200 then return null; end if;
 select array_agg(x.id),array_agg(x.prepared_profile_id),array_agg(x.lead_id) into ids,profiles,leads_to_check from(
  select s.id,d.prepared_profile_id,s.lead_id from public.sites s join public.demo_sites d on d.site_id=s.id
  where s.activated_at is null and s.trial_recovery_ends_at<=statement_timestamp()
   and not exists(select 1 from public.site_subscriptions sub where sub.site_id=s.id)
   and not exists(select 1 from public.subscriber_intakes i where i.demo_site_id=s.id and i.status='pending_payment' and i.updated_at>statement_timestamp()-interval '24 hours')
   and not exists(select 1 from public.site_preview_tokens p where p.site_id=s.id and p.revoked_at is null and p.expires_at>statement_timestamp())
  order by s.trial_recovery_ends_at,s.id for update of s skip locked limit p_batch)x;
 if ids is not null then delete from public.sites where id=any(ids); get diagnostics deleted_sites=row_count;
  delete from public.prepared_business_profiles p where p.id=any(profiles) and not exists(select 1 from public.demo_sites d where d.prepared_profile_id=p.id);
  delete from public.leads l where l.id=any(leads_to_check) and l.source='self-service' and not exists(select 1 from public.sites s where s.lead_id=l.id);
 end if;
 with doomed as(select ctid from public.site_preview_tokens where revoked_at is not null or expires_at<=statement_timestamp() order by expires_at limit p_batch)
 delete from public.site_preview_tokens p using doomed d where p.ctid=d.ctid; get diagnostics deleted_previews=row_count;
 with doomed as(select ctid from public.api_rate_limits where updated_at<statement_timestamp()-interval '2 days' order by updated_at limit p_batch*10)
 delete from public.api_rate_limits r using doomed d where r.ctid=d.ctid; get diagnostics deleted_limits=row_count;
 with doomed as(select ctid from public.tenant_usage_counters where window_start<statement_timestamp()-interval '14 months' order by window_start limit p_batch*10) delete from public.tenant_usage_counters t using doomed d where t.ctid=d.ctid;
 with doomed as(select ctid from public.tenant_usage_events where created_at<statement_timestamp()-interval '90 days' order by created_at limit p_batch*10) delete from public.tenant_usage_events t using doomed d where t.ctid=d.ctid;
 with doomed as(select ctid from public.tenant_concurrency_leases where expires_at<statement_timestamp() order by expires_at limit p_batch*10) delete from public.tenant_concurrency_leases t using doomed d where t.ctid=d.ctid;
 insert into public.audit_events(id,entity_type,entity_id,action,details) values(gen_random_uuid(),'platform','cleanup','expired_demo_cleanup',jsonb_build_object('deletedSites',deleted_sites,'deletedPreviews',deleted_previews,'deletedRateLimits',deleted_limits,'batch',p_batch));
 return jsonb_build_object('deletedSites',deleted_sites,'deletedPreviews',deleted_previews,'deletedRateLimits',deleted_limits,'batch',p_batch); end $$;

-- Helpers are internal; actor-specific entry points are granted by provisioning.
revoke all on function public.finder_lead_json(public.leads) from public;
revoke all on function public.finder_profile_json(public.prepared_business_profiles) from public;
revoke all on function public.finder_pipeline_json(public.lead_pipeline_events) from public;
revoke all on function public.finder_audit_json(public.audit_events) from public;
revoke all on function public.issue_preview_for_site(text,boolean) from public;
revoke all on function public.owner_finder_list_leads(text,integer,integer) from public;
revoke all on function public.owner_finder_get_lead(text,text) from public;
revoke all on function public.owner_finder_list_workspace(text,integer,integer) from public;
revoke all on function public.owner_finder_create_search(text,jsonb,text,text) from public;
revoke all on function public.owner_finder_complete_search(text,uuid,jsonb,boolean) from public;
revoke all on function public.owner_finder_fail_search(text,uuid) from public;
revoke all on function public.owner_finder_list_searches(text,integer) from public;
revoke all on function public.owner_finder_get_cache(text,text) from public;
revoke all on function public.owner_finder_save_cache(text,text,jsonb) from public;
revoke all on function public.owner_finder_upsert_lead(text,jsonb,text) from public;
revoke all on function public.owner_finder_add_pipeline(text,text,text,text,text) from public;
revoke all on function public.owner_finder_list_pipeline(text,text) from public;
revoke all on function public.owner_finder_create_profile(text,text,jsonb,text,text) from public;
revoke all on function public.owner_finder_list_profiles(text,text) from public;
revoke all on function public.owner_finder_append_audit(text,text,text,text,jsonb,text) from public;
revoke all on function public.owner_finder_list_audit(text,text) from public;
revoke all on function public.owner_demo_create(text,text,jsonb,integer,integer,text) from public;
revoke all on function public.owner_preview_issue(text,text,boolean,text) from public;
revoke all on function public.site_admin_preview_issue(text,boolean) from public;
revoke all on function public.owner_demo_site_by_lead(text,text) from public;
revoke all on function public.owner_demo_site_identity(text,text) from public;
revoke all on function public.owner_demo_site_identity_by_slug(text,text) from public;
revoke all on function public.owner_demo_configure_admin(text,text,text,text,text,text) from public;
revoke all on function public.owner_demo_invitation_prepare(text,text,text,timestamptz,text) from public;
revoke all on function public.consume_api_rate_limit(text,text,integer,integer) from public;
revoke all on function public.public_trial_create(jsonb,text,text,text,timestamptz,integer,integer) from public;
revoke all on function public.cleanup_expired_demo_batch(text,integer) from public;
