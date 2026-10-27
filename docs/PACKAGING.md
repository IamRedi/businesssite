# Product packaging model

This repository is distributed as a repeatable, non-exclusive white-label product. It has three layers.

## 1. Core product

The stable product source:

- `packages/website-engine`: pure profile-to-website generator.
- `packages/business-finder`: neutral discovery and prepared-profile contracts.
- `packages/site-data`: PostgreSQL persistence and lifecycle services.
- `apps/web`: owner workflow, customer portal, landing site and provider adapters.
- `db/migrations`: append-only schema history.

The core contains no buyer brand, seller customer data or buyer secrets.

## 2. Deployment package

The reproducible operating package:

- [.env.example](../.env.example): every buyer-owned setting and credential name.
- [setup](SETUP.md), [configuration](CONFIGURATION.md) and [deployment](DEPLOYMENT.md): installation and hosting instructions.
- `npm run migrate`, `npm run migrate:status` and `npm run preflight:release`.
- [apps/web/vercel.json](../apps/web/vercel.json): scheduled trial cleanup.
- GitHub CI: clean install, PostgreSQL migration check and quality gate.

Each buyer deploys to accounts they control: database, hosting, Stripe, Google, Resend and storage. The master repository receives none of those secrets.

## 3. Commercial package

The deliverable that governs resale and support:

- [LICENSE](../LICENSE): source-available evaluation license.
- [non-exclusive commercial model](COMMERCIAL_MODEL.md): commercial scope to include in the sale agreement.
- [support and update policy](SUPPORT_AND_UPDATES.md): configurable commercial policy template.
- [CHANGELOG](../CHANGELOG.md): delivered version history.
- [release checklist](RELEASE_CHECKLIST.md), [migration inventory](MIGRATION_INVENTORY.md), [deployment topology](DEPLOYMENT_TOPOLOGY.md) and [known limitations](KNOWN_LIMITATIONS.md): release evidence and accepted boundaries.

The sale agreement, legal entity details, pricing, tax, warranty and jurisdiction must be completed by the rights holder and reviewed by qualified legal counsel before sale.
