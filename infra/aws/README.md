# AWS Infrastructure

AWS resources are deployed from this directory with SAM/CloudFormation when explicitly requested.

Current infrastructure templates cover:

- Private S3 bucket for `apps/web` build output
- CloudFront distribution with HTTPS, Origin Access Control, and SPA fallback
- API Gateway and Lambda for `apps/api`
- EventBridge schedules and Lambda jobs for `apps/jobs`
- ACM certificates for custom HTTPS domains
- Route 53 alias records for web and API domains
- SSM Parameter Store references for server-side secrets

Do not commit account IDs, bucket names, ARNs, credentials, or secret values.

## Domains

Route 53 manages DNS for `kidrawer.com`.

```text
test web: https://test-fund.kidrawer.com
test API: https://test-fund-api.kidrawer.com
prod web: https://fund.kidrawer.com
prod API: https://fund-api.kidrawer.com
```

CloudFront uses an ACM certificate from `us-east-1`, created by `certificates.yaml`.
The API uses a Regional API Gateway custom domain certificate, created by `template.yaml` in the app region.

## Templates

```text
infra/aws/certificates.yaml
infra/aws/template.yaml
infra/aws/parameters.test.json
infra/aws/parameters.prod.example.json
```

Before production deployment, copy `parameters.prod.example.json` to `parameters.prod.json` and replace placeholders.
`parameters.test.json` also contains placeholders and must be filled before deployment.

## Commands

Validate and build the SAM app without deploying:

```bash
corepack pnpm sam:validate
corepack pnpm sam:build
```

Deploy test certificates first:

```bash
corepack pnpm deploy:certs:test
```

Create a test infrastructure change set without executing it:

```bash
corepack pnpm deploy:change-set:test
```

Deploy test infrastructure and web assets:

```bash
corepack pnpm deploy:infra:test
corepack pnpm deploy:web:test
```

Production equivalents use the `:prod` suffix. Do not run production deploys until `infra/aws/parameters.prod.json` has been created locally and reviewed.

Scheduled jobs default to enabled through `EnableScheduledJobs=true`. Set `EnableScheduledJobs=false` only when a test stack should not run unattended market-data and snapshot jobs.

## SSM Parameters

`.env.test` and `.env.prod` should store SSM parameter paths rather than decrypted values.

Current naming convention:

```text
/family-ledger/test_db_password
/family-ledger/prod_db_password
/family-ledger/test_supabase_secret_key
/family-ledger/prod_supabase_secret_key
/family-ledger/test_supabase_url
/family-ledger/prod_supabase_url
/family-ledger/test_supabase_jwt_secret
/family-ledger/prod_supabase_jwt_secret
```

Lambda API and jobs should resolve these paths server-side with SSM `GetParameter` and `WithDecryption=true`. The decrypted values must stay in backend runtime memory only.

Supabase pooler metadata is non-secret and can live in env files:

```text
SUPABASE_DB_HOST=
SUPABASE_DB_NAME=
SUPABASE_DB_USER=
SUPABASE_DB_TRANSACTION_PORT=
SUPABASE_DB_SESSION_PORT=
```

Use the transaction pooler port for Lambda/serverless runtime database access.
