# Local Agent Instructions Proposal and Implementation Plan

**Status:** Implemented locally; user approved implementation on 2026-11-03. Independent semantic review and explicit handoff loading passed. Automatic host loading remains unverified. The user subsequently authorized the default delivery workflow; see [delivery evidence](../releases/2026-11-03-local-agent-instructions.md).
**Goal:** Put short operational reminders at component and operator boundaries without duplicating maintained contracts or weakening root instructions.
**Spec:** User-requested directory assessment and concrete proposal; governed by [root rules](../../AGENTS.md), [workflow](../project-workflow.md), [architecture](../architecture.md), and [documentation map](../README.md).
**Architecture:** Seven component-scoped AGENTS.md files link to existing authoritative documents. Root rules retain universal constraints and cross-layer reading triggers. Existing documentation validation explicitly includes the new files.
**Tech Stack:** English Markdown and the existing offline documentation checker; no new service, skill, dependency, or application behavior.

## Assessment and alternatives

The assessment found only the root AGENTS.md. API separates HTTP/auth/services/repositories; jobs separates scheduled handlers, providers, services, storage and logging; web contains both UI and isolated client checks; shared includes DTOs, decimal calculations and provider parsers. Scripts mix local fixtures, live checks, deployment and repair. These are meaningful instruction boundaries; directory size alone is not a reason to add rules.

The 2026-10-30 instruction-organization plan deliberately excluded nested instructions from that task. That historical scope remains valid; this proposal is a new, separately reviewed change rather than a retroactive revision of the earlier decision.

Alternatives:

- Root-only: minimal maintenance, but directory work still depends heavily on recalling cross-layer reading routes.
- Seven boundary files (recommended): local discovery with one rule layer below root; enough coverage for application and operator work.
- Per-subdirectory files: more precise scope, but services/routes/pages/providers rules would mostly repeat component guidance and produce more conflict surfaces.

Use package roots rather than src roots so package configuration and colocated client verification receive the same guidance. Do not claim every host loads nested rules automatically: explicitly include applicable root-to-directory instructions in handoffs and confirm behavior in the active host.

## Proposed files and exact content scope

| Proposed file | Local instructions to include | Maintained sources to reference |
| --- | --- | --- |
| `apps/api/AGENTS.md` | Keep transport parsing in handlers/routes, decisions in services, persistence in repositories; trace authorization and effective account scope before calculations/pagination/cache reads; preserve fail-closed request context while distinguishing trusted non-HTTP callers; validate DTO changes against consumers and error-redaction contracts. | Architecture code organization; Auth enforcement/secret boundaries; relevant API and data-model sections; local testing |
| `apps/web/AGENTS.md` | Use existing clients for data access; keep role/scope UI checks as hints; reuse date/decimal/format/cache/navigation helpers for their intended roles; preserve loading, invalidation and runtime-config behavior when editing reads; route visible changes to frontend guidelines and authenticated acceptance. | Frontend guidelines; Auth; time policy; relevant product spec; local-testing acceptance; workflow runtime configuration |
| `apps/jobs/AGENTS.md` | Reuse provider interfaces, job logging and idempotent persistence; preserve revision guards, pending repair and retry behavior when editing snapshots; preserve provider/valuation date distinctions; retain backup allowlists, precision and job-overlap guards; identify provider decisions before adding sources. | Workflow jobs guidance; time policy; data-model market data/snapshots; deployment scheduling; backup operations |
| `packages/shared/AGENTS.md` | Keep modules focused and use public exports; trace API/jobs/web consumers before changing DTOs or validators; reuse authoritative decimal/date helpers; keep reusable calculations independent of credentials, persistence and UI; treat shared parsers as shared code rather than duplicating provider logic. | Architecture; financial-values data model; time policy; affected API/product contracts |
| `scripts/AGENTS.md` | Determine actual effects before execution; use the verification inventory/CLI; list blocked checks without escalating to direct execution; preserve dry-run/apply boundaries; keep temporary output ignored and sanitized; update inventory and review audited dependencies when changing verification behavior; route deployment/migration/repair scripts to their operator contracts. | Local-testing command effects and verification entry; workflow delivery/migration guidance; TEST contract; relevant backup/repair runbook |
| `supabase/AGENTS.md` | Review migration history, constraints/RPC/RLS and backup dependencies before schema edits; preserve exact numeric and referential semantics; prepare changes separately from application; review seed effects and private data; never infer applied state from a migration filename. | Data model; Auth; workflow Windows migrations; TEST migration gate; backup operations |
| `infra/aws/AGENTS.md` | Review templates/parameters together with deployment tooling and live-equivalence gates; derive identifiers through existing configuration; identify independent IAM/schedule/runtime/configuration changes before proposing execution; route configuration and approval/lock work to the deployment contract. | Deployment; TEST contract; workflow delivery scope; architecture |

