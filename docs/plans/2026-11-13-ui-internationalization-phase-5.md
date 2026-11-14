# UI Internationalization Phase 5 Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline execution or `superpowers:subagent-driven-development` if that execution approach is authorized. Apply the repository compatibility rules before either workflow. Track the checkboxes below; do not commit automatically.

**Status:** Approved. Implementation in progress. The ordinary switch is enabled in the local candidate and passed guest and authenticated functional smoke checks. See [current evidence and remaining checks](../releases/2026-11-13-ui-internationalization-phase-5.md).

**Goal:** Reconcile whole-app bilingual coverage, close inherited acceptance gaps, and enable the ordinary language switch only after documented release-readiness gates pass.

**Architecture:** Retain the existing bundled i18next/react-i18next resources, singleton language store and explicit display helpers. Separate ordinary language availability from the loopback-only development fixtures. Keep business APIs, authentication, financial calculations and stored data language-independent.

**Tech stack:** React, strict TypeScript, Vite, existing pnpm verification runner and isolated browser fixtures. No new framework or translation backend.

**Spec:** [Approved design](../specs/2026-11-07-ui-internationalization-design.md), [phased roadmap](2026-11-07-ui-internationalization-roadmap.md), [maintained contract](../specs/ui-internationalization.md).

## Scope and prerequisites

Work in the existing `test` checkout. Record HEAD and staged, unstaged and untracked changes before execution. This request authorizes this document, not implementation, issues, commits, push, deployment, migrations or shared-data writes. Historical authorization in earlier phase documents does not authorize this phase.

Read [root instructions](../../AGENTS.md), [web instructions](../../apps/web/AGENTS.md), [workflow](../project-workflow.md), [frontend guidelines](../frontend-guidelines.md), [local testing](../local-testing.md), and the three specification links above. Before touching verification registration, read [scripts instructions](../../scripts/AGENTS.md). Domain regression and any corrections also require the affected architecture, auth, API, data-model, time-policy and product-specification sources listed in root instructions. If API/shared corrections prove necessary, read their local instructions and owning contracts first; do not expand into redesign.

Phases 1–4 have implementation evidence, but acceptance is incomplete. Read all four dated release records. Specifically carry forward:

- Phase 3: authenticated light-theme coverage, full visual inspection rather than width measurements alone, comprehensive tooltip/focus/native-confirmation scenarios, and real-session request observations. Details must cover both holding and account detail routes.
- Phase 4: authenticated light theme and Settings, full visual inspection, remaining Settings/maintenance/import interactions. The English About fix needs integrated regression at 320 pixels.
- Phase 4 runner blocked education-reserve and API-error-logging checks for missing execution review. Reassess actual current registration and effects; neither direct execution nor a renamed command may bypass that block.

## Global constraints

- Languages are `zh-CN` (default) and `en`; display locales are `zh-CN` and `en-NZ`. No system detection, cross-tab synchronization or server preference.
- Keep storage key `family-ledger.uiLanguage`; getter/read failure defaults to Chinese, write failure retains the in-memory selection; logout does not clear the choice.
- Controls display `中文` / `English`, without flags. Product names are `金财屋` / `Family Ledger`; original artwork and user/provider/source text remain unchanged.
- Switching must not reload, remount, change route/query, submit, invalidate caches, refetch ledger data or reset drafts, IDs, original revisions, pagination, pending operations or focus.
- Preserve decimal precision, rounding, negative zero, missing values, currency, gain colors, calendar dates, viewer timezone and Shanghai 06:00 business-day semantics.
- Use isolated transport and synthetic records for writes and secret/error scenarios. Real TEST family records are not fixtures.
- Readiness is not deployment authorization. Deferred or waived visual coverage is never passed; retain the public gate unless the user explicitly changes the readiness requirement.

## Review focus

1. Stored English on the first ordinary-build render, including bootstrap failures: Task 2 and Task 6.
2. Language changes during uncertain writes retain exact retry identity and payload: Task 3.
3. Long English warnings, modal footers and chart tooltips at 320 pixels: Task 4.
4. Unknown/legacy error envelopes and intentionally untranslated source values: Tasks 1 and 3.
5. Preview gate removal accidentally exposes fixtures or changes authentication: Tasks 2, 5 and 6.

## Task 1: Reconcile coverage and terminology

**Files:** Create `docs/releases/2026-11-13-ui-internationalization-phase-5.md` when execution begins (use the actual execution date if later). Extend `apps/web/verify-i18n-phase4.ts` and `apps/web/verify-i18n-resources.ts` only where inventory gaps require it; correct relevant files under `apps/web/src/i18n/resources/{zh-CN,en}/` and their callers.

**Interface:** Existing raw resource validator remains authoritative for resource shape; the release record becomes the integrated scenario/defect ledger.

