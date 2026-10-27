# Development standards

Follow [local setup](SETUP.md) before changing the repository and [testing](TESTING.md) before handoff.

## Boundaries

- `website-engine` is deterministic and side-effect free.
- Finder reaches the generator only through `PreparedBusinessProfile`.
- Database, provider, authentication and billing behavior live outside the engine.
- Owner-only code remains under owner routes and may not leak into customer APIs.
- Generated sites consume `SiteDocument`; they do not query Finder records.

The automated boundary scan is necessary but not sufficient. Review imports and runtime data flow whenever a package contract changes.

## Database changes

Use the next sequential filename in `db/migrations`. Migrations must be forward-compatible, reviewed against existing data and documented in `DATA_MODEL.md`. Never modify a migration that may have been applied.

## Environment changes

Every new variable requires a safe placeholder in `.env.example` and an entry in `CONFIGURATION.md`. Server secrets must not use the `NEXT_PUBLIC_` prefix.

## Media

Browser uploads are converted to WebP and currently stored in PostgreSQL. Keep the media API contract independent from storage so a production object-storage adapter can replace the repository without changing `SiteDocument`.

## Commit hygiene

Preserve user changes, keep commits focused and do not commit `.env.local`, logs, build output, customer payloads or temporary screenshots. Update `CHANGELOG.md` for customer-visible changes.
