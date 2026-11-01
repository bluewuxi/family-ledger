# Manual Testing Follow-up Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential execution in the existing checkout. Follow the project compatibility rules instead of generic worktree, commit, or deployment steps. Delegation is not required by this plan.

**Status:** Implemented locally; active migration applied and verified on TEST. Administrator browser acceptance completed within the read-only scope below. Restricted-viewer acceptance is user-deferred; deployment and migration approval registration remain pending.

**Goal:** Resolve the seven findings collected during the user's manual testing without changing financial calculations or weakening account authorization.

**Architecture:** Reuse a shared trend presentation for dashboard and account detail; distinguish compact price lists from detailed price disclosure. Add instrument activity as an independent server-enforced state, and reorganize settings without changing authentication permissions.

**Tech stack:** React, TypeScript, Recharts, Lambda API/jobs, Supabase Postgres, existing verification scripts.

**Specifications:** [Investment overview](../specs/investment-overview.md), [account visibility](../specs/2026-10-31-account-visibility-design.md), [auth](../auth.md), [API](../api.md), [data model](../data-model.md), [frontend guidelines](../frontend-guidelines.md), and [time policy](../time-policy.md). The user-confirmed changes below are inputs to this plan; update affected maintained contracts during implementation.

## Baseline and authorization

- Planning baseline: branch `test`, HEAD `558207abd1971422070a47d726399724a5e6a42e`.
- Existing uncommitted changes in `docs/local-testing.md` and `docs/specs/2026-10-31-auth-migration-design.md` document the separately completed TEST user rename. Preserve them and distinguish them in review.
- The user subsequently authorized implementation and local validation of all seven findings, with explicit instructions not to commit, push, deploy, or apply the prepared migration.
- Future implementation authorization includes code, migration preparation, documentation, local checks, and review; applying a shared-database migration requires separate explicit authorization. The prior user-rename authorization does not cover an instrument migration.
- Keep English repository prose and Simplified Chinese UI text. No new dependencies or permission roles are expected.
- Follow [project workflow](../project-workflow.md) and [authenticated acceptance](../local-testing.md#authenticated-browser-acceptance). Never replace real login with an auth bypass.

## Seven findings and acceptance targets

| ID | Finding | Target |
| --- | --- | --- |
| 1 | Account trends differ from dashboard charts. | Match dashboard curves, gradients, axes, legend, height, zero line, principal styling, and hover/touch presentation for both tabs; preserve account data/range/currency semantics. |
| 2 | Latest-price cells have excessive labels. | Account detail, holdings overview, and account holdings lists show price and its trading date only. Detailed metadata remains available in holding detail. |
| 3 | Instruments cannot be disabled independently of price automation. | Add `active`; hide inactive instruments from transaction choices and stop automatic price acquisition while preserving history. |
| 4 | Monthly-review authorization coverage needs confirmation. | Verify all computed sections use authorized accounts. Use exactly `资产变化`, not `家庭资产变化` or `可见账户合计`, for the relevant page wording. |
| 5 | Extra-password recovery instructions are permanently displayed. | Add `忘记密码？`; show guidance only in a dismissible dialog after clicking. |
| 6 | User-access heading is separated from its list by the password form. | Group heading, explanation, actions, messages, and user table together. Keep the extra-password section separate. |
| 7 | Change-login-password action is misplaced at the page top. | Place `修改登录密码` immediately left of `刷新用户` for administrators; preserve a self-service entry in user preferences for viewers. |

## Review focus

- Editing a historical transaction referencing an inactive instrument must not silently clear or replace its original instrument (Task 3).
- Disabled instruments with remaining holdings must remain in valuation/history; cached quotes must not trigger fresh requests (Task 3).
- Missing values, live endpoints, color crossings, and negative ranges must survive chart sharing (Task 1).
- A viewer granted account A must not receive account B amounts, warnings, or contribution denominators; shared authored monthly notes remain the documented exception (Task 4).
- Viewer password access, dialog keyboard focus, and narrow-screen action placement must survive settings regrouping (Task 5).

## Task 1: Unify account and dashboard trend presentation

**Files:** `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/components/AccountTrendChart.tsx`, new `apps/web/src/components/InvestmentTrendChart.tsx`, `apps/web/src/pages/AccountDetailPage.tsx`, `apps/web/src/styles.css`, `docs/specs/investment-overview.md`.

**Interface:** The shared presentational component receives the existing prepared trend/profit series, selected view, gain-color preference, axis configuration, and hover-date metadata. Fetching, range state, reporting currency, and financial calculations stay with existing owners. Define its typed props from the existing chart helper types before extraction; do not duplicate the series-building algorithms.

- [ ] Extract dashboard presentation into the shared component, retaining its existing reference appearance: 280px plot, 2.8px main strokes, smooth curves, gradient fills, principal step/dash style, and gain/loss colors.
- [ ] Route both pages through the shared presentation; retain account range controls, separate loading/errors, current endpoint connection, real gaps, and synthetic-point tooltip exclusion.
- [ ] Align legend and tooltip formatting with the dashboard, including rounded monetary tooltip display, without changing stored values or calculations.
- [ ] Run `corepack pnpm verify:portfolio-trend`, `corepack pnpm verify:dashboard`, and `corepack pnpm verify:account-detail`; inspect both tabs with positive/negative ranges, gaps, and a live endpoint during final visual acceptance. Pure styling does not require artificial unit tests.

## Task 2: Separate compact price display from detail disclosure

**Files:** `apps/web/src/lib/holdingDisplay.tsx`, `apps/web/src/pages/AccountDetailPage.tsx`, `apps/web/src/pages/HoldingsPage.tsx`, `apps/web/src/pages/AccountsPage.tsx`, `apps/web/src/pages/HoldingDetailPage.tsx`, `docs/specs/investment-overview.md`.

**Interface:** Extend `formatHoldingLatestPrice` with an explicit `compact | detailed` presentation option; require each call site to choose its mode.

- [ ] Use compact mode in holding lists: price plus provider/exchange trading date only; remove estimate, quote-kind, provider, and fetched-at badges from those cells.
- [ ] Keep all those metadata fields available in holding detail, including estimated status and acquisition time. Do not remove them from DTOs or underlying storage.
- [ ] Preserve precision, missing-price fallback, cash behavior, and actual price dates; never substitute the fetch date or viewer-local date for a trading date.
- [ ] Update the account-detail specification that currently requires source and estimate labels in the list price column. Limit the new compact rule to overview/list displays; detailed price-reference and maintenance screens keep their information.
- [ ] Verify examples for quotes, stored closes, estimates, missing prices, and cash; run `corepack pnpm verify:holding-detail` and `corepack pnpm verify:holdings` where affected.

## Task 3: Add instrument activity across storage, transactions, and prices

**Files:** new `supabase/migrations/20261101100000_instrument_active.sql` (confirm filename is unused before creation), `packages/shared/src/index.ts`, `apps/api/src/repositories/instrumentRepository.ts`, `apps/api/src/services/instrumentService.ts`, `apps/api/src/services/transactionService.ts`, `apps/api/src/services/dashboardService.ts`, `apps/api/src/repositories/marketDataSourceRepository.ts`, `apps/jobs/src/repositories/instrumentPriceRepository.ts`, `apps/jobs/src/repositories/portfolioSnapshotRepository.ts`, `apps/web/src/pages/InstrumentsPage.tsx`, `apps/web/src/pages/TransactionsPage.tsx`, `apps/web/src/pages/AccountsPage.tsx`, relevant backup/restore mappings, and API/data-model/local-testing documentation.

**Interface:** `instruments.active boolean not null default true`; `Instrument.active: boolean`; create defaults omitted activity to true; update changes activity only when supplied. Preserve `priceUpdateEnabled` independently. The following historical-edit and cache rules are proposed implementation defaults, not previously verified behavior.

- [ ] Add focused fixtures in new `scripts/verify-instrument-active.ts` before implementation. Assert create defaults, explicit false, omitted update preservation, invalid-type rejection, and read/history retention.
- [ ] Prepare the migration and map `active` through all instrument readers, writers, fixtures, seeds, export, and restore paths. New backups retain false; older supported backups without the field default to true under explicit version compatibility rules. Verify against existing backup fixtures and an isolated database, never shared TEST.
- [ ] Add an enable/disable control and visible state to instrument management. Keep inactive entries available for management, historical filters, name lookup, and detail navigation.
- [ ] Filter new transaction choices to active compatible instruments in every transaction-entry path. On editing an old record, show its inactive original instrument as retained context rather than an available new choice. Allow retaining that same reference while editing other fields; reject new selection or reassignment to an inactive instrument on the server. Never clear or substitute its ID automatically.
- [ ] Check native cash instruments and generated cash legs separately: prevent silently selecting an inactive settlement instrument, report a clear validation reason, and retain existing generated legs/history when editing unrelated fields.
- [ ] Gate live quote requests and scheduled/manual automatic-price ingestion on both `active` and `priceUpdateEnabled`. Keep configured sources and automation settings so re-enabling restores eligibility. Audit derived Kernel estimate paths and provider target counts, not only ordinary quote providers.
- [ ] Keep existing historical prices, snapshots, transactions, and nonzero holdings. Proposed cache policy: do not delete stored quote/cache rows; existing valid cache may be read until normal expiry, but inactive instruments trigger no refresh and then use existing stored-price fallback. Preserve missing-price warnings instead of dropping holdings from totals.
- [ ] Extend fixtures for zero provider calls for inactive instruments, active re-enable behavior, cached data, held inactive instruments, history reads, retained inactive transaction references, rejected reassignment, and backup round trips.
- [ ] Run the new fixture plus affected `verify:market-data`, `verify:dashboard-quote-timeout`, `verify:stock-etf-price-ingestion`, `verify:fundrock-ingestion`, `verify:kernel-price-estimation`, `verify:portfolio-snapshots`, and `verify:backup` scripts. Classify database scripts before execution and run only isolated fixtures within implementation scope.
- [ ] Document the approved final activity/edit/cache semantics and prepare a separate migration-application checklist. Do not apply the migration or register deployment state under implementation authorization alone.

## Task 4: Verify monthly scope and correct wording

**Files:** `apps/web/src/pages/MonthlySummaryPage.tsx`, `scripts/verify-monthly-summary.ts`, new `scripts/verify-monthly-summary-scope.ts`, `docs/specs/investment-overview.md`; inspect `apps/api/src/services/monthlySummaryService.ts`, `apps/api/src/repositories/transactionRepository.ts`, `apps/api/src/repositories/portfolioSnapshotRepository.ts`, and auth request context.

**Evidence:** Current source already scopes transaction reads and account snapshot rows before aggregation. No missing monthly authorization filter was confirmed. Deployment and real viewer acceptance have not been established by this investigation.

- [ ] Add an isolated request-scope integration fixture covering A-only access, empty grants, all-account admin access, and hidden B with missing valuation data. Exercise repository filtering and the summary service together, not only pure arithmetic helpers.
- [ ] Assert authorized-only bridge totals, principal rows, account contributions and denominator, trade counts, dividends, cash adjustments, and warnings. Keep shared monthly narrative/status under the explicit existing exception.
- [ ] Fix a server-side scope gap only if the new evidence demonstrates one; do not add a second frontend authorization calculation.
- [ ] Change the relevant heading/description to `资产变化`; remove the misleading whole-family description without introducing `可见账户合计`. Record this page-specific wording exception in the investment specification.
- [ ] Run `corepack pnpm verify:monthly-summary`, `corepack pnpm verify:account-access`, and the new scope fixture. Verify the deployed page later using an explicitly configured restricted viewer and normal login.

## Task 5: Regroup settings and move password actions (findings 5–7)

**Files:** `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/styles.css`, `docs/frontend-guidelines.md`, relevant user-management/recovery wording in `docs/auth.md`.

- [ ] Group the user-access title, description, user-specific feedback, refresh action, account-scope editor, and table in one section. Keep the extra-password form in a separate section with its own feedback.
- [ ] Move `修改登录密码` beside `刷新用户`, immediately to its left. Retain the existing `/change-password` route and a viewer self-service link in the preferences section; viewers must not gain user-management controls.
- [ ] Replace the always-visible extra-password recovery paragraph with `忘记密码？` opening a dismissible accessible dialog. Support keyboard activation, Escape/close, focus containment, and focus return. Opening guidance performs no reset or backend write.
- [ ] Keep recovery guidance consistent with the maintained operator procedure. Inspect the existing hard-coded parameter-name inference and runtime configuration before reusing it; avoid exposing a guessed TEST/production target in the new dialog. Parameter names are not credentials, but secret values must never be displayed.
- [ ] Inspect administrator/viewer layouts, long emails, loading/saving/error feedback, and narrow screens. Keep controls at least 44px high and tables horizontally scrollable; wrap the action group without overlap.
- [ ] Run existing relevant auth/client checks if changed behavior reaches them; verify the dialog and role-dependent navigation during final real-login acceptance.

## Task 6: Integrated verification and review

- [ ] Review all seven acceptance rows against the final working-tree changes, including staged/untracked files and preserved baseline documentation changes. Record unresolved findings explicitly.
- [ ] Run `corepack pnpm typecheck`, `corepack pnpm build`, applicable focused checks above, and `git diff --check`. Check documentation meaning, cross-links, and consistency with implemented behavior.
- [ ] With user agreement and real login/readiness, inspect account detail, dashboard, holdings, instruments, transaction editing, monthly review, and settings at `320x740`, `393x852`, `430x932`, `768x1024`, and `1440x1000`. Obtain separate authorization for shared test-data or grant changes. Reuse `test@example.com`; do not create another shared feature-test identity.
- [ ] Report implementation, migration status, deployment, and authenticated visual acceptance separately. Do not call unperformed browser checks passed. No commit, push, issue creation, or deployment is included unless subsequently authorized.

## Completed work outside this plan

The separate TEST rename to `test@example.com` is complete, including matching `app_users`/`profiles` email updates and preservation of UUID, grants, viewer role, inactive status, and credential linkage. Its policy documentation is already pending locally. Do not repeat this repair or include it among the seven outstanding findings.

## Local execution evidence (2026-11-01)

- Findings 1–7 are implemented in the working tree. The task checklists above describe the planned sequence; this execution record distinguishes completed code work from operational acceptance.
- Dashboard/account plots now share InvestmentTrendChart; compact list prices retain trading dates, and holding detail retains all metadata.
- Instruments have independent activity state, editable in management; inactive instruments are excluded from new transaction choices and automatic fetches. Historical edits retain their original inactive reference. Fresh existing cached quotes may still be used until expiry; historical valuation inputs remain intact.
- Backup format 11 preserves activity, validates boolean values, and normalizes older supported formats after checksum validation. The new additive migration sorts after the existing account-visibility backup migration. It remains unapplied to shared TEST.
- Monthly repository/service fixtures cover selected, empty, and all-account scopes, including a broken hidden account. No missing scope filter was found. The page uses 资产变化 as requested.
- Settings findings 5–7 are implemented together, including viewer self-service access and a native recovery dialog. Independent review identified and corrected the missing activity input and historical-edit save restriction.
- Passed focused checks: monthly-summary (including repository/service scope fixtures), account-access, holdings, holding-detail, account-detail, dashboard, portfolio-trend, market-data, dashboard-quote-timeout, stock-etf-price-ingestion, fundrock-ingestion, kernel-price-estimation, portfolio-snapshots, instrument-active, backup, and the auth-client fixture. Final full typecheck/build rerun passed after the review fixes; git diff --check passed.
- User explicitly deferred authenticated browser acceptance. No real-login or five-viewport visual acceptance is claimed. Shared grants/test data were not modified for these findings.
- No issue creation, commit, push, deployment, shared migration application, or repeat user rename occurred during this implementation.

- Isolated local PostgreSQL backup/restore verification passed: 27 tables and 52 migrations, version-11 equality, rollback, identity/privilege checks, default activity true, and inactive false preserved through export/restore. This used a disposable local database, not shared TEST.

## Authenticated browser acceptance (2026-11-01)

The user resumed acceptance, logged into the local application normally as an administrator, and confirmed `/settings` readiness. API/web bypass flags remained false. Missing local `AUTH_TABLE_NAME` initially prevented authentication; it was resolved from the existing TEST stack output into ignored `.env.local`, then the local API was restarted. No credentials, roles, grants, or shared schema were modified.

| Scope | Result | Evidence and limits |
| --- | --- | --- |
| Settings findings 5–7, administrator | Passed | Inspected 320x740, 393x852, 430x932, 768x1024, and 1440x1000. User heading/actions/table share one section; extra-password form is separate; login-password link precedes refresh on desktop and wraps on phones. Target actions measured 44px high. Recovery guidance is absent until clicked; dialog dismiss button and Escape work; focus returns to the trigger. User table remains internally scrollable. |
| Monthly wording and responsive shell | Passed within inspected scope | Inspected the same five sizes; the description and asset-change metric use `资产变化`. Existing missing-snapshot warnings remain visible. This is not acceptance of monthly numerical correctness or restricted-viewer authorization. |
| Charts and compact price cells (findings 1–2) | Blocked | Account detail and holdings display server errors because shared TEST lacks `instruments.active`. No populated chart/price visual acceptance is claimed. Dashboard has the same confirmed API dependency. |
| Instrument activity and transaction choices (finding 3) | Blocked | Instrument list shows an error from the absent field. The prepared migration remains unapplied; no test instrument/transaction was written. |
| Restricted viewer and viewer password entry | Pending | Only the administrator session was exercised. The dedicated test viewer remains inactive; no activation/grant/password changes were authorized or performed. Prior isolated scope fixtures remain the automated evidence. |

Private screenshot evidence: `.local/browser-acceptance/settings-recovery-desktop.png`. Full-page captures can reposition fixed mobile headers during capture; live viewport screenshots and DOM geometry were used to assess actual fit. Temporary viewport overrides were reset and the browser returned to settings. No settings, passwords, review notes, or ledger records were saved.

Overall visual acceptance is partial, not complete. Remaining populated investment-page checks require the separately authorized schema prerequisite and restricted-viewer checks require a normal user login with existing appropriate access. Deployment remains not requested.

## Authorized TEST migration and resumed acceptance (2026-11-01)

- The user explicitly authorized applying the prepared active migration to TEST and requested the configured SSM path in the recovery dialog. No commit, push, or application deployment was authorized.
- Applied only 20261101100000_instrument_active.sql under the existing operator deployment lock, using psql and runtime SSM password resolution. Verified active is boolean, NOT NULL, default true; all 20 instrument rows are active. A before/after fingerprint excluding active confirmed all existing instrument fields and IDs were preserved.
- Migration approval registration was not performed: the maintained registration command requires a clean committed checkout, while the user explicitly retained uncommitted work. Preserve this evidence and register the exact verified migration manifest after an authorized commit, before any later delivery. No approval gate was bypassed.
- The admin-only GET gate-status response now includes parameterPath from server configuration, never its value/verifier. The dialog visibly displays /family-ledger/test_trading_password_gate in TEST. Added an isolated status-response fixture verifying a custom configured path and exact output shape. Corrected narrow-screen code wrapping; 320px dialog scrollWidth now equals clientWidth (265px).
- Account detail and dashboard populated profit/assets plots were inspected at 320x740, 393x852, 430x932, 768x1024, and 1440x1000. Their gradient, curve, axes, principal, gain/loss styles match; tabs switch normally. Account asset keyboard selection displayed a valid date and rounded value. No chart financial calculation change was made.
- Holdings overview latest-price cells were inspected at all five sizes: only price and trading date appear; horizontal table scrolling remains contained. Holding detail retains source and price-reference information. Existing narrow metric cards can wrap long totals; no amount truncation was observed in DOM.
- Instrument edit and new-transaction selection were inspected at all five sizes. The activity checkbox can change independently from automatic pricing in unsaved form state, and cancel discards it. Transaction choices and current cash balance load; a selected active security is displayed correctly. No instrument state or ledger transaction was saved, so real inactive-save/provider exclusion remains supported by isolated fixtures, not a live mutation test.
- The user explicitly chose to preserve current user state and defer restricted-viewer browser acceptance. test@example.com remains inactive; no password, role, or grant was changed.
- Additional observed issue: after full-page navigation, settings/accounts/transactions and a transaction balance first read sometimes showed a request failure; the visible refresh/retry action restored data. This intermittent first-read behavior remains a separate open finding; it is not attributed to active migration or claimed fixed by these changes.
- Private evidence includes .local/browser-acceptance/recovery-with-path.png, recovery-path-mobile.png, and account-assets-393.png. Browser returned to settings and temporary viewport overrides were reset.
- Final local typecheck/build and account-secrets fixture passed following the recovery-path change; diff checks passed. No application deployment or migration registration was performed.

## Authorized combined delivery (2026-11-01)

The user subsequently authorized combining the Data fix task with these changes, committing, and deploying to TEST. The historical June repair had no unmerged source changes and was not replayed; the completed reusable TEST-user repair documentation is included. Tracking and verification evidence are in [issue 122](https://github.com/bluewuxi/family-ledger/issues/122) and the [release record](../releases/2026-11-01-manual-testing-follow-up.md). Independent review caught and corrected unchanged financial full-form edits incorrectly selecting inactive settlement cash; original unchanged-save snapshot recalculation is retained. Final typecheck/build and focused activity/backfill checks passed after that correction.
