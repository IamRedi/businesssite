# Customer-admin PWA

BusinessSite RC exposes a web-installable customer administration experience,
not a native-store application. The manifest lives at
`/site-admin/manifest.webmanifest`, has `start_url` `/site-admin/login`, and
is scoped strictly to `/site-admin/`.

It is generated from the validated white-label profile. The same profile
supplies PWA name, short name, description, colors and local standard,
maskable and Apple-touch assets. Do not add the manifest to Owner, public
generated-site, preview or custom-domain layouts.

The service worker has no fetch handler. It never caches account, editor, API,
auth or generated-site responses. Version/profile cache namespaces are cleared
at activation so releases cannot reuse stale shell state. Browser install,
logout and update behavior need staging acceptance for each buyer profile.
