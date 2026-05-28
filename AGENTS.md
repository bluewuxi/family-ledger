# AGENTS.md

## Project Overview

Project name: `family-ledger`
Chinese product name: `小家大财`
English product name: `Family Ledger`

`family-ledger` is the repository/package name only. Do not show `family-ledger` as user-facing UI text.

This is a Simplified Chinese family investment ledger web app for a very small number of users, usually no more than 3 family members.

The app tracks:

- US stocks and ETFs
- Hong Kong stocks
- China A-share ETFs/funds
- New Zealand PIE funds
- Cash accounts

Keep the product simple. The app has only two roles:

- `viewer`: read-only access
- `admin`: read, write, update, delete, and manage access

Do not introduce complex RBAC, teams, organizations, workspaces, invitations, or permission matrices unless explicitly requested.

---

## Architecture

The project uses a serverless architecture:

```text
CloudFront + private S3 static assets
  -> API Gateway
  -> Lambda API
  -> Supabase Postgres

EventBridge
  -> Lambda scheduled jobs
  -> Supabase Postgres
```

Main components:

- Frontend: React + TypeScript + Vite
- API: AWS API Gateway + Lambda
- Scheduled jobs: AWS EventBridge + Lambda
- Database: Supabase Postgres
- Auth: Supabase Auth
- UI language: Simplified Chinese
- Repository style: monorepo

There is no always-on backend server. The Lambda API is the primary business and authorization layer. Supabase RLS may be used defensively, but frontend checks are never security boundaries.

---

## Repository Structure

Keep frontend, API, jobs, and shared types clearly separated:

```text
family-ledger/
  apps/
    web/       # React + TypeScript + Vite frontend
    api/       # API Gateway + Lambda API project
    jobs/      # EventBridge-triggered Lambda jobs

  packages/
    shared/    # Shared TypeScript types, constants, validators, calculations

  supabase/
    migrations/
    seed/

  infra/
    aws/

  docs/
  scripts/
  .github/
    workflows/
```

Use `docs/roadmap.md` as the source of truth for implementation status and staged priorities.

---

## Business Logic Boundaries

Business logic must not live only in the frontend.

Frontend (`apps/web`) is responsible for:

- Chinese UI
- Routing
- Forms
- Display formatting
- Basic client-side validation
- Calling Lambda API endpoints
- Using Supabase Auth for login and token acquisition

Frontend must not:

- Directly write investment business tables
- Contain authoritative investment calculations
- Enforce permissions as the only security layer
- Use Supabase service role keys or server-side secrets
- Contain tax calculation as the source of truth

Lambda API (`apps/api`) is responsible for:

- Verifying Supabase access tokens
- Loading the current user and role
- Enforcing `viewer` / `admin` permissions
- Validating requests
- Applying business rules
- Calling repository functions
- Returning stable API DTOs

Preferred API structure:

```text
apps/api/src/
  handlers/
  routes/
  services/
  repositories/
  auth/
  db/
  utils/
```

Rules:

- Put HTTP event parsing in handlers/routes.
- Put business logic in services.
- Put database access in repositories.
- Put auth and role checks in `auth/`.
- Keep handlers thin.
- Do not let repositories decide business rules.

Scheduled jobs (`apps/jobs`) are responsible for trusted batch work such as prices, FX rates, portfolio snapshots, recalculations, and future report generation. Jobs may use server-side secrets, but secrets must never be committed or logged.

Database migrations are responsible for persistence, foreign keys, check constraints, unique constraints, indexes, and data integrity. Keep schema simple and readable.

---

## Auth And Permissions

Use Supabase Auth for identity and the `user_roles` table for application permissions.

General rule:

```text
GET endpoints: viewer and admin
POST/PUT/PATCH/DELETE endpoints: admin only
maintenance/job endpoints: admin only
```

Expected auth flow:

```text
Frontend logs in with Supabase Auth
  -> Frontend receives access token
  -> Frontend calls Lambda API with Authorization: Bearer <token>
  -> Lambda verifies token
  -> Lambda loads user role
  -> Lambda authorizes request
```

Do not add a more complex role system unless explicitly requested.

---

## Language And UI

The user-facing app must be in Simplified Chinese.

Use Chinese labels such as:

- 登录
- 财富足迹
- 投资账户
- 投资标的
- 交易记录
- 持仓总览
- 设置
- 总资产
- 今日变动
- 未实现收益
- 账户数量

Code identifiers should remain in English, for example `InvestmentAccount`, `Instrument`, `InvestmentTransaction`, and `PortfolioSnapshot`.

---

## Financial Data

Use precise numeric handling.

