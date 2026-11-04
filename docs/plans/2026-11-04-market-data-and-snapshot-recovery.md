# Market Data and Snapshot Recovery Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for a subsequently authorized implementation. Follow the repository workflow and applicable local instructions. This document does not authorize execution, delegation, commits, deployment, or live repair.

**Status:** Implemented — local implementation, automated validation, and scoped review completed. New migrations, live repair, deployment, and authenticated visual acceptance remain pending.

**Goal:** Reuse batched price acquisition across API/jobs, recover historical price gaps and failures, and serve clearly dated snapshot fallbacks without fabricating historical valuations.

**Architecture:** Retain the existing Lambda API/jobs and PostgreSQL architecture. Share typed provider contracts and pure acquisition policy, with server-owned persistence and orchestration; the browser requests valuations, never providers directly. Keep live quotes, historical prices, repair state, and persisted snapshots distinct.

**Tech Stack:** Strict TypeScript, React/Vite, existing Decimal arithmetic, Supabase PostgreSQL, AWS Lambda/EventBridge Scheduler, existing fixture and disposable-database verification tooling.

**Spec:** The confirmed decisions below are the change specification for this plan. Implementation must reconcile the maintained [investment specification](../specs/investment-overview.md), [API contract](../api.md), [data model](../data-model.md), and [time policy](../time-policy.md); this draft does not silently replace them.

## Authorization, baseline, and reading

- The user approved this plan and authorized local implementation, validation, and review. Migration application, live provider jobs, infrastructure changes, shared-environment repair, commit, push, and deployment remain unauthorized.
- Planning baseline: clean `test` checkout at `4fd2193b7ccfd8dc5e74e8ef58a071961c850f34`. Recheck HEAD and working/index/untracked changes before execution; remain in the existing checkout.
- Every implementation handoff must include root [AGENTS.md](../../AGENTS.md), [project workflow](../project-workflow.md), and the applicable [web](../../apps/web/AGENTS.md), [API](../../apps/api/AGENTS.md), [jobs](../../apps/jobs/AGENTS.md), [shared](../../packages/shared/AGENTS.md), [database](../../supabase/AGENTS.md), [scripts](../../scripts/AGENTS.md), and [AWS](../../infra/aws/AGENTS.md) instructions.
- Read [architecture](../architecture.md), [Auth](../auth.md), [frontend guidelines](../frontend-guidelines.md), [local testing](../local-testing.md), [deployment](../deployment.md), [TEST delivery](../test-auto-deployment.md), and [backup/restore](../operations/backup-restore.md) for affected behavior and operations.
- Preserve server-side role/account scope, exact decimal financial values, manual-price precedence, transaction-owned prices, Kernel NTA formulas/date mapping, and the existing app business-date cutoff. Repository prose is English; UI copy is Simplified Chinese.
- Do not add an always-on service, a new market-data database, a Python production runtime, calendar subscriptions, paid sources, or undocumented replacement scraping endpoints as an incidental implementation choice.

## Confirmed requirements

### 1. Price capabilities and batched acquisition

- Model capabilities by source and instrument: intraday quotes, dated daily closes/published unit prices, derived estimates, manual-only prices, and historical-range support. One source may support multiple capabilities.
- Both UI-driven API reads and jobs call the same provider contract through server orchestration. Group by source and query kind, deduplicate instrument identities, then split into supported batch sizes.
- A single application-level batch is not a promise of one upstream HTTP request. Use native batching only after validating the actual endpoint, response mapping, limits, and data-source decision. Otherwise use bounded per-instrument requests inside the adapter.
- Return success/failure/unavailable/unsupported results per requested instrument and date/range. Preserve successful results when another item fails. Never infer complete coverage solely from HTTP success or a nonempty response.
- Existing baseline: quote and daily-price interfaces already accept arrays. Yahoo/Eastmoney currently loop over symbols; FundRock fetches one page for several funds. Yahoo daily ingestion currently selects only the last returned daily bar. Historical access for each source must be demonstrated rather than inferred from a latest-price API.

### 2. Current valuation and UI refresh

