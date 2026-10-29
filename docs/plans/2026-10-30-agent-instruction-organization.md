# Agent Instruction Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution or `superpowers:subagent-driven-development` if that execution method is selected. Follow the project's compatibility rules; the skill does not authorize commits, worktrees, or delivery. Track execution with the checkboxes below.

**Goal:** Make root agent instructions a concise project entry point while preserving every active requirement in its appropriate maintained source.

**Architecture:** Keep project identity, a code map, universal constraints, authorization boundaries, and mandatory task-based reading routes in `AGENTS.md`. Put product behavior in maintained specifications, cross-layer conventions in focused documents, and execution procedures in the existing workflow. Retain one complete owner for each rule and use links for consumers.

**Tech Stack:** Markdown documentation, Git, PowerShell, and existing repository verification guidance. No application, dependency, build, infrastructure, or plugin changes.

**Spec:** The user's instruction review and follow-up explicitly require dashboard rules to leave `AGENTS.md`, appropriate separation of other content, and preservation of Superpowers requirements. The target organization and coverage matrix below capture that request; existing [project rules](../../AGENTS.md), [workflow](../project-workflow.md), and [adopted decisions](../decisions/rules-cleanup-decisions.md) remain authoritative until an authorized documentation edit replaces their locations.

Status: Implemented; documentation reorganization and verification completed on 2026-10-30.
Created: 2026-10-30 (Pacific/Auckland).
Planning baseline: branch `test`, HEAD `fb758a97ebbc817cb8b62d50ee3f4dcfe4478d10`, clean working tree before this plan was created. Recheck the baseline at execution time.

## Global Constraints

- Preserve business behavior, financial formulas, permissions, date semantics, deployment gates, and existing authorization boundaries. Relocation is not policy approval.
- Remove the entire dashboard calculation/chart section from root instructions, including formula summaries. Route relevant tasks to the investment specification instead.
- Use the existing `test` checkout. Ask before switching from another branch unless already authorized; do not create a branch or worktree for this task.
- Implementation authorizes document changes, validation, review, and a report. It does not authorize an issue, commit, push, deployment, live data changes, or migration application.
- Keep new/updated repository prose in English, with the existing UI/source-text and bilingual root README exceptions.
- Preserve real user agreement/login/readiness and viewports `320x740`, `393x852`, `430x932`, `768x1024`, and a desktop width. Their relocation does not change acceptance requirements.
- Keep Superpowers enabled and retain its current project adaptations and documented desktop/CLI coverage limits. Do not edit cached skills, the local loader skill, plugin installation, or global configuration.
- Reuse existing documents. Add only `docs/frontend-guidelines.md` and `docs/time-policy.md` as new maintained sources; do not create a parallel agent documentation tree or nested instruction files.
- Do not impose a line-count target. Judge the root by relevance, correct ownership, and reliable discovery.

## Review Focus

1. A task changes shared valuation, price ingestion, or snapshots without mentioning dashboard: its reading route must still reach the relevant financial contracts (Tasks 1 and 2).
2. A rule is deleted from the root but survives only in this plan or a historical record: every active requirement must have a maintained destination (Tasks 1 and 4).
3. An authorization summary hides existing viewer exceptions or broadens permissions: preserve endpoint-specific contracts and remove misleading method-only summaries (Tasks 1 and 4).
4. A Superpowers worker starts with an isolated context or an uncommitted tree: it must receive relevant specifications, scoped diffs/new files, and current authorization limits (Tasks 3 and 4).
5. Moved UI/time requirements become circular links or optional reading: source ownership, mandatory triggers, and links/anchors must be explicit (Tasks 2 and 4).

## Target Ownership and Coverage Matrix

Each row is a migration checklist, not a second permanent rule source. During implementation, record the final destination section and verification result in this plan. Retain all qualifying clauses, exceptions, and prohibitions when merging existing text. Do not resolve a substantive disagreement by silently preferring code or the shorter wording.

