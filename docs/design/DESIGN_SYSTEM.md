# Design system

Status: the **ds/1 token layer is IMPLEMENTED** (BSRC-DESIGN-FOUNDATION-001,
Phase 1, 2026-10-01) with a pixel-exact migration guarantee (38/38 visual
regression captures identical). The premium visual upgrades (webfont pairings,
image treatments, motion) remain DESIGNED / NOT IMPLEMENTED and belong to P5.
Token changes are subject to the evolution log
([TEMPLATE_SYSTEM.md](TEMPLATE_SYSTEM.md) §8).

## 2. ds/1 — the implemented token system

Defined once at `.generated-site` in `apps/web/app/styles.css`, consumed by
the generated-site surface (both the frozen legacy render path and the ds/1
design pipeline):

- **Font roles**: `--ds-font-body` (Georgia stack), `--ds-font-display`,
  `--ds-font-chrome` (Inter stack). Legacy `font:` shorthand rules keep their
  exact `Inter, sans-serif` stack until P5 webfont loading — native controls
  (date/time inputs, buttons) rasterize a widened stack differently, which the
  pixel regression caught.
- **Type scale**: `--ds-type-h1/h2` (+ leading/tracking), `--ds-type-h1-compact`
  (≤900px), `--ds-type-lede`, `--ds-type-eyebrow`, `--ds-type-nav`,
  `--ds-type-cta`.
- **Spacing scale**: `--ds-space-1..10` (4px base) plus section rhythm
  `--ds-section-pad-y/x` (scoped: studio 70px/7%, clarity 100px/0,
  forge 100px/8%).
- **Container**: `--ds-container` (1180px) + `--ds-container-gutter` (20px).
- **Radius scale**: `--ds-radius-s..3xl` + `--ds-radius-pill`.
- **Borders**: `--ds-border-hairline` / `--ds-border-line`.
- **Shadows**: `--ds-shadow-1` (cards/gallery), `--ds-shadow-2` (map).
- **Overlays**: `--ds-overlay-card`, `--ds-overlay-hero` — scoped per layout
  where the legacy scrims differed (forge card scrim, luxury hero/card scrims).
- **Section backgrounds**: `--ds-section-bg`, `--ds-section-bg-raised`,
  `--ds-section-bg-invert`.
- **Motion**: `--ds-motion-fast/base/slow` + `--ds-ease-out` — defined, not
  applied by any legacy layout; reserved for variant implementations under the
  `prefers-reduced-motion` rule.
- **Breakpoints**: documented constants 1080 / 900 / 760 / 680 / 600 / 420
  (media queries cannot consume custom properties).

### Scoping rules (learned from the pixel regression, now contractual)

1. Tokens that alias `--site-*` resolve at their **definition scope**; a scope
   that overrides `--site-*` (e.g. `.generated-site-luxury .site-contact`)
   must **re-alias** the tokens it needs (see the luxury contact block).
2. Layout scopes (`-studio/-clarity/-forge/-luxury`) override only values that
   genuinely differed between the legacy layouts.
3. New visuals must be expressible as token combinations or as new shared
   variants — no hardcoded colors/px in archetype CSS beyond token definitions.
4. Versioning: `ds/1` is recorded per document in `SiteDocument.design
   .designSystemVersion`; a bump that changes rendered output requires an
   evolution-log entry and keeps vN renderers until no document references
   them.

## 3. Acceptance rules for any new visual work

1. Tokens only (rule 3 above).
2. Mobile parity: every variant renders its own 390px composition, verified
   by fixture screenshots.
3. Contrast: text tokens pass WCAG AA against their backgrounds in every
   theme (checked per theme, evidence recorded).
4. No motion that ignores `prefers-reduced-motion`.
5. Zero visual change to v1 documents: the 38-capture fixture matrix stays
   pixel-identical (`scripts/design-fixture-capture.mjs` +
   `scripts/design-fixture-diff.mjs`).

## P5-002 isolated custom tokens

The local custom/1 branch uses a separate five-token palette and scoped CSS
module with 4.5:1 foreground/CTA guards. Existing ds/1 tokens/selectors remain
unchanged. See [custom foundation](CUSTOM_SITE_FOUNDATION.md).
