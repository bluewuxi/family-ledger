# Architecture

`family-ledger` uses a serverless architecture:

```text
S3 Static Website
  -> API Gateway
  -> Lambda API
  -> Supabase Postgres

EventBridge
  -> Lambda scheduled jobs
  -> Supabase Postgres
```

## Components

- `apps/web`: React + TypeScript + Vite frontend hosted by S3 Static Website Hosting.
- `apps/api`: Lambda API behind API Gateway.
- `apps/jobs`: EventBridge-triggered Lambda jobs.
- `packages/shared`: shared TypeScript types and constants.
- `supabase/migrations`: Supabase schema migrations.

## Boundaries

The frontend uses Supabase only for Auth: login, session reading, and access token acquisition. Business data access goes through the Lambda API.

The Lambda API verifies the Supabase access token, loads the current user role from `user_roles`, enforces `viewer` / `admin` permissions, and uses a server-side Supabase client for trusted database access.

The family ledger data is shared. Core business tables do not have per-user ownership; user references on business records are audit fields only.

API and jobs resolve sensitive server-side values from AWS SSM Parameter Store. Decrypted values must stay in backend runtime memory and must never be exposed to frontend code.

Jobs use trusted server-side Supabase access and will later run as Lambda functions triggered by EventBridge. Future price update jobs will use `instruments.price_source` configuration.

There is no always-on backend server. Lambda API is the primary business authorization layer, Supabase RLS is defensive, and the frontend must not write investment business tables directly.
