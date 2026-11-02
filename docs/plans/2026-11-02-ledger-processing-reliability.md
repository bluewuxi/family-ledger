# Ledger Processing Reliability Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for sequential execution, or `superpowers:subagent-driven-development` if that execution method is selected. Follow the project compatibility rules; this document grants no delivery or live-operation authorization.

**Status:** Implemented locally; final validation recorded below. The user approved this plan on 2026-11-02 and authorized local implementation and required checks, excluding commits, pushes, deployment, shared migration application, and live data changes.

**Goal:** Prevent stale snapshot writes, invalid chronological trade balances, missing completed-date valuations, unrepaired late market inputs, and duplicate transaction creation after retries.

**Architecture:** Retain API/shared Decimal calculations and PostgreSQL atomic commits. Extend revision guards to derived writes, use a small durable repair state in Postgres, and reuse the existing scheduled Lambda jobs. Do not introduce an always-on backend or a new orchestration service.

**Tech stack:** TypeScript, Decimal.js, Supabase Postgres RPCs, Lambda/EventBridge Scheduler, React, existing local verification scripts.

**Spec and maintained contracts:** [Investment overview](../specs/investment-overview.md), [data model](../data-model.md#portfolio-valuation-snapshots), [API](../api.md), [time policy](../time-policy.md), [Auth](../auth.md), [deployment](../deployment.md#scheduled-jobs), and [workflow](../project-workflow.md). Update these owners with implemented behavior; this draft does not silently supersede them.

## Baseline and authorization

- Reviewed `test` at `35f1a5d941547db30f0c4354a1d89a8845b15338`; working tree was clean before this plan.
- Review evidence is local source analysis, not a live data audit or confirmation of deployed infrastructure.
- Existing `verify:holdings`, `verify:portfolio-snapshots`, `verify:time-policy`, and `verify:transaction-price-backfill` passed during the review. New failure scenarios remain to be reproduced with fixtures.
- Current scope includes local implementation and isolated validation. Commits, pushes, deployment, shared migration application, historical repair, and automation activation remain excluded.
- Before execution, reread AGENTS.md and required maintained sources, record branch/HEAD/diffs, and retain unrelated edits. Use the existing `test` checkout; do not create a branch/worktree without explicit authorization.

## Global constraints and proposed decisions

- Preserve `Asia/Shanghai` and the `06:00` business-day cutoff. Scheduled work derives its upper date bound from scheduled time, never retry execution time.
- Preserve trade-date recognition of securities and generated cash. No settlement-date clearing engine, opening-day reset, short accounting, or change to performance formulas.
- Preserve expected fund publication lag, provider dates, manual-price precedence, unavailable-value warnings, signed snapshot values, and account visibility. Never invent prices or FX to fill a calendar date.
- Keep price/FX schedules unchanged. Propose running snapshot maintenance daily at 06:30 Shanghai and catching up missing completed dates. Applying the schedule change requires separate infrastructure/automation authorization.
- Treat snapshots as repairable latest-known valuations for their historical dates. A newly accepted price/FX row invalidates dependent historical snapshots; recalculation can revise stored historical display FX. Document this explicitly alongside the existing stability rule: ordinary display reads still use stored snapshot FX.
- Do not retroactively rewrite stored transaction settlement amounts when FX arrives. Preserve exact-date principal FX rules and existing prior-or-same-day settlement FX rules.
- Preserve explicit cash withdrawals/fees/adjustments that can create liabilities. Chronological safeguards apply to trade funding and security availability; do not introduce a blanket prohibition on negative cash.
- Use strict TypeScript, numeric persistence, Decimal arithmetic, minimal dependencies, service-role-only write RPCs, sanitized errors, and no secrets in logs.

## Approach and sequence

Extend the existing revision/RPC mechanism rather than moving financial formulas into SQL. A single large database calculation transaction would duplicate the authoritative TypeScript logic; external workflow orchestration would add unnecessary infrastructure for this ledger.

Execute Tasks 1-5 in order, then integration validation. Task 1 provides safe snapshot writes; Task 3 provides recoverable invalidation; Task 4 consumes both. Task 5 extends the transaction commit from Tasks 1-2. Each task includes its owning documentation and focused regression evidence. No automatic per-task commits.

## Review focus

| Failure mode | Owning checks |
| --- | --- |
| Transaction commits between job reads and snapshot save; opposite lock acquisition orders | Task 1: stale-write rejection and two-session concurrency |
| Future funding, same-day ordering, deletions, and pre-existing invalid history | Task 2: chronological candidate-versus-baseline fixtures |
| Process crashes after a source write, or a newer invalidation arrives during repair | Task 3: atomic marker and token-guarded completion |
| Weekend month-end, delayed execution, missing FX, and backlog beyond Lambda budget | Task 4: calendar coverage, incomplete valuation, resumable catch-up |
| Commit succeeds but response is lost; key reused with changed content or revoked access | Task 5: concurrent retries, payload conflict, current authorization |

## Task 1: Guard every snapshot writer against stale inputs

**Files:** Modify `apps/jobs/src/services/portfolioSnapshotGenerationService.ts`, both API/jobs `repositories/portfolioSnapshotRepository.ts`, `apps/api/src/services/snapshotRecalculationService.ts`, and `scripts/verify-test-snapshots.ts`. Add an additive migration under `supabase/migrations/` and `scripts/verify-snapshot-revision-db.ts`. Extend `scripts/verify-portfolio-snapshot-calculation.ts` and `scripts/verify-signed-snapshots-db.ts`.

**Interface:** A guarded snapshot RPC accepts `(valuation jsonb, expected_revision text)` and returns its identity plus the resulting revision as decimal text. Reuse `get_ledger_write_revision()`; do not coerce revisions to JavaScript numbers. Every read/calculate/write attempt captures revision before reading its inputs.

- [x] Add a failing fixture: pause a job after reading inputs, commit a backdated transaction, then release the job. Assert the job cannot overwrite the newer valuation.
- [x] Add isolated database checks for two snapshot workers, transaction/job overlap, rollback, and execution permissions.
- [x] Establish a single lock order: ledger revision row before per-date snapshot locks. Refactor the transaction RPC and snapshot wrapper together; remove the unguarded service-role entry point after all callers migrate. Retain atomic complete-account replacement.
- [x] Migrate scheduled generation, Kernel repair, API recalculation, and audit/repair callers. Search all `upsert_portfolio_snapshot` call sites rather than relying only on the file list. Do not expose an unchecked legacy bypass.
- [x] Retry standalone calculation on revision conflict at most three attempts, rereading all inputs each time; exhausted work remains pending/failed. Distinguish a stale-plan retry from replaying a possibly committed transaction request.
- [x] For sequential dates, capture a fresh revision per calculation or use the returned revision only when all earlier inputs remain valid. Snapshot writes themselves advance the current revision.
- [x] Update data-model concurrency contracts and local verification guidance; run the new fixtures and existing snapshot/transaction atomicity checks in disposable databases only.

**Acceptance:** No stale successful snapshot save, torn header/account set, unchecked writer, or lock-order deadlock in the controlled interleavings.

## Task 2: Validate the chronological transaction candidate

**Files:** Create `packages/shared/src/transactionTimeline.ts` and `scripts/verify-transaction-timeline.ts`; export the helper from `packages/shared/src/index.ts`. Modify `apps/api/src/services/transactionService.ts`, `atomicTransactionWriteService.ts`, and relevant transaction repository serialization. Extend `scripts/verify-signed-snapshots-db.ts`.

**Interface:** `validateTransactionTimeline({ before, after, accounts, instruments }): TransactionTimelineViolation[]`, with violations carrying account/instrument, transaction ID, trade date, reason, available amount, and requested amount as decimal strings. API maps these to safe Chinese validation errors.

- [x] Add failing fixtures for a buy funded only by a later deposit, a sell supported only by a later buy, reduced/deleted earlier purchases, date/account/instrument reassignment, and an edited deposit that makes an existing buy unfunded.
- [x] Use the existing trade-date/creation-time/ID ordering as the canonical order. Ensure preview ordering matches committed ordering, including concurrent same-day creates; persist the server-assigned ordering timestamp used in the accepted plan rather than allowing database commit time to reorder it.
- [x] Replay candidate manual rows and generated cash legs as one coherent change. Validate security availability immediately before each sell and settlement-currency cash immediately before each buy; apply each generated cash effect once.
- [x] Validate create/update/delete across affected old and new accounts/instruments through all later recorded transactions. Future rows cannot fund earlier trades, but future obligations must still be checked when earlier entries change.
- [x] Preserve existing signed-cash behavior. Compare baseline and candidate violations so legacy invalid history does not block unrelated or corrective edits: reject newly introduced or worsened trade deficits, allow unchanged/improved ones. Include fixtures where final totals match but an intermediate deficit differs.
- [x] Preserve note-only updates and existing opening-balance uniqueness. Keep checks inside the revision-protected preparation/commit path.
- [x] Update API/data-model chronological validation rules and run timeline, holdings, price-backfill, and atomic-transaction checks.

**Acceptance:** No later funding can justify an earlier trade, and mutations cannot introduce/worsen downstream trade deficits. Existing liability and corrective-entry behavior remains explicit and tested.

## Task 3: Make late-input snapshot repair durable

**Files:** Add a migration for `snapshot_repair_state` and source-write invalidation. Create `apps/jobs/src/services/snapshotRepairService.ts` and its repository. Modify `instrumentPriceIngestionService.ts`, `fxRateIngestionService.ts`, `kernelNtaRefreshService.ts`, and API `marketDataSourceService.ts` as needed. Add `scripts/verify-snapshot-repair-db.ts`. Update backup export/restore allowlists and their verification scripts.

**Interface:** A single full-ledger repair marker stores `from_date`, an invalidation token, and resumable progress. Source changes atomically lower the date and advance the token. Completion/progress uses compare-and-set against that token; newer invalidations cannot be cleared by an older worker.

- [x] Add failing crash tests between source persistence and worker execution, between date repairs, and immediately before marker completion.
- [x] Record invalidation in the same database transaction as effective price/FX insert, update, or deletion, covering automatic and manual paths. Use the earlier old/new source date on edits. Rolled-back writes must leave no marker.
- [x] Do not mark no-op duplicate ingestion as changed. Accept conservative invalidation for a new lower-priority provider row; preserve current price selection and provider correction policies.
- [x] Repair affected completed snapshot dates with Task 1 guards. Include historical cost-basis FX effects, not just current market value. Never recalculate transaction settlement cash from newly loaded FX.
- [x] Integrate Kernel pending state without losing pending work during migration; verify disabled targets and interrupted Kernel refresh recovery. Drain generic pending work independently of whether a provider returns new records on the next run.
- [x] Bound work by available Lambda time, persist progress only under the matching token, and leave pending work on errors or conflicts. Multiple workers may duplicate calculations but cannot falsely clear unfinished work.
- [x] Define backup/restore semantics: retain repair state, include it in versioned allowlists, and verify restore does not silently discard pending invalidation. Keep schema access service-role-only.
- [x] Update data-model, deployment, and backup guidance. Document historical revision behavior and separate it from expected provider lag.

**Acceptance:** Every committed input change is either reconciled or durably pending; restart and concurrent invalidation cannot lose work.

## Task 4: Supply calendar coverage and recover delayed batches

**Files:** Modify `apps/jobs/src/handlers/generatePortfolioSnapshots.ts`, snapshot generation/repository services, `infra/aws/template.yaml`, and `infra/aws/parameters.test.json`. Extend `scripts/verify-time-policy.ts`, `verify-portfolio-snapshot-calculation.ts`, and `verify-monthly-summary.ts`. Add `scripts/verify-snapshot-catchup.ts`.

**Interface:** `listMissingCompletedSnapshotDates({ fromDate, throughDate, limit })` returns ascending missing calendar dates using paginated/database-side selection. The maintenance runner combines missing dates with Task 3 pending dates without skipping older inputs.

- [x] Add fixtures for 2026-10-31/2026-11-01 boundaries, leap day, an empty ledger, no transactions on a weekend, and a delayed retry across the 06:00 cutoff.
- [x] Prepare daily snapshot maintenance at 06:30 Shanghai; preserve existing FX/price schedules and scheduled-time payloads. Do not apply configuration during local implementation.
- [x] Catch up completed dates from the first transaction through the scheduled upper bound, within a bounded batch. No incomplete/future date writes; manual backfill date validation must enforce this too.
- [x] Preserve missing-data rules: do not substitute future FX, invent zero valuations, or claim a report is available when inputs are missing. Persist unavailable valuations where the existing schema permits; otherwise keep the date pending with an explicit reason. Arrival of the missing input must requeue that date through Task 3.
- [x] Check recent upstream job state before normal snapshot completion. Defer while a relevant run is active; for failed/stale upstream runs, record degraded/pending status instead of treating ingestion as successful. Do not require a new market close on holidays or reject expected fund lag.
- [x] Keep Task 3 invalidation as the correctness backstop: job-status checks alone cannot prevent an upstream write racing the snapshot. Expose pending repair/failure/date coverage in existing job diagnostics without a new monitoring service.
- [x] Verify monthly reports become available when exact boundaries exist; retain `SNAPSHOT_DATE_MISMATCH` behavior when they do not. Test multi-batch catch-up, failures, retries, and pagination beyond 1,000 records.
- [x] Update deployment, time-policy, data-model, monthly API, and local-testing contracts. Treat initial historical catch-up as a separately authorized repair, with reviewed date range and backup; do not activate it implicitly on deployment.

**Acceptance:** Normal operation covers every completed calendar date, retries retain their scheduled date bound, and missing inputs/backlogs remain visible and recoverable.

## Task 5: Make transaction creation retry-idempotent

**Files:** Modify `apps/api/src/routes/router.ts`, transaction service/repository/atomic writer, `apps/web/src/lib/apiClient.ts`, and `apps/web/src/pages/TransactionsPage.tsx`. Add an additive migration for `transaction_create_requests`, and `scripts/verify-transaction-idempotency.ts`. Extend isolated transaction DB, backup, and browser-client fixtures. Locate any additional create callers before changing the request contract.

**Interface:** Transaction creation requires `Idempotency-Key` containing a UUID. Scope uniqueness by actor and operation. Persist a canonical request fingerprint, transaction identity, and original successful response atomically with the ledger write. Keyless legacy callers receive a clear validation error after coordinated API/web release.

- [x] Add failing tests for lost response after commit, concurrent identical submissions, a revision conflict followed by retry, and changed payload under an existing key.
- [x] Canonicalize parsed user input deterministically, including null/default fields and exact decimal normalization; exclude derived FX/settlement/snapshot data so changing market inputs do not change request identity.
- [x] Check current authentication/admin access before looking up a replay. Same key/content returns the original successful result without recalculation or mutation; changed content returns conflict. Repeat the replay check inside the atomic RPC before revision rejection to resolve simultaneous requests.
- [x] Persist no successful reservation on rollback. Retain committed keys without automatic expiry for this small ledger; a later transaction deletion must retain a tombstone/replay record so an old request cannot recreate it. A replay reports the original operation result, not a claim about the transaction's current state.
- [x] Have the form create one key per logical submission, retain it across uncertain transport outcomes, and clear it after confirmed success or explicit new-entry intent. Payload edits start a new intent only after an uncertain earlier submission is resolved; never silently turn an ambiguous retry into a fresh create.
- [x] Keep operation keys scoped to the current session/form; do not store credentials or trading passwords. Define reload behavior explicitly: a lost in-memory intent requires checking recorded transactions before a new submission, rather than promising cross-reload idempotency.
- [x] Add the table to versioned backup/restore contracts and access restrictions. Do not use date/amount/instrument similarity to deduplicate legitimate repeated trades.
- [ ] API/Auth references and local verification guidance are updated; conflict/retry fixtures pass. Authenticated transaction-page acceptance at all five required viewports remains pending real user login.

**Acceptance:** One committed transaction per actor/key under concurrency and retries; altered content and unauthorized replays fail safely.

## Task 6: Integrated validation and review

- [x] Run all new focused scripts, plus existing `verify:holdings`, `verify:portfolio-snapshots`, `verify:time-policy`, `verify:transaction-price-backfill`, `verify:transaction-table`, `verify:signed-snapshots-db`, `verify:monthly-summary`, `verify:portfolio-trend`, `verify:market-data`, `verify:kernel-price-estimation`, `verify:kernel-price-estimation-db`, `verify:backup`, and `verify:backup-restore-db`. Inspect command effects first; DB fixtures must use disposable loopback clusters.
- [x] Run `corepack pnpm typecheck`, `corepack pnpm build`, and `git diff --check`. Register new verification commands in `package.json` and document them in local-testing guidance.
- [x] Exercise a combined scenario: delayed FX arrives during weekend catch-up while a backdated transaction is submitted twice; interrupt repair and resume. Assert a single trade, correct cash, correct snapshots, and no lost invalidation.
- [x] Review all scoped working/index/new-file changes against the baseline, including RPC permissions, numeric serialization, lock ordering, Lambda budget, backup restore, and old/new caller compatibility. Review may not substitute for controlled concurrency tests.
- [x] Update roadmap only to the actual implementation/acceptance state. Record remaining risks and implementation, deployment, and visual acceptance separately.

## Delivery and historical reconciliation boundaries

After implementation is separately requested, local changes and validation can proceed within that scope. Before any authorized delivery, read [TEST deployment](../test-auto-deployment.md) and the Windows migration procedure. Prepare additive migration and coordinated API/jobs/web rollout evidence; applying migrations, activating the daily schedule, and running initial historical repair require their own explicit authorization. Do not bypass CI or substitute manual deployment.

For separately authorized historical reconciliation: take the required ledger backup, run a TEST-targeted read-only audit, review missing/mismatched dates and existing chronological violations, then apply only the approved repair scope. Never auto-edit source transactions to make the new validator pass. Verify snapshots/monthly boundaries after repair and retain evidence. Production remains operator-run.

## Plan review record

Snapshot implementation follow-up review found that an explicit historical catch-up request was transient: after the first 30 dates, an ordinary invocation could skip the remaining older gaps because newer snapshots already existed. A focused 92-date fixture failed at the second invocation (`0` instead of `30`) before the fix. The explicit request now persists the repair watermark/token before upstream readiness checks and date selection. The fixture completes in 30/30/30/2-date batches without repeating `catchupFrom`, and also verifies persistence across upstream deferral. A disposable PostgreSQL fixture verifies durable selection and service-role-only request access. The maintenance deadline now starts before job creation/readiness overhead rather than after those operations.

The five accepted recommendations map to Tasks 1-5; the combined failure scenario belongs to Task 6. Detailed policy choices above were approved for local implementation. See the execution record below for actual validation and remaining acceptance.

## Execution record (2026-11-02)

- Tasks 1-5 are implemented locally. Existing and new working-tree changes remain uncommitted on `test` at starting HEAD `35f1a5d`.
- Ruling: snapshot repair service/repository responsibilities are colocated in `snapshotRepairService.ts`, and repair SQL checks are combined into `verify:snapshot-revision-db` rather than a second database harness. This keeps one bounded maintenance entry point and avoids duplicating disposable PostgreSQL setup.
- Ruling: repair progress retains the next calendar date as a watermark, including beyond an older event's bound. Clearing at that event bound could lose repair of newer persisted snapshots. Historical missing-date initialization still requires an explicit authorized catch-up date.
- Ruling: replay checks run both before preparation and after preparation failure, as well as inside the locked commit. This handles a competing identical request committing before the second request finishes validation.
- Independent cross-component review found and corrected stale-event repair loss, premature UI intent allocation, unsafe intent clearing on authentication/rate-limit responses, missing maintenance diagnostics, and missing controlled snapshot concurrency coverage.
- Passed: typecheck, build, holdings, portfolio snapshots/trend, time policy, transaction timeline/idempotency/table/price-backfill, monthly summary, market data, Kernel estimation and its isolated DB check, signed snapshots DB, snapshot revision DB, snapshot catch-up, backup, session reads, loading, dashboard, deployment fixtures, and whitespace review. Deployment verification uses synthetic publication fixtures; it performs no deployment.
- Database checks use temporary loopback clusters only. The full current-format backup/restore check includes real concurrent idempotent commits, stale revision replay, payload conflicts, deletion tombstones, revoked access, rollback, repair state, and exact restore equality. Final combined check passed: concurrent create, delayed FX, weekend-boundary valuation, stale completion rejection, and resumed progress. Full restore passed with 29 tables, 55 real migrations, format 12, exact equality, linked cash, pending state, identity dependencies, restricted privileges, and late-failure rollback.
- Three additive SQL migrations and local daily-snapshot/CORS source configuration are prepared. No shared migration, live data repair, live configuration change, deployment, commit, or push was performed.
- Authenticated transaction retry UI acceptance at the five required viewports remains pending real user login. No visual acceptance is claimed from fixtures or build output.
## Follow-up review (2026-11-02)

Found and fixed two additional gaps against the approved plan. Explicit historical catch-up now persists a repair request before readiness checks and resumes across ordinary invocations; a 92-date regression covers four batches and interruption. Maintenance budget starts before job/readiness work. Transaction ordering now compares normalized UTC creation instants with fractional precision instead of raw timestamp strings, preserving equivalent PostgreSQL/API timestamp ordering and weighted-cost behavior. Focused regression, isolated snapshot revision DB, typecheck, and build checks passed; full restore regression was rerun. No live operations or delivery actions were performed.
