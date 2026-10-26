# Project Workflow

Read this document for implementation, validation, migration, or delivery work. Project constraints and business contracts remain in [AGENTS.md](../AGENTS.md). The [adopted cleanup decisions](rules-cleanup-decisions.md) record approved authorization and completion policies. SuperPowers is not enabled.

## Workspace and implementation

Before editing, inspect `git branch --show-current` and `git status --short`. Use the existing `test` branch for routine work; do not create feature branches unless explicitly requested. If the current branch is not `test`, ask before switching unless the user explicitly requested work on another branch.

Prefer small vertical slices, changing only the necessary layers in this order: shared types/validation, migration if needed, repositories, services, routes/handlers, frontend API client, frontend components, documentation, and validation. Update architecture, schema, API, auth, deployment, and roadmap documentation when their decisions change.

For jobs and market data, inspect existing `apps/jobs/src` patterns and relevant `scripts/verify-*` scripts first. Reuse provider interfaces, job/provider run logging, idempotent inserts, SSM secrets, Scheduler metadata, and redacted structured logs. Do not introduce scraping or another provider approach without a clear data-source decision.

## Frontend verification and runtime configuration

Follow all mobile and login requirements in AGENTS.md. Start the local API and web app when practical with `corepack pnpm dev:api` and `corepack pnpm dev:web:local`. Use `http://127.0.0.1:5181` unless occupied. Obtain the user's agreement and wait for their login and target-page confirmation before inspecting authenticated pages.

The deployed web app uses runtime configuration. `scripts/deploy-aws.ts` writes `apps/web/dist/config.json` during `deploy:web:<env>` from `infra/aws/parameters.<env>.json` and `.env.<env>`. Inspect that runtime file for deployed API URL problems. Do not hardcode `VITE_API_BASE_URL`, create temporary Vite env files, or change Vite `envDir` as a deployment fix; Vite env values are only the local-development fallback.

## Validation

Run the completion checks required by AGENTS.md. Run focused verification scripts for affected areas; discover current commands in `package.json` and guidance in [local testing](local-testing.md). Existing examples include `verify:holdings`, `verify:dashboard`, `verify:market-data`, and `verify:portfolio-snapshots`. Report any blocker that prevents validation. Do not claim authenticated visual acceptance from a build or deployment check.

## Applying database migrations on Windows

Migrations live in `supabase/migrations`. Do not assume `psql` is unavailable because `Get-Command psql` fails. Search common installation locations first:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue
Get-ChildItem "C:\Program Files" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue
```

Use the full executable path or temporarily add its bin directory to PATH. Read Supabase connection values from environment files and resolve the password from AWS SSM. Never print passwords, service keys, or secret-bearing connection strings. Fall back to a temporary Node `pg` client only if `psql` cannot be found or run. Keep SQL idempotent where practical and verify the target schema afterward. TEST migration verification and registration must also follow [the deployment contract](test-auto-deployment.md).

## Delivery scope and workflow

Implementation requests, including "finish" or "complete the task," stop after changes, applicable validation, and a summary. They do not authorize issue creation, commit, push, or deployment. Existing explicit authorization persists within its scope; do not ask repeatedly.

| Request | Authorized scope |
| --- | --- |
| Commit | Validate/review, create a GitHub issue, commit locally with `Refs`; do not push or close the issue as delivered. |
| Push | Necessary validation, issue and commit preparation, push `test`, monitor/verify configured CI and automatic TEST deployment, and close the issue after the applicable delivery evidence passes. |
| Default delivery workflow | Execute the complete sequence below. |
| Deploy current version to TEST | Deploy the identified committed version through the existing mechanism; do not include uncommitted edits. Clarify which version if unclear. |
| Release/ship without a clear environment | Clarify the target before deployment. Production remains operator-run. |

Authorization to push `test` includes its configured automatic TEST deployment. It does not include applying migrations, data repairs, independent infrastructure/configuration changes, enabling automation, or manual deployment/bootstrap/recovery. Obtain separate explicit authorization for those operations, respecting existing verification, registration, and lock requirements. If automation is disabled, blocked, or fails, diagnose and report; do not bypass gates or silently replace it with manual deployment. Read-only diagnosis and ordinary local fixes remain within the authorized task; do not push a new corrective commit without push authorization covering it.

Full default delivery sequence:

1. Run validation and review `git status --short` and `git diff` to confirm intended changes.
2. Create a GitHub issue with `gh issue create`, summarizing the task and validation/deployment plan.
3. Commit directly to `test` with `Refs #<issue-number>`. Do not use automatic closing keywords such as `Fixes`; issue closure follows verification.
4. Push with `git push origin test`.
5. Wait for GitHub CI and automatic TEST deployment; do not run a duplicate local deployment. Inspect workflow results, summaries, and deployment checks before reporting success.
6. Close the issue only after deployment verification succeeds, or after the documented documentation-only skip evidence below. Report authenticated visual acceptance separately.

GitHub CLI authentication is expected to be available. [TEST automatic deployment](test-auto-deployment.md) is the detailed deployment contract: database migrations and non-code infrastructure/configuration changes require independent verification and operator registration; missing approvals and unknown changes fail closed. Production remains operator-run. Bootstrap and incident recovery use the documented independent procedure and shared deployment lock.

Documentation-only changes skip deployment under the existing contract. For an authorized documentation-only delivery, close the issue after applicable local checks and CI pass and the workflow confirms the expected documentation-only skip for the pushed commit. Record the commit/run evidence and explicitly report "deployment skipped: documentation only." An unexplained skip, disabled automation, or failed/blocked run is not this exception.

## Completion reporting

- Implementation: report applicable checks passed, failed, or blocked. Documentation-only work uses semantic/consistency/link/diff checks and skill validation when applicable; code changes require typecheck/build and affected focused checks. Mixed changes require both. Read-only analysis does not require build checks.
- Deployment: report not requested, passed for an identified commit, legitimately skipped for documentation only, failed, or blocked, with workflow evidence when delivery was requested.
- Visual acceptance: report not applicable, pending, user-deferred, passed, failed, or blocked. Meaningful frontend changes retain all five viewport requirements and the user-login procedure. Deferred acceptance does not prevent separately reporting completed implementation/deployment or closing a deployment-verified issue; state the outstanding visual acceptance explicitly and do not claim the UI is fully accepted.