- Ordinary reads use a valid shared quote cache; refresh only due eligible instruments. Reuse prices when changing reporting currency or navigating between valuation pages.
- Daily-price-only holdings do not cause intraday provider polling. Manual-only assets never cause automatic source calls. Current valuation still includes current ledger changes and existing stored-price fallback.
- Preserve the fast cached valuation before a due refresh. API returns `nextRefreshAt`, actual quote timestamps/dates, source kind, and sanitized quality/refresh warnings. Hidden tabs pause timers; requests in progress are not duplicated.
- Use the existing five-minute intraday interval initially. Repeated failures introduce a bounded cooldown. With no calendar service, weekday holidays are not positively identified: redundant holiday requests are limited by cache/cooldown, not falsely classified as closed.
- Weekend filtering uses the source market's local date and existing supported market session policy. Do not use the viewer timezone. Do not invent holiday or half-day certainty from fixed hours.
- Treat a deliberate refresh as a bounded request to update eligible prices, not an unrestricted cache bypass. Currency conversion, account/table filters, and chart range changes do not force acquisition. Preserve current viewer valuation-read exceptions; historical ingestion/retry operations remain admin-only.

### 3. Daily snapshot eligibility without holiday calendars

- No exchange holiday API or maintained holiday dataset is included in this scope. Saturday/Sunday are the only assumed non-trading days; a weekday public holiday can intentionally leave a snapshot gap.
- For snapshot business date `D`, reconstruct transactions/cash/holdings through `D`. Continue using the existing `Asia/Shanghai` 06:00 completed-date convention and original scheduler event time.
- For a weekday `D`, each required nonzero automatically priced security must have an eligible historical value for `D`. Published unit prices and explicit estimates retain their existing provider date meaning; late publication leaves the date pending until that dated value arrives. Do not relabel a later date as the missing date.
- This intentionally tightens the existing FundRock/Kernel historical carry policy for weekday formal snapshots. Current valuation can still show their latest available value with its actual date. Publication delay is recorded as pending data, not necessarily a transport failure.
- For Saturday/Sunday snapshot date `D`, use the latest eligible historical price on or before `D`, and apply ledger changes through `D`. A valid weekend snapshot has actual snapshot date `D` even when price dates are earlier. It is not a copy of Friday's snapshot. Missing all usable historical prices still blocks formal publication.
- Source session/price dates and app business dates remain different concepts. Implement and test one explicit mapping for required prices; do not import the dashboard's US-session daily-movement mapping into historical snapshot dates.
- Cash requires no market quote. Preserve explicit manual-only valuation policy and existing manual/actual/estimate price priority; a transaction-owned manual price remains a documented best-effort input, not a falsely labeled official close. A missing prior comparison price must not block a valid current market value.
- Preserve existing valuation-FX and principal-FX contracts: no new same-calendar-day FX requirement and no future FX. Missing required FX is tracked separately from a security-price gap; it must not create a partial total.
- Evaluate only required holdings for the date, including historical holdings now closed. A provider failure unrelated to those inputs must not alone decide eligibility. A global job status is operational evidence, not proof of financial completeness.
- A missing required price leaves the formal snapshot absent/unavailable, with durable diagnostics. Later eligible dates may still publish; a missing Monday must not permanently prevent Tuesday or weekend processing.

### 4. Read-time fallback and financial consistency

- Resolve a requested historical date to the newest valid snapshot at or before it in the same authorized account/purpose scope. Never choose future data, fill an unavailable amount with zero, or silently aggregate only surviving accounts.
- Return `requestedDate`, `actualSnapshotDate`, `isFallback`, and a reason. No predecessor means unavailable. Do not persist duplicate snapshots just to fill a query gap.
- Date queries, historical charts, account history, and monthly asset endpoints use the same resolver. Charts may show carried values, but mark them as carried and expose both dates; do not present interpolated values as recorded history. Keep the current live endpoint distinct.
- A carried valuation includes the predecessor's ledger, principal, and saved conversion rates. Do not attach current/date-requested cash, principal, or FX to the old assets. Actual transaction lists and monthly activity statistics retain their requested-period meaning.
- Period calculations on a chart use the actual valuation dates and corresponding principal interval. A repeated carried valuation does not create an additional daily gain/loss observation. Persisted snapshot comparisons continue comparing actual records.
- Monthly reports display carried opening/closing assets with their actual dates. When boundaries do not cover the requested month, full-month profit/return, reconciled asset-change attribution, and contribution percentages remain unavailable with an explanation; actual monthly cash flows/trades remain visible separately. Do not silently relabel a shorter interval's profit as full-month profit.
- Raw snapshot maintenance lists remain an audit of persisted snapshots. Show pending dates separately instead of inserting synthetic rows into persisted-row pagination/comparisons.
- After repair, invalidate affected cached histories/monthly results so exact-date results replace fallbacks. Keep authorization revision in cache keys and prevent hidden-account diagnostic disclosure.

