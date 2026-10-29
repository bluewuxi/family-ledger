# Project Rules

## Product and scope

- Repository/package: `family-ledger`. User-facing names: `金财屋` / `Family Ledger`; never display the repository name as the product name.
- This Simplified Chinese family investment ledger usually serves no more than three family members and tracks US stocks/ETFs, Hong Kong stocks, China A-share ETFs/funds, NZ PIE funds, and cash accounts.
- Keep access simple: `viewer` is read-only for ledger data; `admin` manages ledger data and access. Follow the documented endpoint exceptions in [Auth](docs/auth.md#enforcement). Do not add complex RBAC, teams, organizations, workspaces, invitations, or permission matrices unless explicitly requested.
- Do not introduce an always-on backend, unnecessary microservices, or a full early-stage tax engine. Do not use DynamoDB for the core ledger unless explicitly requested. Price scraping requires a clear data-source decision; tax features must not promise compliance.

## Repository map and universal constraints

- Stack: React/TypeScript/Vite; CloudFront/private S3 → API Gateway → Lambda API → Supabase Postgres; EventBridge Scheduler → Lambda jobs. Supabase Auth provides identity.
- `apps/web` owns UI and Auth token acquisition; business data goes through `apps/api`, which authorizes requests and owns business rules. `apps/jobs` owns trusted batch work; `packages/shared` owns cross-layer contracts/calculations. Migrations, seeds, and AWS infrastructure live in `supabase/migrations`, `supabase/seed`, and `infra/aws`. Follow detailed boundaries in [Architecture](docs/architecture.md#code-organization).
- The frontend must not write investment tables directly, hold server secrets, or be authoritative for investment/tax calculations or permissions. Server-side role checks are authoritative; frontend checks are UI hints and RLS is defensive.
- Use strict TypeScript and minimal dependencies. Persist financial values with PostgreSQL `numeric` and use reliable authoritative arithmetic as defined in [Financial Values](docs/data-model.md#financial-values).
- Write new/updated repository content, specifications, plans, README files, instructions, comments, and identifiers in English. Chinese is reserved for user-facing text, product names, exact UI labels, and source data/quotations requiring it; keep surrounding explanations in English. Conversation may be in Chinese. The sole documentation-prose exception is the root README's opening project description: retain its Chinese description and provide an equivalent English description alongside it. The app UI uses Simplified Chinese.
- Never commit or log secrets, or expose secrets/internal stack traces in API responses. Never expose server-side Supabase keys in frontend code, bundles, logs, or Git. Frontend environment variables contain public values only. Resolve server secrets from AWS SSM Parameter Store or Secrets Manager at runtime in API/jobs/server-side scripts. Do not hard-code AWS account IDs, bucket names, ARNs, secrets, or credentials.

## Working and authorization boundaries

- Use the existing `test` checkout for routine work. Before editing, inspect branch and working-tree state; ask before switching from another branch unless the user explicitly requested that branch. Create a branch or worktree only when explicitly requested.
- Implementation/finish/complete requests authorize changes, validation, review, and a summary, not issue creation, commit, push, or deployment. Existing explicit authorization persists within scope. Read [delivery scope](docs/project-workflow.md#delivery-scope-and-workflow) before delivery; a request to deploy a committed version does not include uncommitted edits.
- Push authorization includes configured CI and automatic TEST deployment monitoring/verification without another permission prompt. Applying migrations, data repair, independent infrastructure/configuration changes, enabling automation, and manual deployment/bootstrap/recovery require separate explicit authorization. Do not bypass disabled/blocked/failed automation or substitute manual deployment. Production remains operator-run; clarify ambiguous release targets.
- Do not bypass real user login for authenticated browser acceptance or claim unperformed checks passed. Follow the [user-login and viewport procedure](docs/local-testing.md#authenticated-browser-acceptance), and report implementation, deployment, and visual acceptance separately under [completion reporting](docs/project-workflow.md#completion-reporting).
- Superpowers is enabled for the desktop workflow. Before planning, implementation, execution, review, or delegation, read [Project Workflow](docs/project-workflow.md), including its [Superpowers compatibility rules](docs/project-workflow.md#superpowers-compatibility). Skills, plans, and agent rulings cannot expand authorization or override maintained contracts. Installed-version evidence and coverage limits belong in [operating guidance](docs/operations/superpowers.md).

## Required reading by task

Read the relevant maintained sources before changing their area or performing the operation. Triggers combine and follow affected behavior/dependencies, not only task wording or the directory edited. Preserve existing contracts unless an explicit user request authorizes their change; keep documentation concise, accurate, and consistent with code, and update affected specifications and documentation when architecture, schema, API, auth, deployment, or roadmap decisions change. Use the [documentation map](docs/README.md) to find other maintained sources and [Roadmap](docs/roadmap.md) for current implementation status and staged priorities.

| Task or affected behavior | Required sources |
| --- | --- |
| Architecture, component responsibilities, shared interfaces | [Architecture](docs/architecture.md), relevant [API](docs/api.md) / [data model](docs/data-model.md) sections |
| Identity, permissions, endpoints | [Auth](docs/auth.md), relevant [API](docs/api.md) contracts |
| Web UI or browser verification | [Frontend guidelines](docs/frontend-guidelines.md), [authenticated acceptance](docs/local-testing.md#authenticated-browser-acceptance), affected product specification |
| Date defaults, timestamps, business dates, scheduler time | [Time policy](docs/time-policy.md); relevant data-model/deployment sections for storage/jobs |
| Investment valuation, dashboard, holdings, account performance, chart helpers | [Investment overview](docs/specs/investment-overview.md), relevant API/data-model sections, [local verification](docs/local-testing.md#validation) |
| Price/FX ingestion, provider freshness, snapshots, shared valuation inputs | [Time policy](docs/time-policy.md), [market data](docs/data-model.md#market-data-foundation) / [snapshots](docs/data-model.md#portfolio-valuation-snapshots), affected investment contracts, [jobs guidance](docs/project-workflow.md#jobs-and-market-data) / [scheduling](docs/deployment.md#scheduled-jobs) |
| Spending or education behavior | [Spending](docs/specs/spending.md) / [education reserve](docs/specs/education-reserve.md), relevant API/data-model sections |
| Commit, push, deployment, migration, infrastructure operations | [Delivery scope](docs/project-workflow.md#delivery-scope-and-workflow), applicable [TEST contract](docs/test-auto-deployment.md) / [deployment](docs/deployment.md); read [Windows migration procedure](docs/project-workflow.md#applying-database-migrations-on-windows) before applying migrations |
| Superpowers installation, upgrade, troubleshooting, coverage | [Operating guidance](docs/operations/superpowers.md), [compatibility rules](docs/project-workflow.md#superpowers-compatibility) |

## Validation

For code changes, run these before reporting implementation completion, plus affected focused verification:

```powershell
corepack pnpm typecheck
corepack pnpm build
```

Documentation/instruction-only changes require meaning, consistency, link, and `git diff --check` review; validate changed skills with their validator. Typecheck/build are unnecessary unless executable behavior or build inputs change. Read-only analysis uses evidence review; mixed changes use all applicable checks. Add focused business-logic verification where practical without introducing a complex test framework. Follow [Workflow validation](docs/project-workflow.md#validation) and [local testing](docs/local-testing.md#validation); report blockers accurately.