These are drafting requirements, not approved replacement contracts. A future author must verify each reminder against the maintained source and actual helper behavior. In particular, frontend decimal helpers may support display and local validation; this does not make the browser authoritative for financial calculations.

For migrations, do not invent a blanket prohibition on modifying any committed SQL. The project currently requires controlled migration review and independently authorized application; a stronger migration immutability policy needs an explicit maintained decision rather than an incidental local instruction.

## Ownership and inheritance

| Layer | Owns | Does not own |
| --- | --- | --- |
| Root AGENTS.md | Product identity, language, trust/security constraints, workspace and authorization boundaries, mandatory cross-layer reading, completion checks | Detailed component recipes or financial formulas |
| Local AGENTS.md | Directory-specific operating decisions, recurring pitfalls, and direct links to contract owners | New permissions, financial/date formulas, endpoint exceptions, delivery authorization, deployed state |
| Maintained docs | Complete architecture/auth/API/data/product/time/acceptance/operator contracts | Host-specific automatic loading assumptions |
| Registry and CLI | Current check inventory, effects, execution policy and audit currency | Authorization to execute DB/live/operator checks |
| Plans and releases | Proposed change, historical rationale and dated evidence | Instructions silently overriding current contracts |

- Local files specialize how to apply root requirements; they must not contradict or relax them. Report a conflict and reconcile the owning maintained source rather than using directory proximity to override protected contracts.
- Root task triggers combine by affected behavior. Editing jobs or shared code may still require investment/UI/API documents; a local list never replaces the root reading table.
- Keep root product/security/authorization/validation text in place during the first rollout. Add only a brief local-instruction discovery sentence there; any later deduplication needs a coverage review.
- In local files, use a one-line scope statement, approximately four to seven actionable bullets, and a few descriptive relative links. Approximately 20–40 lines is a drafting budget, not a hard quota.
- Do not copy endpoint lists, five viewport values, formulas, provider schedules, current backup version, role exceptions, or deployment status into local rules. Link the owning sections.
- Keep checklist command membership in the registry, not seven hard-coded test lists. Root-required typecheck/build remain mandatory for code changes.

## Directories deferred

- `apps/`, `packages/`, and `infra/`: grouping layers add little actionable context.
- API routes/services/repositories, web pages/components/lib, jobs providers/services: use the package-level rules; split only after evidence of a distinct recurring failure not addressed by the package file.
- `scripts/verification/`: current registry and local-testing guidance already own the execution contract. Start with scripts-level discovery and avoid another safety-policy copy.
- `supabase/migrations/` and `supabase/seed/`: a single parent file covers schema and seed operations; no two-tier SQL instructions initially.
- `.github/`: existing shared action and TEST contract already describe the release gate. Workflow edits still trigger root delivery reading; add a dedicated file only if repeated workflow-specific mistakes justify it.
- `docs/`: documentation map and workflow already define ownership and placement. A new parent file would mostly repeat them.

## Future implementation sequence

