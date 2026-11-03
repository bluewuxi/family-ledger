# Jobs Instructions

Apply these instructions to `apps/jobs` together with the root rules and all affected investment, data, and time contracts.

- Reuse provider interfaces, job/provider run logging, idempotent persistence, Scheduler metadata, and runtime secret handling from [jobs guidance](../../docs/project-workflow.md#jobs-and-market-data).
- When changing snapshots, preserve revision-checked publication, pending repair tokens, bounded catch-up, and retry behavior. Read the [snapshot contract](../../docs/data-model.md#portfolio-valuation-snapshots) before changing calculation or publication paths.
- Keep provider/valuation dates distinct from acquisition instants and execution time. Derive scheduled defaults from event metadata using the [time policy](../../docs/time-policy.md) and [scheduling contract](../../docs/deployment.md#scheduled-jobs).
- Preserve failed-run signaling so Scheduler can retry; duplicate attempts must retain the existing idempotency and audit behavior in the [scheduling contract](../../docs/deployment.md#scheduled-jobs).
- Preserve backup table allowlists, exact numeric serialization, consistency, and job-overlap guards. Review [backup operations](../../docs/operations/backup-restore.md) and [architecture](../../docs/architecture.md#boundaries) before changing export or restore dependencies.
- Establish a clear data-source decision before adding a provider or scraping approach. Preserve published-price, confirmed-close, explicit-estimate, and live-quote distinctions in the [market-data contract](../../docs/data-model.md#market-data-foundation).
