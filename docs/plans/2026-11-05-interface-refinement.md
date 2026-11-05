# Interface Refinement Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task by task after implementation is requested. Follow project workflow adaptations; do not create branches or make automatic commits.

**Status:** Approved; implementation and isolated regression checks completed on 2026-11-05; authenticated visual acceptance remains partial. Authorized incident cleanup is complete. Issue, scoped commit, push and automatic TEST delivery are authorized; deployment evidence is tracked separately.

**Goal:** Refine Family Ledger into a calm, warm financial workspace with grouped navigation, clearer page hierarchy, and full-page statement import while retaining its original logo and existing financial behavior.

**Architecture:** Refine the existing React shell and shared styles first, then investment pages and contextual drawers, followed by extraction of the statement-import workflow into routed pages. Reuse existing API clients, authorization, request lifecycle, and financial contracts.

**Tech Stack:** React, TypeScript, Vite, existing CSS tokens, Lucide and Recharts; no new UI framework.

**Spec:** The approved direction is recorded below. Maintained owners are [frontend guidelines](../frontend-guidelines.md), [investment overview](../specs/investment-overview.md), [spending](../specs/spending.md), [education reserve](../specs/education-reserve.md), and [account visibility](../specs/2026-10-31-account-visibility-design.md). Update their affected clauses alongside implementation; this proposal does not silently replace current contracts.

## Baseline and authorization

- Planning baseline: branch `test`, HEAD `4e28c251057cf957e16d99af7a030f475ed7eda5`. Reinspect before execution.
- Existing unrelated work: modified `docs/releases/2026-11-04-kernel-independent-anchors-test.md`; untracked `docs/plans/2026-11-04-kernel-actual-price-backfill.md` and `docs/releases/2026-11-04-kernel-actual-price-repair-test.md`. Preserve these files.
- Implementation, validation and review are authorized. Subsequent explicit authorization covers zero-association incident-account cleanup, issue creation, scoped commit, push to test and existing automatic TEST delivery. No migrations, production release, independent infrastructure changes or further shared business-data writes are authorized.
- Executors read root `AGENTS.md`, `apps/web/AGENTS.md`, [project workflow](../project-workflow.md), and task-specific contracts. Read `scripts/AGENTS.md` before editing verification scripts. Include these in any authorized handoff.

## Approved direction and interpretation

The two conversation mockups represent a dashboard and a full-page statement preview. Adopt their warm-white surfaces, restrained brown/gold accents, grouped sidebar, concentrated headline metrics, and spacious tabular workspace. They are illustrative, not pixel-perfect or business-data specifications.

### Original branding is mandatory

- Keep the original logo artwork and existing brand wordmark. Reuse `apps/web/public/icon-64x64.png` and existing resolution variants as appropriate. Preserve favicon, Apple touch and Android icon resources.
- Do not use the mockups' newly drawn outline-house logo. Do not regenerate, recolor, crop, distort, or overwrite original branding assets.
- Adjust surrounding spacing and logo display size only, keeping aspect ratio. Consolidate duplicate brand placements in the authenticated shell while retaining a clear sidebar/mobile-header identity.
- Record logo asset hashes at execution baseline and compare after implementation.

### Navigation

| Group | Entries in order |
| --- | --- |
| 概览 | 财富足迹, 月度回顾 |
| 投资 | 持仓总览, 交易记录, 投资标的 |
| 家庭 | 家庭收支, 账户管理 |
| Bottom utilities | 数据维护, 设置 |

Move the About entry into Settings while keeping `/about` directly accessible. Keep current route URLs and family-cashflow tab URLs. Accounts remain cross-purpose. Desktop retains collapsible navigation; mobile retains its initially closed overlay drawer. No new bottom navigation or deeply nested menu is included.

### Visual system

