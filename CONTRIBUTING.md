# Contributing

## Change standard

Every change must preserve the boundaries in `ARCHITECTURE.md`, include tests proportional to risk and update affected documentation. Do not commit secrets, customer data, generated build output or unlicensed assets.

## Workflow

1. Read `docs/PROJEKTSTAND.md`, `EVIDENCE.md` and `docs/VERIFICATION.md`.
2. Confirm one authorized task contract, its scope, non-scope, acceptance criteria, stop conditions and Git/external authority.
3. Capture branch, HEAD, upstream divergence and the complete tracked/untracked worktree state.
4. Add or update tests before changing public contracts or persistence behavior.
5. Add a new numbered migration; never rewrite an applied migration.
6. Run the task-selected verification levels and record exact evidence; lower-level tests never prove hosted/provider acceptance.
7. Run `npm run quality` before handoff unless the task records an exact blocker.
8. Review the diff for secrets, tenant data, stale claims and unrelated edits.
9. Record a handoff before requesting review. Do not start the successor task.
10. Commit, push, deploy and accept only when each action is separately authorized.

Task lifecycle:

`planned -> authorized -> in_progress -> locally_implemented -> verified -> reviewed -> accepted -> committed -> pushed -> ci_verified -> deployed`

Use `blocked`, `incomplete`, `failed`, `deferred`, `superseded` or `cancelled` explicitly when applicable.

## Definition of done

- Acceptance behavior is verified.
- Type checking, lint, tests, boundary checks, documentation checks and build pass.
- New environment variables appear in `.env.example` and `docs/CONFIGURATION.md`.
- New routes, tables and operational duties appear in the relevant documents.
- Security and rollback impact has been reviewed.
- `docs/PROJEKTSTAND.md` and `EVIDENCE.md` agree with the change.
- Commit, push, CI, deployment and Production states are reported separately.
