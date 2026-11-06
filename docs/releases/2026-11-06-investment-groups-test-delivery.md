# Investment groups: TEST delivery — 2026-11-06

## Authorization and source

The user explicitly authorized issue creation, commit and push to `test`, registration of the already-applied migration, monitoring automatic delivery and verification. SQL replay, synthetic groups and shared business-data mutations remain prohibited. [Issue #134](https://github.com/bluewuxi/family-ledger/issues/134) tracks this delivery.

The existing checkout was preserved at baseline `ca6fd745d504e2b51b72e82c2bd26192de59e1d2`. That baseline already contained one unpushed documentation commit, including the investment-group design and historical evidence archive; normal delivery includes that ancestor without rewriting history. No branch or worktree was created.

## Prerequisites and verification

The [schema-first record](2026-11-06-investment-groups-test-schema.md) contains the original transaction and compatibility evidence. A fresh read-only check before registration confirmed all three tables, both RPCs, RLS, client-denied direct privileges, the backup encoding marker and empty configuration at revision `0`. The application stack was stable and no deployment lock was held. Registration will attest the complete clean committed migration manifest; it does not execute SQL.

Local lint, typecheck, build and the audited core/group checks are rerun for delivery. Earlier isolated PostgreSQL/backup restore and independent review are recorded in the [plan](../plans/2026-11-06-investment-groups.md). [Authenticated acceptance](2026-11-06-investment-groups-local-acceptance.md) covers the local client, both themes, all five viewports, administrator drawer and viewer presentation. Shared write scenarios remain excluded; deployment verification does not turn those scenarios into passed acceptance.

## Publication

Feature commit `f41834062270564f6909a67e4c8d901d06e0d342` was created and pushed. Complete migration approval was registered at `2026-11-06T08:57:36.519Z`, with evidence `#134`; readback matched all 61 committed migration files and confirmed lock release. The longer evidence path exceeded standard record size before writing; the documented concise issue reference preserved the full manifest without a storage change. No SQL was replayed.

The [first CI run](https://github.com/bluewuxi/family-ledger/actions/runs/42191527900) passed lint/typecheck/build, then failed in the existing tooling fixture's immediate descendant-PID disappearance assertion. Deployment did not start. The same tooling fixture passed locally on Windows. The Unix adapter kills the process group, while the fixture probed PID existence immediately after the direct child closed; group termination/reaping need not complete in that order. The corrective fixture waits up to five seconds for `ESRCH` for timeout and cancellation, still failing for a surviving process or permission error. It changes no runtime termination or deployment gate. Effect review: bounded local process probes and timer only, no credentials/network/new child commands; its registry fingerprint was updated after that review.

Corrective commit `99941b0c901f5cf7197a3dbfddcf8cb4a2ec5b96` passed [CI and automatic TEST deployment](https://github.com/bluewuxi/family-ledger/actions/runs/42192115414). Ubuntu tooling/process tests, documentation checks and all core checks passed. The complete manifest approval remained valid without re-registration. `last-success` and verified status advanced at `2026-11-06T09:08:06.567Z` (22:08 NZDT); artifact SHA-256 is `14b6b44043e27a04a8d9f8c4cd385eca238dff7b37ed5bdab8fdab39af990b0e`.

The automatic workflow verified API health, unauthenticated rejection, runtime configuration and exact published HTML/entry assets against its build, after backend update and CloudFront invalidation. Independent read-only checks afterward confirmed health/auth/configuration, served JS/CSS assets, stable `UPDATE_COMPLETE`, released lock and the same success pointer. At `2026-11-06T09:08:53.852Z`, configuration still contained zero groups and revision `0`; schema/RPC/RLS/client-denial checks remained valid. No group or shared business-data mutations, SQL replay, manual deployment or job invocation occurred.

The compatible format-16 writer is now delivered with the jobs code. A real scheduled format-16 cloud backup run was not invoked or accepted by this delivery; prior local exact-export/file-preflight and isolated restore evidence remain separately recorded. Local authenticated acceptance is unchanged; no new deployed-login acceptance is claimed. Follow-up evidence documentation uses the normal documentation-only CI/skip contract.
