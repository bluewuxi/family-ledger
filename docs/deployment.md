# Deployment

Production deployment uses SAM/CloudFormation templates under `infra/aws` when explicitly run.

## Frontend

- Build `apps/web` as a static Vite app.
- Write public runtime configuration to `apps/web/dist/config.json` during `deploy:web:<env>`.
- Host static files from a private S3 bucket behind CloudFront.
- Configure SPA routing fallback to `index.html`.
- Use CloudFront for TLS, caching, custom domains, and HTTPS redirects.

## API

- Deploy `apps/api` as Lambda functions behind API Gateway.
- Keep handlers thin and route to services.
- Configure server-side secrets outside Git.
- Use API Gateway Regional custom domains for HTTPS API endpoints.
- The API Lambda may asynchronously invoke the FX and price job Lambdas for admin-triggered data maintenance retrieval of market data.

## Jobs

- Deploy `apps/jobs` handlers as Lambda functions.
- Trigger scheduled jobs with EventBridge Scheduler.
- Current handlers include price updates, FX updates, portfolio snapshots, and ledger backups.
- Schedules are enabled by default in new stacks through `EnableScheduledJobs=true`. Set `EnableScheduledJobs=false` only when a test stack should not run unattended market-data, snapshot, and backup jobs.

## Domains

```text
test web: https://test-fund.kidrawer.com
test API: https://test-fund-api.kidrawer.com
prod web: https://fund.kidrawer.com
prod API: https://fund-api.kidrawer.com
```

Route 53 hosts DNS for `kidrawer.com`. The CloudFront certificate stack must be deployed in `us-east-1`; the main application stack is deployed in the app region and creates the Regional API certificate there.

## Infrastructure Commands

Validate and build:

```bash
corepack pnpm sam:validate
corepack pnpm sam:build
```

Test deployment sequence:

```bash
corepack pnpm deploy:certs:test
corepack pnpm deploy:change-set:test
corepack pnpm deploy:infra:test
corepack pnpm deploy:web:test
```

Production uses the same sequence with the `:prod` suffix after creating a local `infra/aws/parameters.prod.json` from `parameters.prod.example.json`.

## Scheduled Jobs

This section documents the production schedule and retry policy.

Scheduled jobs use EventBridge Scheduler, not EventBridge Rules, so cron expressions are evaluated in the configured timezone instead of being hand-converted to UTC. The default timezone is `Asia/Shanghai`.

Configure the FX update Lambda handler exported as `updateFxRates` from `apps/jobs` with:

```text
ScheduleExpressionTimezone: Asia/Shanghai
ScheduleExpression: cron(5 6 ? * TUE-SAT *)
FlexibleTimeWindow: OFF
```

Configure the price update Lambda handler exported as `updatePrices` with:

```text
ScheduleExpressionTimezone: Asia/Shanghai
ScheduleExpression: cron(10 6 ? * TUE-SAT *)
FlexibleTimeWindow: OFF
```

Configure the portfolio snapshot Lambda handler exported as `generatePortfolioSnapshots` after the FX and price jobs have normally completed:

```text
ScheduleExpressionTimezone: Asia/Shanghai
ScheduleExpression: cron(30 6 ? * TUE-SAT *)
FlexibleTimeWindow: OFF
```

Configure the ledger backup Lambda handler exported as `backupLedgerData` after the batch jobs have normally completed:

```text
ScheduleExpressionTimezone: Asia/Shanghai
ScheduleExpression: cron(0 7 * * ? *)
FlexibleTimeWindow: OFF
```

These defaults run shortly after the app's `06:00 Asia/Shanghai` business-day cutoff and before China/Hong Kong markets open. Tuesday-Saturday Beijing is a post-US-close global snapshot cadence; it captures the prior US trading day and the latest available provider-published close or unit price. It does not create a separate Monday-before-CN/HK-open snapshot. Duplicate provider dates on holidays are handled by idempotent inserts/skips.

This cadence intentionally prioritizes US/global market data over NZ PIE publication timing. Foundation Series/FundRock unit prices have been observed publishing the prior provider date around `19:00 Pacific/Auckland`, which can be after the main batch. That expected lag is not a reason to move the entire FX/price/snapshot/backup chain later. If NZ PIE freshness becomes important, add a separate FundRock-only refresh after the NZ publication window rather than delaying the main batch.

