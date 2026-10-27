-- Preserve whole-site deletion semantics: article-media relations disappear with
-- either their article or media asset, while featured-image references remain
-- protected by the existing site_articles foreign key.
alter table site_article_media
  drop constraint if exists site_article_media_site_id_media_id_fkey;

alter table site_article_media
  add constraint site_article_media_site_id_media_id_fkey
  foreign key (site_id, media_id)
  references site_media_assets(site_id, id) on delete cascade;
