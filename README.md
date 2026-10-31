# 金财屋 / Family Ledger

`family-ledger`（金财屋 / Family Ledger）是一个中文家庭投资账务 Web 应用，用于少数家庭成员跟踪美股/ETF、港股、A 股 ETF/基金、新西兰 PIE 基金和现金账户。

Family Ledger (金财屋), maintained in the `family-ledger` repository, is a Chinese-language family investment ledger for a small number of family members tracking US stocks/ETFs, Hong Kong stocks, China A-share ETFs/funds, NZ PIE funds, and cash accounts.

The bilingual project description above is the sole documentation-language exception. The rest of this README and other documentation use English prose; Chinese product names, UI labels, and required source quotations remain allowed.

## Current status and documentation

Implemented areas include authentication and viewer/admin access, investment account/instrument/transaction management, holdings and performance charts, scheduled market data and snapshots, spending imports, education reserves, monthly family reviews, backup tooling, API error tracking, and automatic TEST delivery. Tax assistance, user-facing CSV export, production operation, and alarm/DLQ hardening remain pending. See the [roadmap](docs/roadmap.md) for status and outstanding acceptance, and the [documentation map](docs/README.md) for maintained contracts and historical records.

## Stack

- Frontend: React + TypeScript + Vite
- API: AWS API Gateway + Lambda
- Jobs: EventBridge-triggered Lambda
- Database/Auth: Supabase Postgres + Lambda/DynamoDB opaque sessions
- Package manager: pnpm workspaces

## Environment Files

Use checked-in `.env.test` for test deployment, checked-in `.env.prod` for production deployment, and ignored `.env.local` for local debugging.

Public frontend values may be stored directly:

- `AUTH_TABLE_NAME` (server-side only)

- `VITE_API_BASE_URL`

Deployments generate `apps/web/dist/config.json` from the checked-in env file plus `infra/aws/parameters.<env>.json`. Vite env values are still used for local development fallback, but deployed API routing comes from the generated public runtime config.

Server-side secrets live in AWS SSM Parameter Store. Env files store parameter paths only:

- `SUPABASE_SECRET_KEY_SSM_PARAM`
- `SUPABASE_JWT_SECRET_SSM_PARAM`
- `SUPABASE_DB_PASSWORD_SSM_PARAM`

Server-side DB metadata is non-secret:

- `SUPABASE_URL`
- `SUPABASE_DB_HOST`
- `SUPABASE_DB_NAME`
- `SUPABASE_DB_USER`
- `SUPABASE_DB_TRANSACTION_PORT`
- `SUPABASE_DB_SESSION_PORT`
- `AWS_REGION`

Never print or commit resolved secret values.

## Setup

```bash
corepack pnpm install
```

Run the frontend:

```bash
corepack pnpm dev:web:local
```

Run the local Lambda API adapter:

```bash
corepack pnpm dev:api
```

Validate:

```bash
corepack pnpm typecheck
corepack pnpm build
```

Run the Stage 1 test smoke check:

```bash
corepack pnpm smoke:stage1:test
```

## Delivery request examples

These examples illustrate intent; they are not required command phrases. See [delivery scope and workflow](docs/project-workflow.md#delivery-scope-and-workflow) for the authoritative procedure and authorization boundaries.

| Example request | Execution scope |
| --- | --- |
| "Fix this issue and summarize the result." | Make and validate the changes, then summarize; leave changes local without creating an issue, committing, or pushing. |
| "Commit these changes." | Validate, review, create a GitHub issue, and commit locally; stop before pushing. |
| "Push these changes to test." | Complete necessary commit preparation, push `test`, and monitor CI and the configured automatic TEST deployment. |
| "Use the default delivery workflow for these changes." | Run the complete project delivery workflow and close the issue after the required verification. |
| "Deploy the current committed version to TEST." | Deploy the identified committed version through the existing mechanism; exclude uncommitted local changes. |
| "Release this." | Clarify the target environment before deployment. |

Database migrations, data repairs, independent infrastructure/configuration changes, and manual deployments require explicit authorization as described in the workflow. For documentation-only deployment skips and separate authenticated visual acceptance, see [completion reporting](docs/project-workflow.md#completion-reporting).

## Supabase Migrations

Migration files live under:

```text
supabase/migrations/
```

Option A: Supabase CLI

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Option B: SQL Editor

Copy and run all migration SQL files in timestamp order for the target project.

Do not commit project refs or secrets. For direct migration tooling, use the session pooler metadata from `.env.test` and resolve the DB password from SSM.

## Seed Data

Initial instrument master data is stored in:

```text
supabase/seed/001_seed_instruments.sql
```

The seed is idempotent and uses `market_region + exchange + symbol` as the stable instrument identity. It seeds metadata only: no transactions, holdings, current prices, FX rates, or portfolio snapshots.

Apply through Supabase SQL Editor, or run it with trusted local DB tooling against the test database after resolving the DB password from SSM. Do not run seeds against production unless explicitly intended.
