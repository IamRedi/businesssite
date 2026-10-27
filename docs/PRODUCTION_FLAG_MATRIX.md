# Production flag matrix

Status: intended controlled-pilot safety contract on 2026-09-05, not a readout of Production secret values. Production remains **NO-GO**.

| Control | Intended state | Guard |
| --- | --- | --- |
| `DATABASE_RLS_MODE` | Enforced only after provider-role/preflight proof | Distinct runtime/owner/system identities; no application BYPASSRLS |
| Legal configuration and EN/DE documents | No activation until professional review | `draft-1` is never relabelled; missing reviewed evidence fails closed |
| Customer onboarding, paid checkout, Stripe Portal | OFF | B6E legal and provider lifecycle acceptance first |
| Resend launch-critical mail | OFF | EN/DE delivery matrix first |
| `PRIVACY_RETENTION_EXECUTION_ENABLED` | OFF | No registry-driven destructive retention |
| `PRIVACY_DELETION_REQUESTS_ENABLED` | OFF | No Production deletion request |
| `PRIVACY_DELETION_EXECUTION_ENABLED` | OFF | No destructive customer deletion |
| Provider cleanup/reconciliation | OFF | No provider mutation |
| `PRIVACY_EXPORT_ENABLED` | OFF | No Production export before legal/store/key/scheduler acceptance |
| `PRIVACY_SCHEDULER_ENABLED` | Operations-only no-op where configured | Authenticated, bounded, lease-protected and kill-switchable |
| `PRIVACY_SCHEDULER_NOOP` | ON | Retention/deletion/cleanup/reconciliation/export execution skipped |
| Central telemetry/monitoring | Bounded operational signals only | No secrets/customer payloads |
| Synthetic operational probe | OFF except approved acceptance window | Restore OFF after run |
| Deployment Protection | ON | No public operational route; temporary bypass only with separate authority |
| Active Protection Bypass | Zero by default | Never reuse compromised credential |
| Google, OpenAI, Paddle, REDI CONTROL/Social | OFF/fail-closed | Separate legal/provider acceptance first |
| Customer public legal identity | No public customer release until complete | Required gate only after approved identity/privacy notice |
