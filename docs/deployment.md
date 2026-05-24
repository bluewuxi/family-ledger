# Deployment

Deployment is not implemented in Stage 0.

## Future Frontend

- Build `apps/web` as a static Vite app.
- Host static files with AWS S3 Static Website Hosting.
- Configure SPA routing fallback to `index.html`.
- Optionally add CloudFront for TLS, caching, and custom domains.

## Future API

- Deploy `apps/api` as Lambda functions behind API Gateway.
- Keep handlers thin and route to services.
- Configure server-side secrets outside Git.

## Future Jobs

- Deploy `apps/jobs` handlers as Lambda functions.
- Trigger scheduled jobs with EventBridge.
- Planned jobs include price updates, FX updates, and portfolio snapshots.

## Scheduled Jobs

Phase 3 documents the production schedule and retry policy, but does not deploy AWS resources or introduce an IaC framework.

Configure the FX update Lambda handler exported as `updateFxRates` from `apps/jobs` with an EventBridge schedule:

```text
cron(0 1 * * ? *)
```

This runs daily at 01:00 UTC.

Recommended EventBridge target settings:

- Maximum retry attempts: `2`
- Maximum event age: `1 hour`
- Dead-letter queue: optional before production, recommended before relying on unattended operation

The Lambda handler must throw on failed ingestion so EventBridge can retry. Duplicate retries are handled by the database uniqueness constraint on exchange rates and the repository insert-if-not-exists behavior. Each attempt creates a `job_runs` row and provider-level `data_provider_runs` row; successful duplicate attempts should record skipped rows instead of duplicate exchange-rate records.

Configure the price update Lambda handler exported as `updatePrices` from `apps/jobs` on the same daily schedule unless a different market-data cadence is chosen later. The seeded stock/ETF providers currently use best-effort Yahoo Finance and Eastmoney public endpoints plus the existing FundRock page parser, so no extra provider API key or secret is required. Price retries are idempotent through the `instrument_prices` uniqueness constraint and insert-if-not-exists behavior.

Configure the portfolio snapshot Lambda handler exported as `generatePortfolioSnapshots` from `apps/jobs` after the FX and price jobs have normally completed. A default daily schedule can run at 02:00 UTC:

```text
cron(0 2 * * ? *)
```

The snapshot handler uses `event.detail.snapshotDate` when present for manual backfills; otherwise it uses the EventBridge event time date. Retries are idempotent through the `portfolio_snapshots(snapshot_date)` and `portfolio_account_snapshots(snapshot_date, account_id)` uniqueness constraints.

Structured CloudWatch logs should include:

```text
jobName
eventId
eventTime
status
jobRunId
recordsInserted
recordsSkipped
errorMessage
```

Do not log decrypted SSM parameter values, Supabase service keys, JWT secrets, database passwords, or raw provider responses that may include sensitive metadata.

## Secrets

Use AWS Secrets Manager or SSM Parameter Store for production secrets such as Supabase secret keys, JWT configuration, and database passwords. Do not hard-code account IDs, ARNs, credentials, or secret values.

Use `.env.test` for test and `.env.prod` for production.

Environment files may store SSM parameter paths, not secret values:

```text
SUPABASE_SECRET_KEY_SSM_PARAM=/family-ledger/test_supabase_secret_key
SUPABASE_JWT_SECRET_SSM_PARAM=/family-ledger/test_supabase_jwt_secret
SUPABASE_DB_PASSWORD_SSM_PARAM=/family-ledger/test_db_password
```

Production uses the same names with the `prod_` prefix. Test resource names use the `test_` prefix.

Supabase database connection metadata may be stored directly because it is not secret:

```text
SUPABASE_DB_HOST=aws-1-ap-southeast-2.pooler.supabase.com
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres.syotdngdmbbiuvsadtil
SUPABASE_DB_TRANSACTION_PORT=6543
SUPABASE_DB_SESSION_PORT=5432
```

For Lambda/serverless app traffic, use the transaction pooler port. For migrations or tools that need a longer session, use the session pooler port.

## Environment Requirements

Frontend build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

API Lambda and jobs Lambda:

- `SUPABASE_URL` or `SUPABASE_URL_PARAM`
- `SUPABASE_SECRET_KEY_SSM_PARAM` or `SUPABASE_SERVICE_ROLE_KEY_PARAM`
- `AWS_REGION`

Local/test DB tooling may also use:

- `SUPABASE_DB_PASSWORD_SSM_PARAM`
- `SUPABASE_DB_HOST`
- `SUPABASE_DB_NAME`
- `SUPABASE_DB_USER`
- `SUPABASE_DB_TRANSACTION_PORT`
- `SUPABASE_DB_SESSION_PORT`

The Lambda IAM role needs `ssm:GetParameter` permission for the required SSM parameter paths and KMS decrypt permission if a customer-managed KMS key is used. SecureString parameters must be read with decryption enabled.

For local browser testing setup, including root `.env.test` loading, the temporary Lambda HTTP adapter requirement, test user roles, and troubleshooting, see [`docs/local-testing.md`](local-testing.md).

Backend deployment/runtime code should:

1. Read the `*_SSM_PARAM` environment variable.
2. Call SSM `GetParameter` with decryption enabled.
3. Use the decrypted value only in Lambda API/jobs runtime memory.
4. Never expose decrypted values to `apps/web`, logs, frontend bundles, or Git.

Example CLI retrieval for local backend checks:

```bash
aws ssm get-parameter \
  --name "/family-ledger/test_supabase_secret_key" \
  --with-decryption \
  --query "Parameter.Value" \
  --output text
```

## CI/CD

GitHub Actions currently installs dependencies, type-checks, and builds. Deployment workflows can be added in a later stage.
