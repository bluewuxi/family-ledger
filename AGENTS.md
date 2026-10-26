# Project Rules

## Product and scope

- Repository/package: `family-ledger`. User-facing names: `金财屋` / `Family Ledger`; never display the repository name as the product name.
- This Simplified Chinese family investment ledger serves usually no more than three family members and tracks US stocks/ETFs, Hong Kong stocks, China A-share ETFs/funds, NZ PIE funds, and cash accounts.
- Keep the product simple: `viewer` is read-only; `admin` can read, write, update, delete, and manage access. Do not add complex RBAC, teams, organizations, workspaces, invitations, or permission matrices unless explicitly requested.
- Do not introduce an always-on backend, unnecessary microservices, or a full early-stage tax engine. Do not use DynamoDB for the core ledger unless explicitly requested. Price scraping requires a clear data-source decision.

## Architecture and code boundaries

- Serverless stack: CloudFront/private S3 → API Gateway → Lambda API → Supabase Postgres; EventBridge Scheduler → Lambda jobs → Postgres. Frontend: React, TypeScript, Vite; identity: Supabase Auth.
- `apps/web` owns UI, routing, forms, formatting, basic client validation, API calls, and Auth token acquisition. It must not write investment tables directly, hold server secrets, or be authoritative for investment/tax calculations or permissions. Keep API calls in client/service modules and components focused.
- `apps/api` verifies tokens, loads users/roles, authorizes requests, validates input, applies business rules, and returns stable DTOs. Keep HTTP parsing in thin `handlers/` / `routes/`, business logic in `services/`, database access in `repositories/`, and token/role checks in `auth/`; use `db/` and `utils/` for supporting code. Repositories must not decide business rules.
- `apps/jobs` owns trusted batch prices, FX, snapshots, recalculations, and future reports. Never commit or log secrets. Migrations in `supabase/migrations` enforce persistence, foreign keys, checks, uniqueness, indexes, and integrity; keep the schema simple and readable. Seed data lives in `supabase/seed`; AWS infrastructure in `infra/aws`.
- Shared enum-like values, DTOs, validators, and reusable calculations belong in `packages/shared/src/index.ts`. Update stable cross-layer types first, then affected API, jobs, frontend, migrations, seeds, and docs as needed.
- Use TypeScript strict mode, explicit types, stable DTOs, small functions, clear boundaries, shared validation where useful, and minimal dependencies. Avoid hidden global state and `any` without a clear reason.

## Auth and API contracts

- Use Supabase Auth for identity and `user_roles` for permissions. The frontend sends `Authorization: Bearer <token>`; Lambda verifies the token, loads the role, and authorizes the request. Frontend checks are UI hints only; RLS is defensive, not a substitute for API authorization.
- General endpoint policy: GET allows viewer/admin; POST/PUT/PATCH/DELETE and maintenance/job endpoints require admin.
- Success: `{ "success": true, "data": {} }`. Failure: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable message" } }`.
- Prefer stable codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `INTERNAL_ERROR`. Never expose secrets or internal stack traces in responses.

## Language and financial data

- Write new/updated repository content, specifications, plans, README files, instructions, comments, and identifiers in English. Chinese is reserved for user-facing text, product names, exact UI labels, and source data/quotations requiring it; keep surrounding explanations in English. Conversation may be in Chinese.
- The sole documentation-language exception is the opening project description in the root README: retain its Chinese description and provide an equivalent English description alongside it. All other documentation prose must be English, subject to the user-facing labels, product names, and source quotations above.
- The app UI must use Simplified Chinese, including established labels such as 登录, 财富足迹, 投资账户, 投资标的, 交易记录, 持仓总览, 设置, 总资产, 最新变动, 未实现收益, and 账户数量.
- Persist money, quantity, price, FX, and tax values with PostgreSQL `numeric`, never floating-point types. Use decimal libraries, database numeric calculations, or documented integer minor units for important authoritative calculations; avoid careless TypeScript floating-point arithmetic.
- Do not implement tax logic casually. Use 税务辅助, 税务估算, or 税务记录; avoid compliance guarantees such as 自动报税, 准确报税, or 税务申报系统.

