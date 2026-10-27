# Template system — target architecture

Status update 2026-10-01: **Phases P1 and P2 are IMPLEMENTED** through
`BSRC-DESIGN-FOUNDATION-001` (ds/1 token layer with 38/38 pixel-identical
regression; design pipeline v2 with plan decisions surviving to the renderer;
gold de-conflation; full document versioning; fail-safe validation). The
`SiteDocument.design` block, the plan v2 fields and the versioning described
below are live code for **new sites only** — every document created before
this change renders through the frozen legacy path (JSONB additive, no
migration, no auto-upgrade). Phases P3–P5 (premium archetypes, catalog
completion, explicit upgrade flow, premium visual bar) remain DESIGNED /
NOT IMPLEMENTED and require their own authorization.

Original design status: accepted as the phase-1 output of `BSRC-DESIGN-AUDIT-001`
(2026-10-01). Current-state facts live in
AUDIT_2026-10-01.md and
[TEMPLATE_CATALOG.md](TEMPLATE_CATALOG.md).

## 1. Definitions (the separation that matters)

| Concept | Owns | Lives in |
| --- | --- | --- |
| **Layout archetype** (`archetype`) | Composition: hero form, section inventory + order, grid and rhythm | `SiteDocument.design.archetype` + renderer branches |
| **Theme** (`themeId`) | Visual identity: color tokens, font pairing, radius/shadow/motion character, image treatment | `SiteDocument.design.themeId` + token presets |
| **Business starter catalog** (`templateKey`, today's 50) | Category starter media + starter copy + keyword matching for cold starts | Unchanged data; no longer implies composition |
| **Design system** (`designSystemVersion`) | The versioned token vocabulary (type scale, spacing, radius, shadow, motion, containers) | `DESIGN_SYSTEM.md` + stylesheet |
| **Build plan** (planner contract) | The AI's explicit design decision + its reasons | `WebsiteBuildPlan` v2 |

Rule: **a theme never changes composition, and an archetype never hardcodes
colors.** Today's conflation (`resolveSiteDesign` letting a theme replace the
layout, `gold` acting as a hidden 4th layout) is retired: the luxury markup
becomes the `luxury-minimal` archetype; `gold` becomes a real theme
(palette + serif-led pairing + image treatment) usable on any archetype.

## 2. SiteDocument v2 `design` block (additive, optional)

```ts
design?: {
  archetype: string;            // e.g. "industrial-bold"
  archetypeVersion: string;     // e.g. "1"
  themeId: string;              // e.g. "gold-noir"
  themeVersion: string;         // e.g. "1"
  designSystemVersion: string;  // e.g. "ds/1"
  sectionOrder: string[];       // subset of the archetype's allowed sections
  sectionVariants: Record<string, string>; // { hero: "fullscreen-image", services: "alternating", … }
  density: "compact" | "regular" | "spacious";
  imageStrategy: "hero-led" | "project-led" | "balanced" | "minimal";
  ctaStrategy: "call-first" | "form-first" | "quote-first" | "visit-first";
  typographyDirection: "serif-led" | "sans-led" | "mixed";
  colorDirection: "dark" | "light" | "split";
  visualStyle: string;          // planner's one-word character, e.g. "bold"
  planner: {
    plannerVersion: string;
    generatorVersion: string;
    aiProvider?: string;        // omitted for deterministic plans
    aiModel?: string;
    planSource: "ai" | "deterministic";
    decidedAt: string;          // ISO timestamp
    sourceContentHash?: string; // import content hash when applicable
  };
};
```

- Absence of `design` = a v1 document; it renders through the frozen v1 path
  (current `SitePreview` behavior) with byte-identical markup order.
- The existing fields (`template`, `templateKey`, `themeKey`, `theme`) remain
  the source of truth for v1 documents and stay populated for v2 documents as
  a compatibility mirror until the deprecation task says otherwise.
- No database migration is required to *store* this (JSONB); a later,
  separately authorized migration may add queryable columns only if a product
  need appears.

## 3. Renderer contract (versioned)

- The renderer selects the code path from the document, never from deploy-time
  state: `design` present and archetype recognized → archetype renderer vN;
  otherwise → legacy v1 path. Unknown archetype values fail closed to the
  legacy path (never to a broken page).
- Archetype renderers are new components; the legacy `SitePreview` markup is
  frozen (bug fixes only, no visual drift) so existing public sites never
  change without an explicit upgrade.
- Shared section components (gallery, contact, appointments, legal) are
  refactored behind variant props; v1 layouts keep calling them with today's
  variants.

## 4. WebsiteBuildPlan v2 (AI design planner)

Extends the existing plan (language/themeKey/templateKey/hero/about/services/
projects/trust/contact/needsHeroImage/notes) with explicit, enum-bounded
design decisions, each with a short `reason` for explainability:

- `layoutArchetype` (enum over the archetype catalog; legacy `studio/clarity/
  forge` remain valid values during transition)
- `themeId` (enum over themes; `auto` allowed)
- `sectionOrder` (ordered subset, validated against the archetype's allowed
  sections and invariants — e.g. contact never before hero)
- `sectionVariants` (map, validated per section type)
- `density`, `visualStyle`, `typographyDirection`, `colorDirection`,
  `imageStrategy`, `ctaStrategy`
- ranked `alternatives` (top-3 archetype/theme candidates with scores) so the
  diversity guard can pick deterministically among near-equal options (§5)

Planner inputs stay the `WebsiteUnderstanding` material: business type,
audience, service count/confidence, project evidence, photo count/quality,
CTA, brand character. The deterministic (no-AI) path gets an equivalent
rule-based `designPlanFor(templateKey, understanding)` fallback so AI-off
deployments still emit a valid plan.

