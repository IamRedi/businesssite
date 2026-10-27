// Customer-admin scope is assigned at registration. This worker deliberately
// never handles fetches: authenticated/editor/API data cannot survive logout,
// cross-brand deployment, or a stale offline cache. Its cache key is retained
// only to make version/profile changes observable and to remove old caches.
const cachePrefix = "site-admin-shell:";
const version = new URL(self.location.href).searchParams.get("v") || "unversioned";
const cacheName = `${cachePrefix}${version}`;
self.addEventListener("install", (event) => event.waitUntil(caches.open(cacheName).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
