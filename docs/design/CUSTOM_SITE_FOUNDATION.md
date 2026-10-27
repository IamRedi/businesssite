# Custom site foundation

P5-002 implements a local candidate. STATUS owns lifecycle;
independent review, owner acceptance and release remain separate.

## Contracts and rendering

The neutral engine owns additive `SiteDocument.customDesign` (`custom/1`) and
`customMedia`, validation and `custom-preset/1` import/export. It has no framework,
database, authentication, billing or Finder dependency. The Finder boundary
remains `PreparedBusinessProfile -> SiteDocument`.

Composition records cinematic-editorial layout, split/full-image hero, section
order, service/about/contact variants, five tokens, classic/modern typography,
line/solid icons, gallery aspect/categories/lightbox, video policy, CTA intent
and fixed media-role rules. Hero first, contact/legal and footer last are required.
Text/accent/muted must pass 4.5:1 against background/surface; CTA uses that pair.
No font service, analytics or stock service is added.

`SitePreview` selects `CustomSite` only when both custom fields validate. Missing
or malformed custom fields retain the original renderer. No stored document,
automatic planner or reviewed import is upgraded. Reusable sections: hero,
services, gallery, video, about, split opening hours, contact, CTA, optional
social gallery, legal and footer.

Image roles are hero/logo/gallery/service/portrait/video-poster, with safe HTTPS
or origin-relative URLs, alt text and dimensions. Video adds sources, poster
reference, duration and byte metadata. Caps: 60 images, 8 videos, two MP4/WebM
sources each, 4 MB per source, 60 seconds; decorative loops cap at 12 seconds.
Operators must verify actual bytes; declared bytes do not inspect remote files.

`GalleryCarousel`: native swipe/scroll snap, desktop arrows, keyboard arrows,
filters, lazy images, reserved aspect ratios, dialog lightbox, Escape/focus
restoration. `VideoShowcase`/`VideoLoop`: reserved poster/aspect, visibility-lazy
sources, preload=none, muted/playsInline, offscreen/hidden pause. Only decorative
loops play automatically; reduced motion/save-data suppress that path. Explicit
playback remains available. The existing map consent boundary is retained.

## Owner and database boundary

- `/owner/sites/[slug]/custom-design`: MFA session and `websites.manage`, business
  sites only. JSON design/media editor, validated draft, isolated 390/1280 preview
  viewport using the actual `SitePreview`, snapshot/draft and preset exports.
  Editing invalidates preview; publication requires a current preview.
- POST `/api/owner/sites/[slug]/custom-design`: same-origin, same permission,
  streamed 2 MB cap, no-store; actions read/publish/restore. No customer/public
  mutation route is introduced.
- Migration `077_owner_custom_design.sql`: two fixed-search_path SECURITY DEFINER
  routines, classified owner-executor by role provisioning. Runtime/system
  cannot execute; owner has no direct table grants. No new table or env var.
- `PostgresOwnerCustomDesignRepository` uses existing `DATABASE_OWNER_URL`.
  Enabled editor/media features and active trial/complimentary/subscription
  lifecycle are enforced in SQL. Locked-row exact JSONB comparison rejects stale
  writes; public legal identity is checked before saving a public document.
- Save updates composition/media only; visibility, publication intent, billing,
  activation and verified domain stay current. Slug/domain caches are invalidated.

## Backup, privacy and presets

The editor downloads a current document/domain snapshot before mutation. SQL
atomically retains one complete previous document/domain verification/visibility/
publication intent in `_customRestore`, without nesting prior backups. Metadata
only enters audit events. Restore rolls back design/media while preserving
intervening content/legal/domain changes; it cannot restore revoked entitlement.
Full document/domain rollback needs operator review of the exported snapshot.
The owner confirmed the private real pilot is new: existing backup is N/A;
its baseline/snapshot is explicitly `existingSite:false`.

The bounded backup stays within the existing tenant generated_document payload,
covered by normal site privacy export/deletion. It may retain old content until
replaced, restored or purged. No new history store or retention exception.
Local/Drive snapshots are owner-controlled customer data: restrict access,
exclude Git and include them in existing retention/deletion duties. Media refs
do not take ownership of bytes; preserve managed assets needed for rollback.