## Mobile UI Guidelines

Treat mobile layout as a first-class requirement for every web UI change.

- Mobile navigation must be closed by default after login and open as an overlay drawer; desktop sidebar collapse controls must not appear on mobile.
- Use readable Simplified Chinese text on phones: avoid tiny labels, cramped helper text, and controls below 44px tap height.
- Prefer stacked controls, wrapped actions, and clear spacing on narrow screens; text and controls must not overlap or depend on hover-only affordances.
- Keep data-heavy pages as horizontally scrollable tables unless a task explicitly asks for a mobile card/list redesign.
- Drawers, dialogs, filters, pagination, tabs, and footer content must fit common phone widths without clipping important actions.
- For meaningful frontend changes, visual acceptance requires checks at `320x740`, `393x852`, `430x932`, `768x1024`, and a desktop width. Report implementation, deployment, and visual acceptance separately. User-deferred visual acceptance does not block reporting implementation or deployment completion, but remains pending and must never be claimed as passed.
- The app requires login before authenticated pages such as the dashboard can be viewed. Do not repeatedly try to bypass or directly open those pages during browser verification. If visual verification of an authenticated page is needed, ask the user whether they want to verify it. If they say yes, provide the local app URL, wait for the user to log in and confirm the target page is ready, then continue browser checks from that state.

## Date And Time Handling

Treat date and time handling as a cross-layer product rule.

- Store instants as UTC ISO strings / PostgreSQL `timestamptz`; do not store viewer-local formatted timestamps as data.
- Store business/calendar dates as `date` / `YYYY-MM-DD` strings only when the value is a date without a time, such as `trade_date`, `settlement_date`, `price_date`, `rate_date`, and `snapshot_date`.
- Human timestamp display in the web app should use the viewer's local time zone and make that clear in UI text where ambiguity matters.
- Portfolio business-day logic is global, not viewer-local: use `Asia/Shanghai` with a `06:00` cutoff through shared helpers such as `getAppBusinessDate`.
- Market-data provider dates (`price_date`, `rate_date`, quote dates) are provider/exchange dates. Do not derive them from viewer-local time.
- Persisted historical `instrument_prices` rows should represent confirmed closes or published unit prices, not live intraday quotes. Dashboard/live quote values belong in the dashboard quote cache.
- NZ PIE/FundRock unit prices may lag by multiple days; snapshots should use the latest published unit price available rather than treating the lag as an error.
- Do not move the main global batch schedule solely to match NZ PIE/FundRock publication timing. The US/global close cadence is more important; if NZ PIE freshness needs improvement later, add a separate FundRock-only refresh and keep provider `price_date` semantics intact.
- Scheduled jobs must use timezone-aware EventBridge Scheduler configuration and pass Scheduler context (`<aws.scheduler.scheduled-time>` as `time`) into Lambda. Snapshot generation must derive its default date from scheduled time, not Lambda execution/retry time.
- Avoid ad hoc `new Date().toISOString().slice(0, 10)` for app business dates or UI date defaults. Use shared time helpers from `packages/shared`.
- When adding date/time behavior, update focused verification scripts such as `verify:time-policy` and document any new semantics.

## Dashboard Calculation and Chart Contracts

- `本日变动` uses only instruments with a quote or estimated price for the current app business day. Older quotes, delayed published fund unit prices, and historical closes alone do not qualify for the numerator. Eligibility is based on data kind/date, not a market or fund exclusion list.
- Its percentage is `todayChange / totalAssets * 100`, using current total investment assets in the same reporting currency. Total assets include cash and instruments excluded from the daily-change numerator, valued using their latest available prices. Never replace this denominator with participating instruments, their preceding value, net investment, or a previous snapshot. Missing/non-positive total assets yield an unavailable percentage.
- Both period-profit and asset-trend curves connect the current dynamic valuation endpoint to its immediately preceding valid point. Preserve real missing-data gaps, saved closes, gain/loss coloring, and hover details; do not split the endpoint into an isolated marker-only series or fabricate intermediate quotes.
- Keep [the investment overview specification](docs/specs/investment-overview.md), [API semantics](docs/api.md), `verify:dashboard`, and `verify:portfolio-trend` aligned with these contracts. Changes to these rules require an explicit user request.