- Use warm near-white canvas, white/light neutral surfaces, dark readable text and gold primarily for selected states and primary actions. Use restrained borders; reserve prominent shadows for overlays.
- Remove tree backgrounds, star overlays, glow and strong decorative gradients from authenticated work areas. Login and About can retain restrained brand decoration using existing assets.
- Use a consistent spacing scale, legible Chinese typography, tabular financial numerals and clear primary/secondary/helper text hierarchy. Controls remain at least 44px high.
- Reduce repetitive cards and large repeated branding; preserve meaningful metric groups and panel boundaries. Main content should use the space released by a narrower sidebar without stretching short forms unnecessarily.
- Support light and dark themes together. Preserve red-positive/green-positive preferences, sign symbols and chart principal conventions. Tune theme contrast without changing financial meaning.

### Account-scope wording

- Remove the global `可见账户合计` notice and avoid replacement banners implying that other accounts are hidden or that the user sees only part of the household.
- Use ordinary labels such as `当前估值`, `投资盈利`, and `账户数量`. Keep the distinction between overall headline metrics and `筛选结果`.
- For an empty authorized dataset, use neutral page-specific copy such as `暂无账户` or `暂无数据`; never reveal hidden counts, remainders or totals.
- Preserve administrator access-management controls and all server authorization, filtered aggregates, revision invalidation and session protections. Do not delete authorization-related `/me` reads elsewhere merely because the notice is removed.
- This explicit user request supersedes the visible-scope-label clause when implemented. Update the maintained investment and account-visibility specifications accordingly; keep their security requirements.

### Page and overlay policy

- Dashboard: concentrated four-metric summary, dominant valuation/profit, quieter daily movement/cash, compact status, trend and bounded recent trades above the two existing distributions.
- Holdings: two overall headline metrics, compact filters and filtered-result summary, then the table. Keep overall and filtered scope unambiguous.
- Account/holding analysis stays on independent detail pages. Distinguish account performance navigation from account-information editing in action labels.
- Keep short contextual edits and single-record details in drawers. Make mobile drawers full-width with reliable title, scrolling and action areas.
- Move statement upload, preview and result into a dedicated workspace. Preserve statement history, PDF attachments, cancellation and undo entry points.
- Account creation with multi-row opening assets is a later slice within this plan: use a dedicated basic-information/opening-assets/review flow while preserving existing request atomicity and error semantics. Basic account edits stay in drawers.

## Global constraints

- No financial formulas, valuation eligibility, quote-refresh timing, business dates, reporting currencies or provider behavior change.
- Preserve actual snapshot dates and carried-date warnings from the current market-data recovery contract. Never replace real data quality with the mockup's unconditional green status.
- Distribution remains securities by individual investment account plus pooled cash; do not copy the mockup's single aggregated securities row or invented asset groups.
- Use existing spending classification labels: `收入`, `消费`, `退款/返现`, `转账/不计入`, `待确认`. The mockup's `日常支出` and `待核对` are not new domain values.
- Duplicate candidates default to skipped but can be explicitly retained under the existing approval rules. Invalid rows block import; pending classification is not itself a new commit blocker. Preview creates no ledger transactions.
- Preserve viewer/admin boundaries, original-file restrictions, sensitive-password handling, scope invalidation and URL filter semantics.
- Keep horizontally scrollable data tables on phones. Do not replace them with cards in this scope.
- Repository prose and identifiers are English; visible interface copy is Simplified Chinese.

## Review focus

1. Empty account scope or revoked access: neutral empty state, no hidden data, and cleared stale cached content (Tasks 1 and 6).
2. Long Chinese names and large/negative amounts at 320px: no page overflow, readable metrics and scrollable tables (Tasks 2, 3 and 6).
3. Dirty or submitting drawers: keyboard/overlay dismissal cannot silently discard input or permit duplicate submission (Task 4).
4. Import navigation, expired preview or uncertain commit result: recover through existing server state and retry semantics without replaying writes automatically (Task 5).
5. Missing prices/FX, carried snapshots and theme/color preferences: retain truthful status and readable charts (Tasks 2, 3 and 6).

## Task 1: Group navigation and remove scope reminders

**Actual progress:** Implementation complete. Admin navigation and mobile focus boundaries inspected. Exhaustive destination/legacy redirect and restricted/empty-scope live acceptance remain pending.