### 5. Historical gaps, corrections, and recovery

- Persist unresolved instrument/date gaps independently of source/job attempt logs and snapshot repair watermarks. Record attempts, next eligible attempt, reason, and whether range retrieval is supported. Weekday holidays remain unresolved/unavailable under this simplified policy; do not manufacture an official holiday conclusion.
- Merge adjacent due dates into bounded source/instrument range queries. Enforce returned symbol, currency, raw-versus-adjusted close, exchange date, publication/close confirmation, positivity, duplicate, and future-date checks.
- Preserve manual prices and transaction ownership. An explicit provider correction to its own historical row is auditable and requeues snapshots from the earliest affected date; unchanged data must not repeatedly enqueue repair.
- Unsupported historical retrieval remains a visible unresolved gap requiring a separately approved source or manual price. Retrying a latest-only endpoint cannot be reported as successful historical recovery.
- Retry transient timeouts/network/5xx with bounded exponential backoff and jitter; honor `Retry-After` for rate limits. Configuration/schema/currency errors need intervention rather than repeated immediate requests. Expected late publication and permanent historical unavailability are separate outcomes.
- Save successful items and retry failed items only. Use expiring request leases with ownership tokens so crashes are recoverable and late workers cannot overwrite newer results or clear newer work.
- Bound work per invocation, persist resumable progress, and select only due unresolved work. Blocked old gaps cannot starve newer dates. Input arrival immediately requeues impacted dates, including older previously blocked dates.
- Coordinate source-item retry, Lambda execution retry, and Scheduler delivery retry. Verify their actual semantics/configuration separately; a Scheduler retry count is not proof of handler-failure recovery.
- Repair and gap state survive backup/restore. Ephemeral request leases must expire or be reset on restore. Do not leave background acquisition promises running after an API Lambda response.

## Design defaults for review

These are proposed implementation defaults, not an assertion that they are already deployed:

- Keep six-second quote batch deadlines; default to two concurrent upstream requests per provider, with a configurable lower adapter limit. Backend batch acquisition uses its own bounded Lambda budget and does not inherit the UI six-second limit blindly.
- Normal live quote freshness remains five minutes. Forced refresh still observes a minimum 60-second per-instrument/source request interval. On transient failures use persisted 5/15/60-minute cooldowns capped at one hour, respecting longer upstream `Retry-After` values.
- Attempt an unresolved supported historical gap at most once per day after immediate transient recovery is exhausted. After seven consecutive unsuccessful daily attempts, mark it `needs_attention` and stop automatic probing until a manual retry or new source data arrives. Keep it unresolved; never convert it to a holiday.
- Use existing schedules for discovery/repair first. Discover missing expected historical dates from due snapshot work, not just a hard-coded lookback window. Any schedule/capacity change is a separately reviewed infrastructure decision.
- Introduce two small persistence concerns: recoverable acquisition/gap state keyed by source, instrument, query kind, and date; and auditable source-price revisions. Extend existing snapshot repair state rather than introducing another general job queue. Final SQL names and constraints are fixed in Task 2 after examining existing RPCs.
- Aggregate user warnings: display actual fallback date immediately, and highlight unresolved data after seven calendar days. Never expose only a generic successful job status while required dates remain missing.

## Review focus

1. A weekday deposit followed by missing prices must not appear as a loss when assets fall back; Task 6 tests actual-date principal consistency.
2. A Saturday deposit must affect Saturday's real snapshot despite Friday's price dates; Task 5 tests weekend reconstruction.
3. Missing Monday/holiday prices must not starve later successful dates or endlessly consume the first batch; Tasks 4–5 test due-work selection.
4. An old concurrent provider response or repair completion must not replace newer prices or clear newer invalidation; Tasks 2–4 test lease/revision ownership.
5. A month-end fallback must expose its actual date without fabricating full-month returns, and a restricted viewer must not receive hidden-account reasons; Tasks 6–7 test both.

## Implementation tasks

Execute in order after approval. Each task includes focused failing fixtures, the smallest implementation, and the passing check. No automatic commits are part of these tasks.

### Task 1: Fix shared acquisition and snapshot contracts

