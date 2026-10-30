# Project Workflow

Read this document for planning, implementation, review, delegation, validation, migration, or delivery work. [AGENTS.md](../AGENTS.md) holds universal project constraints and mandatory reading routes; the [documentation map](README.md#maintained-sources) identifies the maintained product and cross-layer contracts. The [adopted cleanup decisions](decisions/rules-cleanup-decisions.md) record approved authorization and completion policies. Superpowers is enabled for the Codex desktop workflow; see [usage and verified coverage](operations/superpowers.md).

## Workspace and implementation

Before editing, inspect `git branch --show-current` and `git status --short`. Use the existing `test` branch for routine work; do not create feature branches unless explicitly requested. If the current branch is not `test`, ask before switching unless the user explicitly requested work on another branch.

Prefer small vertical slices, changing only the necessary layers in this order: shared types/validation, migration if needed, repositories, services, routes/handlers, frontend API client, frontend components, documentation, and validation. Update architecture, schema, API, auth, deployment, and roadmap documentation when their decisions change.

## Documentation maintenance

Use the [documentation map](README.md) to locate maintained contracts and historical records. Formal implementation plans are version-controlled repository documents; creating or editing one does not authorize issue creation, commit, push, or deployment. Keep temporary drafts, private source data, migration mappings, backups, and diagnostic output in ignored local locations. Mark plan status explicitly and link final contracts and delivery evidence when available.

Place maintained product specifications in `docs/specs/`, new dated plans in `docs/plans/`, operator procedures in `docs/operations/`, adopted decisions in `docs/decisions/`, and release evidence in `docs/releases/`. Cross-layer contracts and workflow entry points remain directly under `docs/`. Update incoming links and each moved document's relative links whenever relocating a file. Follow the naming guidance in the documentation map.

A small hotfix does not require a retrospective plan. If it restores specified behavior, retain the existing specification and add focused verification where appropriate. User-authorized behavior changes require updates to the affected specification and API/schema/auth contracts. Update operational guidance when procedures change. Record actual delivery and its checks in dated release evidence, with issue/commit references when authorized and available. Update the roadmap only when current progress or outstanding acceptance changes. Complex cross-layer changes, data repairs, or risky migrations warrant a short implementation plan before execution.

Keep maintained specifications focused on durable behavior and repeatable acceptance criteria. Plans preserve implementation history; dated release records preserve deployment and acceptance evidence. Historical authorizations and one-time cutover assumptions do not apply to future operations. README's opening bilingual project description is the sole documentation-prose language exception defined in AGENTS.md.

## SuperPowers compatibility

These project adaptations govern the activated desktop workflow. The [adoption record](plans/2026-10-27-superpowers-adoption.md) identifies the selected version, checks, and coverage limits. Apply the host's instruction hierarchy and the user's authorized scope; a skill, generated plan, or agent ruling cannot expand that scope or override project contracts.

- **Workspace and delivery:** Work in the existing `test` checkout by default. Create a branch or worktree only when explicitly requested; retain the ask-before-switching rule. Use this document's delivery workflow instead of a generic merge/push/PR menu. Design approval and plan execution do not authorize commits. Omit automatic design/per-task commits unless commit authorization covers them; authorized commits require the project issue and `Refs` convention. Existing push authorization includes configured automatic TEST monitoring without another permission prompt.
- **Review without commits:** Record starting HEAD, branch, and existing staged/unstaged/untracked changes before implementation. Review the final task scope across committed changes since that baseline, `git diff`, `git diff --cached`, and relevant untracked file contents. Identify task changes within already-modified files without reverting unrelated work. A `BASE...HEAD` review alone is insufficient while changes remain uncommitted. Give reviewers the actual scoped diff, new files, relevant contracts, and validation evidence. Keep the progress ledger until its decisions and unresolved findings are recorded in a durable plan or completion report; do not delete it on the assumption that commits exist.
- **Documents and approval:** Override upstream `docs/superpowers/` defaults with `docs/specs/YYYY-MM-DD-<topic>-design.md` for proposals and `docs/plans/YYYY-MM-DD-<topic>.md` for plans. Mark proposals Draft or Approved and link the stable maintained specifications they affect. Approval does not silently replace the current contract; update the stable specifications when an authorized behavior change is implemented. Use English prose, preserving the root README exception and permitted UI/source text. Formal documents remain version-controlled; temporary briefs and review packages remain ignored local artifacts.
- **Proportional planning:** A clear small correction that restores an existing contract uses diagnosis, focused verification, and implementation without a retrospective plan or repeated design approval. Use design discussion for material uncertainty or a proposed contract change, and a short plan for complex cross-layer work, data repair, or risky migration. Reuse decisions already approved in the conversation rather than asking again.
- **Verification:** Prefer a reproducible failing focused check before changing business logic, then demonstrate that the fix passes. Use existing verification scripts rather than adding a test framework solely to satisfy a template. Use the project's Corepack/pnpm setup and verification commands rather than upstream `npm install` examples. Documentation-only changes use semantic/link/diff checks and applicable skill validation; pure styling uses appropriate existing checks and required visual acceptance without artificial unit tests. All code changes still require typecheck/build and affected focused checks. Do not delete existing or user-authored code merely because it was not written through TDD. Classify commands before running them: local fixture checks, isolated database tests, live reads, and live writes have different effects. Generic test or completion steps do not authorize migrations, data repair, or live mutation.
- **Agents and rulings:** Delegate only when authorized by the user or applicable skill instructions and supported by the host. Give each agent AGENTS.md, this workflow, the applicable maintained specifications/policies from the task-reading routes, the scoped task, and current authorization/validation limits, including in isolated contexts. Provide implementers the starting branch/HEAD and relevant existing changes; give reviewers the actual scoped working/index diffs, relevant new-file contents, and validation evidence. Keep overlapping writes sequential. Agent rulings may resolve implementation details, but cannot alter financial formulas, business-date semantics, permissions, login/viewport requirements, delivery scope, or other explicitly protected contracts. Report unresolved material defects; a review limit or parked finding is not evidence that the contract passed. Use actual available tools and models; do not copy upstream model names or change global model configuration as a prerequisite.
- **Completion:** Report implementation, deployment, and visual acceptance separately. Preserve user agreement, login/readiness, and all five required viewport checks in [authenticated browser acceptance](local-testing.md#authenticated-browser-acceptance). A mockup, automated test, build, or subagent report cannot substitute for authenticated visual acceptance. Follow the existing completion and issue-closure rules, including deferred acceptance and documentation-only deployment skips.

For a future separately authorized activation or version verification, follow the [activation and upgrade verification procedure](operations/superpowers.md#activation-and-upgrade-verification). These daily compatibility rules remain the adaptation source.

## Jobs and market data

For jobs and market data, inspect existing `apps/jobs/src` patterns and relevant `scripts/verify-*` scripts first. Reuse provider interfaces, job/provider run logging, idempotent inserts, SSM secrets, Scheduler metadata, and redacted structured logs. Do not introduce scraping or another provider approach without a clear data-source decision.

## Frontend verification and runtime configuration

Follow [frontend guidelines](frontend-guidelines.md) for mobile layout and shared navigation, and [authenticated browser acceptance](local-testing.md#authenticated-browser-acceptance) for startup guidance, user agreement/login/readiness, and all five viewport requirements.

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

## Contract ownership and command effects

Use the [documentation map](README.md#maintained-sources) for contract owners. When sources materially disagree, report evidence and explicitly reconcile the owning contract; neither implementation nor historical release evidence silently overrides intended behavior. Continue unaffected work. Classify verification commands by their actual effects using [local testing](local-testing.md#command-effects); names such as verify, smoke, or dry-run do not imply isolated or read-only execution. Preserve existing authorization within scope, but do not infer live-write permission from generic validation.