1. Recheck branch/HEAD and staged, working and untracked scope. Read applicable maintained sections and record a coverage matrix mapping every proposed bullet to its owner. Resolve unsupported statements before authoring.
2. Add `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, and `apps/jobs/AGENTS.md`. Review authorization-before-data-flow, client authority and trusted-batch distinctions using existing source paths. No business rules move out of stable specs.
3. Add shared/scripts/supabase/infra files. Review a shared-calculation change, a fixture edit, a live repair, a new migration, and an IAM/schedule change as separate reasoning cases. Each must route to the proper contract and preserve existing authorization limits.
4. Add a short discovery sentence to root and an ownership entry in docs/README.md. Do not rewrite the root mandatory reading table or shorten universal safeguards in this rollout.
5. Add all seven exact paths to `scripts/verification/docs-policy.json` maintained scope. The current checker uses an explicit list, so merely adding files is insufficient. Do not change checker logic or add fingerprints solely for Markdown; confirm the policy change remains within existing audit scopes.
6. Run `corepack pnpm verify:docs-tests`, `corepack pnpm verify:docs`, and `git diff --check`; review new-file whitespace explicitly while untracked. Validate every relative link/fragment, plus semantic ownership and absence of contradictory instructions. Run registry validation if its audited scope is affected; do not refresh audit evidence without review.
7. Record which nested instructions the active host actually supplies for a bounded directory task. If automatic discovery cannot be observed, report that limit and verify explicit handoff loading. Do not infer desktop/CLI compatibility from file presence.
8. Review the actual working/index/new-file contents and publish an implementation summary with unresolved findings. No issue/commit/push/deployment follows without authorization for this new task.

## Acceptance criteria

- Exactly seven local files exist at the agreed boundaries, with no unnecessary deeper files.
- Every rule has a maintained owner, and each owner link resolves. Local instructions add actionable routing rather than parallel business contracts.
- Root universal requirements and cross-layer triggers retain coverage; none survive only in a plan or release record.
- All seven files are included in documentation validation; no broad exceptions or checker weakening is introduced.
- API request scope versus trusted jobs, frontend versus authoritative calculations, and planning versus operator execution remain distinct in example reviews.
- No application code, schema, infrastructure, workflow activation, skill installation or global host settings change. Documentation/policy-only work uses documentation checks; executable changes, if separately needed, require a revised scope and typecheck/build.

## Planning evidence and limits

Assessment performed on the clean existing `test` checkout after the verification-loop delivery. Only this proposal is added. Existing local docs check coverage is explicitly enumerated and currently contains only root AGENTS.md. Package layout and maintained ownership were reviewed; no authenticated browser, live database, cloud action, or nested-loader experiment was performed. Implementation is pending approval.

## Implementation coverage and evidence

Starting state: `test` at `a96b9b0ee1cf3f59fcab7aed5ce51cff40523b57`, with only this approved plan untracked. The planning paragraph above records the original assessment, not current activation or authorization.

| Local file | Bullet coverage and maintained owners |
| --- | --- |
| `apps/api/AGENTS.md` | 1: architecture code organization; 2: Auth enforcement and architecture scope/cache boundary; 3: API account visibility and request-context implementation; 4: API/data-model contracts and consumer tracing; 5: API response and Auth secret boundaries; 6: local-testing verification |
| `apps/web/AGENTS.md` | 1: architecture and Auth enforcement; 2: architecture financial authority, shared time policy and product map; 3: Auth session lifecycle and read verification; 4: workflow runtime configuration; 5: frontend guidelines and product contracts; 6: authenticated acceptance and completion reporting |
| `apps/jobs/AGENTS.md` | 1: workflow jobs guidance; 2: data-model snapshots; 3: time policy and Scheduler payload; 4: deployment retry/logging contract; 5: backup operations and architecture overlap guards; 6: data-model market-data distinctions and source decision |
| `packages/shared/AGENTS.md` | 1: architecture focused modules/exports; 2: API/product consumers; 3: data-model financial values; 4: time policy; 5: architecture responsibility boundaries and market-data parser reuse |
| `scripts/AGENTS.md` | 1: local-testing actual command effects; 2: local-testing execution policy and owning procedures; 3: workflow delivery/Windows migrations and operator map; 4: workflow ignored artifacts and deployment secret handling; 5: verification inventory/audit currency; 6: TEST delivery and backup/repair procedures |
| `supabase/AGENTS.md` | 1: data model/Auth/API dependencies; 2: financial values and integrity; 3: Windows application procedure and TEST migration gate; 4: seed contract and root private-data rules; 5: backup/restore dependencies; 6: verified environment state and separately authorized application |
| `infra/aws/AGENTS.md` | 1: deployment and TEST source/live gates; 2: architecture configuration/secret boundaries; 3: TEST independent-change classification and workflow authorization; 4: Scheduler/time policy; 5: TEST approvals, locks and recovery |

- Exactly seven local files were added at the agreed boundaries; universal root rules and the complete reading table remain in place. The only root addition is the discovery/handoff sentence. The documentation map identifies local guidance ownership.
- Existing API request-context code was inspected to distinguish HTTP fail-closed policy from trusted batch/fixture work. Existing web decimal/cache/runtime helpers were inspected to preserve display/local-validation versus server financial authority and configuration precedence. No endpoint exceptions, formulas, schedules, backup versions, viewport values, or deployed-state claims were copied into local files.
- Documentation policy review confirmed exactly seven maintained-path additions, unchanged legacy-plan and exception lists, and no checker logic change. Registry validation first reported exactly one stale reviewed dependency, `scripts/verification/docs-policy.json`. After reviewing that metadata-only change, only its existing normalized-text SHA-256 was updated; no Markdown file was added to the fingerprint map. Registry validation then returned no diagnostics.
- Final `corepack pnpm verify:docs-tests`, `corepack pnpm verify:docs`, and `corepack pnpm verify:tooling` passed. Direct registry validation returned zero diagnostics. Tracked and untracked whitespace checks passed; semantic review covered working/index diffs and new-file contents.
- Explicit loading handoff passed in a fresh bounded review: root/workflow plus all seven exact paths and API/batch, frontend financial authority, shared helper, fixture/live repair, migration, and IAM/schedule reasoning cases. The reviewer confirmed exactly seven local paths, the single policy digest change, and no semantic defects. File presence and explicit handoff success are not evidence that the host automatically loads nested instructions; automatic desktop/CLI loading has not been observed.
- Typecheck/build are not required for this instruction/policy-metadata-only task. No application code, schema, workflow, infrastructure, skills, dependencies, global settings, live environment, issue, commit, push, or deployment was changed.
