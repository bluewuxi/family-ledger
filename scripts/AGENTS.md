# Script Instructions

Apply these instructions to `scripts` together with the root rules; command names and local ports do not establish isolation or authorization.

- Classify actual effects, including imports, network/SDK calls, subprocesses, and environment loading, before execution. Use [command effects](../docs/local-testing.md#command-effects), not verify/smoke/dry-run naming, to determine the boundary.
- Discover checks and conservative recommendations through the [verification entry point](../docs/local-testing.md#verification-entry-point). Report blocked checks; do not bypass the runner with direct execution. DB/live/operator work follows its owning procedure and separately applicable authorization.
- Preserve reviewed dry-run/apply boundaries, target checks, and rollback/backup requirements when editing repair or migration tools. Follow [delivery scope](../docs/project-workflow.md#delivery-scope-and-workflow), [Windows migrations](../docs/project-workflow.md#applying-database-migrations-on-windows), and the relevant [operator runbook](../docs/README.md#maintained-sources).
- Keep temporary outputs in ignored local locations and sanitize diagnostics; never include credentials or private source data in tracked evidence. Follow [documentation maintenance](../docs/project-workflow.md#documentation-maintenance) and [secret handling](../docs/deployment.md#secrets).
- When changing verification behavior or dependencies, update the inventory and review effect-audit currency. A changed fingerprint requires review rather than automatic refresh; preserve the [execution contract](../docs/local-testing.md#verification-entry-point).
- Route deployment, registration, lock/recovery, backup, and repair operations to the [TEST contract](../docs/test-auto-deployment.md) and relevant [backup/repair procedure](../docs/operations/backup-restore.md). A plan or generic validation request does not authorize operator mutation.
