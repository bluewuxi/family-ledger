# Architecture

Account purpose is a current attribute, with exactly one purpose per account. Investment dashboard services filter accounts and transactions before valuation and historical aggregation. Account management and family reports cover all purposes.

Snapshot persistence consists of headers (identity, date, historical FX and metadata) and account rows. The `portfolio_snapshots` relation is an invoker-security all-account view. Snapshot generation and repairs keep the same atomic writer RPC; the staged rollout and verified cutover are recorded in [TEST release history](releases/test-release-history.md#test-cutover-completed--2026-09-23). The current backup format is version 7, including Kernel anchors, estimated-price/NTA metadata, education reserves, and pending Kernel snapshot refresh state. Version-specific validation precedes normalization of older supported backups; see [backup and restore](operations/backup-restore.md) for compatibility limits. Version-1 restore compatibility is outside operational scope. Production has not been deployed.

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
- `supabase/seed`: seed data.
- `infra/aws`: AWS infrastructure.

## Code organization

- `apps/web` owns UI, routing, forms, formatting, basic client validation, API calls, and Auth token acquisition. Keep API calls in client/service modules and components focused. It must not hold server secrets, write investment tables directly, or be authoritative for investment/tax calculations or permissions.
- `apps/api` verifies tokens, loads users/roles, authorizes requests, validates input, applies business rules, and returns stable DTOs. Keep HTTP parsing in thin `handlers/` / `routes/`, business logic in `services/`, database access in `repositories/`, and token/role checks in `auth/`; use `db/` and `utils/` for supporting code. Repositories must not decide business rules.
- `apps/jobs` owns trusted batch prices, FX, snapshots, recalculations, and future reports. Reuse the provider interfaces, run logging, idempotency, and secret handling described in [Project Workflow](project-workflow.md#jobs-and-market-data). Price scraping requires a clear data-source decision.
- Shared enum-like values, DTOs, validators, and reusable calculations belong in `packages/shared/src/index.ts`. Update stable cross-layer types first, then affected API, jobs, frontend, migrations, seeds, and docs as needed.
- Use TypeScript strict mode, explicit types, stable DTOs, small functions, clear boundaries, shared validation where useful, and minimal dependencies. Avoid hidden global state and `any` without a clear reason.
- Migrations enforce persistence, foreign keys, checks, uniqueness, indexes, and integrity. Keep the schema simple and readable; persistence contracts are maintained in the [data model](data-model.md).

## Boundaries

The frontend uses Supabase only for Auth: login, session reading, and access token acquisition. Business data access goes through the Lambda API.

The Lambda API verifies the Supabase access token, loads the current user role from `user_roles`, enforces `viewer` / `admin` permissions, and uses a server-side Supabase client for trusted database access.

The family ledger data is shared. Core business tables do not have per-user ownership; user references on business records are audit fields only.

API and jobs resolve sensitive server-side values from AWS SSM Parameter Store. Decrypted values must stay in backend runtime memory and must never be exposed to frontend code.

Jobs use trusted server-side Supabase access and run as Lambda functions triggered by EventBridge Scheduler. Price update jobs use `instruments.price_source` configuration. A code-backed market-data source registry describes only implemented sources: Frankfurter, Yahoo Finance, Eastmoney, FundRock, and the Kernel estimate source. It provides stable source keys, canonical run-log names, capabilities, acquisition methods, configuration types, and supported instrument filters without introducing a generic editable provider table.

Kernel S&P 500 (Unhedged) pricing uses actual-price anchors and published USF per-unit NTA. NTA dates map to preceding weekday Kernel valuation dates. API and jobs share decimal calculation and announcement parsing; an atomic service-role RPC preserves audit history, replaces estimates and records pending snapshot recalculation. No Kernel credentials or exchange market-price quotes are used. The existing global schedules remain unchanged; late announcements are picked up on the next refresh. The public NZX website endpoint has no confirmed external stability guarantee or data-use licence.

The ledger backup job is also a trusted scheduled Lambda. It exports allowlisted public app tables through a database RPC so the backup reads one PostgreSQL statement snapshot, writes the gzipped payload to a private encrypted S3 backup bucket after batch jobs normally complete, and refuses to run while recent known market-data or snapshot batch jobs are still marked `started`. The web app exposes backup status through the data maintenance page only as sanitized job status fields, not raw backup payloads or S3 object metadata.

There is no always-on backend server. Lambda API is the primary business authorization layer, Supabase RLS is defensive, and the frontend must not write investment business tables directly.
