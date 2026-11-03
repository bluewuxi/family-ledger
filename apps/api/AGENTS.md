# API Instructions

Apply these instructions to `apps/api` together with the root rules and all reading routes triggered by the affected behavior.

- Keep HTTP parsing in handlers/routes, business decisions in services, persistence in repositories, and session/role checks in auth; follow [code organization](../../docs/architecture.md#code-organization).
- Trace current authorization and effective account scope before financial calculations, counts, ordering/pagination, and private cache reads. Preserve scope/revision identity in history caches; consult [Auth](../../docs/auth.md#enforcement) and the [account visibility boundary](../../docs/architecture.md#account-visibility-boundary).
- Preserve fail-closed HTTP request context, including an empty selected scope. Keep the existing trusted batch/fixture path outside HTTP distinct; never remove request context to obtain full-ledger access. See [account visibility](../../docs/api.md#account-visibility-and-management).
- Trace DTO and validator changes through jobs, web clients, and shared consumers. Check the affected [API contract](../../docs/api.md) and [persistence contract](../../docs/data-model.md) before changing response or write behavior.
- Preserve sanitized API failures and the narrowly defined application-secret response exception; follow the [response contract](../../docs/api.md#response-contract) and [secret boundaries](../../docs/auth.md#secret-boundaries).
- Select affected checks through [local verification](../../docs/local-testing.md#verification-entry-point); fixtures do not establish deployed authorization or authenticated browser acceptance.
