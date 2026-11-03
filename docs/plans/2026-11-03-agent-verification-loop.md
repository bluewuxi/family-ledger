# Agent Verification Loop Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential implementation after implementation is explicitly requested. Use `superpowers:subagent-driven-development` only if delegation is authorized. Follow the project compatibility rules; no automatic commits, branches, worktrees, pushes, or deployments.

**Status:** Implemented locally; user approved implementation and subsequently authorized the default delivery workflow on 2026-11-03. See [delivery evidence](../releases/2026-11-03-agent-verification-loop.md).
**Goal:** Make verification discoverable, conservatively selectable, and repeatable while catching deterministic documentation drift.
**Architecture:** A typed registry describes checks and their effects. A local CLI plans checks and executes only audited local fixtures; CI uses a fixed core profile. A separate documentation checker validates references and explicitly marked plan metadata.
**Tech Stack:** Existing Node 22, pnpm 9.15.4, strict TypeScript, tsx, node:assert, and existing YAML support; no new test framework or service.
**Spec:** The user's selected four-part scope: verification inventory, safe execution entry point, critical CI coverage, and documentation consistency. Governing contracts: [workflow](../project-workflow.md), [local testing](../local-testing.md), [documentation map](../README.md), and [TEST deployment](../test-auto-deployment.md). This proposal does not supersede those contracts.

## Baseline and decisions

- Inspected `test` at `fff61687a663bece4040211ae631c9ee36b03e14`; the working tree was clean before this plan.
- The shared validation action currently runs typecheck/build and six focused commands: api-health, holdings, dashboard, portfolio-trend, time-policy, and deployment.
- Existing auth and account-access checks include synthetic HTTP/SDK fixtures; similarly named live-auth and database scripts have different effects. Full dependency review is required before admitting any check to execution.
- The root TypeScript project does not cover every standalone script. New tooling needs its own strict typecheck configuration.
- Preserve current scripts and package aliases. Add metadata and orchestration around them, rather than rewriting business tests.
- Use a fixed CI core first. Change-based selection is a local recommendation, not a claim of complete dependency analysis and not a way to remove core CI checks.
- Reuse the current authority map. Do not introduce a second spec hierarchy, an MCP server, scheduled agents, or automatic document rewriting.
- Alternatives considered: prose-only inventory leaves selection manual; running all scripts risks live effects; fully dynamic CI can silently omit checks. The selected registry plus fixed core avoids those failure modes with limited machinery.

## Global constraints

- Work in the existing `test` checkout; inspect HEAD and all staged, unstaged, and untracked changes again before implementation.
- Preserve financial formulas, permissions, login/viewport requirements, and deployment gates.
- No live reads/writes, credential resolution, database migrations, or cloud operations are part of the new executor.
- Registry classification is reviewed metadata, not an OS security boundary. Environment filtering cannot prevent arbitrary code from reading files or opening sockets.
- Keep all repository prose and identifiers in English. Implementation uses existing installed dependencies.
- Future code implementation requires `corepack pnpm typecheck`, `corepack pnpm build`, and affected focused checks. Planning-only delivery requires document/link/diff review.

## Review focus

1. A command changes from fixtures to live access: audit metadata must become stale and execution must stop (Tasks 1–2).
2. An untracked, renamed, or deleted file is absent from a naive diff: selection must include it or report an explicit blocker (Task 2).
3. Windows paths, command shims, spaces, and cancellation behave differently from Linux: exercise both execution adapters (Task 2).
4. A check fails or never starts: summaries and CI must not present a partial run as success (Tasks 2 and 4).
5. Historical examples and code fences resemble active document commands: document checks must avoid treating them as current executable requirements (Task 3).

## Planned file map

| File | Responsibility |
| --- | --- |
| `scripts/verification/registry.ts` | Typed check entries, domains, profiles, and reviewed effects |
| `scripts/verification/selection.ts` | Pure selection and explanation logic |
| `scripts/verification/runner.ts` | Fixed-command execution, environment policy, timeout and result handling |
| `scripts/verification/cli.ts` | Argument validation, Git discovery, text/JSON output |
| `scripts/verification/docs.ts` | Documentation reference and metadata checks |
| `scripts/verification/docs-policy.json` | Explicit maintained scope and narrowly scoped legacy exceptions |
| `scripts/verify-verification-tooling.ts` | Registry, selection, executor, and CI wiring fixtures |
| `scripts/verify-docs-consistency.ts` | Documentation checker fixture cases |
| `tsconfig.verification.json` | Strict no-emit checking for the new tooling |
| `package.json` | New entry points and tooling typecheck integration |
| `.github/actions/validate/action.yml` | Shared fixed-core execution and documentation gate |
| `scripts/verify-deployment.ts` | Adapt existing workflow assertions if required, preserving release protections |
| `docs/local-testing.md`, `docs/project-workflow.md` | User-facing command semantics and evidence reporting |
| `docs/README.md`, `docs/test-auto-deployment.md` | Tool discoverability and accurate CI description |