The import review UI gains a compact "design" card (archetype, theme,
variants, order preview + reasons); Create must submit the plan's design
fields, and both creation flows (wizard + owner complimentary) must pass them
into generation. This fixes the discarded-plan defect found in the audit.

## 5. Diversity guard (intentional + deterministic + explainable)

- The planner scores candidates; a **deterministic seed**
  `sha256(sourceContentHash + siteLocale + plannerVersion)` breaks ties among
  candidates within a small score delta.
- Same input → same site (regeneration is reproducible); materially different
  content (photo count/quality, services, projects) shifts scores and seed
  inputs, so same-category businesses diverge without uncontrolled randomness.
- Every choice is recorded with its reason and rank; the review UI shows it.
- Guard telemetry (per-phase counters: archetype/variant distribution) is
  added to the phase-3 benchmark, not to customer surfaces.

## 6. Versioning and explicit upgrades (critical)

Every generated document records `design.planner.*` (versions, model,
provider, timestamp, source hash) as in §2. Rules:

1. Rendering is pinned by the versions in the document; changing renderer or
   token code never mutates stored documents.
2. Upgrades are explicit: **Preview upgrade → owner/customer Accept →
   migrate** (regenerate the design block through the new planner; content,
   media, legal identity, slug, accounts untouched; the previous document
   version is retained for rollback).
3. A template/archetype breaking change bumps `archetypeVersion`; a visual
   change bumps `themeVersion` or `designSystemVersion`; every bump requires
   an entry in TEMPLATE_EVOLUTION_LOG.md with the
   affected-population and migration fields.
4. The trial/self-service flow may auto-upgrade only documents that are still
   `private` and younger than the accept window defined in the implementing
   task; public sites always require explicit acceptance.

## 7. Backward compatibility guarantees

- Existing `sites.generated_document` rows are untouched by the rollout (the
  design block is additive; v1 render path frozen).
- Site editor: `themeKey` radio continues to work for v1 documents; for v2
  documents it becomes the theme picker over themes (composition untouched).
- Owner demos/apply paths keep their current contracts; they gain optional
  design fields.
- Information/editorial sites are out of scope entirely.
- Product boundaries hold: archetype/theme catalogs stay neutral (no
  product/person/brand names), framework-independent, and inside
  `packages/website-engine` + `packages/ai-assistant` contracts.

## 8. Documentation duties (from now on)

No template/design/theme change is DONE without:

1. An entry in TEMPLATE_EVOLUTION_LOG.md (date,
   version, commit, affected templates/themes, before, after, reason,
   evidence link, compatibility, sites affected, migration required YES/NO,
   rollback path).
2. Catalog updates ([TEMPLATE_CATALOG.md](TEMPLATE_CATALOG.md)) and, for token
   changes, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
3. The standard control-plane updates: STATUS, TASKS ledger entry, evidence
   record; CHANGELOG only when customer-visible.

## 9. Visual regression and benchmark duties

- Canonical fixtures: one synthetic business per archetype (long name, many
  services, few services, no photos, many photos, landscape logo, square
  logo) rendered at 1440 / 1280 / 768 / 390 and across all six locales;
  screenshots stored as task evidence.
- Benchmark: 8–10 diverse synthetic businesses (steel/construction,
  restaurant, hairdresser, lawyer, auto service, hotel, tree service,
  consultant, retail, photographer) planned end-to-end; measured on archetype
  spread, hero variants, section ordering, theme spread, image strategy and
  visual similarity. **8/10 same-looking sites = FAIL.**

## 10. Implementation phases (each needs its own authorized task)

1. **P1 — Safety baseline.** Design-token refactor of the existing generated-site
   CSS with zero visual change; fixture harness + visual regression evidence;
   freeze v1 renderer as "legacy".
2. **P2 — Plan v2 + design block.** `WebsiteBuildPlan` v2 schema, `design`
   block in `SiteDocument`, deterministic fallback planner, apply the plan's
   design fields in wizard/import/owner flows (fixes the discarded-plan
   defect), review-UI design card. Diversity guard live (still over 3
   archetypes).
3. **P3 — First 3 premium archetypes** (`industrial-bold`,
   `editorial-premium`, `local-service-conversion`) with hero + services +
   projects/contact variants; run the benchmark; evidence.
4. **P4 — Catalog completion.** Remaining archetypes, projects/about/contact
   variant sets, themes as full skins (gold-noir first), explicit
   upgrade/accept/migrate flow for existing sites.
5. **P5 — Premium quality bar.** Self-hosted font pairings, image treatments,
   motion tokens, dark/light section composition; full 6-locale × device
   regression evidence; CHANGELOG.

## 11. Blast radius estimate

- `packages/website-engine` (contracts, generate, new catalog) — medium.
- `packages/ai-assistant` (plan schema v2, versioned; `ANALYSIS_VERSION` bump)
  — small.
- `apps/web` renderer + `styles.css` — largest surface; contained to the
  generated-site block + new archetype components.
- `apps/web` flows (trials, import review/apply, owner complimentary, owner
  AI apply, site editor) — small per flow, all touching only the submission/
  generation boundary.
- Database — none required for P1–P3 (JSONB additive); optional later.
- Untouched: billing, auth/accounts, RLS, legal gates, InfoEsencë, custom
  domains, privacy pipeline. Existing sites: zero visual change by
  construction.

## P5-002 custom composition candidate

Additive owner opt-in custom/1 composition/media and custom-preset/1 JSON format
are implemented locally. See [custom foundation](CUSTOM_SITE_FOUNDATION.md)
for contracts, routes, migration, backup/privacy and operations. Automatic/import
planners and stored-site upgrades remain outside this candidate.