**Files:** `apps/web/src/lib/navigation.ts`, `apps/web/src/components/Layout.tsx`, `apps/web/src/components/AccountScopeNotice.tsx`, `apps/web/src/pages/SettingsPage.tsx`; affected frontend/investment/account-visibility documents.

- [x] Add group metadata to navigation items while retaining route lookup used by `PageTitle`; render grouped navigation and bottom utilities from the same definitions.
- [x] Keep About routable and reachable from Settings; verify nested account, holding and import pages keep the correct parent selection.
- [x] Remove the global notice mount and its unused component/request if no callers remain. Inspect aggregate copy for equivalent partial-visibility reminders; do not hide real valuation failures or administrator policy controls.
- [ ] Preserve mobile inert/background handling, keyboard focus and collapse preference. Verify every existing destination and legacy cashflow redirect.
- [ ] Update the owning label/navigation clauses. Verify restricted, empty-scope and admin states using isolated fixtures and later real-login inspection.

## Task 2: Establish shared styling and preserve the logo

**Actual progress:** Shared styling implemented in both themes; 11 branding files match their baseline hashes. Empty/loading/pagination behavior retained. Full zoom/reduced-motion/safe-area and contrast audit not completed.

**Files:** `apps/web/src/styles.css`, `apps/web/src/components/Layout.tsx`, `PageTitle.tsx`, `PageBackLink.tsx`, `CurrencySelect.tsx`, `PaginationControls.tsx`, `LoadingState.tsx` under `apps/web/src/components/`; `docs/frontend-guidelines.md`.

- [x] Capture hashes for existing branding assets and inventory shared selectors before editing; prefer consolidating affected declarations over adding conflicting overrides.
- [x] Implement the visual system above in existing theme tokens, shell, headings, actions, forms, tables, tabs and feedback states. Retain original logo and wordmark; remove authenticated-shell decorative backgrounds and redundant branding.
- [x] Keep input labels, visible focus, disabled states and field errors readable in both themes; target WCAG AA text contrast and non-color status cues.
- [ ] Normalize empty/loading/error and pagination presentation without losing page-size controls or exact counts. Empty paginated results use the maintained zero-page semantics.
- [ ] Check long labels, browser zoom, reduced-motion preference, mobile safe areas and sticky-action clearance. Compare logo hashes and document tokens/conventions.

## Task 3: Refine investment information hierarchy

**Actual progress:** Hierarchy, compact filtered totals, data-status detail and identity-based distribution colors implemented. Named financial fixtures passed; broader synthetic missing-data/long-name visual scenarios remain pending.

**Files:** `apps/web/src/pages/DashboardPage.tsx`, `HoldingsPage.tsx`, `AccountDetailPage.tsx`, `HoldingDetailPage.tsx`; `apps/web/src/components/InvestmentPerformanceCard.tsx`, `ValuationStatus.tsx`, `DistributionPanel.tsx`, `InvestmentTrendChart.tsx`; affected styles and investment specification.

- [x] Recompose dashboard summary and panel spacing; retain chart tabs, range, plot semantics, recent-trade height matching and narrow-screen stacking.
- [x] Surface concise blocking data-quality summaries, with dates/source explanations in expandable details. Distinguish expected publication lag from missing inputs.
- [x] Compress holdings filtered totals into a coherent summary; keep headline values independent of filters. Preserve columns and add a scroll cue; pin a compact identifier column only where it leaves usable width on phones.
- [x] Align account/detail headers and actions with the same hierarchy. Preserve chart-only range loading and report-currency behavior.
- [x] Improve distribution label/amount alignment and stable color mapping without changing groups or denominators. Preserve incomplete/negative-value behavior.
- [ ] Run existing dashboard, trend, holdings and account-detail focused checks; visually inspect loss, missing-data and long-name examples without changing shared live data.

## Task 4: Make contextual drawers safe and consistent

**Actual progress:** Focus entry, containment, restoration, Escape and scroll cleanup verified on account edit drawers. Both themes inspected at all five sizes. Isolated cancelled dirty dismissal, save success/failure, submitting protection and revocation checks passed without shared saves.