No changes to application code, migrations, infrastructure templates, or deployment permissions are intended.

## Task 1: Audited verification registry

**Files:** Registry, tooling fixtures, TypeScript config, package scripts, local-testing documentation.

**Interfaces:**

- `CheckEffect = 'local-fixture' | 'disposable-db' | 'live-read' | 'live-write' | 'operator' | 'unreviewed'`.
- `VerificationCheck`: `id`, optional `packageScript`, `steps` (ordered executable kind and argument arrays), `domains`, `contracts`, `effect`, `auditFiles` (path and SHA-256), `requirements`, `timeoutMs`, and `profiles`.
- Executable kinds are only workspace `tsx` and `tsc`; no user-provided executable or shell string. Composite aliases expand into reviewed steps, including deployment-tool typechecking.
- `validateRegistry(root): Diagnostic[]`; diagnostics identify the check, path, and correction required. Include failure on missing commands, duplicate IDs, missing contracts, and stale audit fingerprints.

- [x] Inventory every `verify:*` and `smoke:*` package alias plus standalone `scripts/verify-*`, `scripts/smoke-*`, and web verification entry points. Map composite aliases explicitly; list SQL-only checks as non-executable records.
- [x] Classify actual effects by reading entry points and relevant imports, subprocesses, environment loading, and network/SDK use. Unreviewed entries remain visible but non-executable.
- [x] Audit the proposed CI core first. Store fingerprints for its entry points, wrapper command definitions, and reachable executable dependencies; broad directory inclusion is acceptable initially. Do not hash documentation or unrelated application files merely to create churn.
- [x] Require re-review when executable dependencies change; do not provide an automatic approve-all or hash-refresh command. Fingerprints record review currency, not correctness or authorization.
- [x] Add failing fixtures for duplicate IDs, an undisclosed composite step, a missing package alias, an unknown entry point, and a changed audited dependency. Implement until they pass.
- [x] Add `verify:tooling` to run strict tooling typechecking and fixtures. Extend the required root typecheck to include this config without losing existing project checks.

**Acceptance:** All discovered verification entry points are represented; every executable record has reviewed effects and valid audit references. Unknowns are reported, never assumed safe.

## Task 2: Conservative planner and local executor

**Files:** Selection, runner, CLI, tooling fixtures, package scripts, local-testing documentation.

**Interfaces:**

- `selectChecks(input: SelectionInput): VerificationPlan`, returning `checks`, per-check `reasons`, `blockedChecks`, `unmappedPaths`, and required `baselineCommands`.
- `runChecks(plan: VerificationPlan, adapter: ProcessAdapter): Promise<VerificationReport>`; each result is `passed`, `failed`, `blocked`, or `not-run`, with duration and exit code.
- Proposed entry point: `corepack pnpm verify:checks -- <mode> ...`.
- Modes: `list`; `plan --changed`; `plan --base <ref>`; `plan --profile core`; `run --profile core`; `run --check <id>` (repeatable). Optional `--json` produces one versioned JSON result. No arbitrary argument pass-through, apply flag, or force override.
- Exit codes: `0` complete success, `1` executed failure/timeout, `2` invalid input, stale audit, missing prerequisites, or blocked selection.

