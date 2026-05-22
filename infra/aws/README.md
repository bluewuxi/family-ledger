# AWS Infrastructure

Stage 0 does not deploy AWS resources.

Future infrastructure will cover:

- S3 Static Website Hosting for `apps/web`
- Optional CloudFront distribution
- API Gateway and Lambda for `apps/api`
- EventBridge schedules and Lambda jobs for `apps/jobs`
- Secrets Manager or SSM Parameter Store for server-side secrets

Do not commit account IDs, bucket names, ARNs, credentials, or secret values.

## SSM Parameters

`.env.test` and `.env.prod` should store SSM parameter paths rather than decrypted values.

Current naming convention:

```text
/family-ledger/test_db_password
/family-ledger/prod_db_password
/family-ledger/test_supabase_secret_key
/family-ledger/prod_supabase_secret_key
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
