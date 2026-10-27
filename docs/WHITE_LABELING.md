# White-label configuration

Each buyer brands the delivered product through deployment settings. They do not need to rename packages, edit templates or search source files for product identity, plan copy, credentials or theme tokens.

The single configuration boundary is [brand-profile.ts](../apps/web/lib/brand-profile.ts), projected through `platform-config.ts` for existing product settings. It validates buyer-owned visual values from `.env.local` or encrypted deployment settings. Legal operator identity remains a separate reviewed boundary.

## Buyer configuration map

| Buyer-owned setting | Configuration |
| --- | --- |
| Stable installation key, asset version, product name, description, tagline, default locale and support | `NEXT_PUBLIC_BRAND_*`, `NEXT_PUBLIC_PLATFORM_*`, `NEXT_PUBLIC_SUPPORT_*` |
| Logo, mark, favicon, PWA/Apple and social assets | `NEXT_PUBLIC_PLATFORM_*_URL`, `NEXT_PUBLIC_PWA_*`, `NEXT_PUBLIC_APPLE_TOUCH_ICON_URL` |

Customer lifecycle UI supports EN/DE through `NEXT_PUBLIC_PLATFORM_LOCALE` and `NEXT_PUBLIC_SUPPORTED_LOCALES`. Generated sites independently retain `de`, `en`, `fr`, `es`, `it` and `sq` through `NEXT_PUBLIC_WEBSITE_LOCALES`. The owner panel is intentionally English-only; branding does not imply owner-panel translation.
| Primary, accent, background and text colors | `NEXT_PUBLIC_BRAND_*` |
| Full buyer visual override | `NEXT_PUBLIC_BRAND_STYLESHEET_URL` |
| Landing headline and short marketing copy | `NEXT_PUBLIC_LANDING_*` |
| Trial length | `TRIAL_DURATION_DAYS` |
| Plan labels, display prices and descriptions | `NEXT_PUBLIC_PLAN_*` |
| Actual subscription prices | `STRIPE_PRICE_*` |
| Checkout account and webhook | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Public product domain | `PUBLIC_APP_URL` |
| Finder provider | `GOOGLE_MAPS_API_KEY` |
| Email sender | `RESEND_API_KEY`, `EMAIL_FROM` |
| Public business media storage | Explicit `BLOB_STORE_ID` with Vercel OIDC, or a matching legacy `BLOB_READ_WRITE_TOKEN`; cleanup uses the same reviewed store authority |
| Private Information/News media storage | `INFORMATION_BLOB_READ_WRITE_TOKEN` |
| Customer-domain hosting | `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` |
| Platform legal identity and conditional DDG fields | Versioned `/owner/legal` configuration; `LEGAL_*` values are non-production fixtures/setup inputs |
| Legal contact versus support contact | `contactEmail` and `supportEmail` are separate fields |
| Currency and tax presentation | Active reviewed legal/commercial version plus matching Stripe Price |

The exact variables and safe placeholders are in [.env.example](../.env.example). Browser-visible settings intentionally use the `NEXT_PUBLIC_` prefix. API keys and secrets must never use that prefix.

## Pricing rule

The plan text shown to a visitor is configured separately from the Stripe Price ID. Before launch, the buyer must verify each display price against the currency and recurring amount on the corresponding Stripe Price. The release preflight requires all Stripe variables in a production release.

## Brand assets

Set `NEXT_PUBLIC_PLATFORM_LOGO_URL` to a stable HTTPS logo URL, preferably from the buyer's own CDN or Vercel Blob. If omitted, the configured two-character `NEXT_PUBLIC_PLATFORM_MARK` is displayed. The logo is reused in metadata and all platform entry pages.

Customer business identity remains separate: every generated business website uses its own `SiteDocument` name, logo, content, theme and customer-owned `publicLegal` identity/privacy URL. Platform imprint data is never copied into that object.

Owner team invitation email subjects/body and authenticator issuer use `NEXT_PUBLIC_PLATFORM_NAME`; links use the canonical `PUBLIC_APP_URL` and do not hardcode the BusinessSite RC product identity. Configure the buyer's `EMAIL_FROM` and Resend account before acceptance testing. Role names and security semantics remain stable technical contracts and are not buyer-renamable labels.

For a buyer who needs a bespoke visual system, set `NEXT_PUBLIC_BRAND_STYLESHEET_URL` only to a local, versioned `/brand.css` path. Remote stylesheets are disabled pending a deployment allowlist/CSP acceptance. Stylesheets may change presentation only, never security-sensitive visibility or authorization.

PWA branding is customer-admin-only: `/site-admin/manifest.webmanifest` is generated from the same profile and scoped to `/site-admin/`. It is a web install experience, not an App Store or Play Store application. Generated websites, previews, custom domains and Owner routes do not advertise this PWA.

## Buyer setup sequence

1. Copy `.env.example` into the buyer's private environment settings.
2. Complete the Buyer white-label section first: identity, logo, colors, locale, trial and plans.
3. Create the buyer's Stripe Products and Price IDs, then enter the matching `STRIPE_PRICE_*` values.
4. Configure the buyer's Google, Resend, Blob and Vercel credentials in their own accounts.
5. Set `PUBLIC_APP_URL` to the buyer's platform domain.
6. Create a legal/commercial version and register the exact EN/DE repository document versions in `/owner/legal`. After professional review, activate each with fresh password + TOTP.
7. Set `CUSTOMER_PUBLIC_LEGAL_IDENTITY_REQUIRED=true`; complete customer-owned legal/privacy fields before public publication.
8. Reconcile price/currency/tax label with Stripe, then run `npm run setup:check` and `npm run preflight:release` with the production environment.
9. Deploy and complete the handover acceptance.

## Never rename casually

`@platform/*` package names, database tables and migration names are technical internals, not buyer-facing branding. Renaming them adds upgrade risk and prevents clean delivery of future master-product updates.