- [x] Write pure selection fixtures before implementation: API auth change; transaction change; shared calculation change; docs-only change; mixed docs/code; unknown path; renamed/deleted/untracked file; missing Git base.
- [x] Implement NUL-delimited Git discovery. `--changed` unions working-tree, index, and non-ignored untracked paths. `--base` additionally includes changes since the merge-base with that ref. Include both rename endpoints; unavailable bases fail visibly.
- [x] Map transaction changes to holdings, cash legs, timeline, idempotency, dashboard, and snapshots. Map auth/access changes to auth, account-access, and client/session checks. Shared changes conservatively select all audited local checks. Docs-only plans select documentation checks; code plans always list typecheck/build as required baseline commands.
- [x] Do not claim changed-path planning satisfies all required reading or verification. Unknown executable paths select the fixed core and report an unresolved mapping; a plan with unresolved coverage cannot be reported as complete.
- [x] Execute only current-audit `local-fixture` entries, sequentially, using fixed argument arrays. Validate the entire requested set before starting; explicitly requested DB/live/operator/unreviewed checks block the run. Listing and planning may show them with reasons.
- [x] Resolve the workspace Node/tool entry points without building shell strings or invoking Windows `.cmd` shims through interpolated commands. Use hidden subprocess windows. Preserve only needed OS/runtime environment; omit cloud, database, app-secret, and inherited Node preload options. No `.env` loading in the orchestrator.
- [x] Add process-adapter fixtures proving blocked checks never spawn, forged arguments are rejected, first failure stops subsequent checks, timeout/cancellation cleans up descendants, and JSON output is not polluted by child stdout. Capture child output separately; never dump environment values.
- [x] Exercise a benign fixture child on Windows and Linux, including a workspace path with spaces. Verify missing dependencies are blockers, not implicit installs. Document that inherited-credential filtering is defense in depth, not network/filesystem isolation.

**Acceptance:** An Agent can discover, plan, and run the audited core without manually reconstructing commands. The CLI cannot invoke live checks even if their IDs are supplied explicitly. Local code completion still requires the existing baseline build/typecheck.

## Task 3: Deterministic documentation checks

**Files:** Documentation checker, policy JSON, checker fixtures, package scripts, documentation map/workflow.

**Interfaces:** `checkDocumentation(root, policy): Diagnostic[]`; `verify:docs` runs it; `verify:docs-tests` runs synthetic cases. Diagnostics carry rule, source file, line, and target.

- [x] Define the maintained scope explicitly: root AGENTS/README and maintained contracts/specs/operations named in the documentation map. Plans, release evidence, and dated design proposals are not implicitly current contracts merely because of their directory.
- [x] Check relative Markdown inline/reference links and fragments offline. Handle URL decoding, Windows separators, duplicate heading anchors, inline formatting, and explicit HTML anchors; ignore images when extracting headings, fenced code, and external URLs. Do not fetch the internet.
- [x] Detect root `corepack pnpm`/`pnpm` script references in executable examples in maintained guidance. Recognize built-in commands such as `exec`, `install`, and filtered workspace commands; do not misclassify them as missing root scripts. Future commands in Draft plans are excluded from this rule.
- [x] Require new plans to declare Draft/Approved/Implemented/Superseded status and link maintained governing contracts; require a replacement link when a document is explicitly Superseded. Do not infer implementation or deployment from a status word.
- [x] Add failing fixtures for broken file/fragment links, duplicate headings, reference links, percent-encoded paths, a removed package command, a historical command example, and a Draft plan containing future commands. Implement until all fixtures pass.
- [x] Run against the repository and triage existing findings. Fix in-scope mechanical errors; record disputed semantics for review. If legacy exceptions are necessary, enumerate exact file/rule/target plus reason and removal condition; prohibit blanket directory exceptions and reject unused exceptions.
- [x] Review the previously observed activity-migration status discrepancy against maintained release evidence. Correct only if evidence establishes the state; otherwise record uncertainty rather than query or mutate TEST. Semantic contradictions remain a manual review responsibility.

**Acceptance:** Broken maintained references and missing active command aliases fail deterministically. Historical prose is not treated as authority. No claim is made that the checker can prove financial, authorization, or deployment-state consistency.

## Task 4: Fixed critical CI profile and shared gate

**Files:** Registry, shared validate action, package scripts, deployment verification fixtures, TEST contract and local-testing documentation.

**Proposed core:** Keep all six existing focused commands. Add `verify:auth`, `verify:account-access`, `verify:account-access-client`, `verify:transaction-idempotency`, `verify:transaction-timeline`, `verify:dividend-cash-leg`, `verify:portfolio-snapshots`, `verify:backup`, and `verify:session-reads`, subject to the mandatory effect/dependency audit in Task 1. A failed audit blocks admission and must be resolved or reported; never silently omit a promised check.

- [x] Measure each proposed command locally after safety audit. Record duration and platform prerequisites in the implementation evidence. No runtime measurements are claimed by this plan.
- [x] Add fixtures asserting preservation of the existing six checks and inclusion of each approved new check exactly once. Ensure changes to the registry, runner, or shared action invalidate the appropriate audit evidence.
- [x] Update the shared action to run typecheck/build, tooling fixtures, documentation fixtures/checks, and the fixed core. Keep the current Node/pnpm versions, pinned actions, no-cloud-credentials validation, and reusable deployment invocation structure.
- [x] Inspect both CI and reusable deployment callers and existing `verify:deployment` assertions. Adapt structural assertions to the new shared gate while retaining credential separation, migration/infrastructure approval, and documentation-only deployment-skip checks.
- [x] Keep all checks blocking; do not add `continue-on-error`, silently skip unsupported checks, or widen job permissions. Keep the existing 20-minute CI timeout; if measurements exceed it, report and propose a scoped change before expanding the rollout.
- [x] Confirm the gate can be invoked locally with identical profile membership. Future authorized CI runs must demonstrate Ubuntu execution; local Windows evidence alone cannot establish hosted CI success.

