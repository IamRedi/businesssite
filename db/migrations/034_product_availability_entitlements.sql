-- Additive product-availability entitlements. Legacy `booking` remains an alias
-- for request-only appointments; `booking_calendar` is reserved and disabled.
alter table site_features drop constraint if exists site_features_feature_key_check;
alter table site_features add constraint site_features_feature_key_check
  check (feature_key in (
    'website', 'editor', 'media', 'ai_rewrite', 'appointment_requests',
    'booking', 'booking_calendar', 'custom_domain', 'custom_domain_existing',
    'social_media'
  ));

insert into site_features(site_id, feature_key, enabled)
select subscriptions.site_id, features.feature_key, features.enabled
from site_subscriptions subscriptions
cross join (values
  ('website', true),
  ('editor', true),
  ('media', true),
  ('ai_rewrite', true),
  ('appointment_requests', true),
  ('booking', true),
  ('booking_calendar', false),
  ('custom_domain', true),
  ('custom_domain_existing', true)
) as features(feature_key, enabled)
on conflict(site_id, feature_key)
do update set enabled=excluded.enabled;
