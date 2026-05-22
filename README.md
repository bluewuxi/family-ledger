# family-ledger

`family-ledger`（家庭投资账务）是一个面向少数家庭成员使用的中文家庭投资账务 Web 应用，用于跟踪美股/ETF、港股、A 股 ETF/基金、新西兰 PIE 基金和现金账户。

当前状态：Stage 0 项目基础。此仓库只包含 monorepo、前端/API/jobs/shared 骨架、文档和 CI；尚未实现真实业务 CRUD、Supabase 表连接、自动价格获取、税务计算或 AWS 部署。

## Tech Stack

- Frontend: React + TypeScript + Vite
- Routing: React Router
- API: AWS API Gateway + Lambda
- Jobs: EventBridge-triggered Lambda
- Database: Supabase Postgres
- Auth: Supabase Auth
- Package manager: pnpm workspaces

## Structure

```text
apps/
  web/       React + TypeScript + Vite frontend
  api/       TypeScript Lambda API placeholder
  jobs/      TypeScript scheduled Lambda placeholders
packages/
  shared/    Shared types and constants
supabase/
  migrations/
  seed/
infra/
  aws/
docs/
scripts/
```

## Local Development

```bash
pnpm install
pnpm dev:web
```

## Validation

```bash
pnpm typecheck
pnpm build
```

## Environment Variables

Copy `.env.example` to a local `.env` file when needed. Real values must stay outside Git.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `AWS_REGION`
- `WEB_S3_BUCKET`

`VITE_SUPABASE_ANON_KEY` is intended for frontend Supabase Auth. `SUPABASE_SERVICE_ROLE_KEY` is server-side only and must never be exposed to `apps/web`.
