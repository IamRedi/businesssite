insert into site_features (site_id, feature_key, enabled)
select site_id, 'custom_domain', true
from site_subscriptions
where status in ('active', 'trialing')
on conflict (site_id, feature_key)
do update set enabled = excluded.enabled;