| Current content | Complete maintained owner after the change | Root treatment |
| --- | --- | --- |
| Product names, small family scope, simple roles, architecture/scope limits | `AGENTS.md` | Retain a concise statement; preserve limits on complex RBAC, always-on services, tax-engine expansion, and core DynamoDB use |
| Stack, repository component map, and market-data acquisition boundaries | `docs/architecture.md`, with a short root map | Retain enough to locate web, API, jobs, shared code, migrations, seeds, and infrastructure; preserve the requirement for a clear data-source decision before scraping |
| API layering and shared types/calculation placement | `docs/architecture.md` | Keep core responsibility boundaries; move detailed directories and shared public-entry-point guidance |
| Strict TypeScript and code conventions | `docs/architecture.md` | Keep strict typing/minimal-dependency principles concise; avoid repeated generic style advice and any new lint configuration |
| Supabase identity, role enforcement, endpoint exceptions | `docs/auth.md` and endpoint-specific `docs/api.md` sections | Retain server-side authorization, frontend hints, and defensive RLS; remove the simplified HTTP-method permission table |
| Response envelope and stable error codes | `docs/api.md` | Link instead of reproducing JSON/code lists; retain the prohibition on exposing secrets/internal traces |
| Repository/UI language and README exception | `AGENTS.md` | Retain the complete language policy concisely |
| Existing UI terminology and tax wording examples | `docs/frontend-guidelines.md` | Retain Chinese UI and cautious tax scope in the root; move exact label/examples without prescribing a new vocabulary |
| Authoritative financial precision | `docs/data-model.md` Financial Values, with a root safety principle | Preserve PostgreSQL `numeric`, supported decimal/minor-unit approaches, and prohibition on careless authoritative floating-point calculations |
| Mobile navigation, tap targets, stacked/wrapped controls, tables, drawers, and shared back navigation | `docs/frontend-guidelines.md` | Mandatory frontend reading route; no detailed layout checklist |
| Login procedure, five viewports, and visual acceptance evidence | `docs/local-testing.md` Authenticated browser acceptance | Retain no-bypass/no-false-acceptance guardrails and the reading route; completion/deferred-state reporting belongs to Workflow |
| Instants, calendar dates, local display, business-day cutoff, provider dates, and shared helpers | `docs/time-policy.md` | Mandatory date/time reading route; no embedded cutoff or helper implementation recipe |
| Historical prices versus live cache and published unit-price lag | `docs/data-model.md` Market Data Foundation / Portfolio Valuation Snapshots | Mandatory market-data/valuation route |
| Global cadence, FundRock-only refresh option, timezone-aware Scheduler and scheduled-time context | `docs/deployment.md` Scheduled Jobs | Mandatory jobs/scheduling route; do not change scheduling or enable anything |
| Dashboard daily-change eligibility, denominator, unavailable values, chart endpoints/gaps/colors/hover, and explicit-change requirement | `docs/specs/investment-overview.md`; DTO semantics in `docs/api.md` | Remove the whole root section, including summaries; add mandatory investment/valuation reading route |
| Focused dashboard, trend, time, and other verification commands | `docs/local-testing.md`, referenced by relevant specification/policy acceptance sections | Keep only universal completion checks in the root |
| Secrets, public-only frontend configuration, no hardcoded infrastructure identities | `AGENTS.md`, with runtime details in architecture/deployment | Retain universal security constraints |
| Implementation versus delivery scope, default branch, independent-operation authorization, no gate bypass | `AGENTS.md` compact boundaries; full scope table in Workflow | Retain boundaries; remove repeated delivery sequence |
| Issue/Refs/commit/push/monitor/closure and Windows migration procedure | `docs/project-workflow.md`; release mechanics in `docs/test-auto-deployment.md` | Required links before the relevant operations |
| Code versus documentation validation, accurate completion claims | `AGENTS.md`; detailed procedures and reporting in Workflow/local testing | Retain typecheck/build, focused checks, and documentation-only/read-only distinctions |
| Superpowers daily adaptations | `docs/project-workflow.md` SuperPowers compatibility | Require reading before implementation, planning/execution, or delegation; preserve scope priority |
| Superpowers identity, upgrade checks, Windows helpers, CLI limitations | `docs/operations/superpowers.md` | Link; avoid duplicating version/activation details across entry points |
| Historical preparation/activation statements and one-time rollout evidence | Existing decisions, plans, and release records | Link from current contracts; label historical state explicitly |

## Task 1: Establish Complete Destination Contracts

**Files:** Create `docs/frontend-guidelines.md` and `docs/time-policy.md`. Modify relevant sections of `docs/architecture.md`, `docs/auth.md`, `docs/api.md`, `docs/data-model.md`, `docs/deployment.md`, `docs/specs/investment-overview.md`, and `docs/local-testing.md` only where needed to receive rules or replace duplicate prose with links.

