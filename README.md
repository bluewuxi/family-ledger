# family-ledger

`family-ledger`（金财屋 / Family Ledger）是一个中文家庭投资账务 Web 应用，用于少数家庭成员跟踪美股/ETF、港股、A 股 ETF/基金、新西兰 PIE 基金和现金账户。

当前状态：已完成基础 monorepo、Supabase schema、Supabase Auth 登录、viewer/admin 角色查询、Lambda API、账户/标的/交易 CRUD、持仓计算、仪表盘摘要、价格/汇率维护任务、投资组合快照、数据备份状态监控和操作员备份/恢复校验脚本。税务辅助、用户导出报表、生产环境正式运行和告警体系仍未实现。

## Stack

- Frontend: React + TypeScript + Vite
- API: AWS API Gateway + Lambda
- Jobs: EventBridge-triggered Lambda
- Database/Auth: Supabase Postgres + Supabase Auth
- Package manager: pnpm workspaces

## Environment Files

Use checked-in `.env.test` for test deployment, checked-in `.env.prod` for production deployment, and ignored `.env.local` for local debugging.

Public frontend values may be stored directly:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
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
