# Custom Investment Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution, or `superpowers:subagent-driven-development` if that execution method is selected. Complete the checkboxes task by task. Project authorization and workflow override generic worktree, commit, and delivery steps.

**Status:** Implemented locally on 2026-11-06; automated validation and independent review passed. Separately authorized TEST schema application removed the dependency blocker. Dual-theme, five-viewport read-only authenticated acceptance is complete; shared write scenarios were deliberately excluded. Migration registration awaits a clean committed migration; commit, push and application deployment are not authorized. See [acceptance evidence](../releases/2026-11-06-investment-groups-local-acceptance.md).

**Goal:** Add mutually exclusive, administrator-maintained investment groups and current grouped allocation alongside current instrument allocation.

**Architecture:** Reuse the API's instrument allocation amounts and aggregate them without another valuation pass. Persist classification separately from financial inputs, with atomic writes guarded by `resource_revisions.scope_key = 'investment_groups'`. Add a dashboard tab and contextual instrument-management workflow; preserve daily snapshots and existing version mechanisms.

**Tech Stack:** Existing strict TypeScript, React/Vite, Lambda API, Supabase Postgres, decimal.js, pnpm via Corepack, and isolated verification scripts. No new runtime library or test framework.

**Spec:** [Approved investment groups design](../specs/2026-11-06-investment-groups-design.md). Maintained contract: [Investment overview](../specs/investment-overview.md).

## Global Constraints

- Read root `AGENTS.md`, [project workflow](../project-workflow.md), and applicable `AGENTS.md` in `apps/api`, `apps/web`, `packages/shared`, `supabase`, `apps/jobs`, and `scripts` before their tasks. Read all maintained sources linked by the design, including auth, API, data model, frontend, time, verification, and backup contracts.
- Work in the existing `test` checkout. Do not create a branch/worktree or switch branches without the authorization required by the project.
- One non-cash instrument belongs to zero or one group across accounts. Ungrouped instruments remain separate; cash remains pooled. Do not infer or seed memberships.
- Use `证券分布` / `分组分布` tabs with the existing trend-tab pattern. Admin-only `管理分组` sits at the right of the same footer row as the left explanation, not a separate row.
- Reuse reporting currencies NZD, USD, CNY, existing Decimal valuation and account scope. Preserve instrument values, totals, prices, FX, profit, and snapshot behavior.
- Add only the `investment_groups` revision purpose. Migration of `ledger_write_state` or other existing mechanisms is a future TODO, not a task here.
- Repository prose, comments, and identifiers are English; UI is Simplified Chinese. Use `金财屋` / `Family Ledger` as product names.
- No commits, issue creation, push, deployment, shared TEST fixture writes, live repair, or shared migration application are included. TEST contains real family data. Isolated local fixture/DB checks must not load project credentials.
- Record implementation, deployment, and authenticated visual acceptance separately. A mockup or synthetic fixture is not real-login acceptance.

## Baseline and execution handoff

Planning inspection: branch `test`, HEAD `ca6fd745d504e2b51b72e82c2bd26192de59e1d2`, clean working tree before this turn's documentation edits. Earlier unrelated uncommitted repair documents are no longer part of that observed dirty baseline. Recheck branch, HEAD, index, working tree and untracked files when execution begins; do not assume this baseline remains current.

Expected planning-only changes: this plan, the design's approval/link, and the documentation-map entry. Preserve any other changes discovered later. Use the current actual scoped diff and new files for review, not only committed `BASE...HEAD` changes.

Recommended future execution: inline, task by task, because database, backup, API, and UI interfaces are closely dependent. A future implementation instruction may select another supported method. Do not start implementation from this document alone.

## Review Focus

1. A positive group can conceal a negative member; source-row invalidity must still suppress the pie (Task 1 fixture).
2. A stale editor can transfer an instrument while another editor changes its group; one atomic revision guard must prevent lost updates (Task 2 concurrent DB fixture).
3. Hidden-account members and counts can leak through otherwise correct totals; derive contributors from scoped allocation rows only (Task 4 scope fixture).
4. Saving grouping can provoke a forced quote refresh or allow an obsolete response to overwrite updated UI; preserve refresh semantics and stale-response cancellation (Tasks 5 and 6 client fixtures).
5. Restore or a missing revision row can admit stale edits or bypass the lock; fail closed and preserve version validation and restore invalidation (Tasks 2 and 3 fixtures/runbook).

