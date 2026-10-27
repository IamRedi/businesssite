# P3 implementation specification — first three premium archetypes

Status: SPECIFICATION ONLY (BSRC-DESIGN-FOUNDATION-002). Nothing here is
implemented; implementation requires its own authorized task after the
foundation commit and review are PASS. The registry contract it extends lives
in `packages/website-engine/src/design-system.ts`; the token vocabulary it
consumes is `ds/1` ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).

Shared implementation rules (apply to all three archetypes):

1. New archetype ids are additive to `LayoutArchetypeId` and
   `archetypeContracts`; `archetypeVersion: "1"`; legacy ids and renderers
   stay frozen.
2. Every variant listed below ships with its renderer in the same task — a
   listed variant must never store as "accepted but not implemented".
3. Mobile is a composition, not a squeezed desktop: each variant defines its
   own ≤900px and 390px behavior and is pixel-reviewed at 390 (fixture
   additions required per archetype).
4. Weak/no imagery fallback: each archetype defines a type/texture-led
   fallback composition (no stock-photo substitution — the platform never
   invents imagery).
5. All styling through `ds/1` tokens; new primitives (e.g. a new shadow or
   treatment) must land as tokens first, with an evolution-log entry.
6. The planner choice space, the import prompt, and the review design card
   gain the new ids in the same task; deterministic fallback defaults are
   defined per archetype below.

---

## 1. `industrial-bold`

Target businesses: metal construction, general construction, manufacturing,
technical B2B trades with real project evidence (Demo Steel is the reference
case). Composition goal: strong project-led visual hierarchy; large
real-work imagery; capabilities; references; trust; one strong inquiry CTA.

- **Hero variants**: `industrial` (default — full-width real-work image,
  headline on a heavy scrim, spec strip under the fold line) and `split`
  (image card right, for weaker imagery). `video-ready` reserved, not in P3.
- **Section order rules**: default
  `hero → projects → services → about → gallery → contact → appointments →
  legal → footer` (project-led). Constraint: `projects` must precede
  `services` unless the understanding reports fewer than 3 project items, in
  which case the deterministic planner uses `hero → services → …`. Contact
  and legal are always present; appointments only when the business
  category supports booking (deterministic default: include inquiry CTA band
  instead).
- **Allowed section variants**: projects `large-feature` | `grid` |
  `case-study-rows`; services `alternating` | `cards`; about `stats-led` |
  `split`; contact `conversion` (single strong CTA block + details);
  hero per above.
- **Typography direction**: `sans-led` — heavy uppercase display (existing
  chrome stack, weight 900 in ds/1), tight tracking, small caps eyebrows.
- **Image strategy**: `project-led` — the largest real-work photo leads;
  imagery gets a duotone-toward-primary treatment (token
  `--ds-image-treatment`, added in this task) and every text-over-image block
  uses the `--ds-overlay-*` scrims.
- **CTA strategy**: `quote-first` — one dominant inquiry/quote button repeated
  after projects and in contact; phone secondary.
- **Density**: `regular` with `spacious` hero; sections breathe (pad-y 100px
  desktop / 64px mobile).
- **Mobile behavior**: hero image shortens (≤420px viewport height), projects
  become single-column large cards with full-bleed images, services stack
  with the image on top, CTA button becomes sticky-bottom (respecting
  `prefers-reduced-motion` for its entrance), never overlapping the
  appointment form.
- **Fallback when imagery is weak/missing**: typographic-industrial
  composition — oversized display headline, number-led capability list,
  primary-color blocks with diagonal clip motif; hero falls back to `split`
  with a solid `--ds-section-bg-invert` panel; no stock imagery.
- **Deterministic fallback design** (AI off): archetype `industrial-bold`,
  hero `industrial` (or `split` with < 2 suitable photos), projects
  `large-feature` when ≥ 3 projects else omitted from order, services
  `alternating`, theme from the matched template palette.

## 2. `editorial-premium`

Target businesses: consultants, lawyers, premium services, studios.
Composition goal: typography-led, generous whitespace, editorial hero, fewer
cards, narrative sections.

- **Hero variants**: `editorial` (default — oversized serif display headline,
  thin rule, eyebrow, no image or a small portrait-anchored image) and
  `centered` (centered-minimal for formal practices).
- **Section order rules**: default
  `hero → about → services → testimonials → gallery → contact →
  appointments → legal → footer` (narrative before offer). Constraints:
  exactly one narrative section (about) may be followed by a pull-quote band;
  services never exceed a 2-column editorial list; testimonials optional and
  only with verified content (deterministic default: omit).
