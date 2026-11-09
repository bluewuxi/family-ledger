# UI Internationalization Phase 3 Implementation Plan

> **For agentic workers:** After explicit implementation authorization, use `superpowers:executing-plans` for inline execution or `superpowers:subagent-driven-development` if delegated execution is selected. Track the checkboxes. Project compatibility rules override automatic commits, worktrees and delivery.

**Status:** Implemented locally. Validation and browser coverage are recorded in the [Phase 3 evidence](../releases/2026-11-10-ui-internationalization-phase-3.md).

**Goal:** Complete bilingual investment workflows in local preview, preserving all financial, date, authorization, mutation and interaction contracts.

**Architecture:** Extend the Phase 2 resources, error descriptors and explicit formatters; translate application-owned enums and warnings at the web boundary. Add narrowly scoped, optional structured API error/warning metadata where existing codes cannot preserve actionable distinctions. Keep calculations, storage, sorting, request identities and the public language gate unchanged.

**Tech Stack:** Existing strict TypeScript/React/Vite, i18next/react-i18next, Corepack/pnpm and reviewed assertion/esbuild fixtures. No new dependency, framework, service or migration.

**Spec:** [Approved design](../specs/2026-11-07-ui-internationalization-design.md), [phased roadmap](2026-11-07-ui-internationalization-roadmap.md), [maintained i18n contract](../specs/ui-internationalization.md), [investment overview](../specs/investment-overview.md), [API](../api.md), [time policy](../time-policy.md).

## Baseline and prerequisites

Planning inspected a clean `test` checkout at `4e1bc78a72765765123ae13412db7969977e61ce`. Re-record branch/HEAD/index/working/untracked changes before execution; preserve unrelated changes and use this checkout.

[Phase 2 evidence](../releases/2026-11-07-ui-internationalization-phase-2.md) ends with completed local acceptance: authenticated shell/group inspection plus isolated auth/startup checks. Earlier pending paragraphs are historical and superseded by the follow-ups. Its browser-tool limits remain: no comprehensive real-session network recorder and no successful automation claim for blocking native confirmations. Phase 3 needs its own workflow evidence; previous acceptance does not cover these pages.