**Acceptance:** A failing auth/access/transaction core check prevents validation success and therefore the existing dependent TEST deployment. DB and live checks remain explicitly outside this first CI profile; passing fixtures is not database or authenticated browser acceptance.

## Final verification and handoff

- [x] Run `corepack pnpm verify:tooling`, `corepack pnpm verify:docs-tests`, `corepack pnpm verify:docs`, and `corepack pnpm verify:checks -- run --profile core`.
- [x] Run `corepack pnpm typecheck`, `corepack pnpm build`, and `git diff --check`.
- [x] Review task changes across working/index diffs and new files against the recorded starting state. Confirm the CLI cannot execute operator commands, baseline CI coverage is preserved, and documentation links explain limitations.
- [x] Update this plan's status and evidence; update maintained guidance only to describe actually implemented behavior.
- [x] Report implementation checks, hosted CI evidence, deployment, and visual acceptance separately. No issue, commit, push, automation activation, or deployment is authorized by this plan. UI acceptance is not applicable unless scope later changes.

## Rollout and deferred work

Implement Tasks 1–3 locally, then wire Task 4 after their fixtures pass. One sequential implementation stream is sufficient because interfaces are shared. Do not activate partial CI wiring before the runner and audits are complete.

Deferred: automatic affected-only CI, disposable-PostgreSQL CI provisioning, full command mediation, sandboxed execution, semantic document auto-repair, scheduled scanners, general repository refactoring, and new Agent roles. The first release should establish a reliable small loop before expanding it.

## Implementation evidence (2026-11-03)

- Implemented the inventory, conservative planner, local-only executor, offline documentation checker, and fixed 15-check CI core. Existing command aliases and all six original core checks remain. No application, schema, infrastructure-permission, or deployment-gate changes were made.
- Ruling: use one shared normalized-text audit map and per-check entry-point references rather than repeat the same dependency paths in every record. The broad API/jobs/shared/web-client scope deliberately invalidates reviews conservatively. CRLF/LF normalization permits Windows and Linux checkouts to share evidence.
- Ruling: standalone scripts without a completed effect review remain explicitly unreviewed. Inventory coverage does not imply permission to execute them. Database and live checks are excluded from the executor.
- Ruling: derive NODE_PATH only from this checkout to preserve pnpm workspace module resolution when launching Node directly. Never inherit NODE_PATH or NODE_OPTIONS. The first full run exposed this platform issue, and correctly stopped with remaining checks not run; the corrected full run passed all 15 checks.
- Registry/selection/runner fixtures cover stale/duplicate/missing metadata, hidden steps, forged selections, no-spawn blocking, missing tools, stop-after-first-failure, unknown paths, real temporary Git rename/deletion/untracked paths, line endings, and real child/descendant timeout and cancellation in paths with spaces.
- Documentation fixtures cover missing links/fragments, explicit and shortcut references, encoded filenames, duplicate headings, HTML anchors, removed root scripts including optional run, historical exclusions, Draft future commands, plan status/replacement rules, and unused exceptions. Repository consistency passes with no exceptions.
- Corrected the activity-migration statement using the dated 2026-11-01 release evidence; no live environment was queried.
- Local host: Windows, Node 24.14.0. CI remains Node 22 / Ubuntu 24.04 with the original 20-minute timeout and pinned actions. A successful local core run took approximately 41 seconds; auth approximately 10 seconds, deployment fixtures approximately 20 seconds, other individual checks below 2 seconds. These measurements are not hosted-run estimates.
- Hosted verification: [CI run 41566560667](https://github.com/bluewuxi/family-ledger/actions/runs/41566560667), build job 125689416145, passed on Ubuntu with actual Node v22.23.4. Tooling process/Git fixtures, document fixtures/checks, and all 15 core checks passed. Disposable database and authenticated browser acceptance remain outside this tooling scope; automatic TEST delivery evidence is recorded separately.
- Final exact verification results and independent review findings are recorded in the completion report; cross-platform execution is now established by the hosted build-job evidence above.