**Files:** Create `packages/shared/src/priceAcquisition.ts` and `packages/shared/src/snapshotAvailability.ts`; update `packages/shared/src/index.ts`, `apps/api/src/providers/IInstrumentQuoteProvider.ts`, and `apps/jobs/src/providers/IInstrumentPriceProvider.ts`. Add `scripts/verify-price-acquisition.ts` and `scripts/verify-snapshot-availability.ts`; register them in the existing verification tooling and package commands.

**Interfaces:** `PriceQuery` discriminates `latest_quote` from `daily_history` with inclusive `fromDate`/`toDate`; `PriceBatchResult` contains per-item outcomes and coverage, not just a flat successful list. `ProviderCapabilities` identifies quote/history/native-batch support. `SnapshotEligibility` discriminates `ready` from `pending` with structured missing-input reasons. `SnapshotResolution<T>` carries requested/actual dates, fallback reason, and nullable value.

- [x] Add failing fixtures for mixed success, duplicate instruments, missing/unsupported dates, weekend/weekday eligibility, and no-predecessor/future-data rejection.
- [x] Define capability registry additions, exact date/time metadata, and safe serializable warning types; preserve stable source keys and existing compatibility fields.
- [x] Define `evaluateSnapshotEligibility(input): SnapshotEligibility` as a pure function using explicit required holdings, dated input facts, and the confirmed rules above.
- [x] Run the new `verify:price-acquisition` and `verify:snapshot-availability` fixture suites plus existing `verify:time-policy` and `verify:market-data`; expected result is all assertions passing.

### Task 2: Persist recoverable work and source revisions

**Files:** Add a new dated migration under `supabase/migrations` (do not edit applied migrations); create server repositories for acquisition state in `apps/api/src/repositories/priceAcquisitionRepository.ts` and `apps/jobs/src/repositories/priceAcquisitionRepository.ts`. Update price repositories and snapshot invalidation RPCs where needed. Extend `apps/jobs/src/services/ledgerBackupBundle.ts`, `apps/jobs/src/services/ledgerRestoreOrder.ts`, exporter allowlists, and `scripts/verify-backup-restore-db.ts`. Add `scripts/verify-price-acquisition-db.ts`.

**Interfaces:** Repository operations claim/release a bounded lease with token, save per-item outcomes atomically, list due gaps, and save provider revisions with snapshot invalidation. Use server-only database access and shared DTOs; no persistence code is imported into the web bundle.

- [x] Write disposable-database fixtures for concurrent claim, expiry/reclaim, stale owner rejection, atomic price-plus-invalidation, duplicate retries, and immutable manual/transaction-owned rows.
- [x] Implement uniqueness, bounded leases, source correction audit, durable blocked dates, and due-work indexes. Distinguish a logical request from its retry attempts.
- [x] Ensure input changes invalidate obsolete formal snapshots for readers while preserving atomic transaction commits and audit evidence; stale previous snapshots cannot remain advertised as current exact-date truth.
- [x] Version backup/export/restore as required, preserve unresolved work, and exclude/reset ephemeral locks safely.
- [x] Run new `verify:price-acquisition-db`, existing `verify:snapshot-revision-db`, `verify:signed-snapshots-db`, `verify:backup`, and `verify:backup-restore-db` against disposable local databases only.

### Task 3: Implement partial-success batched adapters and quote orchestration

**Files:** Update Yahoo/Eastmoney quote adapters under `apps/api/src/providers`, daily adapters under `apps/jobs/src/providers`, `packages/shared/src/yahooFinanceDailyBars.ts`, and shared acquisition helpers from Task 1. Create `apps/api/src/services/priceAcquisitionService.ts`; update `dashboardService.ts`, `accountDetailService.ts`, `quoteMode.ts`, and `dashboardQuoteRepository.ts`. Extend existing provider/quote timeout fixture scripts.

**Interfaces:** Server `getQuotes(input)` consumes scoped instrument identities, mode, current time, and request budget; returns usable quotes plus due-time/quality metadata. Adapters consume `PriceQuery[]` and return `PriceBatchResult`, preserving every requested identity's outcome.

- [x] Add fixtures proving one business batch, duplicate elimination, bounded concurrency, response mapping independent of order, partial HTTP/parse failure, deadline preservation, and no late-response downgrade.
- [x] Record a capability matrix for existing endpoints. Use verified native batching where available; otherwise retain the source with controlled per-symbol concurrency. Mark unsupported history honestly. New endpoints require an explicit source decision before adoption.
- [x] Share pure mapping/parsing and scheduling helpers across API/jobs; keep secrets and database writes in server layers. Preserve FundRock single-page retrieval and Kernel NTA calculation contracts.
- [x] Add cached/automatic/explicit-refresh semantics with compatibility for existing requests. Ordinary navigation and currency changes reuse valid quotes. API never calls a historical ingestion job from a read.
- [x] Run `verify:dashboard-quote-timeout`, `verify:dashboard`, `verify:holdings`, `verify:account-detail`, Yahoo/Eastmoney/FundRock provider suites, and new acquisition fixtures.