## File and responsibility map

| Area | Create | Modify / reuse |
| --- | --- | --- |
| Contracts and aggregation | `packages/shared/src/investmentGroups.ts`; `apps/api/src/services/groupAllocationService.ts`; `scripts/verify-investment-groups.ts` | `packages/shared/src/index.ts`; existing `DashboardHoldingAllocationSummary` and Decimal conventions |
| Persistence | `supabase/migrations/20261106120000_investment_groups.sql`; `scripts/verify-investment-groups-db.ts` | Existing instrument mutation guards only where needed; no existing migration edits |
| Backup | No new backup framework | `apps/jobs/src/repositories/ledgerBackupRepository.ts`, `apps/jobs/src/services/ledgerBackupBundle.ts`, `apps/jobs/src/services/ledgerRestoreOrder.ts`, `scripts/verify-backup.ts`, `scripts/verify-backup-restore-db.ts`; exporter in the new migration |
| API | `apps/api/src/repositories/investmentGroupRepository.ts`; `apps/api/src/services/investmentGroupService.ts`; `apps/api/src/routes/investmentGroupRoutes.ts`; `scripts/verify-investment-group-api.ts` | `apps/api/src/routes/router.ts`, `apps/api/src/services/dashboardService.ts`, instrument service/repository only for safe deletion/type-change error mapping |
| Dashboard | `apps/web/src/components/InvestmentDistributionPanel.tsx`; `apps/web/verify-investment-groups-client.ts` | `DashboardPage.tsx`, `DistributionPanel.tsx`, `styles.css`; reuse `apiClient.ts` and `useValuation.ts` |
| Maintenance | `apps/web/src/components/investments/InvestmentGroupsManager.tsx`; `apps/web/src/components/investments/InvestmentGroupEditor.tsx`; `apps/web/src/lib/investmentGroupsClient.ts` | `InstrumentsPage.tsx`; reuse `Drawer.tsx`, `useEditDismissal.ts`, existing read/session invalidation |
| Verification integration | New aliases defined below | `package.json`, `tsconfig.verification.json`, `scripts/verification/registry-data.json`; effect-review fingerprints only after reviewing changed dependencies |
| Documentation | No retrospective release record before release | Maintained investment/API/data-model/auth/backup/local-testing/architecture/roadmap docs as affected; this plan for progress/evidence |

Paths in the map without a directory prefix inherit their area: web pages/components/styles live under `apps/web/src`. If the proposed migration timestamp is taken at execution, choose a later unique filename and update this plan and fixtures before writing it. At inspection the latest migration was `20261106090000_kernel_nta_same_date.sql` and backup version was 15; reconfirm before allocating the next version.

## Task 1: Contracts and pure current-allocation aggregation

**Files:** Contract/aggregation row of the map; verification registration files.

**Interfaces:**

- Export `InvestmentGroup { id: string; name: string; instrumentIds: string[] }` and `InvestmentGroupConfiguration { revision: string; groups: InvestmentGroup[] }`.
- Export `SaveInvestmentGroupInput { name: string; instrumentIds: string[]; expectedRevision: string }` and `DeleteInvestmentGroupInput { expectedRevision: string }`.
- Export the design's exact `GroupAllocationRow` and `GroupDistribution` types without altering their field semantics.
- Export `parseSaveInvestmentGroupInput(value: unknown): SaveInvestmentGroupInput` and `parseDeleteInvestmentGroupInput(value: unknown): DeleteInvestmentGroupInput`. The server/database remain authoritative for canonical names, duplicate existence, and membership validity.
- Export `buildGroupDistribution(input: { allocations: DashboardHoldingAllocationSummary[]; totalAssets: string | null; configuration: InvestmentGroupConfiguration }): GroupDistribution` from the API pure service. No database or provider access in this function.

