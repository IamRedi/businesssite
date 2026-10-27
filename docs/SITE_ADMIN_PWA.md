# Website Admin app installation

The website administration panel is installable as a Progressive Web App (PWA).
It is intentionally scoped to `/site-admin/`; public websites, the landing
page and the Owner workspace do not become installable apps.

## Customer flow

1. The customer opens the normal website-admin panel and signs in.
2. In Chrome, when the browser considers the installation eligible, the fixed
   **Install app** button appears.
3. Selecting it adds **Website Admin** to the device launcher. The installed
   app opens at `/site-admin/login` and keeps the normal secure session flow.

Chrome decides whether to emit the install prompt. It may not appear when the
app is already installed, in unsupported browsers, or when browser-specific
installation criteria are not yet met. On iPhone/iPad, Safari's Share → Add to
Home Screen remains the browser-provided installation route.

## Security and freshness

- The manifest and service worker are served from the canonical platform host.
- The service worker is cache-free by design: it only enables installation and
  never stores authenticated editor data or serves stale content after deploys.
- Customer-domain website footers already link to `/site-admin/login`; host
  security redirects that platform-only route to the canonical platform host.

This is a PWA, not a Google Play application. A later Play Store release would
require a separate Android packaging/listing decision and is not implied here.
