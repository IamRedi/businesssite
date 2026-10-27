-- Bind editorial audit references to the same tenant while retaining audit rows
-- after an article is deleted.
alter table site_content_audit_events
  drop constraint site_content_audit_events_article_id_fkey;

alter table site_content_audit_events
  add constraint site_content_audit_events_site_article_fkey
  foreign key (site_id, article_id)
  references site_articles(site_id, id)
  on delete set null (article_id);