### Task 4: Discover price gaps, backfill ranges, and resume failures

**Files:** Update `apps/jobs/src/services/instrumentPriceIngestionService.ts`, `apps/jobs/src/handlers/updatePrices.ts`, `apps/jobs/src/services/snapshotRepairService.ts`, and instrument price/job repositories. Create `apps/jobs/src/services/priceRecoveryService.ts`. Update API data-maintenance/source services for admin retry through the existing job mechanism; extend stock/ETF ingestion, FundRock, Kernel, and snapshot-catchup fixtures.

**Interfaces:** `recoverHistoricalPrices({throughDate, budgetMs})` selects due gaps, merges ranges, batches providers, saves valid items, and leaves durable retry/intervention outcomes. Snapshot eligibility discovery queues missing dates even if no recent provider record was returned.

- [x] Add fixtures for Monday missing/Tuesday present, latest-only source, late fund publication, no automatic holiday inference, retry budget/backoff, unsupported ranges, and historical closed holdings.
- [x] Persist partial successes and audit every attempt. Return an incomplete outcome when required dates remain absent; distinguish new job execution success from financial coverage.
- [x] Add fair bounded selection so blocked dates do not monopolize work. New dated inputs reactivate affected repair work regardless of prior cooldown/intervention state.
- [x] Save source corrections with before/after provenance and requeue affected dates atomically; do not overwrite preferred manual data.
- [x] Inspect actual Scheduler delivery and Lambda asynchronous execution settings read-only during separately authorized delivery verification. Document ownership of retry layers; any configuration changes require independent authorization.
- [x] Run ingestion/provider suites, `verify:kernel-price-estimation`, `verify:snapshot-catchup`, and acquisition database fixtures. All simulated HTTP failure cases use local fixtures, not live fault injection.

### Task 5: Enforce weekday gaps and real weekend snapshots on every write path

**Files:** Update `apps/jobs/src/services/portfolioSnapshotGenerationService.ts`, `snapshotRepairService.ts`, API `snapshotRecalculationService.ts`, `portfolioValuationService.ts`, transaction mutation planning/RPC integration, and snapshot repositories. Extend `scripts/verify-portfolio-snapshot-calculation.ts`, `verify-snapshot-catchup.ts`, `verify-signed-snapshots-db.ts`, and `verify-snapshot-revision-db.ts`.

**Interfaces:** All scheduled, transaction-triggered, manual-date, and repair calculations consume Task 1 eligibility. Ready dates publish atomically with the existing revision guard; pending dates record reasons and do not publish a falsely complete snapshot.

- [x] Test Friday value 100 plus Saturday cash deposit 20 produces Saturday assets 120 using Friday's price; Saturday `actualSnapshotDate` remains Saturday.
- [x] Test missing weekday price leaves a pending date, but a later complete weekday/weekend can publish. A weekday holiday remains a gap without a calendar exception.
- [x] Test delayed daily fund values, estimate dates, manual-only prices, zero/negative holdings, missing FX, missing only prior comparison price, US/HK/China/NZ dates, and delayed scheduler retries.
- [x] Preserve transaction validity/idempotency when a snapshot is pending. A valid ledger mutation must not be rejected solely because provider data is absent; atomically invalidate affected obsolete results and retain repair work.
- [x] Keep existing completed-date bounds, account-set replacement, revision retries, and concurrent invalidation protections. Readiness must derive from required inputs rather than the latest global job status alone.
- [x] Run snapshot/time/transaction/idempotency/signed-snapshot suites, including disposable-database rollback and concurrency checks.

### Task 6: Resolve historical fallbacks consistently across API and reports

**Files:** Update `apps/api/src/services/portfolioSnapshotService.ts`, `monthlySummaryService.ts`, `accountDetailService.ts`, snapshot repository queries, scoped history caches, shared trend DTO/calculation helpers, and API route parsing. Extend `scripts/verify-portfolio-trend.ts`, `verify-monthly-summary.ts`, `verify-monthly-summary-scope.ts`, and account-scope fixtures.

