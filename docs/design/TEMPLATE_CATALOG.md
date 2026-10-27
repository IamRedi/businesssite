# Template catalog

Two parts: **A** is the exact current inventory (audited 2026-10-01, HEAD
`07b1134`); **B** is the proposed v2 catalog (DESIGNED / NOT IMPLEMENTED).
Update part A whenever the engine changes, and record every change in
TEMPLATE_EVOLUTION_LOG.md.

## Part A — current inventory (v1, live)

### Layout archetypes (`SiteTemplate`) — 3 (+1 hidden)

| Layout | Business templates | Renderer class | Character (as shipped) |
| --- | --- | --- | --- |
| `studio` | 12 | `.generated-site-studio` | Warm, editorial, personal; split hero with image panel |
| `clarity` | 18 | `.generated-site-clarity` | Clean, calm, contemporary; background-image hero |
| `forge` | 20 | `.generated-site-forge` | Strong, practical; split hero + image card |
| (hidden) luxury | — | `.generated-site-luxury` | Triggered by `themeKey === "gold"`, overrides any layout |

### Theme keys (`ThemeSelection`) — 5

`auto` (template's `preferredTheme ?? layout palette`), `studio`, `clarity`,
`forge`, `gold` (fixed dark/gold palette + luxury markup). 10 business
templates declare `preferredTheme: "gold"`. An explicit non-auto/gold theme
**replaces the layout** (`resolveSiteDesign`).

### Business category registry (BSRC-DESIGN-P4-001, live)

`packages/website-engine/src/category-registry.ts` (`business-category-registry/1`)
is the canonical business-category source of truth: 16 families, 64
subcategories with six-locale labels (de/en/fr/es/it/sq), multilingual search
aliases and a canonical `defaultTemplateKey` per entry. Every one of the 50
business template keys below stays reachable through a subcategory (pinned by
test); 11 registry entries extend new domains (hotel, retail, photography, IT,
tutoring, driving school, gym, personal trainer, real estate, steel
fabrication, manufacturing) that map to no template yet and stay on the
generic path. Template resolution is canonical-first: stored
`categoryKey`/`subcategoryKey` pick the template directly, free-text keyword
matching remains the compatibility fallback. The 12 `templateCategories`
below remain the template catalog's own grouping (owner workspace filter);
they are not a second category taxonomy for creation flows.

Since BSRC-DESIGN-P4-002 the registry also parameterizes the import-AI
understanding schema (`suggestedCategory`, unknown keys discarded) and the
plan pass receives the resolved category as a structured signal with an
auditable source (`owner` | `ai` | `legacy`) — authority ladder: fresh owner
decision > AI detection > stored profile keys > legacy free text > other.

Since BSRC-DESIGN-P4-003 (live since 2026-10-02, deployment rc8fqkfxx, v9)
the plan records a choice block — `archetypeConfidence`, a signal-citing
`selectionReason` and up to two genuinely different alternatives — and the
import review renders up to three design cards with real-renderer mini
previews; an explicit user pick persists as
`SiteDocument.design.planner.designSource: "owner"` (the untouched AI
recommendation as `"ai"` evidence). The category remains a signal: no
category→archetype mapping exists anywhere in the pipeline.

BSRC-DESIGN-P4-004 (2026-10-03) benchmark-closed the P4 chain on 12 real
business classes: all four archetypes in content-justified use, 10 unique
section orders, zero near-identical alternative pairs, zero hallucinated
facts, weak-content sites always degrading to minimal/balanced imagery.
Evidence: P4-004 benchmark.

### Business template keys — 50, across 12 categories

| Category | Keys (layout) |
| --- | --- |
| vehicle (2) | auto-repair (forge), car-dealership (studio) |
| food (2) | restaurant (studio), fast-food (forge) |
| beauty (5) | barber (studio), hair-salon (studio), nail-studio (studio), lashes-brows (studio), beauty-studio (studio) |
| health-care (4) | medical-practice, dental-practice, home-care, psychotherapy (all clarity) |
| wellness (5) | physiotherapy, osteopathy, nutrition (clarity); massage, wellness (studio) |
| professional (6) | lawyer, accountant, insurance, architect, consultant, consultation (all clarity) |
| pet (4) | veterinary (clarity), pet-grooming (studio), dog-training (forge), pet-wellness (studio) |
| cleaning (4) | window/office/facility/home-cleaning (all clarity) |
| trade (4) | electrician, plumbing-heating, locksmith, handyman (all forge) |
| delivery (3) | courier, moving, local-delivery (all forge) |
| garden (4) | tree-service, landscaping, garden-maintenance, irrigation (all forge) |
| construction (6) | crane-service, civil-engineering, fiber-network, glass-facade, house-construction, construction (all forge) |

Each key carries: multilingual `match` keywords, one stock `heroImageUrl`,
starter `serviceImageUrls`, optional English `starterContent`, a 5-color
palette, optional `preferredTheme`. Fallback: `midnight` (clarity).

### Section inventory (every site, fixed order)

header/nav → hero → services → about → **shared tail** (`CompleteBusinessSections`):
gallery (≤ 4 photos) → contact (+ hours + consent-gated map) → appointment
request form → legal block → business-login footer. Section variants: none.
Navbar variants: none. Hero variants: one per layout.

### Design tokens in use

5 CSS variables per site (`--site-primary`, `--site-accent`, `--site-page`,
`--site-surface`, `--site-ink`); one global stylesheet; Georgia serif body +
Inter sans chrome (neither webfont-loaded); ad-hoc spacing/radius/shadow.
Details in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

### AI contracts

| Contract | Choice space | Applied? |
| --- | --- | --- |
| Import `WebsiteBuildPlan` v2 (since BSRC-DESIGN-FOUNDATION-001) | `templateKey ∈ {studio, clarity, forge}`, `themeKey ∈ 5`, plus the v2 `design` decisions (layoutArchetype, heroVariant, sectionOrder, sectionVariants, density, visualStyle, typographyDirection, colorDirection, imageStrategy, ctaStrategy) | **Yes** — carried through review into `SiteDocument.design`; renderer honors archetype, section order and validated variants (unknown ids fail safe) |
| Owner AI blueprint (v1) | `templateKey` over all 50 catalog keys, `themeKey` over 5 | Yes (`owner/ai/apply`); design block derived deterministically |
| Deterministic fallback | keyword matcher → templateKey, theme `auto` | Yes (both flows); emits a deterministic design block |

### Storage

Whole document as `sites.generated_document` JSONB (migration 001). Design
fields stored: `template`, `templateKey`, `themeKey`, `theme{5}` — and, for
every site created after BSRC-DESIGN-FOUNDATION-001, the additive
`design` block (archetype + versions, theme + versions, designSystemVersion,
heroVariant, sectionOrder, sectionVariants, density, visualStyle,
typographyDirection, colorDirection, imageStrategy, ctaStrategy, planner
metadata incl. model/provider/timestamp/fallbacks). Documents without
`design` render through the frozen legacy path. No migration is required.
Editorial sites: separate `site_editorial_settings.theme_key`.

## Part B — proposed v2 catalog (DESIGNED, NOT IMPLEMENTED)

### Archetypes (composition) — v2 entry set

| Archetype id | Succeeds / targets | Composition signature |
| --- | --- | --- |
| `industrial-bold` | forge × visual B2B (steel, construction, trades with project photos) | Full-bleed project hero, alternating image/text services, project grid, certification/trust band, strong single CTA |
| `editorial-premium` | studio/clarity × professional, beauty, consultant | Magazine rhythm, serif-led display type, numbered editorial services list, pull-quote about, restrained imagery |
| `local-service-conversion` | forge/clarity × cleaning, handyman, courier, physio | CTA-first hero (call/form), trust badges + hours near top, compact service cards, map-forward contact |
| `luxury-minimal` | the hidden gold/luxury markup, formalized | Dark hero with overlay, numbered intro, slow rhythm, generous whitespace |
| `hospitality-visual` | restaurant, hotel | Image-led hero, menu/gallery-forward sections, warm palette bands |
| `portfolio-cinematic` | photographers, creative, agencies | Masonry/large-feature projects first, minimal chrome, image-first navigation |
| `professional-corporate` | medical, legal, accounting, insurance | Structured calm: clear hierarchy, credibility block, credential/trust section, form-first contact |
| `modern-retail` | dealership, retail, showroom | Product/showcase grid, feature cards, offer/CTA bands |
| `technical-b2b` | fiber, civil engineering, B2B services | Spec-sheet rhythm: dense service list, process/timeline, certification row, quote-request CTA |
| `personal-brand` | psychotherapy, nutrition, coaches | Portrait-led hero, story about, warm testimonial band, gentle CTA |

Legacy `studio`, `clarity`, `forge` remain valid archetype ids forever (frozen
v1 renderers) so no existing document is ever orphaned.

### Section types and variants (v2)

| Section | Variants |
| --- | --- |
| `hero` | `split`, `fullscreen-image`, `editorial`, `centered-minimal`, `industrial-grid`, `video-ready` |
| `services` | `cards`, `alternating`, `icon-grid`, `editorial-list`, `horizontal-showcase` |
| `projects` | `masonry`, `large-feature`, `editorial-grid`, `carousel`, `case-study-rows` |
| `about` | `split`, `story`, `stats-led`, `image-led` |
| `contact` | `compact`, `full-conversion`, `map-details-split` |
| `testimonials` | `quote-band`, `card-row`, `single-emphasis` |
| `trust` | `badge-row`, `certification-band`, `stat-strip` |
| `team` | `portrait-grid`, `single-profile` |
| `gallery` | `grid-4` (v1 default), `masonry`, `filmstrip` |
| `cta-band` | `call`, `form`, `quote`, `none` |

Variant selection is the planner's job (content-driven: photo
count/quality, service count, project evidence, audience, CTA, brand
character), validated against each archetype's compatibility matrix;
deterministic fallback defaults are defined per archetype before
implementation.

### Themes (visual skins) — first wave, DESIGNED

`gold-noir` (formalized gold), `forge-steel` (industrial warm), `atelier-cream`
(editorial warm light), `clarity-day` (clean light). A theme = a token preset
(colors + font pairing + radius/shadow/motion character + image treatment)
defined in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), applicable to any archetype.

## P5-002 owner custom candidate

Cinematic-editorial composition with split/full-image hero and reusable sections
is a local owner preset foundation, not an automatic catalog entry. See
[custom foundation](CUSTOM_SITE_FOUNDATION.md); promotion is a separate task.