**Files:** `apps/web/src/components/Drawer.tsx`; callers in `AccountsPage.tsx`, `InstrumentsPage.tsx`, `TransactionsPage.tsx`, and `components/spending/`; shared styles.

- [x] Add dialog labelling, initial focus, focus containment, focus restoration, Escape handling and background-scroll containment with cleanup on unmount.
- [x] Route close button, backdrop and Escape through one close-request path. Give callers optional dirty/submitting guards; default behavior remains compatible for read-only details.
- [x] Add unsaved-edit confirmation only after meaningful changes. Preserve transaction uncertain-result protection and retry identity; prevent dismissal while a save is pending where required.
- [x] Fix header/action footer placement while allowing one predictable content scroll region; use full-width mobile panels.
- [x] Verify keyboard-only open/edit/close, cancelled dismissal, failed save, successful save, focus return and scope revocation in isolated fixtures. Use existing testing facilities; do not add a framework solely for this task.

## Task 5: Extract complex workflows into pages

**Actual progress:** Routed import and staged account creation implemented. Existing committed batch selection and reload restored successfully. Statement response-loss/definitive-rejection fixtures passed. Premature Next-button submit found during acceptance, fixed and red/green verified locally; real final-submission and failure-recovery acceptance remain pending.

**Files:** `apps/web/src/App.tsx`, `pages/SpendingPage.tsx`, `components/spending/SpendingStatementsDrawer.tsx`, `lib/spendingClient.ts`, `pages/AccountsPage.tsx`; create `pages/SpendingImportPage.tsx`, `components/spending/SpendingImportWorkspace.tsx`, and `pages/AccountCreatePage.tsx` under `apps/web/src/` as needed for these responsibilities.

- [x] First extract import UI/state from its drawer shell without changing requests. Keep history and attachment/undo/cancel controls accessible through the existing entry point.
- [x] Add `/daily-expense/import` and an existing-batch route `/daily-expense/import/:statementId`. Keep active navigation on 家庭收支 and use `PageBackLink` to return to the applied spending query.
- [x] Present upload, preview and result stages, source/account context, exact counts, duplicate/error controls, paginated table and persistent action summary. Retain encoding selection, explicit skip/duplicate decisions, original record numbers and all current bank metadata.
- [x] Reuse existing authorized statement reads on reload/deep link. Handle missing/expired/cancelled/committed batches explicitly. Never put file bodies, signed URLs, credentials or preview decisions in URL parameters; never automatically commit after navigation.
- [x] Guard departure with unsaved preview choices and pending operations. Preserve the server token and exact decision set for retry; show prior committed results rather than making a new batch after uncertain outcomes.
- [x] Add the account creation route `/accounts/new` and extract the current form/initial-assets logic for staged presentation. Keep edit drawers and all current validation; if requests are currently separate, show partial success honestly and never invent atomic completion.
- [x] Update spending and frontend workflow documentation; add focused isolated checks for route restoration, duplicate overrides, malformed records, token expiry, uncertain retry, viewer restrictions and account-create failure recovery.

## Task 6: Cross-page consistency and acceptance

**Actual progress:** Core local validation passed after restoring the temporary theme override. Read-only theme/layout coverage is recorded below; overall visual acceptance is not complete; scoped automatic TEST delivery is authorized.

**Files:** remaining affected web pages, `docs/frontend-guidelines.md`, owning product specifications, this plan. Update `docs/roadmap.md` only with actual implementation/acceptance status.

