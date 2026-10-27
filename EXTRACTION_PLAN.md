# Extraction history

> Historical record. The standalone extraction is complete. Use [README.md](README.md) and the [documentation index](docs/README.md) for current product status.

## Objective

Create an independently deployable white-label product in which business discovery supplies a neutral `PreparedBusinessProfile` and a pure website engine returns a `SiteDocument`, with no runtime dependency on a source SaaS or vertical-specific product.

## Completed isolation

- Established neutral `@platform/*` workspaces and contracts.
- Reimplemented category templates, theme selection, starter content and media mapping in a pure engine.
- Added a standalone PostgreSQL schema and repositories.
- Isolated Finder behind owner-only routes and the prepared-profile boundary.
- Added private demos, business-admin editing, self-service trials and subscription adapters.
- Added an automated boundary scan that rejects legacy and provider dependencies in the engine.

## Deliberately excluded from extraction

- Legacy brand names and vertical-specific automotive modules.
- Source-product renderers, database clients, actions and billing code.
- Workshop CRM, inventory, POS and invoice features.
- Outbound automation and generative AI.
- Complex calendar scheduling and domain provisioning.

## Continuing rule

Future features must enter through neutral contracts or provider adapters. Copying source-product modules back into the standalone repository would invalidate the isolation achieved by this extraction.