- [x] Add focused synthetic fixtures with the design's 110,000 total, QQQM 30,000 and the three-instrument group 70,000. Assert group percentage `63.64`, cash 10,000, individual gold 10,000 and unchanged source rows. Add member-null, negative-member/positive-group, zero-total, no-group, empty-group, scoped-contributor and rounding cases; e.g. member amounts `0.01` and `0.02` produce `0.03`.
- [x] Register future `verify:investment-groups` as `tsx scripts/verify-investment-groups.ts`, review its imports/effects, then run it through `corepack pnpm verify:checks -- run --check verify:investment-groups`. Capture the expected initial missing-export/assertion failure; never bypass a stale-review block.
- [x] Implement the shared types/parsers and pure aggregation. Namespaced IDs are `group:<uuid>`, `instrument:<uuid>`, `cash`; contributors come from source rows only. Use Decimal on existing two-decimal instrument amounts, retain null propagation, and suppress all percentages when the source distribution is invalid. Name the unavailable reason exactly as the design specifies.
- [x] Rerun that check; require exit 0 and all assertions passed. Verify parser rejects blank/overlength names, duplicate IDs, malformed UUIDs/revisions, and any client-supplied purpose key rather than accepting a generic version-write request. Check Unicode code-point length with supplementary characters.

Deliverable: a pure, tested aggregation and shared contract, with no changes to existing financial calculations.

## Task 2: Atomic persistence and purpose-keyed revision guard

**Files:** Persistence row of the map; package/registry/typecheck entries. Read existing instrument mutation and financial-lock triggers before choosing lock order.

**Interfaces:**

- `read_investment_group_configuration() returns jsonb` provides revision plus groups/member IDs from one statement snapshot; a missing purpose row raises a sanitized dependency error upstream.
- `write_investment_group(operation text, target_group_id uuid, group_name text, member_ids uuid[], expected_revision text, actor_id uuid) returns jsonb`; operations are `create`, `update`, `delete`. Create supplies a null target ID; delete ignores name/members. Return `{ revision, group }`, with `group = null` for deletion.
- All RPCs are server-only. The write RPC checks active admin, locks the fixed purpose row, compares revision, applies all membership/name changes, and increments once. `40001` maps to a conflict; missing state never behaves as revision zero.

- [x] Create `scripts/verify-investment-groups-db.ts` following the disposable loopback PostgreSQL harness in `verify-backup-restore-db.ts`. Create synthetic schema/data, avoid env/SSM/Supabase connections, and validate all cleanup paths stay inside the harness-owned temporary directory. Register `verify:investment-groups-db` as disposable-db; it is not runnable by the local-fixture runner.
- [x] Add assertions for atomic create/update/delete; revision `0 -> 1`; simultaneous same-revision saves where exactly one succeeds; member transfer; non-cash constraints; instrument-to-cash rejection; deletion cascade with version invalidation; missing scope row; rollback after deliberate failure; and migration initialization that does not reset an existing revision. Run the fixture before implementation and record its missing-schema/RPC failure using the reviewed disposable-DB procedure.
- [x] Write the additive migration for the three approved tables, constraints, index, RLS, server-only grants and RPCs. Only insert `resource_revisions('investment_groups', 0)` with conflict-preserving initialization. Do not create a ledger purpose or touch existing snapshot writers, financial revisions, repair state, or scheduled jobs.
- [x] Define canonical name normalization once in SQL for persistence; store trimmed display name and a derived lowercase uniqueness key, never a caller-controlled key. Make the API length/blank validation match this definition, including the agreed Unicode trimming set. Extend the DB fixture with ASCII/Unicode boundary whitespace, Chinese, case-only duplicates, and 32/33 code-point names so application and persistence cannot disagree.
- [x] Make classified instrument deletion and type changes use database-enforced invariants. Serialize instrument mutation and group membership checks with a consistent lock order; specifically avoid financial-ledger/instrument/group-row deadlocks. Do not add financial triggers to the new tables. Verify concurrent deletion/reassignment cannot leave an orphan or cash member.
- [x] Run `corepack pnpm verify:investment-groups-db` only after checking its disposable effect and local PostgreSQL prerequisites. Require all assertions and cleanup to pass; missing prerequisites are a reported blocker, never a reason to use shared TEST. Snapshot/revision-state hashes in the fixture must remain unchanged after group-only writes.