**Interfaces:** `resolveSnapshotAtOrBefore(history, requestedDate): SnapshotResolution<PortfolioSnapshotSummary>` selects eligible scoped history and retains saved FX. Report DTOs carry requested and effective boundary dates plus availability reasons for derived metrics.

- [x] Test no earlier snapshot, no future fallback, predecessor outside query pagination, same-day invalidated snapshot, purpose filters, and restricted/empty account scopes.
- [x] Apply one resolver to history queries, trend targets, account views, and monthly asset endpoints; keep raw maintenance pagination as persisted rows.
- [x] Test missing Monday after a deposit: displayed assets/principal both use the prior snapshot's date. Exact transaction activity stays visible separately without artificial profit/loss.
- [x] Test month-end fallback displays older assets and actual dates but withholds full-month profit/attribution. Exact repaired endpoints restore normal calculations automatically.
- [x] Invalidate repaired histories and dependent report caches; retain scope revision and refuse mixed partial account totals.
- [x] Run `verify:portfolio-trend`, `verify:monthly-summary`, `verify:account-detail`, `verify:account-access`, and `verify:loading` with the changed DTOs.

### Task 7: Apply UI refresh policy and explain fallback/recovery

**Files:** Update `apps/web/src/lib/useValuation.ts`, `pages/DashboardPage.tsx`, `HoldingsPage.tsx`, `AccountDetailPage.tsx`, `MonthlySummaryPage.tsx`, `DataMaintenancePage.tsx`, `components/InvestmentTrendChart.tsx`, `AccountTrendChart.tsx`, `AssetSnapshotsTab.tsx`, and their existing helpers.

- [x] Add client fixtures for daily-only no-poll behavior, hidden-tab pause, one in-flight refresh, cached currency changes, stale-response rejection, and permission-change invalidation.
- [x] Use server refresh hints; keep the existing cached-first presentation and current valuation distinct from historical fallback.
- [x] Show requested/actual snapshot dates in cards, chart tooltips, and report boundary labels. Example: `11月4日暂无快照，显示11月3日数据`. Show source price dates separately on valid weekend snapshots.
- [x] Show unsupported historical retrieval, due retry, and attention-needed gaps in existing maintenance screens. Admin retry reuses existing authorized job actions; viewers do not acquire mutation controls or hidden diagnostics.
- [x] Keep carried chart segments distinguishable, no synthetic actual-snapshot markers, no artificial zero returns, and no misleading full-month metrics.
- [ ] Automated loading/client/financial fixtures passed. Deferred: perform real-login browser acceptance at 320x740, 393x852, 430x932, 768x1024, and recorded desktop dimensions using the maintained handoff procedure. Browser writes need their own authorization.

### Task 8: Reconcile maintained documentation and deployment evidence

**Files:** Update `docs/specs/investment-overview.md`, `docs/api.md`, `docs/data-model.md`, `docs/time-policy.md`, `docs/architecture.md`, `docs/auth.md` only where endpoint behavior changes, `docs/deployment.md`, `docs/local-testing.md`, `docs/operations/backup-restore.md`, `docs/roadmap.md`, and `docs/README.md`. Add a dated evidence record under `docs/releases` only for verified operations; annotate older plan status without rewriting historical observations.

- [x] Replace conflicting historical-gap, fund-lag, forced-quote-refresh, monthly exact-boundary, and unconditional carry descriptions with the approved behavior, while preserving unaffected financial formulas.
- [x] Distinguish existing ledger reliability deployment from this new acquisition/fallback design. The [2026-11-02 release](../releases/2026-11-02-ledger-processing-test.md) already records migrations/configuration and deployment of `0eec3d5`; several other maintained documents still say pending.
- [x] Preserve the old release's snapshot-executor hold as a historical fact. The read-only inspection in this chat later found a daily enabled schedule, deployed recovery code, and a successful run at `2026-11-02T22:30:00Z`; it did not independently verify all migration effects or the full historical repair. Verify current reserved concurrency and latest runs before asserting the hold has been lifted permanently.
- [x] Record separate statuses for code deployment, migrations, schedule/executor activation, initial historical catch-up, ongoing recovery, and authenticated visual acceptance. Do not infer completion of one from another.
- [x] Add operational guidance for cooldown/intervention, supported backfill ranges, holidays remaining gaps, actual-date fallback, invalidated snapshots, and source corrections.
- [x] Run `corepack pnpm verify:docs` and `git diff --check`; review meaning and incoming links manually as well.

