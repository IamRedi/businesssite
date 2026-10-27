-- Additive owner custom design boundary; no new tables or visibility changes.
-- A single previous composition/document is retained in the same tenant's
-- generated_document._customRestore. No customer content enters audit_events.
create or replace function public.owner_custom_site_read(p_session text,p_slug text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; begin
 select * into a from public.owner_auth_resolve_session(p_session,'websites.manage');
 if a.owner_id is null then return null; end if;
 return (select jsonb_build_object('document',s.generated_document,
   'domain',jsonb_build_object('customDomain',s.custom_domain,'status',s.custom_domain_status,
     'verification',s.custom_domain_verification,'checkedAt',s.custom_domain_checked_at),
   'publicationIntent',s.publication_intent,'visibility',s.visibility)
   from public.sites s where s.slug=p_slug and s.site_kind='business');
end $$;
revoke all on function public.owner_custom_site_read(text,text) from public;

create or replace function public.owner_custom_site_apply(p_session text,p_slug text,p_expected jsonb,p_design jsonb,p_media jsonb,p_restore boolean,p_correlation text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a record; s record; v_doc jsonb; v_backup jsonb; begin
 select * into a from public.owner_auth_resolve_session(p_session,'websites.manage');
 if a.owner_id is null then return null; end if;
 select * into s from public.sites where slug=p_slug and site_kind='business' for update;
 if s.id is null or p_restore is null then return null; end if;
 if s.generated_document is distinct from p_expected then raise exception 'custom_design_conflict'; end if;
 -- Editing must never reactivate expired, canceled, revoked or read-only sites.
 if not exists(select 1 from public.site_features f where f.site_id=s.id and f.feature_key='editor' and f.enabled)
   or not exists(select 1 from public.site_features f where f.site_id=s.id and f.feature_key='media' and f.enabled)
   or not (
     (s.activated_at is null and s.demo_expires_at>statement_timestamp())
     or exists(select 1 from public.site_complimentary_access c where c.site_id=s.id and c.status='complimentary_active')
     or exists(select 1 from public.site_subscriptions sub where sub.site_id=s.id and (
       (sub.status in('active','trialing') and (not sub.cancel_at_period_end or sub.current_period_end>statement_timestamp()))
       or (sub.status='past_due' and sub.payment_grace_ends_at>statement_timestamp())))
   ) then raise exception 'custom_design_lifecycle_denied'; end if;
 if p_restore then
   v_backup:=s.generated_document->'_customRestore';
   if jsonb_typeof(v_backup->'document') is distinct from 'object' then return null; end if;
   -- Restore composition/media only: preserve all intervening content/legal edits,
   -- identity, visibility and current verified domain configuration.
   v_doc:=(s.generated_document-'customDesign'-'customMedia'-'_customRestore');
   if v_backup->'document' ? 'customDesign' then v_doc:=v_doc||jsonb_build_object('customDesign',v_backup->'document'->'customDesign'); end if;
   if v_backup->'document' ? 'customMedia' then v_doc:=v_doc||jsonb_build_object('customMedia',v_backup->'document'->'customMedia'); end if;
 else
   if jsonb_typeof(p_design) is distinct from 'object' or p_design->>'version' is distinct from 'custom/1'
     or jsonb_typeof(p_media) is distinct from 'object' or jsonb_typeof(p_media->'images') is distinct from 'array'
     or jsonb_typeof(p_media->'videos') is distinct from 'array' or pg_column_size(p_design)+pg_column_size(p_media)>393216 then return null; end if;
   v_backup:=jsonb_build_object('capturedAt',statement_timestamp(),'document',s.generated_document-'_customRestore',
     'domain',jsonb_build_object('customDomain',s.custom_domain,'status',s.custom_domain_status,'verification',s.custom_domain_verification,'checkedAt',s.custom_domain_checked_at),
     'publicationIntent',s.publication_intent,'visibility',s.visibility);
   v_doc:=(s.generated_document-'_customRestore')||jsonb_build_object('customDesign',p_design,'customMedia',p_media,'_customRestore',v_backup);
 end if;
 if pg_column_size(v_doc)>1572864 then return null; end if;
 update public.sites set generated_document=v_doc where id=s.id;
 insert into public.audit_events(id,entity_type,entity_id,action,details,actor_owner_id,correlation_id)
 values(gen_random_uuid(),'site',s.id,case when p_restore then 'custom_design.restored' else 'custom_design.published' end,
   jsonb_build_object('version','custom/1','backupRetained',not p_restore),a.owner_id,left(p_correlation,128));
 return v_doc;
end $$;
revoke all on function public.owner_custom_site_apply(text,text,jsonb,jsonb,jsonb,boolean,text) from public;
