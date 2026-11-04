# Independent Kernel Anchors Implementation Plan

**Status:** Implemented; TEST migration and actual-root adoption verified; commit/registration/automatic delivery pending. Visual acceptance: user-waived for this scope, not passed. Governing contracts: [API](../api.md#kernel-estimate-anchor-api), [data model](../data-model.md#market-data-foundation), [backup](../operations/backup-restore.md).

> Execute inline with superpowers:executing-plans. User authorization covers design, local implementation, migration files and isolated validation only. Omit all commit/delivery steps.

**Goal:** Save actual roots before NTA publication and block estimates in an unpaired winning root interval.

**Architecture:** Reuse append-only roots/references and service-only atomic RPCs. Shared planning selects actual revisions before references. Backup format 14 preserves pending references and observed precision.

**Tech stack:** Strict TypeScript, Decimal, PostgreSQL numeric and existing verification runner.

**Spec:** [Approved design](../specs/2026-11-04-kernel-pending-anchors-design.md).

## Global constraints

Read root AGENTS.md, apps/api/AGENTS.md, apps/jobs/AGENTS.md, packages/shared/AGENTS.md, supabase/AGENTS.md, scripts/AGENTS.md and apps/web/AGENTS.md. Follow project-workflow and affected maintained sources. Baseline: test, 2bc45353905a5a6f66aa4f429b14f2f30f2937fe, clean worktree. No shared writes or branch/worktree changes.

## Review focus

Stale refresh after a pending root; older-date actual corrections; same-ID NTA content changes; higher-precision prices and old retries; version-13 backups and partial reference corruption.

## Task 1: Shared planning and API

- [x] Add pending/multiple-root/reference-revision fixtures to scripts/verify-kernel-price-estimation.ts and confirm failure through verify:checks.
- [x] Update shared anchor/input contracts and nzxNta.ts: preserve roots, nullable pairing evidence and blocked intervals.
- [x] Add independent save repository mapping and injectable API dependencies; verify no NZX dependency and source/precision validation.
- [x] Run focused fixtures; expected success.

## Task 2: Atomic persistence

- [x] Extend scripts/verify-kernel-price-estimation-db.ts with save, pairing, stale/concurrent payload, precision/manual protection, privileges and rollback assertions; confirm failure.
- [x] Add supabase/migrations/20261104110000_kernel_pending_actual_anchors.sql with explicit pending constraints, independent save, refresh and exact list response.
- [x] Run isolated Kernel and full-schema fixtures; preserve revision protection and no shared connections.

## Task 3: Backup, UI and adoption preparation

- [x] Add format-14/original-version-13 checks, corrupted-reference rejection and pending exact restore coverage.
- [x] Update backup/restore compatibility and marker gating; preserve exporter allowlist and root-first order.
- [x] Render pairing status/null references and truthful notices in the existing maintenance UI. Prepare local-only adoption planning with synthetic conflict checks.
- [x] Run backup/restore and affected financial/client checks; visual acceptance was explicitly waived by the user for this scope.

## Task 4: Contracts, validation and review

- [x] Update maintained contracts, operator guidance and local implementation status.
- [x] Review verification effects/fingerprints. Run lint, typecheck, build, affected Kernel/backup/financial/snapshot/concurrency checks and docs/diff review.
- [x] Obtain fresh review of scoped uncommitted diffs and new files; address material findings. Leave all work uncommitted.

## Execution evidence

### Baseline and authorization

During the initial local-only phase, finished on branch test without changing HEAD 2bc45353905a5a6f66aa4f429b14f2f30f2937fe. Original worktree/index were clean; changes remain uncommitted. No TEST reads/writes, migration application, live price adoption, issue creation/update, commit, push or deployment occurred. The two actual prices and previous migrations were not replayed.

### Red/green and decisions

- The missing-NTA fixture first failed with the original planner exception; it now produces a pending root and no ineligible estimates. Independent SQL save first failed because its RPC was absent; it now saves actual non-estimated prices and reuses retry identities.
- A target-announcement amendment regression first failed because stale target NTA could replace its correction. Exact dated observations in refresh state now reject stale/inconsistent target evidence. Root reference corrections remain append-only.
- Observed precision protection first failed for 6.6100/precision4 followed by conflicting 6.62/precision2. The writer now compares persisted observed precision as well as significant stored decimals. Equal lower-precision observations reuse the existing more precise root.
- Local adoption initially missed a conflicting sibling manual price. A synthetic regression failed first, then passed after same-target/date manual protection was added. No real candidate/export was executed.
- Implementation decisions: root metadata is immutable; pairing state is computed from references. Explicit save never calls NZX, including when already published. A later scheduled/manual refresh pairs it. Use an isolated Decimal clone with precision 80 to preserve the existing numeric ratio and single ten-place half-up rounding without changing global Decimal settings. No financial formula, date mapping, permissions or schedules changed.

### Validation evidence (2026-11-04)

- corepack pnpm lint, corepack pnpm typecheck and corepack pnpm build passed after final executable changes.
- All 15 fixed core checks plus verify:kernel-price-estimation passed through the reviewed runner. Focused account-detail, holding-detail, monthly-summary, market-data, snapshot-catchup, acquisition/recovery/availability, source-price-correction, stock/ETF ingestion and transaction-price-backfill checks passed. Backup fixtures additionally passed populated format-13 normalization, format-14 pending/paired references, root-first restore, malformed references and exact nullable values.
- Disposable-loopback verify:kernel-price-estimation-db passed independent save, delayed pairing, target amendments, stale root-set/reference rejection, concurrent retries, disabled-state preservation, observed-precision/manual protection and service-only privileges.
- Disposable verify:backup-restore-db passed 33 allowlisted tables, all 58 real migrations, format 14, exact roundtrip/file dry-run, pending actual roots, revision advancement, existing-snapshot invalidation and late-failure rollback. No shared restore was performed.
- Disposable verify:snapshot-revision-db, verify:signed-snapshots-db and verify:price-acquisition-db passed revision/CAS protection, private publication permissions, atomic rollback, source corrections and immutable manual prices.
- Local adoption CLI ran only against synthetic files: reused existing price identity and rejected output overwrite; output stayed ignored. Documentation consistency and git diff --check passed.
- Effect review: Kernel fixture and existing holding-detail/transaction-price-backfill fixtures were inspected before classification as local-fixture. They use synthetic inputs/injected persistence and no live credentials. Changed shared dependencies received individual reviewed fingerprints. The conservative changed-path planner reports unmapped market-data/backup/migration paths (exit 2, no execution); focused checks above were selected manually under maintained contracts. This is a recommendation-coverage limit, not a passed automatic coverage plan. No blocked live/operator checks were bypassed.

### Independent review

A fresh reviewer inspected working/index diffs and untracked migration/helpers/design/plan against applicable instructions/contracts. Two P2 findings (observed trailing-zero precision and sibling manual-price adoption conflicts) were fixed with failing-then-passing regressions. A timestamp concern was withdrawn after verifying the maintained clock_timestamp() default. No additional material finding was established. Reviewer coverage was source review; validation results above were confirmed by the implementer. No independent browser review occurred.

### Remaining operator/acceptance work

Migration 20261104110000_kernel_pending_actual_anchors.sql is prepared and locally verified only. Applying/registering it, adopting the two existing actual prices with a fresh reviewed export/backup, committing/pushing and automatic TEST delivery all remain separately unauthorized. No issue closure is implied. On 2026-11-04 the user explicitly waived visual acceptance for this change, including maintenance-page copy and pending-pairing status display. Record this as user-waived, not passed; no visual checks were performed. This is a new scope-specific decision and does not waive future UI changes. Current TEST continues running the previous implementation.

### Continuation boundary

The user then requested continued progress after granting this visual waiver. The earlier explicit exclusions on TEST migration application, live data repair, commit, push and deployment remain in force until explicitly superseded. Local implementation, tests and independent review are complete. The next operational stage requires explicit scope for applying/verifying/registering the new TEST migration, preparing/revalidating and adopting only the two existing actual prices without replaying the 39-price manifest, and committing/pushing through configured automatic TEST delivery. Obtain a fresh exact backup and target/value/precision/conflict preflight before shared data writes; retain transactional and revision protection and verify the actual deployment before claiming delivery. Do not substitute a manual deployment.

### Authorized TEST rollout

The user subsequently explicitly authorized the new migration application/verification/registration, idempotent adoption of the two existing actual prices, commit/push and automatic TEST monitoring. These permissions supersede the earlier exclusions for this bounded rollout. The new migration, two pending actual roots, six audited obsolete-estimate retirements, twelve-date guarded snapshot recalculation, all 147 available valuations and 19 pending dates are verified; no price rows were added. A real-export format-14 backup/file restore preflight passed. See the [rollout record](../releases/2026-11-04-kernel-independent-anchors-test.md). Commit/registration/automatic delivery evidence follows after completion. Visual acceptance remains user-waived, not passed.
