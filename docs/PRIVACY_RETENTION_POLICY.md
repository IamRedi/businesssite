# Privacy retention policy

Task Group 4-B3 leaves Policy v1 and hash `ecd7d93ded8744dee6b379e4f883e1f11d61909153952e2090a542575d6865af` unchanged. Migrations 048–049 map export/deletion workflow ledgers to existing classes without silently changing the policy version.

Status: Policy v1 is the owner-approved **technical baseline** implemented by migration `047_privacy_retention_job_foundation.sql`. It is not legal, tax or production certification.

The canonical source is `config/privacy-retention-policy-v1.json`. Its normalized SHA-256 is `ecd7d93ded8744dee6b379e4f883e1f11d61909153952e2090a542575d6865af`. `npm run check:privacy-policy`, setup and release preflight reject an unknown class/store, a changed manifest without a new version, missing inventory coverage, multiple/invalid active versions, or automatic disposition of contract/billing/accounting evidence.

Migration 072 maps `site_information_sponsor_banners` to the existing
`media_content` class. Its rows are included in the customer export and deletion
functions; the approved Policy v1 hash and retention rules remain unchanged.

Migration 073 maps `site_complimentary_access` to the existing
`active_subscription` class. The entitlement row is included in the customer
export projection and cascades with the site; the approved Policy v1 hash and
retention rules remain unchanged.

## Policy v1

| Data class | Trigger and period | Disposition | Automatic | Important boundary |
|---|---|---|---|---|
| Appointments | created + site option 90/180/365 days; 180 default | anonymize | policy candidate | tenant option is constrained in DB; no B1 executor |
| Finder cache | expiry / 30 days | delete | yes | existing bounded cache cleanup only |
| Abandoned Finder searches | last activity + 90 days | delete | policy candidate | dry-run in B1 |
| Qualified leads | qualified + 365 days | anonymize | policy candidate | dry-run and relationship verification in B1 |
| AI detail | completed + 90 days | delete | policy candidate | prompts/output/errors are not put in job records; no B1 executor |
| Usage events / aggregates | 90 days / 14 months | delete | approved existing cleanup | aggregate window is monthly |
| Canceled-customer recovery | 30 days read-only + 30 days pending deletion | manual review | no | active subscription blocks eligibility |
| Export artifact | created + 24 hours | delete | policy candidate | no artifact or executor exists in B1 |
| Security audit | created + 12 months | manual review | no | scoped legal holds apply |
| Webhook/REDI evidence | processed + 90 days | delete | policy candidate | provider reconciliation required; no B1 executor |
| Ephemeral security records | their existing expiry | delete | approved existing cleanup | tokens/secrets never enter receipts |
| Media/content | active + export/cooling/reconciliation | manual review | no | no Blob/provider deletion in B1 |
| Active subscriptions | verified effective end | retain | no | never deleted by the planner |
| Owner account | disable/revoke, transfer last-owner, then anonymize | manual review | no | last-owner invariant remains authoritative |
| Contract/billing/accounting | legal trigger not yet approved | manual review | no | `legal_review_required=true` |
| Trial/demo | recovery end + 30 days | delete | approved existing cleanup | any subscription row blocks deletion |

The registry has 17 normalized rules covering all 66 database tables after migration 058 and ten inventoried external/provider stores. It describes technical handling; it does not invent statutory periods.

## Change and activation rules

An activated policy and its rules are immutable. A future change clones to a new draft/version, records a new canonical manifest and hash, then requires an owner with fresh password and non-replayed MFA to activate it. There is exactly one active valid policy. Historical jobs keep their original `policy_version_id`, snapshot and hash evidence.

`PRIVACY_RETENTION_EXECUTION_ENABLED=false` is the default and required B1 posture. The scheduler may create and calculate dry-run retention scans, but no registry-driven destructive executor exists. Existing independently approved expiry cleanup remains bounded to its prior classes plus expired Finder cache.

## Backup target

The approved technical target is RPO no more than 24 hours, RTO no more than 8 hours, 30 daily recovery points and a quarterly isolated restore drill. The repository now provides and locally verifies the guarded logical backup/restore and signed post-restore deletion-suppression mechanism described in the recovery runbook. It still does not enable a Production schedule/store or prove the current Free provider plan meets 30 recovery points; those remain Production blockers.