Deliverable: migration source and isolated DB evidence; migration remains unapplied to shared environments.

## Task 3: Backup and restore compatibility

**Files:** Backup row of the map; exporter portion of the new migration; [backup operations](../operations/backup-restore.md).

**Interfaces:** Extend `LEDGER_BACKUP_TABLES`, `LedgerBackupRows`, existing bundle validators/normalizers, `prepareLedgerRestoreRows`, and `RESTORE_ORDER`. Use the next unused backup version (16 if inspection baseline remains current); exporter marker `__investment_groups_encoding = 'purpose-revisions-v1'` distinguishes compatible export.

- [x] Extend `verify-backup.ts` with exact current-format group/member/revision round-trip and rejection of missing, duplicate, unknown-purpose, negative/malformed revision, orphan and cash memberships. Include a revision larger than JavaScript's safe integer range and assert its exact decimal string survives. Retain fixtures for all previously supported formats and original checksum validation.
- [x] Run `corepack pnpm verify:checks -- run --check verify:backup` after reviewing effect changes; capture the new-format failure before implementation.
- [x] Update exporter allowlist, stable ordering (`scope_key` for revisions), revision serialization, marker validation, bundle schema, and version support. Normalize older validated backups to empty groups/members and exactly the initial group purpose; never normalize before original-format checksum validation. No unknown purposes are silently accepted.
- [x] Update restore order: users/instruments and groups before memberships, with revision restored consistently after classification-trigger activity. Preserve existing financial-state restore ordering. Extend `verify-backup-restore-db.ts` for the new data and default-row upsert behavior so the migration-inserted purpose row cannot cause duplicate-key restore failures.
- [x] Document that live restore invalidates all pre-restore sessions/editors under an operator-run procedure before reopening access; a numeric revision can otherwise repeat after rollback. Do not implement a live restore action or silently change running sessions in this feature. Isolated restore checks prove payload/data consistency; they do not claim a live invalidation rehearsal.
- [x] Rerun reviewed backup fixtures and `corepack pnpm verify:backup-restore-db` under its disposable procedure. Require current-format round-trip, legacy checksum preservation, and exact revision restoration. Update format/version evidence as local implementation only, not deployed.

Deliverable: durable classification backup compatibility, with no cloud backup or shared restore performed.

## Task 4: Admin configuration API and scoped dashboard integration

**Files:** API row of the map; shared dashboard type in `packages/shared/src/index.ts`; use Task 1/2 interfaces.

**Interfaces:**

- Repository: `readInvestmentGroupConfiguration(): Promise<InvestmentGroupConfiguration>` and `writeInvestmentGroup(input: { operation: 'create' | 'update' | 'delete'; groupId: string | null; name: string | null; instrumentIds: string[]; expectedRevision: string; actorId: string }): Promise<{ revision: string; group: InvestmentGroup | null }>`.
- Service: `getInvestmentGroupConfiguration(): Promise<InvestmentGroupConfiguration>`, `saveInvestmentGroup(id: string | null, body: unknown, user: AuthenticatedUser): Promise<{ revision: string; group: InvestmentGroup | null }>`, and `deleteInvestmentGroup(id: string, body: unknown, user: AuthenticatedUser): Promise<{ revision: string; group: null }>`.
- Route module follows existing auxiliary-route conventions for the design's GET/POST/PUT/DELETE paths, with admin authorization for every configuration endpoint. Return standard success envelopes; DELETE carries `{ expectedRevision }` in its JSON body. Stale edits use existing `CONFLICT`, HTTP 409; dependency/state failures use sanitized 503; invalid/not-found inputs follow existing conventions.
- `getDashboard` returns existing `DashboardSummary` plus required `groupDistribution` in a new shared `InvestmentDashboardSummary` extension. Keep the base summary unchanged for calculation helpers/holdings consumers. Integrate classification in `getDashboard` after `getCurrentInvestmentPortfolio`, so `/holdings` does not acquire a new group dependency.