- Do not use floating-point types for persisted money, quantity, price, FX rate, or tax values.
- Database values should use PostgreSQL `numeric`.
- TypeScript code should avoid careless floating-point calculations for authoritative results.
- Prefer decimal libraries, database numeric calculations, or documented integer minor-unit approaches for important calculations.
- Do not implement tax logic casually.

For tax-related features, use wording such as:

- 税务辅助
- 税务估算
- 税务记录

Avoid wording that implies guaranteed tax compliance, such as:

- 自动报税
- 准确报税
- 税务申报系统

---

## Shared Types

Shared enum-like values, DTOs, and reusable calculations live in `packages/shared/src/index.ts`.

When adding stable domain values or cross-layer DTOs, update shared types first and then update API, jobs, frontend, migrations, seed data, and docs as needed. Keep shared types practical and stable.

---

## API Responses

Use a consistent API response shape.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Prefer stable error codes such as:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `INTERNAL_ERROR`

Do not leak secrets or internal stack traces in API responses.

---

## AWS And Secrets

Do not deploy AWS resources unless explicitly requested.

Do not hard-code:

- AWS account IDs
- bucket names
- ARNs
- secrets
- credentials

Frontend environment variables may contain public values only. Server-side secret values must live in AWS SSM Parameter Store or AWS Secrets Manager and be resolved only by API/jobs/server-side scripts at runtime.

Never expose server-side Supabase keys to `apps/web`, frontend bundles, logs, or Git.

---

## Database Migrations And Tools

Supabase migrations live in `supabase/migrations`.

When applying migrations from Windows, do not assume `psql` is unavailable just because `Get-Command psql` fails. First search common install locations, for example:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue
Get-ChildItem "C:\Program Files" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue
```

If found, run `psql.exe` by full path or temporarily add its `bin` folder to `PATH` for the session. Use the Supabase DB connection values from the environment files and resolve the database password from AWS SSM. Do not print database passwords, service keys, or connection strings containing secrets.

Only fall back to a temporary Node `pg` client when `psql` cannot be found or cannot run. Keep migration SQL idempotent where practical, and verify the target schema after applying it.

---

## Coding Standards

Use TypeScript strict mode.

Prefer:

- Small functions
- Clear module boundaries
- Explicit types
- Stable DTOs
- Shared validation where useful
- Minimal dependencies
- No hidden global state

Avoid `any` unless there is a clear reason.

For React:

- Keep components focused.
- Put API calls in service/client modules.
- Avoid large components with mixed UI, data fetching, and business logic.
- Use Chinese UI text and English code identifiers.

For Lambda API:

- Handlers parse requests and return responses.
- Services handle business logic.
- Repositories access Supabase/Postgres.
- Auth utilities verify identity and roles.

---

## Testing And Validation

Before considering a task complete, run:

```bash
corepack pnpm typecheck
corepack pnpm build
```

When adding business logic, add focused tests or verification scripts where practical. Do not add a complex test framework before the core structure needs it.

---

## Documentation

Update documentation when architecture, schema, API, auth, deployment, or roadmap decisions change.

Important docs:

```text
docs/architecture.md
docs/auth.md
docs/api.md
docs/data-model.md
docs/deployment.md
docs/roadmap.md
docs/local-testing.md
```

Keep docs concise and accurate. Do not leave docs contradicting code.

---

## Default Development Workflow

Use the existing `test` branch for routine work. Do not create feature branches unless explicitly requested.

When implementing a feature, prefer small slices:

1. Update shared types and validation.
2. Add or update database migration if needed.
3. Add repository methods.
4. Add service logic.
5. Add API route/handler.
6. Add frontend API client.
7. Add frontend page/component.
8. Update docs.
9. Run typecheck/build.

When the user asks to commit, push, deploy, release, ship, finish, or use the default delivery workflow:

1. Run validation.
2. Review changed files.
3. Create a GitHub issue with `gh issue create`.
4. Commit to `test` with a message that references the issue.
5. Push `test`.
6. Deploy to the test environment.
7. Verify the deployment.
8. Close the GitHub issue only after deployment succeeds.

GitHub CLI authentication is expected to be available for this project.

---

## What Not To Do

Do not:

- Build a full tax engine in early stages.
- Add complex RBAC.
- Add teams/workspaces/organizations.
- Put business logic only in React components.
- Let frontend write investment tables directly.
- Use DynamoDB for the core investment ledger unless explicitly requested.
- Add an always-on backend server.
- Add unnecessary microservices.
- Hard-code real AWS/Supabase credentials.
- Use floating-point values as authoritative persisted financial data.
- Implement price scraping without a clear data-source decision.
- Over-engineer the first version.
