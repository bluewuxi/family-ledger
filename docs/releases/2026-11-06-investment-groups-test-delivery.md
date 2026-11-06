# Investment groups: TEST delivery — 2026-11-06

## Authorization and source

The user explicitly authorized issue creation, commit and push to `test`, registration of the already-applied migration, monitoring automatic delivery and verification. SQL replay, synthetic groups and shared business-data mutations remain prohibited. [Issue #134](https://github.com/bluewuxi/family-ledger/issues/134) tracks this delivery.

The existing checkout was preserved at baseline `ca6fd745d504e2b51b72e82c2bd26192de59e1d2`. That baseline already contained one unpushed documentation commit, including the investment-group design and historical evidence archive; normal delivery includes that ancestor without rewriting history. No branch or worktree was created.

## Prerequisites and verification

The [schema-first record](2026-11-06-investment-groups-test-schema.md) contains the original transaction and compatibility evidence. A fresh read-only check before registration confirmed all three tables, both RPCs, RLS, client-denied direct privileges, the backup encoding marker and empty configuration at revision `0`. The application stack was stable and no deployment lock was held. Registration will attest the complete clean committed migration manifest; it does not execute SQL.

Local lint, typecheck, build and the audited core/group checks are rerun for delivery. Earlier isolated PostgreSQL/backup restore and independent review are recorded in the [plan](../plans/2026-11-06-investment-groups.md). [Authenticated acceptance](2026-11-06-investment-groups-local-acceptance.md) covers the local client, both themes, all five viewports, administrator drawer and viewer presentation. Shared write scenarios remain excluded; deployment verification does not turn those scenarios into passed acceptance.

## Publication

Pending the committed source, migration registration and configured automatic CI/TEST workflow. No manual application deployment or repeated migration is part of this procedure. Record the actual commit, registration and run evidence after verification; do not infer success from a push alone.
