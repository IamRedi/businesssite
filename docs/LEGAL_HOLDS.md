# Legal holds

Legal holds are a technical, scoped preservation control. They are not legal advice and do not decide whether a hold should exist.

A hold uses an opaque ID, an allowlisted typed subject reference, optional verified site/account/owner scope, one or more policy data classes, a controlled reason category, a bounded external/legal reference, timestamps and actor references. It cannot contain SQL, arbitrary table names, JSON selectors or copied subject PII.

An active hold is checked before eligibility calculation, plan creation, job claim and retry/transition. A blank data-class list is subject-wide; otherwise only declared classes are blocked. Advisory subject locks make concurrent hold creation and job claim fail safe. Creating a hold can block an active candidate job, but never deletes or modifies subject data.

Creation evidence is immutable. Release is an audited state transition with a release actor/time; released holds and history cannot be rewritten or deleted. Blocked jobs remain visible. Owner with fresh authentication can create/release; admin can read; operator, viewer, runtime and PUBLIC cannot enumerate or mutate holds.

Use the narrowest defensible subject and classes, a controlled reason, and an external reference that contains no secret or unnecessary personal content. A contract/security category is not a blanket retention exception. Release only after the responsible owner has verified the external decision.

## Customer deletion interaction

Migration 049 rechecks matching holds at deletion request, eligibility planning, provider reconciliation, owner approval, every retry and immediately before execution. A subject-wide hold blocks the workflow; a class-scoped hold marks only affected plan items `blocked_by_hold`, keeps them visible in the dry-run plan and prevents approval/execution while they remain active. Owner approval cannot override a hold. Hold rows, release history and hold-related receipts are retained and never anonymized by customer closure.