Preset export reconstructs allowlisted composition recursively; unknown keys
are discarded. All fields are enums, hex, booleans or bounded numbers. No site
ID/name/content/contact/legal/domain/media object or URL is exported. Import
binds design to the destination business content/media. Save is a JSON file;
hosted preset registry, catalog promotion and automatic selection are future work.

## Local tools and release duties

Keep customer input/export/media in ignored `.custom-site-private/` or a private
external directory. `optimize-custom-site-media.py` preserves originals and
writes WebP, muted H.264 faststart MP4, WebP posters and hashes/byte manifest to a
separate output. Pillow/imageio-ffmpeg are local tools, not runtime dependencies.
No GIF is emitted; no new hosted external service is required.

`build-custom-site-preview.mjs INPUT OUTPUT` assembles the real hydrated renderer,
baseline, candidate, snapshot and preset; `--owner-editor` assembles an owner UI
fixture. `serve-custom-site-preview.mjs OUTPUT PORT` binds loopback, serving
page/assets/media only; input/exports are not served. Screenshots stay private.
Local LCP/CLS are preview measurements, not hosted/mobile-network/Safari acceptance.

Before an authorized release: review, mandatory quality, fresh RLS and 076->077
upgrade proof; migrate 077 and reprovision roles; verify hosted auth/caches.
Upload selected media through existing managed storage, create the customer via
the existing flow, apply composition, and separately accept public contact/legal
facts, media rights, publication and hosted performance. Drive URLs and local
`/media/` refs are source/preview paths, not deployed assets.

Evidence: P5-002.

## Owner managed custom media (P5-002.1)

`POST /api/owner/sites/[slug]/custom-media` takes exactly one multipart `file`.
Existing Owner auth/MFA, `websites.manage` and same-origin checks run before
access. Business lifecycle plus editor/media entitlement is resolved by new
`owner_custom_media_context`; registration locks the same site and rechecks.
No Site Admin identity, remote URL ingestion or publication mutation is used.

WebP is capped at 4 MiB / 2000px per dimension: complete RIFF framing and actual
pixel decoding are checked. Prepared unfragmented AVC/AAC MP4 is capped at
4,000,000 bytes / 3840px and the saved custom composition duration (default30s,
absolute60s; decorative loops at most12s). Complete box framing, bounded sample
tables, internal data references, exact non-overlapping sample byte accounting,
AVC NAL framing and SPS dimensions are validated before upload. AAC-LC config
and raw access-unit bounds are checked; no complete entropy-decoding claim.
Other video containers/codecs, fragmented MP4, animated/metadata WebP
and WebM are unsupported. No runtime transcoding occurs. `sharp` and `mp4box`
are server dependencies only; parsers are not shipped to the Owner client.

Existing `BLOB_STORE_ID` and `PRIVACY_PROVIDER_VERCEL_BLOB_STORE_ID` must match
the dedicated PUBLIC business store. Existing OIDC binding is preferred; no
private/database fallback. `BLOB_READ_WRITE_TOKEN` is usable only through the
existing exact-store token authority helper when OIDC is unavailable.
No new environment variable or external service is introduced.
Paths are `sites/<siteId>/custom/<uuid>-<safe-filename>`; exact provider URL,
path and MIME are checked. Failed registration conditionally deletes only the
newly allocated object with its ETag; failed cleanup returns a generic503 for
operator reconciliation rather than falsely reporting removal. The authorized
Owner response carries `cleanupRequired`, exact storage key and provider
authority for that reconciliation, without exposing provider/DB error strings.

Migration078 adds two Owner-only routines, no tables or data updates. Existing
`site_media_assets` records public store authority, key, MIME, byte size and
dimensions; duration is returned for `customMedia` (no registry duration column).
Existing FORCE/RLS and non-login Owner executor policies apply. Owner application
roles remain procedure-only. Site Admin registration and cleanup worker binding
rules are unchanged. Operators must preserve matching cleanup authority and
existing rollback media references; flags are not enabled by this task.

Normal UI uploads attach managed URLs to hero/logo/gallery/portrait/poster or
video source roles. Videos require a selected poster. Upload invalidates preview;
existing preview/save/preset tools continue to preserve publication state.
Verification: P5-002.1.