- [x] Add `verify:investment-group-api` (`scripts/verify-investment-group-api.ts`) using existing synthetic route/service dependency injection patterns. Cover admin CRUD, viewer denial, restricted-session denial, invalid request, 409/503 sanitization, and exact preservation of existing dashboard fields.
- [x] Register/review the fixture and run `corepack pnpm verify:checks -- run --check verify:investment-group-api`; record expected missing-route/integration failure.
- [x] Implement repository/service/routes and router registration. Do not expose arbitrary purpose selection or bypass account request context. Translate database invariant errors from instrument edits into existing safe validation/conflict responses.
- [x] In dashboard integration, pass existing scoped `holdingAllocations` and total assets to `buildGroupDistribution`. Fetch configuration once consistently; catch only classification dependency failure into `status: 'unavailable'`, empty rows and `classification_unavailable`, preserving the original dashboard. Do not swallow financial/auth failures.
- [x] Extend fixtures: hidden-account-only instruments/groups must not appear in group rows or counts; empty scope reveals no contributors; cash has no member IDs; inactive held instruments still contribute; a missing configuration dependency preserves instrument distribution; two tabs share identical valuation metadata. Spy on provider calls to prove grouping does not invoke another valuation/quote pass.
- [x] Rerun API and aggregation fixtures and existing `verify:dashboard`, `verify:account-access`, `verify:holdings` via the reviewed runner. Require all selected checks to pass.

Deliverable: usable server contracts with scope-safe grouped distribution and unchanged financial reads.

## Task 5: Dashboard tabs and aligned footer

**Files:** Dashboard row of the map. Use the shared `InvestmentDashboardSummary` from Task 4.

**Interfaces:** `InvestmentDistributionPanel({ dashboard, loading, isAdmin, onRetry }: { dashboard: InvestmentDashboardSummary | null; loading: boolean; isAdmin: boolean; onRetry: () => void }): ReactElement`. Keep selection state inside this component or a small URL-backed hook. Reuse `DistributionPanel` rendering with optional header/footer and grouped-row details rather than duplicating a second pie implementation.

- [x] Add a focused client fixture to `apps/web/verify-investment-groups-client.ts` and register `verify:investment-groups-client`: tab changes make zero API calls; totals remain identical; unavailable grouping does not show instrument rows as a successful fallback; viewer sees no management action; stale async responses cannot overwrite a later identity/state. Follow existing client-fixture conventions, not a new framework.
- [x] Run the registered fixture before UI behavior exists and record a failing behavioral assertion. Pure CSS changes do not require artificial implementation-mirroring tests.
- [x] Implement `证券分布` / `分组分布` with the existing `.trend-tabs` visual and keyboard pattern, unique tab/panel IDs, focus behavior, and appropriate labels. Default to securities absent valid route state; retain selected view across currency/refresh. Use `/dashboard?distribution=groups` and `/instruments?tab=groups&from=distribution` for the fixed internal return flow, preserving unrelated query parameters and never accepting arbitrary return URLs.
- [x] Extend shared distribution presentation minimally: group rows use server-provided validity/percentages and contributing members; preserve the separate `证券账户与现金` panel unchanged. Use stable identity colors and existing whole-amount formatting. Keep errors, nulls, zero/negative states explicit.
- [x] Render footer as two columns in one flex/grid row: left `占比以全部投资净资产为分母，含现金。`, right admin-only `管理分组` only on the group tab. Left text may wrap, right action remains vertically centered and at least 44px high. No separate lower button row at narrow sizes.
- [x] Rerun client fixture and existing `verify:valuation-client`, `verify:session-reads`, `verify:account-access-client` through the reviewed runner. Switching tabs must not call `reload(true)` or otherwise force providers. Group retry may perform a cached dashboard read, not bypass the normal refresh floor.

Deliverable: current allocation tabs and the confirmed footer layout; authenticated acceptance is still a separate gate.

## Task 6: Instrument-page group management

**Files:** Maintenance row of the map; extend Task 5 client fixture. Existing instrument editor/price configuration remains intact.

**Interfaces:**

