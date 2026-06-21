# Architecture

`金财屋` / `Family Ledger` uses a serverless architecture:

```text
CloudFront + private S3 static assets
  -> API Gateway
  -> Lambda API
  -> Supabase Postgres

EventBridge Scheduler
  -> Lambda scheduled jobs
  -> Supabase Postgres
```

## Components

- `apps/web`: React + TypeScript + Vite frontend hosted as private S3 static assets behind CloudFront for HTTPS and custom domains.
- `apps/api`: Lambda API behind API Gateway.
- `apps/jobs`: EventBridge-triggered Lambda jobs.
- `packages/shared`: shared TypeScript types and constants.
- `supabase/migrations`: Supabase schema migrations.

## Boundaries

The frontend uses Supabase only for Auth: login, session reading, and access token acquisition. Business data access goes through the Lambda API.

The Lambda API verifies the Supabase access token, loads the current user role from `user_roles`, enforces `viewer` / `admin` permissions, and uses a server-side Supabase client for trusted database access.

The family ledger data is shared. Core business tables do not have per-user ownership; user references on business records are audit fields only.

API and jobs resolve sensitive server-side values from AWS SSM Parameter Store. Decrypted values must stay in backend runtime memory and must never be exposed to frontend code.

Jobs use trusted server-side Supabase access and run as Lambda functions triggered by EventBridge Scheduler. Price update jobs use `instruments.price_source` configuration.

The ledger backup job is also a trusted scheduled Lambda. It exports allowlisted public app tables through a database RPC so the backup reads one PostgreSQL statement snapshot, writes the gzipped payload to a private encrypted S3 backup bucket after batch jobs normally complete, and refuses to run while recent known market-data or snapshot batch jobs are still marked `started`. The web app exposes backup status through the data maintenance page only as sanitized job status fields, not raw backup payloads or S3 object metadata.

There is no always-on backend server. Lambda API is the primary business authorization layer, Supabase RLS is defensive, and the frontend must not write investment business tables directly.