Read [root instructions](../../AGENTS.md), [web](../../apps/web/AGENTS.md), [API](../../apps/api/AGENTS.md), [shared](../../packages/shared/AGENTS.md), [scripts](../../scripts/AGENTS.md), [workflow](../project-workflow.md#superpowers-compatibility), [architecture](../architecture.md#code-organization), [auth](../auth.md), [frontend guidelines](../frontend-guidelines.md), [local verification/acceptance](../local-testing.md), [data model](../data-model.md), and the spec links above. Read the [market-data recovery contract](../specs/market-data-and-snapshot-recovery.md) for carried dates and price states; this work does not change jobs or providers.

The user authorized Phase 3 implementation, validation and review. Delivery, migrations, shared-data repair and later-phase planning require separate authorization.

## Scope and boundaries

| Workflow | Included in Phase 3 |
| --- | --- |
| Dashboard | Headline metrics, performance/valuation disclosure, trends, ranges, recent trades, instrument/account/group distributions, loading/empty/error states |
| Holdings | Overview filters and filtered summaries, rows, detail route, prices/provenance, linked transaction context and warnings |
| Monthly review | Month/currency selection, bridge/attribution, principal/activity tables, boundary warnings, family notes and completion workflow |
| Accounts | Account directory and shared create/edit workspace, investment account detail/trend/holdings/recent activity, account-level trading-password controls |
| Instruments/groups | Security list/create/edit/detail/delete, status and provider configuration labels; dashboard group distribution; regression of the already-migrated group pilot |
| Transactions | Filters/sorting/pagination, balances, create/edit/detail/delete, generated cash legs, exact-input validation and uncertain-create retry workflow |

The shared account directory/create component includes existing investment/daily-expense purpose choices: translate that component completely without adding spending/import/education functionality. Preserve legacy education restrictions. `AccountPurposePage` and family cashflow report pages, Settings/access administration, gate setup/recovery, maintenance/API-error/snapshot administration remain Phase 4. `AssetSnapshotsTab` is maintenance-owned and is not swept into this phase just because it displays investment data. Account-level reveal/update is included because it is part of the account workflow; no real secrets are used in acceptance fixtures.

## Global constraints

- Retain `zh-CN`/`en`, English display locale `en-NZ`, Chinese default and browser-local language lifecycle. Vite DEV plus exact loopback gate stays intact; ordinary builds remain Chinese. Public switch is Phase 5 only.
- Retain `金财屋` / `Family Ledger`, original artwork, user names/notes, instrument/provider names and quoted source payloads. Translate application-owned enum/status/cash aggregate labels, not stored identifiers or arbitrary user text.
- Translation is presentation only: report currency, gain colors, Shanghai 06:00 cutoff, viewer-local timestamps, calendar dates, server sorting/pagination and authoritative decimal strings remain unchanged.
- Never treat profit as return: lifetime investment profit, account investment profit, period profit, unrealized gain/loss, daily movement and profit share of assets retain separate glossary keys/definitions. Period profit has no return percentage.
- Switching preserves route/query, filters, page, selected IDs, drafts, overlays, focus, pending writes, original revisions and transaction idempotency keys. It creates no request, refresh, invalidation, submit or automatic replay.
- Keep existing role/account-scope checks, hidden-resource behavior and generated-cash restrictions. UI hints never replace server authorization. No broad RBAC, schema or financial algorithm change.
- Do not parse server `message` strings or translate arbitrary exception text. Old messages remain backward-compatible; migrated UI uses stable metadata and safe localized fallback.
- Native date/month controls and browser beforeunload text are browser-owned exceptions; values remain ISO. Native application confirmations use current-language text when opened; blocking dialogs cannot support a live switch. Reactive dialogs use Phase 2's topmost-overlay conventions.
- All new repository prose is English. Use isolated write/error fixtures; shared TEST contains real family data. No automatic commits or deployment.

## Review focus

1. Localized labels accidentally become React keys, sorting inputs, request dependencies or create-intent fingerprints (all workflow tasks).
2. Different failures collapse into a generic validation error, or unknown writes falsely claim rollback/success (Task 2 and mutation tasks).
3. Snapshot mismatch/opening-price warnings lose the actual date or source instrument because those facts currently exist only in message text (Tasks 2 and 5).
4. Chart rounding, ratio units, dates or abbreviated axes drift when replacing fixed Chinese formatting (Tasks 1, 3 and 4).
5. Partial account creation, pending transaction retries or revealed password state changes during a switch (Tasks 6 and 8).

## File map and task order

| Area | Create/modify |
| --- | --- |
| Resources/conventions | New `apps/web/src/i18n/resources/{zh-CN,en}/{investment,dashboard,holdings,monthlyReview,accounts,instruments,transactions}.ts`; extend `errors.ts`, `resources.ts`, `instance.ts`, `resourceValidation.ts`, `typecheck.ts` |
| Presentation helpers | New `apps/web/src/i18n/investmentLabels.ts`, `investmentWarnings.ts`, `investmentMessages.ts`; modify `lib/holdingDisplay.tsx`, `lib/useValuation.ts`, relevant page-local formatters |
| Error metadata | New `packages/shared/src/investmentErrorDetails.ts`; modify `packages/shared/src/index.ts`, `apps/api/src/utils/apiError.ts`, `apps/api/src/routes/router.ts`, `apps/web/src/lib/apiClient.ts`, `apps/web/src/i18n/uiErrors.ts` |
| Metadata producers | `apps/api/src/services/accountService.ts`, `accountDetailService.ts`, `instrumentService.ts`, `transactionService.ts`, `atomicTransactionWriteService.ts`, `transactionIdempotency.ts`, `accountTradingPasswordService.ts`, `monthlyReviewService.ts`, `monthlyReportMonth.ts`, `monthlySummaryService.ts`; relevant structured constraint mapping in `repositories/transactionRepository.ts`/`instrumentRepository.ts` |
| Dashboard/charts | `pages/DashboardPage.tsx`; `components/InvestmentTrendChart.tsx`, `AccountTrendChart.tsx`, `InvestmentPerformanceCard.tsx`, `ValuationStatus.tsx`, `DistributionPanel.tsx`, `InvestmentDistributionPanel.tsx` |
| Holdings/monthly | `pages/HoldingsPage.tsx`, `HoldingDetailPage.tsx`, `MonthlySummaryPage.tsx` |
| Accounts | `pages/AccountsPage.tsx`, `AccountCreatePage.tsx`, `AccountDetailPage.tsx`; `components/AccountCreateWorkspace.tsx` |
| Instruments/transactions | `pages/InstrumentsPage.tsx`, `TransactionsPage.tsx`; `lib/transactionBalances.ts`; existing group components only for regression or necessary resource reuse |
| Verification | New `apps/web/verify-i18n-phase3.ts`, `verify-i18n-phase3-client.ts`, `scripts/verify-i18n-investment-errors.ts`; extend affected existing scripts; root `package.json`, `tsconfig.verification.json`, registry data |
| Browser fixtures/docs | New `apps/web/fixtures/i18n-phase3.html`, `apps/web/src/fixtures/I18nPhase3Fixture.tsx`; `styles.css`; maintained i18n/API/frontend/local-testing docs and evidence/status links |

Execute Tasks 1–2 before migrating workflows; Tasks 3–8 proceed sequentially to avoid overlapping shared-file edits. Task 9 reconciles phase coverage. Add narrow producer/helper paths discovered while tracing an existing branch to this plan before editing; do not broaden product behavior. Leave calculations in shared financial modules untouched.

## Task 1: Establish investment labels, messages and formatting contracts

**Interfaces:** `investmentLabels.ts` exports typed maps from existing enum values to `investment` resource keys, plus `getInvestmentLabel(kind, value, language): string` with discriminated kind/value overloads for account type/purpose, asset type, market region, transaction type/source, adjustment direction, price source and monthly review status. Known maps must use `satisfies Record<ExistingEnum, ResourceKey>`. Unknown runtime values return a localized unavailable label without throwing. Shared legacy `*_LABELS` exports remain intact for unmigrated consumers.

`investmentMessages.ts` exports a discriminated `InvestmentMessage` union for frontend validation/success/partial-success notices and `translateInvestmentMessage(message, language): string`. Parameters are key-specific, not arbitrary dictionaries; raw input passwords and exception messages are forbidden. `investmentWarnings.ts` exports explicit-language functions for `DashboardWarning`, `HoldingWarning`, `SnapshotWarning`, `PortfolioTrendWarning`, `MonthlySummaryWarning` and `AccountDetailWarning`. Warning rendering consumes codes/structured facts, never `.message`.

- [ ] Inventory every in-scope visible/accessibility string and helper caller before extraction. Add a file/surface coverage table to the maintained i18n document, including every warning code and exception. Reconcile its stale Phase 2 coverage row with the existing Phase 2 migrated-coverage section; do not claim Phase 3 complete yet.
- [x] Add the seven namespaces in both languages and register them in resources, instance and validator together. Preserve separate keys for distinct metrics even when Chinese wording matches. Extend glossary with realized/unrealized meaning, carrying cost, market value, principal flow, valuation movement, profit share, snapshot dates, generated cash and estimates, linked to their owning formulas.
- [ ] Write failing exhaustive-enum/warning/resource assertions, including missing key, whitespace-only text, parameter mismatch, invalid compile-time key and required plural forms. Application-owned `现金`/`未分组` aggregate labels are chosen by row type/code, never by comparing a returned name string. Real group names that equal those labels remain source data.
- [x] Add trailing explicit language/locale arguments with Chinese defaults to holding display helpers. Pass language from React callers; retain source names, quantity's existing six-decimal display, price precision, missing markers and timestamp/calendar-date distinctions. Do not localize input strings, API params or `localeCompare(..., "zh-CN")` ordering.
- [x] Capture existing chart rounding separately: `formatChartMoney` uses `Math.round`, including negative half values; do not silently replace it with the general number formatter. Keep existing K/M thresholds and decimal rules in both languages, including boundary cases 999/1000/999999/1000000 and negatives; no new 万/亿 system. Full tooltips retain whole amounts and currency context.
- [x] Register `verify:i18n-phase3` as `tsx apps/web/verify-i18n-phase3.ts`, include in verification typechecking, and effect-review its import graph. Run through the reviewed runner to establish intentional RED then GREEN. Extend existing resource/type fixtures; no new framework.

## Task 2: Preserve actionable investment errors and structured warnings

**Interfaces:** Add optional `details?: InvestmentErrorDetails` to shared `ApiError`, `ApiRequestError` (fourth constructor argument) and `ApiClientError` (fourth argument). Export a discriminated union with `reason` plus permitted typed parameters. Keep code/status/message and all old three-argument constructors compatible. Router serializes only this reviewed metadata; the web client validates it before retaining it. Unknown/malformed details use context-aware safe fallback. No request schema changes.

Define the initial reason catalog at existing throw sites:

| Reason family | Required distinctions/parameters |
| --- | --- |
| `FIELD_REQUIRED`, `FIELD_INVALID`, `FIELD_TOO_LONG`, `DECIMAL_INVALID`, `DECIMAL_PRECISION`, `POSITIVE_AMOUNT_REQUIRED` | Allowlisted field identifier, optional integer limit/scale; never raw field contents |
| `ACCOUNT_IN_USE`, `INSTRUMENT_IN_USE`, `INSTRUMENT_DUPLICATE`, `CLASSIFIED_INSTRUMENT_CASH`, `LEGACY_EDUCATION_READ_ONLY` | Action-specific guidance without internal identifiers |
| `OPENING_BALANCE_EXISTS`, `INACTIVE_INSTRUMENT`, `MISSING_CASH_INSTRUMENT`, `INACTIVE_CASH_INSTRUMENT`, `CURRENCY_MISMATCH` | Safe currency code where needed; preserve current branch semantics |
| `INSUFFICIENT_CASH`, `INSUFFICIENT_POSITION` | Calendar `date` from timeline violation; do not include hidden account names/holdings |
| `GENERATED_CASH_READ_ONLY`, `TRANSACTION_TYPE_IMMUTABLE`, `SETTLEMENT_BEFORE_TRADE`, `DIVIDEND_TAX_EXCEEDS_GROSS`, `SETTLEMENT_AMOUNT_INVALID` | Preserve the corrective action supplied by current message |
| `INVALID_OPERATION_ID`, `IDEMPOTENCY_CONFLICT`, `LEDGER_REVISION_CONFLICT`, `REFERENCE_UNAVAILABLE`, `SNAPSHOT_RECALCULATION_FAILED` | Distinguish new operation from retry/reload and confirmed precommit failure from unknown transport outcome |
| `EXTRA_PASSWORD_NOT_INITIALIZED`, `EXTRA_PASSWORD_REJECTED` | Distinguish gate setup from incorrect supplied password, without secret/config parameters |
| `INVALID_REPORT_MONTH`, `FUTURE_REPORT_MONTH` | Preserve actual month validation; no future review creation |

- [x] Trace every in-scope failure producer and request context, including repositories' existing constraint branches, before coding the metadata. Add explicit metadata at the point a branch is known; never reverse-map Chinese/English exception strings. For generic invalid-body/filter cases, a safe field/invalid-request fallback is sufficient; do not invent an actionable distinction that the backend cannot establish.
- [x] Extend `UiErrorContext` with investment read and each mutation context (`accountSave/Delete`, `instrumentSave/Delete`, `transactionSave/Delete`, `monthlyReviewSave`, `tradingPasswordReveal/Update`). Extend `UiErrorDescriptor` from its current parameter-free shape to a key-specific union. `describeUiError` maps validated details first, then code/status/context. Only explicit precommit reasons may say “not saved”; response loss/unknown writes instruct users to check, preserving transaction retry semantics.
- [x] Preserve old backend messages/statuses and wire behavior for existing callers. Do not send details for internal infrastructure failures, passwords, raw SSM/Supabase errors or unreviewed arbitrary objects. `errorLogging` must not start logging added request values. Read-error mapping may not clear data or alter refresh scheduling.
- [x] Extend `MonthlySummaryWarning` additively with `actualDate?: string` for `SNAPSHOT_DATE_MISMATCH` and `instrumentShortName?: string` for `MISSING_OPENING_PRICE`; existing `date` remains requested/transaction date. Populate at current producer branches while retaining `message`. Add optional `origin?: "holding" | "valuation" | "snapshot" | "principal"` to `AccountDetailWarning` and populate the corresponding assembly loops in `accountDetailService.ts`: the existing snapshot prefix otherwise exists only in message text. Retain code/name/currency/date and old messages. Missing metadata from an older API gets a localized less-specific warning; never parse legacy text. Do not hide the warning.
- [ ] Add `scripts/verify-i18n-investment-errors.ts` and register `verify:i18n-investment-errors`. Synthetic API fixtures assert each catalog branch, exact legacy code/status/message, sanitized details and client round-trip. Test new-web/old-API and old-client/new-envelope compatibility, malformed/unrecognized reasons, unavailable references and secret-marker exclusion. Test mismatch actual/requested dates and opening instrument survive English rendering.
- [ ] Run RED/GREEN focused checks plus affected auth/access, transaction timeline/idempotency, instrument-active, account-secrets and monthly-summary fixtures. Update API response/warning documentation with optional metadata and compatibility; update Auth wording only if a referenced explanation needs clarification, not permissions. No migrations or live secret operations.

## Task 3: Translate dashboard, chart and distribution workflows

**Files:** Dashboard/chart/distribution components from the map; `lib/useValuation.ts`, `uiErrors.ts`, resources and focused checks.

- [x] Change `useValuation` error state to a descriptor, or add a descriptor field while preserving compatibility until every caller is migrated; inspect all callers before choosing. Keep `path`, cached-then-due-refresh sequence, stale-response guards and next-refresh timing untouched. Render errors using the current language, never add language/t to load dependencies.
- [x] Migrate all dashboard metrics, descriptions, tabs/ranges, recent trades, loading/retry/empty states, valuation disclosure and both distributions. Distinguish headline lifetime profit, asset-share ratio and period profit. Show cash/group labels from row types; preserve user/group/provider names and configured-versus-contributing member-count meaning.
- [x] Translate chart legends, accessible labels, current/carried dates, hover/touch tooltips, unavailable gaps, range/loading errors and numeric axes via explicit language/locale. Keep chart point IDs/data keys, interpolation/crossing calculations, principal step, hover eligibility, color scheme and default one-year/profit selection unchanged. Memoize translated presentation on language without refetching or recomputing authoritative values.
- [ ] Write fixtures for null/negative/zero/incomplete totals, ratio denominators, both distribution tabs, empty groups, unavailable classification, carried snapshot dates, live endpoints and excluded synthetic crossing tooltips. Freeze DTOs and compare amounts, curve input arrays, selected range/tab, currency and request counts across switches; do not round before arithmetic.
- [ ] Test exact rounding/negative zero/compact boundaries from Task 1, full tooltip values, English dates across year boundaries and switching while tooltip/details disclosure is open. Run `verify:dashboard`, `verify:dashboard-quote-timeout`, `verify:portfolio-trend`, `verify:valuation-client`, `verify:snapshot-availability`, `verify:investment-groups-client` and new focused checks via the reviewed runner.

## Task 4: Translate holdings overview and detail

**Files:** `HoldingsPage.tsx`, `HoldingDetailPage.tsx`, `holdingDisplay.tsx`, relevant resources/checks.

- [x] Translate headings, filters, selected-account/asset options, filtered totals, table columns, price/estimate badges, warning lists, empty/loading/failure states, details metadata, recent transaction types and linked cash explanations. Keep overall headline performance independent of table filters.
- [x] Pass locale/language to price/quantity/amount/date helpers and warning renderers. Preserve currency codes, provider/source text and raw names. Do not translate missing/invalid data into numeric zero or drop unavailable warnings. Preserve sorting on the same original data and existing Chinese collation.
- [ ] Add fixtures for cash/noncash positions, negative position, unknown cost, missing price/FX, estimate/quote/stored-price provenance, closed/missing detail, linked cash leg and restricted account not-found. Compare unformatted values, filter membership/order and request args across languages.
- [ ] Verify switch during a filter/detail load and visible error preserves selections and stale-response protection. Run `verify:holdings`, `verify:holding-detail`, `verify:account-access-client`, new Phase 3 checks and affected existing loading fixtures. Record visual scenarios in Task 9 rather than accepting a translated SSR string alone.

## Task 5: Translate monthly review end to end

**Files:** `MonthlySummaryPage.tsx`, warning/message helpers, monthly resources and checks; Task 2 owns metadata producers.

- [x] Migrate month/currency selectors, metric/bridge/attribution labels, account/transaction/principal tables, missing-boundary warnings, completion status, notes editor, save/success/failure and timestamps. Keep family notes and actor/source names untouched. Store notices/descriptors rather than translated strings; avoid locale-dependent keys for expanded rows.
- [x] Replace `warning.message` with code-based rendering. Test all nine `MONTHLY_SUMMARY_WARNING_CODES`; mismatch displays requested and actual dates, opening-price warning identifies available source instrument, FX warnings preserve date/currency. Unknown/missing fields get safe localized fallback without suppressing report incompleteness.
- [x] Preserve exact-boundary snapshots, initialization-month synthetic openings, no double-counting of principal, current-month last-completed-day limit and contribution denominator semantics. Presentation must not change math, sorting, month-query values or saved notes. Viewer remains read-only for review writes.
- [ ] Synthetic tests cover ordinary/initialization/current months, mismatched/missing boundaries, per-account unavailable values, note length boundary (existing 12,000 UTF-16 units), in-progress/complete saves, permission failure and response loss. Switch while notes are dirty or save pending: draft/month/status remain, one original request completes, no duplicate PATCH occurs. Preserve current successful-save behavior.
- [ ] Run `verify:monthly-summary`, `verify:portfolio-snapshots`, `verify:time-policy`, API metadata and Phase 3 client checks. Check native month inputs as ISO controls; display month labels separately in English where needed.

## Task 6: Translate accounts, creation and account detail

**Files:** Accounts pages/workspace, account chart, account resources/error details and checks.

- [x] Translate directory filters/columns, type/purpose/region labels, all create/edit fields/help/validation, opening-assets steps, review summary, notices and account delete confirmation. `AccountCreatePage` continues to delegate to `AccountsPage createOnly`; step identity uses numeric/stable keys, never translated labels.
- [ ] Replace browser-owned required/validation message dependence in changed forms/workspace with localized application messages based on `validity` flags and existing validation rules. Preserve decimal input parsing, step progression, submission blocking and final form target. Do not introduce locale commas into canonical numeric input or change allowable values.
- [x] Retain separate account/opening-asset requests and exact partial-success behavior. Model partial completion with structured state (created account ID and safe succeeded/failed counts), never a translated string used as a control flag. Switching/retrying must not recreate an account or repeat successful openings. Existing submitBlocked protections remain authoritative UI state.
- [x] Translate account detail header/context, reporting currency, performance, holdings, recent activity, account information, trend range, warnings and loading/error states. Range changes remain panel-local; language changes do not request a range or refresh quotes. Account-purpose choices remain the existing set and legacy education stays read-only.
- [x] Translate account trading-password reveal/update labels, confirmations and specific extra-password failures. Secret input/revealed value stays component memory only, untranslated, with existing hide/clear lifetime; switching neither reveals/refetches nor stores/logs it. Treat the existing stored placeholder as source data unless separate non-secret status metadata is explicitly designed; do not detect it by comparing decrypted text. Settings gate configuration/recovery remains Phase 4.
- [ ] Synthetic tests cover create step/back/dirty state, no openings, multiple openings, nth-opening failure, existing account update/delete-in-use, admin/viewer restrictions, slow trend responses, gate-uninitialized versus rejected, pending reveal/update and secret clearing. Use fake secret markers and assert none reaches storage/logs/evidence; no real reveal/SSM write. Run `verify:account-detail`, `verify:account-purposes`, `verify:account-secrets`, `verify:account-access-client`, `file:apps/web/verify-interface-workflows.ts` and Phase 3 checks.

## Task 7: Complete instruments and group integration

**Files:** `InstrumentsPage.tsx`, investment label/error helpers, instrument resources; existing group/distribution components only as required.

- [x] Translate security-list columns/filter/action/empty/error states and the full create/edit/view drawer, status options, market/asset/provider configuration help and validation. Preserve provider identifiers, instrument/source names, ticker/exchange rules, active-state behavior and original sort order. Include the admin classification shortcut labels without retranslating user group names.
- [x] Preserve cash/source constraints and duplicate/in-use/grouped-cash failures via Task 2 reasons. Confirmation copy localizes at invocation or uses the existing reactive dialog with stable selection. No activation, quote refresh or provider request is caused by language switching.
- [ ] Test stock/ETF/fund/cash configuration, active/inactive retained references, duplicate short name, in-use deletion, grouped cash conversion rejection, invalid paired symbol/exchange, validation while draft is open, and permission failures. Assert exact payload enum values and request counts. Group pilot's original revision, pending guards and direct-route loading remain intact.
- [ ] Run `verify:instrument-active`, group/API/client checks and new Phase 3 checks; include all English security drawer exceptional states in the visual ledger. Do not add provider scraping, ingestion changes or later maintenance translation.

## Task 8: Translate transactions and preserve retry semantics

**Files:** `TransactionsPage.tsx`, `transactionBalances.ts`, transaction resources/message helpers; metadata producers covered by Task 2. Read `transactionDecimal.ts` without changing its arithmetic.

- [x] Translate filters/ranges, balances/loading, totals/table headings, type/source options, create/edit/detail fields, derived amounts, linked cash legs, confirmations and all validation/errors. Audit local error producers such as bank-cash configuration and trade availability: return a typed reason plus safe parameters instead of selecting rendered strings. Add typed reasons to balance-response validation without weakening shape checks.
- [x] Preserve exact decimal multiplication/comparison, transaction dates and sorting query values, opening-balance rules, cash/noncash requirements, inactive retained references, dividend tax, settlement and generated-leg restrictions. Translate labels only; no authoritative frontend recalculation or parsing formatted output.
- [x] Keep create intent's serialized payload and operation UUID independent of language. An uncertain response retains the same payload/key for an explicit user retry; edited payload still blocks unresolved retry; existing definite validation rejection clears intent only under its current rules. Switch never retries, resets intent, or suppresses unknown-result guidance. Edit/delete retain original linked-cash/snapshot confirmations and pending protections.
- [ ] Stateful fixtures cover each transaction type and conditional fields, invalid/missing/zero balances, insufficient cash versus holdings at a historical date, opening duplication, generated-leg rejection, malformed balance response, tax/settlement/date errors and failed snapshot recalculation. Test pending create -> switch -> response loss -> explicit identical retry with the same key, edited payload blocked, definite 400 behavior, and successful completion exactly once.
- [ ] Assert table filter/sort/page, current drawer, draft, focus and API request bodies are identical across switches; error parameters reformat with language while raw input stays unchanged. Native confirmations remain an invocation-time exception and may not be claimed live-reactive.
- [ ] Run `verify:transaction-table`, `verify:transaction-timeline`, `verify:transaction-idempotency`, `verify:transaction-price-backfill`, `verify:dividend-cash-leg`, `verify:holdings`, new API-metadata and Phase 3 fixtures. These are local fixtures; do not run a live duplicate-create smoke against TEST.

## Task 9: Phase-wide coverage, browser acceptance and handoff

- [ ] Add `verify:i18n-phase3-client` (`tsx apps/web/verify-i18n-phase3-client.ts`) using existing real-handler/component fixture patterns, and the isolated DEV HTML entry from the map. Reuse Phase 2 transport isolation: intercept all requests, reject unexpected routes, never call original fetch or install a synthetic session in the real app. Fixtures mount real components with representative DTOs, not parallel mockup implementations.
- [x] Register all new commands/typecheck inputs with reviewed local-fixture effects and exact fingerprints. Inspect `corepack pnpm verify:checks -- list` and `corepack pnpm verify:checks -- plan --changed`; manually reconcile known unmapped UI/resource/fixture paths. Classify new API imports and subprocesses; no blanket fingerprint refresh or blocked-run bypass.
- [ ] Run raw resource completeness, enum/warning exhaustiveness and hardcoded-copy audits on every in-scope file, including aria/title/placeholder/tooltip/validation/success paths. Add an explicit exception list for source names, artwork, self-language controls and browser UI; no blanket CJK ban. Cross-check every file/surface in Task 1's coverage ledger against an owning task and evidence.
- [ ] Use isolated browser scenarios for all writes/failures/secret controls and state preservation. Obtain agreement and real user login/readiness before authenticated read-only inspection; keep bypass disabled. Shared TEST group/account/instrument/transaction/monthly-review data and server preferences stay unmodified. Local theme inspection may temporarily override DOM styling without preference writes, then restore it.
- [ ] Maintain a matrix for each workflow family at `320x740`, `393x852`, `430x932`, `768x1024`, and recorded desktop dimensions (recommended `1440x1000`), both languages and both themes. Cover dashboard two charts/distributions/tooltips, holdings/detail, monthly bridge/notes/warnings, account creation steps/detail, instrument drawer and transaction conditional forms/errors. Inspect wrapping, table scroll, footer reachability, keyboard/focus/overlay behavior and data labels. Record screenshots inspected versus automated layout checks accurately.
- [ ] Test switching with an open tooltip/disclosure, modal/drawer, dirty form, page/filter selection and pending operation. Use local overlay language controls within the focus boundary as in Phase 2. Record instrumented request counters; real-network claims require a recorder. State browser-tool/native-dialog limits explicitly and retain corresponding fixture evidence.
- [x] Run new Phase 3 checks plus all affected checks named in Tasks 1–8 through the reviewed runner, and all five existing Phase 1/2 i18n checks. Run required `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build`, `corepack pnpm verify:docs`, `git diff --check`; run tooling verification for registry changes and the reviewed fixed core for the shared API-envelope change. Report failed/blocked/not-run checks, not inferred passes.
- [x] Inspect production rendering/bundle: forced Chinese with stored English, no language switch/fixture markers, no synthetic data/credentials and no new remote resource fetch. Record bundle delta against a same-command baseline; no unrequested loading infrastructure.
- [x] Review the actual baseline-to-final task scope including staged/unstaged/new files, API compatibility, descriptor safety, immutable financial inputs, state/request evidence and untranslated exceptions. No source-message matching or accidental sorting/currency/date change is acceptable. Unresolved material findings remain open regardless of review iteration limits.
- [x] Update maintained i18n/API/investment/frontend/local-testing documentation with implemented contracts and actual scope, not promises. Add dated Phase 3 evidence and update this plan/map/roadmap with separate implementation, deployment and visual statuses. Deferred acceptance is not passed; public English remains gated. Handoff glossary, reason catalog/compatibility, coverage matrix, bundle delta and outstanding issues. Stop before Phase 4/5 planning or implementation.

Unchecked items include acceptance and fixture cases beyond the evidence recorded for this implementation. See the [Phase 3 evidence](../releases/2026-11-10-ui-internationalization-phase-3.md) for the layout matrix, observed interactions and remaining limits.

## Exit criteria and plan self-review

Phase 3 requires complete application-owned translation of the listed investment workflows, including exceptional states; formula-consistent glossary and warning context; unchanged financial values/precision, dates, colors, sorting and permissions; stable state and zero language-triggered requests; passing focused/core/code checks and recorded qualified bilingual visual acceptance. No whole-app English release or deployment is implied.

Self-review maps every roadmap item to an owner: dashboard/trends/distributions (3), holdings/details (4), monthly review (5), accounts (6), instruments/groups (7), transactions (8), with shared terminology/error foundations (1–2) and evidence (9). Proposed implementation choices requiring plan review are the optional API detail union, minimal warning fields, seven functional namespaces and the explicit account/shared-page scope boundary. Existing K/M axes are retained rather than introducing a new display convention. Inline execution is recommended because shared error/resource and presentation interfaces require sequential coordination; delegated execution remains selectable after review.
