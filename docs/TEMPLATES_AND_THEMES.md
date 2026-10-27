# Website templates and themes

The generated-website system is intentionally data driven. Business-category selection, visual defaults and starter media belong to the standalone website engine; rendering belongs to the web application. Finder, billing and persistence are not template dependencies.

## Runtime flow

1. The engine receives a `PreparedBusinessProfile`.
2. `selectBusinessTemplate` matches the normalized category and subcategory against multilingual match terms. The longest matching term wins; catalog order is used only as a stable tie-breaker, so a narrow subcategory cannot be captured by a broad earlier term.
3. The selected template supplies its layout, colors, preferred design preset, hero asset and dedicated media pack when available.
4. `demoMediaFor` supplies distinct service and gallery assets for that exact template key. Semantically sensitive subcategories must use `starterMedia` rather than a broad category fallback.
5. `generateSiteDocument` combines verified profile data with localized starter content and demo defaults.
6. The renderer uses only the resulting `SiteDocument`.

`auto` is the recommended editor setting. It preserves category-aware styling. A business owner may override it with Studio, Clarity, Forge or Gold without changing the selected category content and media.

## Shared media-pack policy

Media is selected from a deterministic, approved pack and is persisted in the `SiteDocument`; the same profile never receives an unreviewed random asset at render time. A hero image is never reused as a service or gallery image.

| Pack | Allowed templates | Why sharing is accurate | Not allowed |
| --- | --- | --- | --- |
| `cleaning-core` | window, office, facility and home cleaning | Home surfaces, workspace care and glass-detail work are normal, truthful services across these cleaning businesses. | No specialist medical, beauty or unrelated premises imagery. |
| `logistics-core` | courier and local delivery | Collection, route preparation and delivery handover are core to both services. | Moving, storage or house-removal imagery. |
| `moving` | moving only | Planning, careful packing and safe transport are specific to removals. | Courier/local-parcel pack. |
| `pet exact specialist` | veterinary, grooming, dog training and pet wellness | Care context, equipment and customer expectations differ materially between the four services. | Any cross-pet-specialist fallback image. |
| `health & care exact specialist` | medical practice, dental practice, home/elderly care and psychotherapy | The premises, privacy expectations, care relationship and permissible wording are materially different. Each template uses only its own dedicated hero and service pack. | Wellness, beauty, veterinary or another health/care specialist's imagery; diagnosis, cure or outcome claims without verified source facts. |
| `trade exact specialist` | electrician, plumbing/heating, locksmith and handyman | The tools, safety context and promised work differ materially. Each template uses only its approved pack. | Cross-trade or hero-as-service fallback imagery. |
| `garden-core` | landscaping and garden maintenance | Design discussion, planting and careful routine pruning are accurate across these two non-arborist garden services. | Tree-service PPE/equipment or irrigation-system imagery. |
| `tree-service` and `irrigation` | their matching template only | PPE, elevated pruning, chipper work, tubing and sprinkler systems are specialist contexts. | Cross-specialist fallback imagery. |
| `construction-core` | house construction and broad construction | Planning, structural coordination and interior finishing are accurate general building contexts. | Crane, civil, fibre or glass-facade imagery. |
| `crane`, `civil`, `fiber` and `glass-facade` | their matching template only | Each has materially different safety equipment, technical scope and customer expectation. | Cross-specialist construction imagery or a hero reused as a service image. |
| `exact specialist` | beauty, wellness, automotive, food, professional services and future technical packs | Different equipment, audiences, premises or claims would make sharing misleading. | Cross-specialist fallback imagery. |

When a new template is added, decide first whether it belongs to an existing documented pack or requires an exclusive pack. Update this table, add the approved filenames to `starterMedia`, add tests and register every new image in the asset audit. Do not use runtime random selection for persisted demos: variation may be designed later as a reviewable, seed-based choice, but it must stay within the approved pack.

## Add a business template

1. Add the project-owned hero, service and gallery images under `apps/web/public/images/templates/`.
2. Register their provenance in `docs/ASSET_AND_LICENSE_AUDIT.md` before release.
3. Add one `BusinessTemplate` entry to `packages/website-engine/src/template-catalog.ts` with a unique subcategory `key`, a layout, multilingual search terms, colors and an optional `preferredTheme`.
4. Add a template-specific `starterMedia` set whenever another subcategory's people, premises, tools, treatment or products would be inaccurate. Restaurant, fast-food, every beauty/wellness or professional-services specialist, auto-repair, car-dealership and similarly sensitive packs must never share fallback imagery. Do not reuse the hero as a service or gallery image.
5. Add localized starter services/copy when the category needs wording beyond the safe generic defaults.
6. Add or extend tests in `packages/website-engine/test/generate.test.ts` for selection, theme and media separation.
7. Run the full quality suite and visually inspect desktop and mobile preview output.

## Add a design preset

1. Extend `ThemeSelection` in `packages/website-engine/src/contracts.ts`.
2. Add its customer-facing metadata to `designPresets` in `packages/website-engine/src/template-catalog.ts`.
3. Define how `resolveSiteDesign` maps the preset to a layout and color tokens.
4. Add any renderer-specific class behavior in `apps/web/components/site-preview.tsx` and `apps/web/app/styles.css`.
5. Add selection and persistence coverage. The client editor reads the shared preset catalog and must not maintain a second list.

## Business information and opening hours

Opening hours are part of `PreparedBusinessProfile.business` and `SiteDocument.contact`. If a verified source supplies hours, the engine preserves them. Otherwise a demo receives editable starter hours so the preview is complete. These defaults are not provider-verified facts and must be reviewed by the business owner before publication.

The editor keeps each weekday separate. An empty opening or closing time marks that day closed. Contact cards, hours and the address-based Google Maps embed are shared across all layouts.

## Release checklist

- Category matching is deterministic and has a safe fallback.
- Hero, service and gallery images are visually related but not duplicated.
- Text contrast passes on image overlays and light surfaces.
- Contact information, hours and map remain readable at 320 px width.
- Appointment requests include a required date and time.
- All generated copy is localized through the website-engine locale catalog.
- New image provenance and package/license changes are documented.
- AI instructions receive the catalog keys and their match terms, choose the narrowest supported subcategory, and may not broaden specialist services or audiences.