- [ ] Enumerate routes and shared overlays from current router/call sites; record each surface, resource owner, normal/loading/empty/error/validation states, source-text exceptions and prior evidence. Include login/recovery/reset alias, forced password change, startup failure, shell/titles, groups, dashboard/charts, holdings/detail, monthly review, accounts/detail/opening/password actions, instruments, transactions, cashflow, spending/import, education, Settings/access, maintenance and About.
- [ ] Audit application-owned visible and accessible text, native confirmations, toasts, titles, chart labels and formatter callers. Classify literals individually; do not use a blanket CJK ban or exempt whole files.
- [ ] Review financial terms against metric definitions, including lifetime versus unrealized profit, account profit, gross/net spending and education reserve versus period spending. Preserve supplied instrument/currency/date facts in warnings.
- [ ] Add a reproducing focused assertion before each copy/mapping correction. Verify missing/empty strings, parameter mismatch, malformed interpolation and plural incompleteness fail independently of Chinese fallback. Verify source names/notes remain byte-for-byte unchanged.
- [ ] Run resource and affected phase inventory checks through the reviewed runner; record exact commands/results and unresolved exceptions. Exit: every application-owned surface has a resource owner or a specific defect, not an assumed pass.

## Task 2: Prepare ordinary switch behind the existing release boundary

**Files:** Modify `apps/web/src/i18n/language.ts`, `instance.ts`, `apps/web/src/components/LanguageSwitch.tsx`, existing language checks; inspect `apps/web/src/main.tsx` and all switch call sites. Create `apps/web/verify-i18n-phase5.ts` for release-policy checks and register it in `package.json` and existing verification metadata after effect review.

**Interfaces:** Preserve `initializeI18n(): Promise<void>`, `setUiLanguage(language: UiLanguage): Promise<void>`, `useUiLanguage()` and storage key. Rename the internal store option from `preview` to `enabled` consistently. Add `isUiLanguageEnabled(dev: boolean, hostname: string): boolean` backed by one source-level release constant initially `false`; keep `isLocalLanguagePreview` unchanged for fixtures and diagnostic preview.

- [x] Add tests for release disabled/enabled and DEV/non-DEV, loopback/non-loopback combinations. Assert only ordinary language availability changes; fixtures remain DEV plus exact loopback only.
- [x] Centralize ordinary availability in the new policy helper. Use it in the singleton and `LanguageSwitch`; retain the disabled policy during Tasks 1–5. No environment variable, deployment setting or authentication modification is needed.
- [ ] Verify guest/login and authenticated shell have reachable controls on mobile and desktop, including recovery and forced-password flow as applicable. Reuse existing controls; keep self-language labels, pressed state, keyboard operation and 44-pixel targets.
- [ ] Test missing/invalid/stored choices, storage getter/read/write exceptions, repeated initialization and rapid alternating switches. Assert last choice, i18next language and metadata agree, and existing route-title ownership remains intact.
- [ ] Run `verify:i18n`, `verify:i18n-client`, phase checks and new policy check via the reviewed runner. Exit: prepared controls work in local preview, ordinary builds remain gated, and the policy change is independently testable.

## Task 3: Integrated state and business regression

**Files:** Extend existing `apps/web/verify-i18n-phase2-client.ts`, phase3 client/state/accounts checks, phase4 client/cashflow checks, and `apps/web/src/fixtures/I18nPhase{2,3,4}Fixture.tsx` only as needed. Avoid duplicating existing successful assertions.

**Interface:** Existing fixture transport counters and synthetic response controls; no real write transport.

- [ ] Create a scenario ledger mapping each state assertion to an existing or new check. Exercise both switch directions with open drawers/dialogs, dirty drafts, selection, pagination and existing errors.
- [ ] Assert unchanged route/query, selected IDs, original revisions, numeric input strings, form payloads, operation keys/import tokens, session and request counters immediately before/after switching. Resolve pending promises after switching and verify notices render in the current language.
- [ ] Cover uncertain transaction/import outcomes, explicit retry, conflict/reload, partial account opening, fake trading-secret clearing, Settings/access revision conflict, password-reset failures and legacy import diagnostics. Assert switching alone never retries a mutation; explicit retry retains the required identity.
- [ ] Exercise financial formatter boundaries: missing/invalid/negative-zero values, rounding ties, percent points, K/M transitions and full tooltips, exact spending decimals, leap/calendar dates and business-cutoff timestamps. Compare calculation inputs/results across languages rather than translated text alone.
- [ ] Use runner discovery/recommendation plus explicit whole-app selection: core, every i18n check, session/loading, investment/groups/account/transaction/monthly/trend checks, cashflow/spending and education checks where reviewed. Inspect blocked-check effects/dependencies before a narrowly justified registry review; record unresolved blocks as readiness blockers.
- [ ] Exit: all selected safe checks pass, each write-path case is isolated, and omissions have explicit disposition.

## Task 4: Complete bilingual visual and interaction acceptance

Scope update: The user waived the remaining Phase 5 visual acceptance matrix on November 14. Preserve the completed observations and record the remaining visual cells as user-waived. Functional browser acceptance, keyboard interactions, isolated regressions, and the final production artifact checks remain in scope.

**Files:** Integrated release evidence, existing fixtures and only concrete affected UI/style files for demonstrated defects.