### Task 9: Integrated validation and separately authorized rollout

- [x] Run `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build`, plus the affected registered fixture/database checks above. Use the reviewed verification entry point to classify effects; never treat a live repair script as a harmless test.
- [ ] Exercise one isolated end-to-end scenario: shared quote requests, partial provider failure, missing weekday price, Saturday cash change, carried query/month-end assets, late historical price, atomic snapshot repair, cache invalidation, and exact-date restoration.
- [x] Review the whole scoped working/index/new-file diff against the execution baseline. Ensure tests cover the five review-focus risks and all confirmed requirements.
- [ ] Before rollout, produce a read-only impact report: newly pending historical dates, existing snapshots incompatible with the stricter policy, unsupported historical sources, and changed monthly availability. Existing snapshots are not silently certified under the new policy or mass-deleted during deployment.
- [ ] Obtain separately scoped authorization for migrations, snapshot reclassification/repair, any retry/schedule infrastructure change, and initial backfill. Register verified migrations/configuration through existing TEST gates; do not replay already deployed reliability migrations.
- [ ] Only under push/delivery authorization, commit/push through configured TEST automation and verify the identified version. Never bypass blocked automation or run duplicate manual deployment.
- [ ] Report implementation, TEST deployment, historical recovery, and real-login visual acceptance separately. Production remains operator-run.

## Plan review and implementation record

- Confirmed rules covered: batch acquisition (Tasks 1–3), no daily-price UI polling (Tasks 3/7), historical gaps/corrections (Tasks 2/4), failure recovery (Tasks 2–5), weekday absence/weekend ledger reconstruction (Task 5), explicit read fallback and report dates (Tasks 6–7), and stale documentation/deployment evidence (Task 8).
- Scope exclusions: exchange holiday detection, automatic alternate provider selection, always-on streaming, general permissions redesign, financial formula redesign, and live data changes during planning.
- The user approved the proposed defaults and tighter weekday rule. Unsupported history remains a supported unresolved state, not a promise of complete automatic backfill.
- Planning verification was documentation-only. Implementation verification is recorded below; authenticated browser acceptance is still not claimed.

## Local execution and verification evidence

- Implemented Tasks 1–8 locally, including shared typed batches, bounded partial acquisition, server-owned request leases, source/date gaps, Yahoo range recovery, source-price corrections, snapshot publication gating, actual-date read fallback, UI hints/labels, and maintained documentation reconciliation. Task 9 local validation is recorded here; live rollout actions remain unchecked and unauthorized.
- Kept the existing `test` checkout and baseline HEAD. No branch/worktree, staged commit, push, TEST mutation, migration application, or deployment was performed. New SQL was applied only inside disposable loopback PostgreSQL fixtures.
- Independent scoped review identified missing FX facts, incomplete historical coverage, retry-phase ambiguity, StrictMode request replay, pending-job success signaling, lease-unguarded quote publication, missing Retry-After propagation, unchanged-price invalidation, and stale-source recovery. These were corrected, with focused fixtures covering the financial/concurrency effects. Final integration also applies eligibility to operator repair scripts without executing their live modes.
- Review refinements: source lease claims use one database batch per provider; quote writes and completion are atomic under live lease ownership; older occurrence timestamps cannot replace newer quotes; repeated identical decimal values do not enqueue corrections; recovery respects current source/enable configuration without excluding inactive historical holdings.
- Red/green evidence was observed for initial shared contracts and report/trend regressions. Some adapter baseline attempts were blocked by the effect-audit registry; they are not claimed as observed failing baselines. After effect review and registration, the complete affected suites ran normally.
- Completed isolated backup/restore rehearsal covers 57 real migrations, 33 populated tables, backup format 13, exact re-export equality, pending recovery state, identity dependencies, service-only access, and rollback. Lease ownership, atomic source corrections, stale responses, source cooldown, fair pending-date selection, private snapshot helpers, and valid repair publication have dedicated disposable-database assertions.
- Logs remain in ignored `tmp/market-data-recovery/`. The final command summary is appended after validation completes.
- Authenticated visual acceptance is blocked pending separately authorized schema readiness and real user login. The new API requires the prepared schema; using the unchanged shared TEST schema or bypassing login would not establish acceptance. No screenshot/build/mock is represented as the five-viewport check.

### Final local validation summary