**Inputs:** Current root sections and corresponding maintained contracts. **Output:** Complete destination sections that can be linked before root text is removed.

- [x] Record the execution baseline: HEAD, branch, staged/unstaged changes, and relevant untracked files. Preserve pre-existing work and identify this task's scope.
- [x] Compare every root bullet against the matrix and destination text; record any missing clauses or genuine conflicts before editing. Preserve unresolved contract disagreements for user decision rather than changing behavior.
- [x] Create frontend guidelines with UI terminology, mobile navigation/layout/table rules, minimum `44px` tap targets, and the existing shared back-navigation pattern. Move the cross-page pattern from the investment specification and link it there.
- [x] Consolidate all five viewport sizes and the complete agreement/URL/login/readiness procedure in local testing. Preserve user-deferred acceptance and the rule that local ports do not isolate TEST data or authorize writes; reference Workflow for completion status semantics.
- [x] Create time policy defining UTC instants versus calendar dates, viewer-local display versus global `Asia/Shanghai` business dates with the `06:00` cutoff, provider/exchange dates, shared helpers, and `verify:time-policy`. Link to storage and scheduler owners for their specific requirements.
- [x] Merge price/cache semantics and expected FundRock lag into data model, and global cadence/Scheduler context into deployment. Preserve the distinction between historical closes/published units and live quotes; do not reinterpret existing estimated-price contracts.
- [x] Consolidate the root dashboard section into investment overview. Preserve data-kind/date eligibility, all denominator exclusions/prohibitions, unavailable results, both connected chart endpoints, true gaps, saved closes, colors/hover, and explicit authorization for contract changes. Keep API DTO semantics aligned and link focused verification commands.
- [x] Consolidate detailed code organization, API envelope/error codes, and financial precision into their owners. Verify the existing preferences and trading-password viewer exceptions remain explicit; make no permission changes.
- [x] Compare the destination text to the original root and mark each covered matrix row. A missing or weakened clause fails this task even when the destination already contained a similar summary.

## Task 2: Replace Root Detail with Mandatory Task Routing

**Files:** Modify `AGENTS.md` and `docs/README.md`.

**Inputs:** Task 1's complete destinations. **Output:** A root entry point and documentation map that reliably locate the applicable contracts.

- [x] Restructure the root around project identity/scope, repository map, universal constraints, working/authorization boundaries, validation, and a task-reading table. Retain security, precision, language, branch, authorization, and honest-verification requirements.
- [x] Remove the entire dashboard calculation/chart section and its formulas. Remove migrated mobile/time/API details, label lists, and repeated delivery procedures; retain their mandatory routes rather than abbreviated copies.
- [x] Add the following reading triggers, explicitly required before editing or acting in the relevant area. Multiple triggers combine; use affected dependencies and behavior, not just the user's keywords or the edited directory.

| Task or affected behavior | Required reading |
| --- | --- |
| Implementation, planning, review, or delegation | Workflow, including Superpowers compatibility, plus applicable contracts below |
| Architecture, component responsibilities, shared interfaces | Architecture and affected API/data contracts |
| Identity, permissions, or endpoints | Auth and relevant API sections |
| Web UI, including browser-only verification | Frontend guidelines and local testing's authenticated acceptance procedure; relevant product specification |
| Date defaults, timestamps, business dates, or scheduler time | Time policy; data-model/deployment sections when storage or jobs are affected |
| Investment valuation, dashboard, holdings, account performance, or chart helpers | Investment overview, relevant API/data-model sections, and local verification guidance |
| Price/FX ingestion, provider freshness, snapshots, or shared valuation inputs | Time policy, market-data/snapshot data model, affected investment contracts, and jobs/schedule guidance |
| Spending or education behavior | Existing spending/education specifications and relevant API/data-model sections |
| Commit, push, deployment, migrations, or infrastructure operations | Workflow delivery scope; TEST contract/deployment and migration procedure as applicable, subject to existing authorization |
| Superpowers installation, upgrade, troubleshooting, or coverage claims | Superpowers operating guidance and compatibility rules |

- [x] Update the documentation map with both new documents and corrected ownership descriptions. Link this plan as a draft; do not describe proposed organization as implemented before it is.
- [x] Walk through a dashboard task, a provider fix, a mobile drawer change, a preference endpoint change, and a documentation-only task using only the root entry point. Confirm each reaches its required sources without loading unrelated procedures by default.