Each Scheduler target must pass the Scheduler context payload into Lambda, including `<aws.scheduler.scheduled-time>` as `time` and `<aws.scheduler.execution-id>` as `id`. The snapshot job derives the completed snapshot date from the scheduled time so retries and delayed starts do not drift across the cutoff. For the default `06:30 Asia/Shanghai` run on Tuesday-Saturday, this writes the just-finished business date, for example the `2026-06-16 06:30 Asia/Shanghai` run writes snapshot date `2026-06-15`.

Recommended Scheduler target settings:

- Maximum retry attempts: `2`
- Maximum event age: `1 hour`
- Dead-letter queue: optional before production, recommended before relying on unattended operation

The Lambda handler must throw on failed ingestion so Scheduler can retry. Duplicate retries are handled by database uniqueness constraints and repository insert-if-not-exists behavior. Each attempt creates a `job_runs` row and provider-level `data_provider_runs` row; successful duplicate attempts should record skipped rows instead of duplicate market-data records.

The stock/ETF providers currently use best-effort Yahoo Finance and Eastmoney public endpoints for enabled instruments configured in the database, plus the existing FundRock page parser for configured Foundation Series PIE funds, so no extra provider API key or secret is required. Price retries are idempotent through the `instrument_prices` uniqueness constraint and insert-if-not-exists behavior. Persisted `instrument_prices` rows are for confirmed daily closes or published unit prices; same-day rows fetched before the relevant exchange close-confirmation cutoff are skipped. FundRock/NZ PIE unit prices may lag by multiple days, including one provider day behind the snapshot date, and the latest published unit price is acceptable for snapshots.

The web Data Maintenance page can manually trigger the FX and price jobs. CloudFormation wires the job function names into the API Lambda through `UPDATE_FX_RATES_FUNCTION_NAME` and `UPDATE_PRICES_FUNCTION_NAME`, and grants `lambda:InvokeFunction` only for those two job functions. Manual invocations pass trigger metadata into the job payload and return before ingestion completes; completion status is read from `job_runs` and `data_provider_runs`.

Because only the test environment exists and production has not started, the data maintenance API surface was renamed directly without a production compatibility window. Deploy API and web together in the same test rollout so the test frontend does not temporarily call removed legacy endpoints.

The snapshot handler uses `event.detail.snapshotDate` when present for manual backfills; otherwise it derives the most recently completed snapshot date from the `06:00 Asia/Shanghai` business-day cutoff. Retries are idempotent through the `portfolio_snapshots(snapshot_date)` and `portfolio_account_snapshots(snapshot_date, account_id)` uniqueness constraints.

The ledger backup handler writes a gzipped JSON object to the private backup S3 bucket under:

```text
backups/{env}/YYYY/MM/DD/family-ledger-{env}-{timestamp}.json.gz
```

Backup objects use SSE-S3 encryption, public access is blocked, bucket versioning is enabled, and lifecycle rules expire current and noncurrent backup objects plus expired delete markers after 30 days. The backup manifest records table row counts, deterministic SHA-256 checksums, the backup version, the environment, the database RPC snapshot semantics, external Auth dependencies, and `secretsExcluded=true`. The export includes public app tables only and deliberately excludes Supabase Auth internals, frontend assets, SSM parameters, service keys, and decrypted trading account passwords.

Before exporting, and again before writing the S3 object, the backup job checks for unfinished recent `started` runs from `ingest-frankfurter-fx-rates`, `update-prices`, and `generate-portfolio-snapshots`. If any are still running within the one-hour freshness window, it marks the backup job failed with `BACKUP_BLOCKED_BY_RUNNING_JOB` and throws so EventBridge Scheduler can retry. Older stale `started` rows are logged and ignored so a crashed Lambda does not block backups forever.

Manual backup and verification commands:

```powershell
corepack pnpm backup:ledger:test
corepack pnpm verify:backup -- --file <downloaded-backup.json.gz>
corepack pnpm restore:backup:dry-run -- --file <downloaded-backup.json.gz>
```

Restore is intentionally operator-run in V1. For a fresh Supabase project, recreate Supabase Auth users first or remap user-linked rows such as `profiles`, `user_roles`, and audit user ids before loading the public ledger tables. See [`backup-restore.md`](backup-restore.md).

Historical price repair is dry-run by default:

```powershell
corepack pnpm repair:market-close-history -- --env test
```

After reviewing the suspect rows, apply the repair with:

```powershell
corepack pnpm repair:market-close-history -- --env test --apply
```