- Client module wraps existing `apiRequest`: `loadInvestmentGroups(): Promise<InvestmentGroupConfiguration>`, `saveInvestmentGroup(id: string | null, input: SaveInvestmentGroupInput): Promise<{ revision: string; group: InvestmentGroup | null }>`, `deleteInvestmentGroup(id: string, input: DeleteInvestmentGroupInput): Promise<{ revision: string; group: null }>`.
- `InvestmentGroupsManager({ instruments }: { instruments: Instrument[] }): ReactElement` owns configuration loading and editor selection.
- `InvestmentGroupEditor({ open, group, configuration, instruments, onClose, onSaved }: { open: boolean; group: InvestmentGroup | null; configuration: InvestmentGroupConfiguration; instruments: Instrument[]; onClose: () => void; onSaved: () => void }): ReactElement` uses `Drawer` and shared dismissal protection. Null group means create.

- [x] Extend client fixture for blank/duplicate names, empty-group save, member move warning, cash exclusion/inactive inclusion, atomic-save error preservation, 409 reload/review, pending-save duplicate prevention, delete confirmation, and dirty dismissal. Assert save submits the revision originally loaded into the draft, not an unseen refreshed revision.
- [x] Implement `证券列表` / admin-only `分组管理` tabs. Load admin configuration only for an admin who enters management or needs the admin classification column; a viewer must not send the forbidden config request. Add the admin classification column/links without changing viewer master-data exposure. Protect edits when changing tabs or routes.
- [x] Implement the drawer form with group name and members. Show current other-group membership before a move; save complete member IDs once. Implement confirm-delete and ungrouping explanation. Use explicit `type="button"` for non-submit controls to avoid accidental form submission.
- [x] After successful mutation, invalidate/reload configuration and relevant dashboard reads through existing session-safe mechanisms. Return to `/dashboard?distribution=groups` when entered from distribution. Reuse valid quotes and normal cached-then-due refresh; do not force an extra provider refresh. Network uncertainty does not trigger automatic write replay.
- [x] Rerun reviewed group client/API fixtures. Verify rejection preserves draft, member move updates both groups, empty groups disappear only from distribution, and identity/scope changes clear private editor/read state.

Deliverable: both maintenance entry paths work without expanding permissions or changing financial data.

## Task 7: Contract reconciliation and full validation

**Files:** Documentation row of the map; validation registrations. No new delivery evidence implying release.