- `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build`: passed. New acquisition/client/database fixture files are included in strict verification typechecking.
- Reviewed fixed core: all 15 registered checks passed. Affected provider/ingestion/report/loading suites: all 15 selected checks passed; final financial/acquisition/correction/client integration selection: all 14 checks passed. These selections overlap and are not additive test counts.
- `verify:price-acquisition-db`, `verify:snapshot-revision-db`, and `verify:signed-snapshots-db`: passed in disposable databases. The acquisition check additionally proves provider-batched claims, atomic quote publication, source-wide Retry-After, source-symbol changes during requests, unchanged-input invalidation suppression, pending-date fairness, and restored exact-date publication.
- `verify:backup-restore-db`: passed with 57 real migrations, 33 populated tables, format 13, exact equality, preserved pending work, identity/privilege checks and late-failure rollback.
- `verify:tooling`, `verify:docs`, and whitespace review: passed. Additional source correction fixture verifies real repository behavior with synthetic SSM/PostgREST transports; no live requests were used.
- The local scenario is covered across financial, transport, database and client fixtures. A real logged-in browser end-to-end run and all five visual viewports remain pending schema readiness and user login; no visual acceptance is claimed.
- HEAD remains `4fd2193` on `test`; staged diff is empty. No commit, push, deployment, shared TEST migration, data repair or infrastructure change was performed.

### Continuation audit (2026-11-04)

- Reconfirmed existing test checkout, unchanged baseline HEAD 4fd2193, empty staged diff, and retained implementation/new files. No branch/worktree or delivery operation was performed.
- Reviewed the existing snapshot audit and shared eligibility calculations. Prepared an ignored local audit under tmp/market-data-recovery that reuses those mappings/calculations, restricts Supabase transport to GET, checks the configured TEST target, and projects pending dates, incompatible persisted dates, unsupported historical adapters, and investment month boundaries. It requests no upstream prices and performs no database writes.
- The first live read was rejected with JWT issued at future. A later read succeeded without changing credentials/configuration or bypassing authentication. Two complete ordered reads matched. The ignored JSON report records 166 dates through 2026-11-03: 45 pending under the strict policy, all 45 already persisted, zero headers explicitly marked unavailable, and zero ready dates lacking a persisted snapshot. These are policy-incompatible candidates, not rows already reclassified in TEST.
- The proposed audit uses two matching ordered reads rather than a transactional snapshot and current instrument/account configuration. Monthly initialization requires separate review; its boundary projection is not a full monthly-service replay. These limits must remain visible in any eventual report.
- Reconciled stale monthly-boundary prose in the data model with the approved carried-asset contract, and corrected the architecture's local backup-format statement to 13 without asserting deployment.
- Real-login acceptance remains pending schema readiness and user login. Migrations, historical reclassification/repair, executor changes, commits, push and deployment remain unauthorized.

- Missing-input instruments span Yahoo (5), Eastmoney (2), Kernel estimate (1), and custom (1). Only Yahoo has the current automatic historical adapter; manual/custom inputs need separate review and are not promised automatic recovery. The projection does not request historical prices or resolve these gaps.
- Investment month-boundary projection: June closes at 2026-06-29; July opens there and closes at 2026-07-26; August opens there and closes at 2026-08-30; September opens there; current November closes at 2026-11-02 instead of 2026-11-03. May has no preceding snapshot and requires initialization-baseline review. These are candidate metric-availability changes, not full monthly-service acceptance. Exact affected dates remain in the ignored local report.
- Continuation checks: verify:docs and git diff --check passed. This continuation changed maintained documentation only; earlier code-validation evidence remains historical and was not represented as rerun.

### Authorized TEST rollout (2026-11-04)

- The user subsequently authorized migrations/registration, 39 price writes, snapshot reclassification/repair, issue #129, commit/push and automatic TEST delivery. This supersedes earlier local-only authorization statements for this rollout only.
- Both new migrations and 39 price rows are applied and verified. All 166 dates were re-evaluated: 152 available, 14 unavailable with retained audit evidence, 38 user-confirmed closure pairs. No existing price, transaction, account, instrument, FX or access row changed.
- Direct Kernel observations are non-estimated Kernel Anchor prices. Corresponding NTA pairing is not yet available, so no estimator anchor roots were fabricated. Future anchor pairing remains a separate outstanding limitation.
- Fresh core15, focused9 and acquisition DB passed, along with rollout lint/typecheck/build. See [TEST rollout evidence](../releases/2026-11-04-market-data-recovery-test.md). Application deployment/registration and five-viewport acceptance statuses are tracked separately there and in issue #129.