- [ ] Apply shared visual conventions to family cashflow tabs, education, monthly review, data maintenance and Settings. Preserve monthly-review print layout, existing settings panel grouping and recovery-dialog behavior.
- [ ] Review all changes against the execution baseline, including working/index diffs and new files; verify unchanged logo hashes, all routes, restricted access and absent scope-reminder copy.
- [x] Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build`.
- [x] Run affected local checks: `verify:account-access-client`, `verify:family-cashflow-ui`, `verify:transaction-table`, `verify:transaction-idempotency`, `verify:dashboard`, `verify:portfolio-trend`, `verify:holdings`, `verify:account-detail`, `verify:spending`, and `verify:account-purposes`. Confirm current commands/effects in package scripts and local testing first; add education/monthly/auth checks if their behavior is touched.
- [x] For import behavior extraction, run `verify:spending-db` against its disposable local database. No shared-environment imports or ledger mutations are authorized by this plan.
- [ ] Obtain user agreement, provide the local login URL and wait for real login/target-page readiness under [authenticated acceptance](../local-testing.md#authenticated-browser-acceptance). Check `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000`, including both themes, grouped navigation, dashboard, holdings, drawers, import and settings. Use isolated synthetic fixtures for destructive/write paths; report any live visual flows that cannot be inspected without writes as pending.
- [x] Record implementation, deployment and visual acceptance separately. Existing waivers for other tasks do not apply. Finish with the scoped diff and outstanding findings; delivery requires its own authorization.

## Planning verification

The original plan was checked for scope, maintained-contract links and whitespace before implementation. Checkboxes now record completed implementation/checks only. Unchecked combined items include remaining acceptance and must not be treated as complete because their code portion exists.

## Execution evidence (2026-11-05)

- Workspace remains test at 4e28c251057cf957e16d99af7a030f475ed7eda5. Existing task documentation and unrelated files are preserved; no issue, commit, push, deployment or migration was performed.
- Final core checks passed: corepack pnpm lint; corepack pnpm typecheck; corepack pnpm build. The production output excludes the development-only account creation fixture.
- Earlier local fixture runs passed: verify:account-access-client, verify:family-cashflow-ui, verify:transaction-table, verify:transaction-idempotency, verify:dashboard, verify:portfolio-trend, verify:holdings, verify:account-detail, verify:spending, verify:account-purposes, and verify:auth. Disposable verify:spending-db passed with synthetic loopback data. No shared migrations were applied.
- The synthetic apps/web/verify-interface-workflows.ts check passed after the last implementation changes. It covers exact statement token/decisions, no automatic write replay, committed-state recovery, unreadable/pending state and definitive rejection classification.
- Fresh-context review examined working/index changes and new files. Its important deterministic-rejection lock finding was fixed; expiry/validation rejection releases the uncertain lock and exposes explicit record reload. Its hidden-field keyboard finding was fixed. The later native button-default defect and its fix are recorded separately below.
- All 11 original icon/favicon/Apple/Android files match the captured SHA-256 baseline. No branding resources were overwritten.
- Temporary local dark rendering changed only the DOM theme assignment in preferencesContext during inspection; no preference save was submitted. The original source was restored byte-for-byte and has no Git diff. Reload confirmed the original light preference. Authentication bypass remained disabled in both local processes.

### Observed visual coverage

The user completed real login and confirmed readiness before authenticated inspection, including a second login after local service interruption. Five sizes were used: 320x740, 393x852, 430x932, 768x1024 and 1440x1000.

| Surface | Light coverage | Dark coverage | Limits |
| --- | --- | --- | --- |
| Dashboard | Five sizes | Five sizes | Values, loss, chart/distribution layout and source warning inspected; not every missing-input/carried-date scenario |
| Holdings | Five sizes sampled | Five sizes | Light tablet capture during transition needs settled recapture; table scroll and filtered/overall distinction inspected |
| Import workspace | Five sizes | Five sizes | Upload/history layout only; existing committed deep link and reload inspected; no live preview/commit/undo/cancel acceptance |
| Settings | Five sizes | Five sizes | Read-only panels and About entry; no preference/access/password writes |
| Account edit drawer | Five sizes | Five sizes | Title/body/actions, focus loop, Escape, restoration and scroll cleanup; dirty-cancel and pending/failure paths pending |
| Account creation | Five sizes for basic information; narrow opening layout | Five sizes for basic information; narrow opening layout | Final-step live acceptance failed due to the incident below; fix verified only in isolated fixture |
| Grouped navigation | Desktop and narrow mobile | Desktop and narrow mobile | Mobile focus wrap verified; exhaustive routes/collapse/legacy redirect acceptance pending |

These observations are partial acceptance, not a blanket visual pass. Browser zoom, reduced-motion behavior, safe-area extremes, remaining detail/education/monthly/maintenance surfaces and print layout remain pending. Scope revocation, empty-authorized datasets and both gain-color choices still require the appropriate isolated/live read-only scenarios. A build or mock fixture does not replace them.

### Acceptance incident and isolated regression

During resumed acceptance, clicking 下一步 from the opening-assets stage unexpectedly submitted creation. The authenticated account list then showed one newly observed account named 本地验收（不保存）. This shared write was outside the user's explicit authorization. Browser interaction with shared write paths stopped immediately, the user was informed, and cleanup waited for separate explicit authorization. After authorization, the exact-name match was unique. All live foreign-key references were enumerated: transactions, account snapshots, education legacy-account links and account grants each had zero rows. One transaction locked the account, rechecked all associations and deleted only that row. The managed placeholder password parameter was removed without reading its value. A subsequent read confirmed account absence; no related business data was deleted.

Root cause: React reused the advancing button DOM node as the final submit button during the native click default action. The isolated [development fixture](../local-testing.md#account-creation-button-regression) reproduced two Next clicks producing simulated submission count 1 before explicit confirmation. Distinct advance/confirm keys and preventDefault on advancing fixed it: the same flow now reaches review with count 0, explicit Confirm gives count 1, and Enter/back with hidden incomplete opening fields remains at count 0. This fixture imports no API/auth clients and performs no network writes. No real shared submission was repeated after the fix.

### Remaining gates

- Complete the unchecked acceptance items and settled light-tablet recapture; run remaining synthetic failure/revocation/long-name scenarios before declaring full UI acceptance.
- Do not exercise account creation, import preview/commit, cancellation, undo, preferences or access writes against shared data under this authorization. Prefer isolated fixtures; any shared mutation requires its own explicit decision.
- Authorized incident cleanup is complete. No further shared mutation is authorized by acceptance or environment naming.
- Implementation is locally validated; automatic TEST delivery is authorized; visual acceptance remains partial/pending. No unrelated earlier waiver applies.


### Final isolated acceptance and delivery authorization

- Development-only fixtures mount real components with synthetic in-memory clients. Unexpected fetches fail; observed network counters stayed zero. These fixtures are excluded from production builds and do not replace authenticated acceptance.
- Import checks passed: duplicate default skip and explicit retention, exact manual retry after response loss, committed-state recovery without replay, definitive rejection unlock, expired preview refresh, malformed-row blocking, viewer restrictions and unavailable/revoked records. Long names and large negative amounts stayed inside the 320px scroll region.
- Review found selected-file loss on internal history switches. A failing reproduction preceded the fix; cancelling departure now retains the selected file and permits previewing it. Route and internal switches protect both selected files and changed preview decisions.
- Drawer fixtures passed dirty Escape cancellation, pending-close protection, failed-save input retention, successful-save focus return and scroll cleanup, and forced revocation. Account fixtures passed Next/Enter progression without submission, explicit confirmation once, and partial-success duplicate prevention with return/cancel still available.
- The reviewed fixed core (15 checks) and focused account-purpose, cashflow UI, spending, transaction-table, account-detail and interface-workflow checks passed. Audit updates cover only reviewed sources and exercised paths.
- Temporary source theme overrides were restored; browser viewport overrides were reset and fixture tabs closed. Original branding resources remain unchanged.
- Root AGENTS.md and deployment guidance record the user policy: TEST contains real family data; launch promotes its database to PROD and creates a separate TEST database. No cutover is performed.
- Earlier no-delivery statements above describe the initial execution phase; the subsequent explicit TEST delivery authorization recorded here supersedes them. Remaining authenticated visual/zoom/print coverage remains pending.

Delivery tracking: [issue #132](https://github.com/bluewuxi/family-ledger/issues/132) and [release evidence](../releases/2026-11-05-interface-refinement-test.md).
