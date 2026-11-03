# Database Instructions

Apply these instructions to `supabase`, including migrations and seeds, together with the root rules and affected API/data contracts.

- Review migration history and affected constraints, RPCs, RLS, and backup dependencies before editing schema. Trace consumers through the [data model](../docs/data-model.md), [Auth](../docs/auth.md), and affected [API contract](../docs/api.md).
- Preserve exact numeric values, foreign keys, uniqueness, and transactional integrity according to [financial values and integrity](../docs/data-model.md#financial-values); do not introduce a different financial meaning through SQL alone.
- Prepare schema changes separately from applying them. Application and verification against a shared environment follow the [Windows migration procedure](../docs/project-workflow.md#applying-database-migrations-on-windows) and [TEST migration gate](../docs/test-auto-deployment.md#independent-changes).
- Review seed effects, target assumptions, and private data before execution. Use synthetic examples rather than tracked family records; follow the [seed contract](../docs/data-model.md#seeded-instruments) and root secret/data boundaries.
- Preserve exporter allowlists, numeric serialization, identity dependencies, and restore ordering when schema changes affect [backup and restore](../docs/operations/backup-restore.md).
- Determine applied state from verified environment and release evidence, never from a migration filename or its presence in Git. Follow the [delivery workflow](../docs/project-workflow.md#delivery-scope-and-workflow) for separately authorized application.
