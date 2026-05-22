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
- `supabase`: future migrations and seed data.

## Boundaries

The frontend handles Chinese UI, routing, forms, display formatting, basic validation, Supabase Auth login, and Lambda API calls.

Business logic belongs in Lambda API services, not React components. Handlers parse HTTP requests, services apply business rules, repositories access Supabase Postgres, and auth utilities enforce viewer/admin permissions.

Supabase Postgres provides persistence and integrity through foreign keys, check constraints, unique constraints, indexes, and `numeric` financial values.

There is no always-on backend server.