**Interface:** Scenario matrix columns: surface, scenario, role, language, theme, viewport, authenticated/isolated, visual observation, interaction observation, request observation, evidence reference, status/defect.

- [ ] Obtain user agreement, provide the local URL and wait for real login and target readiness. Disable both auth bypass flags in processes/environment. Do not inherit earlier phases' browser consent as current readiness.
- [ ] For each Task 1 surface, inspect Chinese and English in light and dark themes at `320x740`, `393x852`, `430x932`, `768x1024`, `1440x1000` (record actual desktop size). Record 20 combinations per applicable surface; inspect screenshots/rendered UI, not just document widths.
- [ ] Cover tables with contained horizontal scrolling, long labels/errors, action footers, mobile navigation, charts/tooltips, empty/loading states and About branding. Verify accessible names, visible focus, keyboard navigation, Cancel initial focus and return focus for modal confirmations. Native blocking prompts use language at invocation; browser-controlled text is explicitly excepted.
- [ ] Use real authenticated read-only pages for actual application acceptance, including Settings and account/holding detail. Capture sanitized request counts during language-only switches with background polling identified; never store secrets or private response bodies in evidence.
- [ ] Use isolated fixtures for all mutation and exceptional-state interactions, including imports, access, passwords and maintenance operations. Record separate role coverage; do not provision users or mutate permissions to fabricate a role test. Unavailable authenticated coverage stays pending.
- [ ] Reproduce and correct defects, then repeat affected language/theme/viewport cells and focused checks. Reset viewport overrides afterward. Exit: complete inspected matrix and no unresolved blocking correctness/layout defect; otherwise keep release disabled and report exact remaining cells.

## Task 5: Production bundle and startup review

**Files:** Existing build configuration only if an evidenced defect requires correction; integrated release record.

- [ ] Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` and selected reviewed checks. Record outputs against the actual source state.
- [ ] Measure raw/gzip main, vendor and chart chunks and total initial JS. Compare a fresh same-toolchain baseline if practical; retain Phase 4's historical 472.64 kB raw / 136.75 kB gzip main chunk as a labelled historical reference, not a controlled measurement.
- [ ] Inspect production output and locally served production startup for fixture/preview exclusion, no remote resource requests, preserved runtime configuration and no language-induced fetch/reload. Do not follow dependency junctions when preparing comparison sources.
- [ ] Record cold-start and switching observations with browser/device/network conditions; investigate new warnings, added requests, visible stalls or unexplained chunk growth. No arbitrary numeric budget was approved: explain the measured delta and resolve material regressions before readiness rather than inventing a passing threshold.
- [ ] Exit: no unexplained material regression; eager bundled resources remain unless separate evidence justifies an approved architecture change.

## Task 6: Enable and verify the ordinary switch after readiness

**Files:** Task 2 source release constant and tests; `docs/specs/ui-internationalization.md`, `docs/frontend-guidelines.md`, root `AGENTS.md` language sentence, `docs/roadmap.md`, approved-design/phase-roadmap status and integrated release evidence.

- [ ] Review Tasks 1–5 evidence. Required checks must pass, coverage must be complete and blocking defects closed. A qualified/deferred matrix is reportable progress but does not authorize enabling. If the user explicitly changes the gate, record exact scope and remaining risk, never convert missing coverage to passed.
- [ ] Change only the ordinary-language release constant to enabled. Keep development fixture/diagnostic guards unchanged. Update earlier Chinese-only assertions to the now-intended ordinary behavior while retaining explicit disabled-policy regression coverage.
- [ ] Build and locally serve the final ordinary production artifact. Verify fresh browser Chinese default; stored English before first app render; guest/login/logout persistence; metadata, route titles and startup failures; invalid/unavailable storage; visible login/shell controls; and zero remote translation requests. Verify the final controls are reachable and functional in guest and authenticated workflows. The Phase 5 visual matrix is user-waived. Authentication still requires real user readiness.
- [ ] Repeat required lint/typecheck/build, complete affected safe verification and final scoped review including untracked files. If final artifact checks fail, restore the disabled constant and fix before claiming readiness.
- [ ] Update maintained language wording to Chinese-default bilingual support only after activation; preserve the source-data exception and original artwork. Update progress from evidence and link final coverage, defects, bundle measurements and command results. Do not rewrite previous phase evidence as if its omissions were originally passed.
- [ ] Report implementation, deployment and visual acceptance separately. Deployment remains not requested; any later authorized push uses configured CI/automatic TEST monitoring, never manual substitution. No per-task commits are part of this plan.

## Completion criteria and handoff

The phase is ready only when resource/terminology inventory is reconciled, safe automated regression passes, inherited and integrated acceptance is complete, performance is reviewed, the final ordinary artifact is verified and maintained contracts match the enabled behavior. If blocked, deliver completed local work and exact outstanding evidence with the release gate retained.

Execution should proceed in task order, with fixes scoped to demonstrated internationalization defects. This plan introduces no database, API preference, provider, deployment or financial calculation change. Review the actual working-tree and index diff plus new files; do not rely on commit-range review alone.