## Task 3: Align Workflow and Superpowers References

**Files:** Modify `docs/project-workflow.md`, `docs/operations/superpowers.md`, and `docs/decisions/rules-cleanup-decisions.md`. Update references in other touched maintained documents where necessary. If moving encountered history, use existing matching plans/releases or `docs/releases/test-release-history.md` and record the exact additional paths in the execution evidence.

**Inputs:** Tasks 1 and 2's source ownership. **Output:** Unchanged execution/authorization semantics with current links and clear historical status.

- [x] Replace Workflow's assertions that detailed business/mobile rules live in AGENTS.md with links to their new owners. Preserve the delivery scope table, full delivery sequence, migration procedure, and separate completion reporting.
- [x] Preserve all seven compatibility areas: workspace/delivery, uncommitted review, documents/approval, proportional planning, verification, agents/rulings, and completion. Keep design/plan approval distinct from commit authorization.
- [x] Update delegation requirements so each worker/reviewer receives root rules, Workflow, relevant destination specifications, scope, baseline/diffs/new files, and validation/authorization limits. Preserve ledger retention and prohibit agent rulings from changing protected contracts.
- [x] Move activation/upgrade helper-verification detail and upstream comparison references from Workflow to Superpowers operations, retaining a link in Workflow. Keep existing installed-version evidence, Windows runtime caveats, unverified optional features, and the open CLI discovery gap; do not claim new runtime verification.
- [x] Clarify the cleanup decision record's opening disabled-state statement as historical preparation, with a link to subsequent adoption. Preserve dated decisions and evidence.
- [x] Review historical prose encountered in touched sections: move only clearly one-time rollout/repair/acceptance details to matching existing records, with dates and provenance intact. Use `docs/releases/test-release-history.md` for existing TEST history lacking a matching dated record. Preserve operationally necessary facts and current behavior; do not perform a broad documentation rewrite or invent new release evidence.
- [x] Check that current contracts no longer rely on this plan, old release prerequisites, or activation history as their sole normative source. Update incoming links to moved sections throughout tracked maintained documents.

## Task 4: Verify Coverage, Discovery, and Scope

**Files:** Review every changed document and relevant incoming links. Update this plan with final destinations, evidence, and unresolved findings after execution.

**Inputs:** Complete scoped documentation diff and the original baseline. **Output:** A reviewed documentation change with evidence of preserved requirements.

- [x] Run `git diff --check`; inspect new untracked documents as well, because ordinary `git diff` omits them. Check new-file whitespace using `git diff --no-index --check -- /dev/null <file>` (or an equivalent read-only Windows check) without staging files just to inspect them.
- [x] Validate relative file links and heading fragments in changed documents, including links from maintained documents to removed/moved headings. Use a temporary local checker or manual review; do not add a permanent verification framework. Mark future file references in this draft as planned until those files exist.
- [x] Review the full scoped working/index diff and relevant untracked contents, plus any task commits since the execution baseline if separately authorized. Check the coverage matrix clause by clause, not by keyword count alone.
- [x] Confirm root instructions contain no dashboard formula, chart rendering rule, provider-specific freshness rule, or Scheduler payload recipe. Confirm those requirements exist in maintained owners and are reachable through mandatory routes.
- [x] Exercise the five Review Focus scenarios as document walkthroughs. Add boundary cases for documentation-only work, authorized push with automatic TEST monitoring, blocked automation, and a request for authenticated UI acceptance; expected authorization and validation behavior must be unchanged.
- [x] Compare all seven Superpowers compatibility areas before/after. Confirm required specs travel with isolated worker context, uncommitted review is still mandatory, and no installation/configuration/worktree/commit action has been introduced.
- [x] Record coverage results and any unresolved material issue in this plan. Update its status to Implemented only after the authorized documentation work and checks actually complete.
- [x] Report documentation implementation and validation separately from deployment (not requested) and visual acceptance (not applicable to this documentation change). Existing product visual-acceptance gaps remain unchanged.

Documentation-only verification does not require application typecheck/build, provider calls, database tests, or authenticated browser sessions. No skill file is changed, so a skill validator is not applicable. If executable behavior or build inputs enter scope, stop treating the work as documentation-only and apply the project's code validation requirements.