- **Allowed section variants**: services `editorial-list` (numbered, no
  images) | `list`; about `story` | `split`; testimonials `single-emphasis`;
  gallery `filmstrip` (restrained, ≤ 4); contact `compact`.
- **Typography direction**: `serif-led` — display serif headline/body pairing
  at large sizes, wide leading, restrained weights; eyebrow letter-spaced
  small caps in the accent color.
- **Image strategy**: `minimal` — imagery supports, never leads; portrait or
  premises photo in about; gallery only with ≥ 4 quality photos; default
  treatment `none` (clean), hairline frames.
- **CTA strategy**: `form-first` (professional services) or `visit-first`
  (studios) — one restrained CTA; no repetition bands.
- **Density**: `spacious` — pad-y 120px desktop / 72px mobile; max text
  measure ~65ch.
- **Mobile behavior**: single column with strong vertical rhythm; hero
  headline steps down to `--ds-type-h1-compact`; services become an
  accordion-free vertical list with hairline separators; contact block is
  thumb-reachable (phone/email taps first).
- **Fallback when imagery is weak/missing**: fully typographic (this
  archetype's natural state); initial-letter or oversized-numeral motif on
  the about; hairline-ruled sections carry the composition.
- **Deterministic fallback design**: archetype `editorial-premium`, hero
  `editorial`, services `editorial-list`, about `story`, theme from the
  matched template palette mapped toward the warm-light `atelier-cream`
  direction (P4 theme; until themes ship, the template palette is kept).

## 3. `local-service-conversion`

Target businesses: local trades, hairdressers, repair, tree service, small
neighborhood businesses. Composition goal: immediate value proposition;
services; reviews/trust; contact/booking dominant; mobile-first conversion.

- **Hero variants**: `centered` (default — headline + sub-line + two CTAs
  [call / book] over a light panel with small premises image) and `split`
  (when a strong hero photo exists).
- **Section order rules**: default
  `hero → trust → services → about → contact → appointments → gallery →
  legal → footer` (conversion-led: trust immediately after the promise;
  gallery demoted below contact). Constraints: contact and appointments both
  present; trust required (badges/hours/area served from verified facts
  only — no invented review counts).
- **Allowed section variants**: services `cards` | `icon-grid`;
  trust `badge-row` (hours, service area, years where verified) ;
  testimonials `card-row` (only with verified content); about `image-led`
  (small) | `split`; contact `compact` (details card + map).
- **Typography direction**: `mixed` — friendly bold sans display, readable
  sans body, short lines; sentence case (no uppercase shouting).
- **Image strategy**: `balanced` — small authentic imagery (premises, work in
  progress); warm treatment token (`warm`); service cards keep images only
  when each service has its own verified photo.
- **CTA strategy**: `call-first` (phone prominent everywhere) with
  `form-first` as the deterministic choice when no verified phone exists.
- **Density**: `compact` — pad-y 72px desktop / 48px mobile; card-first
  layout; larger tap targets.
- **Mobile behavior**: mobile-first by construction — CTAs sticky-bottom
  (call + book), services as 1-column cards, trust badges as a horizontal
  scroll strip, hours accordion, map below the fold with consent gate
  unchanged.
- **Fallback when imagery is weak/missing**: color-panel composition —
  accent-tinted cards, icon-led service rows (abstract trade glyphs, not
  photos), hero on a light `--ds-section-bg-raised` panel; never stock
  imagery.
- **Deterministic fallback design**: archetype
  `local-service-conversion`, hero `centered`, services `cards`, trust
  `badge-row`, contact `compact`, theme from the matched template palette.

---

## Benchmark gate (P3 acceptance, unchanged from TEMPLATE_SYSTEM.md §9)

8–10 diverse synthetic businesses planned end to end; measured on archetype
spread, hero variants, section ordering, theme spread, image strategy and
visual similarity. **8/10 same-looking = FAIL.** Fixture additions: one
canonical synthetic business per new archetype rendered at 1440/1280/768/390
across de/en/sq with the weak-imagery scenario included, screenshots stored
with the private task evidence.

## Explicit non-goals for P3

Remaining archetypes (luxury-minimal formalization, hospitality-visual,
portfolio-cinematic, professional-corporate, modern-retail, technical-b2b,
personal-brand), themes as full skin presets (gold-noir/atelier-cream),
webfont loading (P5), the explicit upgrade/accept/migrate flow for existing
sites (P4), and any change to billing/auth/RLS/legal boundaries.
