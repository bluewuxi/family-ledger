# AGENTS.md

## Project Overview

Project name: `family-ledger`  
Chinese product name: `家庭投资账务`

This is a Chinese-language family investment ledger web app.

The app tracks investments across:

- US stocks and ETFs
- Hong Kong stocks
- China A-share ETFs/funds
- New Zealand PIE funds
- Cash accounts

The expected number of users is very small, usually no more than 3 family members.

The app has only two roles:

- `viewer`: read-only access
- `admin`: read, write, update, delete, and manage access

Do not introduce complex RBAC, teams, organizations, workspaces, invitations, or permission matrices unless explicitly requested.

---

## Confirmed Architecture

The project uses a serverless architecture:

```text
S3 Static Website
  ↓
API Gateway
  ↓
Lambda API
  ↓
Supabase Postgres

EventBridge
  ↓
Lambda scheduled jobs
  ↓
Supabase Postgres
```

Main components:

- Frontend: React + TypeScript + Vite
- Frontend hosting: AWS S3 Static Website Hosting
- API: AWS API Gateway + Lambda
- Scheduled jobs: AWS EventBridge / EventBus + Lambda
- Database: Supabase Postgres Free
- Auth: Supabase Auth
- UI language: Simplified Chinese
- Repository style: monorepo

---

## Repository Structure

Use this structure unless explicitly changed:

```text
family-ledger/
  apps/
    web/       # React + TypeScript + Vite frontend
    api/       # API Gateway + Lambda API project
    jobs/      # EventBridge-triggered Lambda jobs

  packages/
    shared/    # Shared TypeScript types, constants, validators

  supabase/
    migrations/
    seed/

  infra/
    aws/

  docs/
    architecture.md
    auth.md
    api.md
    data-model.md
    deployment.md
    roadmap.md

  scripts/

  .github/
    workflows/
```

Keep frontend, API, jobs, and shared types clearly separated.

---

## Business Logic Rules

Business logic must not live only in the frontend.

Layer responsibilities:

### Frontend: `apps/web`

Frontend is responsible for:

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
- Use Supabase service role key
- Contain tax calculation as the source of truth

Frontend role checks are only UI hints.

### API: `apps/api`

Lambda API is the main business layer.

API is responsible for:

- Verifying Supabase access tokens
- Loading the current user
- Enforcing `viewer` / `admin` permissions
- Validating requests
- Applying business rules
- Calling repository functions
- Returning stable API DTOs

Keep handlers thin.

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
- Do not put business logic directly in handlers.
- Do not let repositories decide business rules.

### Jobs: `apps/jobs`

Scheduled jobs are responsible for trusted batch work:

- Updating prices
- Updating FX rates
- Generating portfolio snapshots
- Recalculating derived data
- Future report generation

Jobs are triggered by EventBridge.

Jobs may use server-side secrets, but secrets must never be committed.

### Database: Supabase Postgres

Database is responsible for:

- Persistence
- Foreign keys
- Check constraints
- Unique constraints
- Indexes
- Data integrity
- Optional RLS as a defensive layer

Database should not become the main business layer unless explicitly requested.

Do not rely on frontend-only checks for data integrity.

---

## Auth and Permission Model

Use Supabase Auth for identity.

Use a planned `user_roles` table for application permissions:

```text
viewer = read-only
admin  = read/write/manage
```

API endpoints must enforce permissions.

General rule:

```text
GET endpoints: viewer and admin
POST/PUT/PATCH/DELETE endpoints: admin only
maintenance/job endpoints: admin only
```

Do not add complex role systems unless explicitly requested.

Expected auth flow:

```text
Frontend logs in with Supabase Auth
  ↓
Frontend receives access token
  ↓
Frontend calls Lambda API with Authorization: Bearer <token>
  ↓
Lambda verifies token
  ↓
Lambda loads user role
  ↓
Lambda authorizes request
```

Server-side secrets:

- `SUPABASE_SERVICE_ROLE_KEY` must only be used in Lambda/API/jobs.
- It must never be exposed to frontend code.
- It must never be committed to Git.
- Use AWS Secrets Manager or SSM Parameter Store for production secrets.

---

## Language and UI Requirements

The user-facing app must be in Simplified Chinese.

Use Chinese labels such as:

- 登录
- 仪表盘
- 投资账户
- 投资标的
- 交易记录
- 持仓总览
- 设置
- 总资产
- 今日变动
- 未实现收益
- 账户数量

Code identifiers should remain in English.

Examples:

```ts
InvestmentAccount
Instrument
InvestmentTransaction
PortfolioSnapshot
```

Do not mix Chinese identifiers into code unless there is a strong reason.

---

## Financial Data Rules

Use precise numeric handling.

Do not use floating-point types for persisted money, quantity, price, FX rate, or tax values.

Database values should use PostgreSQL `numeric`.

TypeScript code should avoid careless floating-point calculations for authoritative results.

When calculations become important, prefer:

- database numeric calculations, or
- decimal libraries, or
- carefully documented integer minor-unit approaches

Do not implement tax logic casually.

For tax-related features, use wording such as:

- 税务辅助
- 税务估算
- 税务记录

Avoid wording that implies guaranteed tax compliance, such as:

- 自动报税
- 准确报税
- 税务申报系统

---

## Supported Core Types

Shared types should live in `packages/shared`.

Core enum-like values:

```ts
type UserRole = "viewer" | "admin";

type CurrencyCode =
  | "NZD"
  | "USD"
  | "HKD"
  | "CNY"
  | "AUD"
  | "GBP"
  | "EUR";

type MarketRegion =
  | "US"
  | "HK"
  | "CN"
  | "NZ"
  | "MULTI"
  | "OTHER";

type AssetType =
  | "stock"
  | "etf"
  | "pie_fund"
  | "mutual_fund"
  | "cash"
  | "bond"
  | "other";

type TransactionType =
  | "buy"
  | "sell"
  | "dividend"
  | "fee"
  | "tax"
  | "deposit"
  | "withdrawal"
  | "interest"
  | "adjustment";

type AccountType =
  | "brokerage"
  | "fund_platform"
  | "bank"
  | "retirement"
  | "other";
```

Core entities:

- `Profile`
- `UserRole`
- `InvestmentAccount`
- `Instrument`
- `InvestmentTransaction`
- `PriceRecord`
- `FxRateRecord`
- `PortfolioSnapshot`

Keep shared types stable and practical.

---

## API Response Format

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

Prefer stable error codes.

Examples:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `INTERNAL_ERROR`

Do not leak secrets or internal stack traces in API responses.

---

## Database Design Guidelines

Use migrations under:

```text
supabase/migrations/
```

Rules:

- Use UUID primary keys.
- Use `auth.users(id)` references where appropriate.
- Use `created_at` and `updated_at`.
- Use `numeric`, not float/double, for financial values.
- Use check constraints for enum-like values.
- Avoid PostgreSQL enum types unless explicitly requested.
- Add useful indexes for common queries.
- Add unique constraints for natural uniqueness where appropriate.
- Keep schema simple and readable.

Planned core tables:

- `profiles`
- `user_roles`
- `investment_accounts`
- `instruments`
- `transactions`
- `prices`
- `fx_rates`
- `portfolio_snapshots`

Do not over-normalize prematurely.

Do not introduce tax-specific tables until tax-assist requirements are clearer.

---

## AWS Guidelines

Frontend will be hosted on S3 Static Website Hosting.

Future production setup may include CloudFront.

API will run on Lambda behind API Gateway.

Scheduled jobs will run on Lambda triggered by EventBridge.

Do not deploy AWS resources unless explicitly requested.

Do not hard-code:

- AWS account IDs
- bucket names
- ARNs
- secrets
- credentials

Use environment variables and deployment configuration.

Expected environment variables:

```text
# Frontend
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=

# Server-side Lambda only
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=

# AWS
AWS_REGION=
WEB_S3_BUCKET=
```

---

## Coding Standards

Use TypeScript strict mode.

Prefer explicit types.

Avoid `any` unless there is a clear reason.

Keep files small and readable.

Avoid unnecessary dependencies.

Do not introduce heavy frameworks unless explicitly requested.

Preferred style:

- Small functions
- Clear module boundaries
- Stable DTOs
- Shared validation where useful
- No hidden global state
- No business logic in UI components

For React:

- Keep components focused.
- Put API calls in service/client modules.
- Avoid large components with mixed UI, data fetching, and business logic.
- Use Chinese UI text.
- Use English code identifiers.

For Lambda API:

- Handlers parse requests and return responses.
- Services handle business logic.
- Repositories access Supabase/Postgres.
- Auth utilities verify identity and roles.

---

## Development Phases

Follow staged implementation.

### Stage 0: Project foundation

- Monorepo setup
- Frontend skeleton
- API skeleton
- Jobs skeleton
- Shared types
- Documentation
- CI

### Stage 1: Supabase schema, auth verification, and role model

- Initial database migrations
- `profiles`
- `user_roles`
- Core business tables
- Auth verification in Lambda API
- Role loading

### Stage 2: CRUD through Lambda API

- Accounts
- Instruments
- Transactions
- Admin-only write APIs
- Viewer read APIs

### Stage 3: Holdings and dashboard

- Holdings calculation
- Portfolio summary
- Account summary
- Market/currency allocation

### Stage 4: Prices, FX, and scheduled jobs

- Price records
- FX rates
- EventBridge jobs
- Portfolio snapshots

### Stage 5: Tax-assist and reports

- Tax notes
- Tax-year summaries
- CSV export
- Report generation

### Stage 6: Deployment hardening

- S3 deployment
- API Gateway/Lambda deployment
- Secrets handling
- Backup/export
- Monitoring/logging

Do not jump ahead unless explicitly requested.

---

## Testing and Validation

At minimum, ensure:

```bash
pnpm typecheck
pnpm build
```

passes before considering a task complete.

When adding business logic, add tests where practical.

Recommended future tests:

- service-level unit tests
- API route tests
- calculation tests
- repository integration tests if feasible

Do not add a complex test framework before the core structure is stable.

---

## Documentation Rules

Update documentation when architecture, schema, API, or auth decisions change.

Important docs:

```text
docs/architecture.md
docs/auth.md
docs/api.md
docs/data-model.md
docs/deployment.md
docs/roadmap.md
```

Keep docs concise and accurate.

Do not leave docs contradicting code.

---

## Security Rules

Never commit secrets.

Never expose server-side Supabase keys to frontend code.

Never put `SUPABASE_SERVICE_ROLE_KEY` in `apps/web`.

Never rely on frontend role checks for real permission enforcement.

Never return internal stack traces to users.

Always validate user input at the API layer.

Always check ownership and role before write operations.

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

---

## Preferred Next Task Pattern

When implementing a new feature, prefer small tasks:

1. Update shared types and validation.
2. Add or update database migration if needed.
3. Add repository methods.
4. Add service logic.
5. Add API route/handler.
6. Add frontend API client.
7. Add frontend page/component.
8. Update docs.
9. Run typecheck/build.

Avoid large all-in-one changes unless explicitly requested.