## Execution Recommendation and Completion Criteria

Prefer inline execution because the tasks edit overlapping documents and must preserve consistent source ownership. Review the complete uncommitted result after the sequential edits; use relevant review skills within project and host limits. If subagent-driven execution is selected, keep overlapping writes sequential and supply the same coverage matrix and authorization limits to each worker.

Completion requires every active requirement to have a maintained owner, all mandatory reading routes and links to work, the entire dashboard detail section to be absent from root instructions, and the full Superpowers compatibility set to remain effective. Formatting or a shorter root alone is not proof of completion. The original implementation authorization excluded commit/push/delivery; subsequent explicit delivery authorization is recorded below.

## Execution Evidence (2026-10-30)

The user authorized implementation in this chat. Execution used the existing `test` checkout and retained HEAD `fb758a97ebbc817cb8b62d50ee3f4dcfe4478d10`. The previously untracked draft plan was the only initial change; no index changes, commits, branch/worktree creation, issue, push, deployment, migration, or live-data operation occurred.

### Coverage and ownership

All rows in the ownership matrix were checked against the original root and their final maintained destinations. Existing Auth permissions, API field semantics, and deployment scheduling clauses were already complete; they were preserved rather than rewritten. The complete dashboard section left the root, including formula summaries. Shared UI conventions and time handling now have maintained owners in [frontend guidelines](../frontend-guidelines.md) and [time policy](../time-policy.md).

The source locations for final clause-level checks are:

| Requirement group | Verified final sections |
| --- | --- |
| Identity, scope, language, precision/security principles, branch and authorization, universal validation | [AGENTS.md](../../AGENTS.md) |
| Component duties, API layering, shared public entry point/update order, typing and schema integrity conventions | [Architecture / Code organization](../architecture.md#code-organization) |
| Tokens, user roles, method defaults and viewer exceptions; response envelope/codes and endpoint-specific permissions | [Auth / Enforcement](../auth.md#enforcement), [API / Response contract](../api.md#response-contract), and existing endpoint sections |
| Chinese labels, tax wording, mobile navigation, controls, tables, drawers, back links | [Frontend guidelines](../frontend-guidelines.md) |
| Five exact viewports, agreement/URL/login/readiness, no bypass or false acceptance, deferred status | [Authenticated browser acceptance](../local-testing.md#authenticated-browser-acceptance), [completion reporting](../project-workflow.md#completion-reporting) |
| UTC instants, calendar dates, local display, global cutoff, shared helpers, provider-date distinction and verification | [Time policy](../time-policy.md) |
| Confirmed/published historical prices versus quote cache, preserved explicit estimates/manual records, FundRock lag, snapshots and exact financial arithmetic | [Market Data Foundation](../data-model.md#market-data-foundation), [Portfolio Valuation Snapshots](../data-model.md#portfolio-valuation-snapshots), [Financial Values](../data-model.md#financial-values) |
| Global schedule priority, FundRock-only refresh option, timezone and scheduled-time payload/defaults | [Scheduled Jobs](../deployment.md#scheduled-jobs) |
| Daily-change date/kind eligibility, total-assets denominator and prohibited substitutes, unavailable values, both connected curves/gaps/colors/hover, explicit-change protection | [Dashboard Composition and Trends](../specs/investment-overview.md#dashboard-composition-and-trends), [Dashboard Read API](../api.md#dashboard-read-api) |
| Focused verification, delivery/Refs/closure, migration procedure, gates and registration | [Local validation](../local-testing.md#validation), [Workflow](../project-workflow.md), unchanged [TEST contract](../test-auto-deployment.md) |
| Seven Superpowers compatibility areas, activation/upgrade procedure, desktop evidence and open CLI gap | [Compatibility](../project-workflow.md#superpowers-compatibility), [operating guidance](../operations/superpowers.md) |

Historical relocations were limited to encountered material: FundRock repair provenance and the 2026-10-08 snapshot implementation boundary moved to `docs/releases/test-release-history.md`; architecture now links the existing dated snapshot cutover, with the staged summary preserved there. The cleanup decision's disabled state is explicitly historical. `docs/roadmap.md` changed only the contract-location reference; no deployment or acceptance status changed. No historical evidence was newly executed or revalidated.

### Task-routing walkthroughs

These are documentation walkthroughs, not application/runtime tests.

| Scenario | Observed route and preserved outcome |
| --- | --- |
| Dashboard or shared chart helper | Root investment route reaches specification, API/data model and focused verification; formulas remain in their owners |
| Provider freshness, shared valuation input, or snapshot fix without a dashboard keyword | Root behavior/dependency triggers combine time, market-data/snapshot, affected investment contracts and jobs/scheduling routes |
| Mobile drawer change | Frontend guidelines require the closed-by-default overlay and fitting controls; local testing requires user handoff and all five viewports |
| Viewer preference update or gated password reveal | Auth/API routes expose both existing viewer exceptions; no role change is inferred from the HTTP method |
| Documentation-only task | Root and Workflow require semantic/link/diff checks, without an application build or artificial production tests |
| Authorized push | Existing delivery workflow includes issue/Refs/commit preparation, automatic CI/TEST monitoring, and verified closure without a redundant permission request |
| Disabled, failed, or blocked automation | Root and delivery contract require diagnosis/reporting and prohibit manual substitution or gate bypass |
| Migration or authenticated visual verification | Independent migration authorization/Windows/TEST procedure remains required; visual inspection waits for agreement/login/readiness and preserves deferred acceptance |
| Isolated worker or reviewer with uncommitted changes | Compatibility supplies applicable maintained contracts and authorization limits, plus baseline/working/index/new-file evidence; no forced commit is needed |

The compatibility comparison retained all seven areas: workspace/delivery; review without commits; documents/approval; proportional planning; verification; agents/rulings; completion. The first five retain their substantive text. Agents/rulings now explicitly names isolated contexts and baseline/diff inputs; completion links to the complete login/viewport procedure. Version/helper checks moved to operations with a mandatory Workflow link.

### Validation and review

- `git diff --check`: passed.
- Temporary read-only documentation checker: scanned all 28 tracked/new Markdown files, including incoming relative links and heading fragments; zero link/anchor errors, zero changed-document whitespace errors, and no non-Markdown changes. New untracked documents were included without staging them. The checker remains ignored task scratch, not a new project framework.
- Root-detail check: no dashboard formula, chart rule, provider-specific freshness rule, cutoff value, tap-size detail, or Scheduler payload recipe remains in root instructions. The required task-reading routes reach their maintained owners.
- Baseline compatibility comparison: all seven named areas remain. Referenced `verify:dashboard`, `verify:portfolio-trend`, and `verify:time-policy` commands exist in `package.json`; they were not run for this documentation-only change.
- Fresh-context final review used the actual scoped working/index diffs, all three untracked documents, original root, plan, and ledger. Result: no Critical, Important, or Minor findings; ready for documentation completion. The reviewer independently confirmed branch/HEAD, unchanged index, and passing diff check. No unresolved material finding or deferred minor remains.
- No application typecheck/build, browser acceptance, live checks, or skill validator was required: executable behavior, build inputs, and skill files were unchanged.

### Recorded decisions and review boundaries

| Decision | Reason and limit |
| --- | --- |
| Apply documentation-only semantic/link/diff checks instead of production TDD/build | Required by the project's explicit compatibility rules and this plan. The residual risk of a lost prose qualifier was addressed by clause-level coverage and independent review; no runtime-test result is claimed. |
| Reviewer set aside application runtime, live deployment, and authenticated visual behavior | These were unchanged and outside this task. Documentation completion supplies no fresh evidence for those behaviors; existing product acceptance gaps remain outstanding. |
| Reviewer set aside fresh Superpowers installation/CLI verification | No tooling state changed. Installed-version evidence and the open CLI discovery limitation remain as recorded; this work does not extend that coverage. |

At implementation completion: documentation reorganization and applicable verification were complete; deployment was not requested and visual acceptance was not applicable. Changes were local and uncommitted, so the ignored progress ledger was retained rather than assuming commit history preserved its record.

## Subsequent Authorized Delivery (2026-10-30)

The user explicitly requested committing the documentation to GitHub's `test` branch. Delivery follows the existing issue/Refs/commit/push/CI verification workflow. [Issue #117](https://github.com/bluewuxi/family-ledger/issues/117) holds the exact commit/run and documentation-only skip evidence; the [dated delivery record](../releases/2026-10-30-agent-instruction-organization.md) defines scope and closure criteria. This does not authorize manual application deployment, migrations, live-data changes, infrastructure changes, or production release.
