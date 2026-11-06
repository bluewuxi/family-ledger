# Kernel Actual Price Repair: TEST

Status: authorized pure data repair completed and verified on 2026-11-04. Visual acceptance: not applicable, not passed. No application deployment.

## Scope and execution

The user authorized the five observed Kernel actual unit prices and formal roots listed in the [repair plan](../plans/2026-11-04-kernel-actual-price-backfill.md), preserving two displayed decimal places and non-estimated classification. October 26 remains a user-confirmed New Zealand public-holiday gap; no price or USF NTA was fabricated. The historical actual dates require no additional NTA for valuation.

Confirmed the existing test checkout at `939aa93a77638a1fea5ca67de0e5b6ba4208f1b9`, a stable stack, the registered/deployed independent-anchor schema, no active trusted jobs and no conflicting manual or higher-precision actual values. Resolved the target by its ID/source configuration; its current symbol is `KN_SP500`. A fresh exact export and format-14 backup passed file verification and restore dry-run before mutation.

The shared deployment lock excluded publication overlap. Under the global ledger lock, the backed-up state was revalidated and the five roots/prices were atomically saved through the existing service-only `save_kernel_actual_anchor` RPC. Exact source observations, including the displayed `6.60` string and two-place precision, were retained in source-price revision/attempt audit. Identical retries reused identities and did not add prices or audit duplicates.

## Verified results

- Added exactly five Kernel Anchor prices with `is_estimated=false`, five immutable actual roots with `actual_price_precision=2`, five source-price revision records and five operator attempt records. Reference fields remain honestly pending/null; no NTA fetch or pairing was required or performed.
- Preserved all 1564 previous price rows and all six previous anchor/reference records exactly. Transactions, accounts, instruments, FX, application identities, roles/access, spending, education and other protected business inputs were unchanged.
- Recalculated all eight persisted dates from October 27 through November 3 via the maintained revision-guarded path. Independent read-back recomputed all 166 availability decisions and compared all 152 available account valuations. Five weekday snapshots became available; 14 dates remain pending. Total price rows: 1569.
- October 26 has no invented Kernel price and retains its prior pending record. Snapshot headers/account rows before October 27 remain unchanged. Both Kernel and global repair queues completed with matching refresh-token/CAS protection.
- A separate post-commit retry of all five saved roots reused the committed identities and left the exact exported ledger unchanged; that verification transaction was rolled back. No duplicate price, root or audit rows were produced.
- The final actual-export format-14 backup passed file verification and the real restore dry-run: 6565 rows, all 33 allowlisted tables and three validated application identities. No shared restore or cloud backup job was executed. Private source evidence, backups and detailed logs remain ignored under `tmp/kernel-actual-five/`.

Application code, UI, schemas, schedules, permissions, formulas and the deployed application version were not changed. No migration, previous price manifest, commit, push or deployment was replayed. This pure data repair has no visual acceptance requirement; it is separate from the earlier application's scope-specific user waiver in the [independent-anchor rollout](2026-11-04-kernel-independent-anchors-test.md).