The repair writes a local JSON backup under `tmp/market-close-repair/`, deletes only unconfirmed same-day close rows, and then recalculates affected snapshots using the remaining confirmed prices. If recalculation is interrupted after deletion, rerun `corepack pnpm verify:snapshot-audit` and `corepack pnpm fix:snapshot-audit` to complete snapshot reconciliation. Production apply requires an explicit project reference confirmation:

```powershell
corepack pnpm repair:market-close-history -- --env prod --apply --confirm-prod-repair <supabase-project-ref>
```

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

Use checked-in `.env.test` for test deployment, checked-in `.env.prod` for production deployment, and ignored `.env.local` for local debugging.

The deployed web app reads public browser configuration from `/config.json` before creating the Supabase Auth client or calling the Lambda API. `scripts/deploy-aws.ts` creates that file after the Vite build from:

- `ApiDomainName` in `infra/aws/parameters.<env>.json`
- `VITE_SUPABASE_URL` in `.env.<env>`, falling back to `SupabaseUrl` in `infra/aws/parameters.<env>.json`
- `VITE_SUPABASE_ANON_KEY` in `.env.<env>`

Vite `VITE_*` variables remain useful for local dev and as a fallback when `/config.json` is absent, but deployment must not depend on Vite embedding the API URL into the JavaScript bundle.

Environment files may store SSM parameter paths, not secret values:

```text
SUPABASE_SECRET_KEY_SSM_PARAM=/family-ledger/test_supabase_secret_key
SUPABASE_URL_PARAM=/family-ledger/test_supabase_url
SUPABASE_JWT_SECRET_SSM_PARAM=/family-ledger/test_supabase_jwt_secret
SUPABASE_DB_PASSWORD_SSM_PARAM=/family-ledger/test_db_password
TRADING_PASSWORD_GATE_SSM_PARAM=/family-ledger/test_trading_password_gate
TRADING_PASSWORD_SSM_PREFIX=/family-ledger/test_trading_account_password_
```

Production uses the same names with the `prod_` prefix. Test resource names use the `test_` prefix. The Lambda infrastructure sets `TRADING_PASSWORD_GATE_SSM_PARAM` and `TRADING_PASSWORD_SSM_PREFIX`; local API debugging should provide matching values.

The extra-password gate parameter is an SSM SecureString. It starts as `empty`; after an admin sets the extra password from Settings, the API stores a salted scrypt verifier for that password. Prefer initializing it through the Settings UI. If it must be initialized manually, generate an equivalent verifier with the API code or a one-off trusted script and store it as SecureString:

```powershell
aws ssm put-parameter --name /family-ledger/test_trading_password_gate --type SecureString --value "<scrypt-verifier>" --overwrite
```

Do not store the extra password itself in SSM, env files, source files, issue comments, or logs. Existing accounts can receive placeholder trading-password parameters with:

```powershell
corepack pnpm backfill:account-trading-passwords -- --apply
```

Frontend API endpoint mirrors:

```text
.env.test: VITE_API_BASE_URL=https://test-fund-api.kidrawer.com
.env.prod: VITE_API_BASE_URL=https://fund-api.kidrawer.com
.env.local: VITE_API_BASE_URL=http://localhost:3000
```

For deployment, `VITE_API_BASE_URL` is validated against `ApiDomainName` when present. The generated `/config.json` value is derived from `ApiDomainName`, so the infrastructure parameter remains the deployed API domain source of truth.

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
- `VITE_API_BASE_URL` for local fallback only

Frontend deploy/runtime config generation:

- `ApiDomainName`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL` or `SupabaseUrl`

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

For local browser testing setup, including root `.env.local` loading, the checked-in Lambda HTTP adapter, test user roles, and troubleshooting, see [`docs/local-testing.md`](local-testing.md).

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

Apply `supabase/migrations/20260906000000_atomic_portfolio_snapshot_write.sql` before deploying the API/jobs or running snapshot repair with this code version. Snapshot writers now require its service-role-only RPC and deliberately have no non-atomic fallback. The migration defines the write function only; it does not rebuild or alter existing snapshot values. Historical rebuilding is a separate operation after backup and dry-run review.

Apply `supabase/migrations/20260907010000_link_transaction_generated_prices.sql` before deploying the API. Transaction-created historical price rows now require their source transaction foreign key so edits and deletes cannot leave stale valuation prices behind.

GitHub Actions currently installs dependencies, type-checks, and builds. Deployment workflows can be added in a later stage.
