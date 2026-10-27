# Architecture decisions

## ADR-001: pure website engine

**Decision:** `PreparedBusinessProfile -> SiteDocument` is a deterministic package operation.

**Reason:** white-label reuse requires the generator to remain independent from Next.js, persistence, provider, authentication and payment choices.

## ADR-002: PostgreSQL system of record

**Decision:** leads, profile versions, generated documents, accounts, trials and subscription state share one standalone PostgreSQL schema.

**Reason:** relational constraints provide idempotency and lifecycle integrity while JSONB preserves the versioned engine contracts.

## ADR-003: explicit trust zones

**Decision:** public, business-admin, owner and internal endpoints use separate route namespaces and authentication mechanisms.

**Reason:** discovery data and platform operations must never be exposed to website customers.

## ADR-004: configured trial enforced synchronously

**Decision:** preview and admin access check expiry at request time; a scheduled job performs later physical deletion.

**Reason:** access policy must not depend on scheduler timing, while deletion remains recoverable through controlled operations and backups.

## ADR-005: provider-verified activation

**Decision:** Stripe subscription activation occurs only after a verified, idempotently recorded webhook.

**Reason:** browser redirects and customer claims are not authoritative payment evidence.

## ADR-006: source-controlled templates

**Decision:** themes, category presets and starter media mappings live in the website-engine catalog.

**Reason:** templates are versioned product code. Database storage would add editor/versioning complexity before that capability is required.

## ADR-007: separate data-driven Information presentation

**Decision:** `site_kind = information` uses the reusable World Desk public
presentation, scoped independently from business templates and populated only
from tenant-owned publication, category, article, media and editorial data.

**Reason:** a dedicated editorial hierarchy is necessary for news and magazine
content, while tenant-specific source branches would break white-label reuse
and risk leaking styles or behavior into business websites.

## ADR-008: explicit platform hosts over provider aliases

**Decision:** branded platform hosts are trusted only through explicit
configuration. Automatic provider-host trust is limited to actual
`*.vercel.app` deployment names; a non-Vercel value exposed through
`VERCEL_PROJECT_PRODUCTION_URL` is not implicitly platform-owned.

**Reason:** deployment providers can expose a customer custom domain as the
production URL. Treating that alias as a platform host bypasses the verified
custom-domain resolver and can serve the wrong tenant surface.

## ADR-009: adopt a written work standard

**Decision:** every change runs through an explicit task contract, local
verification and a recorded handoff. The private development repository keeps
the full task ledger and evidence; this public snapshot keeps only the
[verification catalog](VERIFICATION.md), [project status](PROJEKTSTAND.md) and
[evidence summary](../EVIDENCE.md).