- [x] Update maintained investment overview, API, data model, auth endpoint list, architecture backup description, backup runbook, local testing and roadmap to reflect implemented-but-not-deployed scope. Preserve the design's future migration TODOs as deferred. Record actual new migration and backup version without claiming shared application.
- [x] Review new/changed verification scripts, all imported executable dependencies, and subprocess/network behavior; update registry classifications and fingerprints explicitly. Add new scripts to verification typechecking. Run `corepack pnpm verify:checks -- list` and `corepack pnpm verify:checks -- plan --changed`; reconcile recommendations with the task checks rather than treating them as exhaustive.
- [x] Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`, then `corepack pnpm verify:checks -- run --profile core`. Run the new local fixtures and affected existing checks not already covered, including instrument activity, valuation client, and loading behavior. Do not rerun already-passing unchanged checks without a reason.
- [x] Run the reviewed disposable group and backup DB checks through their owning procedures. Missing local PostgreSQL remains a blocker, not permission to connect to TEST. Run `corepack pnpm verify:docs` and `git diff --check`; review meaning and contract consistency as well as deterministic checks.
- [x] Review the actual scoped working/index diff and untracked files against the fresh execution baseline; include financial non-regression and protected authorization boundaries. Fix material findings and rerun only affected checks. No automatic per-task commits.

Deliverable: verified local implementation with precise blockers and no implicit deployment.

## Task 8: Authenticated acceptance and handoff

- [x] Obtain user agreement for authenticated browser acceptance, provide the local login URL, and wait for user login/target-page readiness. Keep auth bypass disabled. If required schema is absent in shared TEST, do not apply it as a testing prerequisite; record acceptance blocked/pending and request separate migration authorization only through the project procedure.
- [ ] Inspect both themes at `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000` (record actual desktop dimensions). Cover tabs, one-row footer, long names, null/error/loading states, drawer focus/keyboard/touch behavior, return navigation, and viewer read-only presentation.

  Read-only live coverage is complete for both themes and all five sizes; see [acceptance matrix and exclusions](../releases/2026-11-06-investment-groups-local-acceptance.md). This broader checkbox remains open because named-group edge states and write/recovery scenarios were not exercised live under the no-shared-write restriction. Isolated fixtures are recorded separately.
- [x] Test mutations on disposable fixtures first. Shared TEST editing requires a specific user-authorized data action; an implementation request does not authorize synthetic family-data fixtures. Do not create/delete a real group merely to demonstrate the UI without that scope.
- [x] Report implementation checks, migration status, deployment not requested, and authenticated acceptance separately. Leave deferred/blocked items explicit. Commit, push, TEST migration, or deployment require their own authorization and maintained workflow.

## Plan self-review and coverage

- Scope/calculation/negative/missing data: Tasks 1 and 4.
- Purpose revision, atomic moves, instrument invariants, future migration exclusion: Task 2.
- Backup, legacy versions, exact revision and restore boundaries: Task 3.
- Auth/session/scope/failure isolation: Tasks 4 and 6.
- Approved tabs/footer and management interactions: Tasks 5 and 6.
- Contracts, mandatory checks, uncommitted review, and real-login acceptance: Tasks 7 and 8.

Self-review must check interface names against this plan, file existence for modifications, future-file labels for creations, all five Review Focus cases, and absence of automatic worktree/commit/live-write steps. This plan is not an implementation transcript; exact function bodies and routine UI composition stay with the implementer.

Planning self-review completed on 2026-11-06: all design areas map to the tasks above, interface names and scope boundaries were checked, and no product implementation was performed. `corepack pnpm verify:docs`, local link/whitespace checks, and `git diff --check` passed. These results validate the planning documents, not the future application or migration.

## New-chat development context

Use the approved design and this plan together. The next chat must re-inspect the current checkout and read the required root/local instructions; it must not assume a clean tree, applied schema, or that prior mockup checks are application acceptance. The only new revision purpose is `investment_groups`, and the TODO to evaluate existing mechanisms remains deferred. The user must explicitly start implementation in that chat; design/plan approval alone does not authorize live operations.

Planning delivery: no product code or migration has been created by this task. Record execution progress in the checkboxes and evidence sections when implementation is subsequently authorized.

## Execution evidence — 2026-11-06

Actual baseline: test, HEAD ca6fd745d504e2b51b72e82c2bd26192de59e1d2; pre-existing design/documentation-map edits and this untracked plan were preserved. No staged changes, branch/worktree creation, commit, issue, push, deployment, shared migration or shared fixture writes. The ignored execution ledger and logs are retained in .superpowers/sdd/2026-11-06-investment-groups/.

Tasks 1–6 have RED/GREEN evidence in the ledger. Aggregation fixtures cover the 110,000/70,000/63.64 example, missing and hidden contributors, source negatives, exact fractional sums, zero positions, empty groups and parser boundaries. Database fixtures use a disposable loopback cluster with all real migrations and cover atomic CRUD, same-revision concurrency, transfers, direct cash rejection, instrument conversion/deletion, concurrent deletion/reassignment, Unicode boundary trimming, 32/33 code-point limits, rollback, missing revision and unchanged financial-state hashes. Backup format 16 fixtures and the full-schema recovery rehearsal passed (36 tables, 60 migrations), preserving exact revision 9007199254740993; current-format semantic validation and original legacy checksums remain enforced.

Real-handler API fixtures cover successful administrator CRUD, viewer/restricted denial, invalid input, sanitized conflicts/dependency errors and dashboard classification failure isolation. Client fixtures exercise real tab/editor behavior with synthetic React scheduling, fixed query paths, no tab refresh, original draft revisions, cash/inactive selection, move warnings, empty groups, validation, duplicate pending saves, failed/conflicting draft retention, dirty dismissal and delete confirmation. Existing session/scope/valuation checks cover obsolete response rejection. These fixtures are not authenticated acceptance or a rendering audit.

Final local validation: lint, typecheck and build passed; the 15-check core profile and all three new local checks passed together (18/18); focused instrument activity/loading/valuation/interface checks passed. The instrument activity fixture had stale quote fields and a weekend date; after effect review it was registered as local-fixture, reproduced the failure, and was corrected to use complete matching quote identity and a weekday. No quote/weekend rule was changed. The change recommendation command conservatively reports unmapped paths; these are manually covered by the plan checks and full scoped review, not bypassed or treated as complete dependency analysis.

Execution decisions: retain the existing checkout and uncommitted ledger under project scope; use a share lock on existing financial coordination state before the classification purpose/instrument locks without changing financial revision; update the stale activity fixture to current contracts rather than changing production behavior. The lock may briefly delay concurrent financial writes; fixture corrections do not expand runtime scope. Existing revision migrations and group historical curves remain deferred.

Final review: one fresh-context read-only reviewer found no financial, authorization, concurrency or data-integrity defect. The executor reconciled maintenance tab keyboard/ARIA behavior, shared back navigation above the title, current-format documentation and initialized-row restore coverage in one pass. Keyboard/client regression passed; the default-row test failed with the upsert deliberately removed and passed after restoration, preserving revision 9007199254740993. Final lint/typecheck/build, core plus group checks (18/18), disposable group DB, full restore, focused activity/loading/valuation/interface checks, verify:docs and diff review passed. No deferred code-review findings remain.

Task 8: the user agreed and confirmed login. The actual admin session was inspected only after that handoff, with both bypass flags disabled. The dashboard and maintenance view expose sanitized classification-dependency errors; group creation remains disabled. No shared business or preference mutation, migration or authorization bypass was performed. Dependency unavailability is observed; its exact shared schema cause was not independently inspected. Overall authenticated acceptance is blocked, not passed.

Partial authenticated evidence: light theme inspected at 320x740, 393x852, 430x932, 768x1024 and actual desktop 1440x1000. Each viewport had no document horizontal overflow. The footer retained one row, left text wrapping, right-aligned management link and 44px action height (at 320px, text height 40px within a 44px row). The securities tab hides the management link. Keyboard navigation between instrument tabs and the fixed return to dashboard?distribution=groups were observed. Loading and dependency-error states remain explicit. The original viewport override was reset; the user tab remains on grouped distribution. Ignored screenshots are retained with the ledger; no family values are copied into tracked evidence.

Still unperformed: dark-theme visual inspection, ready grouped distribution, long-name/null/zero group rendering, live drawer focus/touch/dirty workflows and viewer presentation at all five viewports. No synthetic shared groups were created to bypass the missing dependency. Local fixtures cover these business/interaction paths but are not authenticated acceptance. The remaining acceptance must follow separately authorized shared schema readiness and the real-login procedure.

## Subsequent TEST schema-first operation — 2026-11-06

The user separately authorized read-only diagnosis and compatible TEST schema application. Catalog/REST evidence confirmed all three group tables and both RPCs missing (PGRST202). The deployed version passed an isolated schema-ahead compatibility rehearsal, including identical format-15 backup payloads and old instrument lifecycle operations. The exact migration was then applied under the shared lock with a validated local backup, input-drift guard, transactional comparison of every previous exporter value and financial revision, RLS/grant verification and format-16 post-backup/restore preflight. Existing instrument columns and financial data were unchanged. Groups/members remain empty and revision is zero. See [complete operator evidence](../releases/2026-11-06-investment-groups-test-schema.md).

The local real-login dashboard now renders ready ungrouped allocations; management shows an empty list with creation available. No group save or shared fixture was performed. Earlier schema-blocked acceptance evidence remains historical; the dependency is now resolved, while remaining full acceptance is pending. Do not populate operational group data before format-16 backup coverage is delivered. No application deployment, issue, commit or push occurred. Migration registration remains pending a separately authorized clean commit; the existing approval was not altered.

## Subsequent authenticated read-only acceptance — 2026-11-06

Administrator dashboard and unsaved group drawer, plus viewer dashboard and direct management URL, were inspected in both themes at all five required sizes. A native unthemed 27–30px name input was corrected by reusing maintained form styling; rendered controls were then 44–46px. The user confirmed dirty cancellation retained the name before signing in as viewer. Viewer dark was inspected after user-only local theme adjustment. No group save/delete or agent preference save occurred. The viewport override was reset. See the [durable matrix, verification and coverage limits](../releases/2026-11-06-investment-groups-local-acceptance.md). Earlier blocked evidence above is historical. Shared named-group write/recovery/edge-state acceptance remains unperformed; isolated fixtures do not replace it. No commit, push or application deployment occurred.
