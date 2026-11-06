# Kernel Actual Price Backfill

**Status:** Implemented; authorized TEST data repair and verification completed.

Governing contracts: [actual-anchor API](../api.md#kernel-estimate-anchor-api), [market data](../data-model.md#market-data-foundation), [snapshot recovery](../specs/market-data-and-snapshot-recovery.md), [backup and restore](../operations/backup-restore.md), and [workflow](../project-workflow.md).

## Authorization and scope

The user authorized exactly five observed Kernel actual unit prices and formal actual roots on TEST: 2026-10-27 (NZD 6.66), 2026-10-28 (6.76), 2026-10-29 (6.73), 2026-10-30 (6.60), and 2026-11-02 (6.58). Preserve observed precision of two decimal places and non-estimated classification. Source: the user's authenticated Kernel Unit price history tooltips. Values/dates were explicitly reviewed in the conversation. Preserve October 26 as a user-confirmed New Zealand public-holiday gap; do not fabricate prices or USF NTA. These actual dates do not require NTA for valuation.

This is a pure data repair, using the deployed independent actual-anchor RPC and revision-guarded snapshot path. No application/UI, migration, schedule, permission or financial-formula changes. Visual acceptance is not applicable, not passed. No new commit/push/deployment is requested for this repair. Starting branch: test; HEAD: `939aa93a77638a1fea5ca67de0e5b6ba4208f1b9`; initial worktree/index clean.

## Execution

- [x] Confirm the TEST target, stable stack, deployed/approved schema, absence of active jobs, exact candidate list and protection against existing manual/higher-precision/conflicting values. Take and validate a fresh exact export and format-14 backup; preserve private evidence under ignored `tmp/` paths.
- [x] Under the shared deployment lock and global ledger lock, revalidate the backed-up state and save the five actual roots/prices atomically through the existing service-only RPC. Record exact source/price audit. Repeated identical observations must reuse root/price identities and produce no duplicate price/audit rows.
- [x] Recalculate related persisted snapshot dates from October 27 through the last completed date, retaining revision checks and token-checked completion. Preserve October 26, previous price/root records and unrelated ledger/access data.
- [x] Independently verify exact prices, two-place observed precision, non-estimated flags, idempotency, all available snapshot valuations/availability, the retained holiday gap and cleared repair tokens. Verify the final format-14 file and restore dry-run. Record actual totals and any limitations.

## Expected impact from the read-only proposal

Five additional price rows and five actual roots; eight related persisted dates recalculated. Expected totals: 1569 price rows, 152 available snapshots and 14 unavailable/pending dates. Revalidate against fresh inputs before execution; never overwrite unexpected changes to force these totals.

## Results

Completed on TEST on 2026-11-04 using only the already-deployed RPC and snapshot path. Exactly five prices and five actual roots were added, with two-place observed precision and non-estimated prices. All 1564 previous price rows, six previous anchor/reference rows and unrelated financial/access data were preserved. No historical NTA was fetched or added.

Recalculated eight persisted snapshot dates. Independent read-back recomputed all 166 snapshot availability decisions and compared every available account valuation: 152 available and 14 pending dates. The five newly resolved dates match the authorized price dates. October 26 and all earlier snapshots/pending data remain unchanged. Price count is 1569. Kernel and global repair queues completed with matching tokens/CAS.

Identical saves reused identities within the guarded write transaction. A separate post-commit retry of all five roots was checked against an exact full-ledger export and rolled back: no price/root/audit duplication or data changes. Exact pre/post exports and format-14 backups were retained locally; actual file verification and restore dry-run passed before and after repair. The final backup contains 6565 rows in 33 allowlisted tables and three validated app identities. No shared restore occurred.

Private input, exact backups, write audit and verification evidence are ignored under `tmp/kernel-actual-five/`. No application/UI/schema/schedule changes, migration replay, commit, push or deployment were performed for this repair. Visual acceptance is not applicable, not passed. See the [repair record](../releases/2026-11-04-kernel-actual-price-repair-test.md). The previous application rollout and its user-waived UI acceptance remain a separate historical record in the [Kernel rollout](../releases/2026-11-04-kernel-independent-anchors-test.md).