## Secrets and deployment boundaries

- Authorization to push `test` includes its configured CI and automatic TEST deployment; monitor and verify them without asking again. Manual deployment, bootstrap/recovery, enabling automation, database migration application, data repair, and independent infrastructure/configuration changes require separate explicit authorization. Do not substitute manual deployment or bypass gates when automation is disabled, blocked, or fails. Production remains operator-run; clarify ambiguous release targets. Do not hard-code AWS account IDs, bucket names, ARNs, secrets, or credentials.
- Frontend environment variables may contain public values only. Resolve server-side secrets from AWS SSM Parameter Store or Secrets Manager at runtime in API/jobs/server-side scripts. Never expose server-side Supabase keys to the frontend, bundles, logs, or Git.
- Use the existing `test` branch for routine work; do not create feature branches unless explicitly requested. Follow workspace checks and implementation procedures in [Project Workflow](docs/project-workflow.md).
- Implementation requests, including "finish" or "complete the task," authorize changes, validation, and a summary, not issue creation, commits, pushes, or deployment. Execute delivery only when explicitly requested or already authorized in the conversation. Commit-only stops locally; push includes necessary commit preparation and monitoring CI/automatic TEST deployment. The default delivery workflow includes issue creation, validation, review, commit with `Refs #<issue-number>`, push, deployment verification, and issue closure. A request to deploy the current version does not include uncommitted edits. See [delivery scope and workflow](docs/project-workflow.md#delivery-scope-and-workflow) for execution boundaries and documentation-only closure.
- [TEST automatic deployment](docs/test-auto-deployment.md) governs release mechanics. Do not duplicate automatic deployment locally. Database migrations and non-code infrastructure/configuration changes require independent verification and operator registration; missing approvals and unknown changes fail closed. Production remains operator-run. Bootstrap/incident recovery use the documented independent procedure and shared deployment lock.
- Before applying migrations, read the [Windows migration procedure](docs/project-workflow.md#applying-database-migrations-on-windows), including installed `psql` discovery, SSM password resolution, and post-apply schema verification.

## Validation and documentation

For code changes, run these checks before reporting implementation completion, plus focused verification for affected behavior:

```powershell
corepack pnpm typecheck
corepack pnpm build
```

For documentation/instruction-only changes, review meaning, consistency, links, and `git diff --check`; validate changed skills with their validator. Typecheck/build are not required unless executable behavior or build inputs are affected. Read-only analysis requires evidence review, not a build. Mixed changes use all applicable checks. When adding business logic, add focused tests/verification scripts where practical; do not introduce a complex test framework before needed. Follow [Project Workflow](docs/project-workflow.md#validation) and [local testing](docs/local-testing.md). Report blockers accurately.

Keep documentation concise, accurate, and consistent with code; update it when architecture, schema, API, auth, deployment, or roadmap decisions change. Read the relevant source before changing its area:

| Source | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | System design and boundaries |
| [Auth](docs/auth.md) | Identity and access |
| [API](docs/api.md) | API semantics and DTOs |
| [Data model](docs/data-model.md) | Schema and integrity |
| [Deployment](docs/deployment.md) / [TEST contract](docs/test-auto-deployment.md) | Deployment operations and automation gates |
| [Roadmap](docs/roadmap.md) | Source of truth for implementation status and staged priorities |
| [Project Workflow](docs/project-workflow.md) | Implementation, local verification, migration tools, and delivery procedures |

The [adopted policy decisions](docs/decisions/rules-cleanup-decisions.md) record the approved cleanup changes. SuperPowers is not enabled. Its [project compatibility rules](docs/project-workflow.md#superpowers-compatibility) preserve authorization boundaries, review of uncommitted work, business contracts, the routine `test` branch, and login/viewport requirements; generic skill workflows cannot expand delivery scope.
