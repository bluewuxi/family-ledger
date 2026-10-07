# Kernel NTA cutover and historical repair

Kernel uses published USF per-unit NTA, mapped one NZX weekday ahead of the Kernel valuation date. The global schedules are unchanged. A late announcement is picked up by the next refresh; missing dates are not fabricated. Actual/manual prices are preserved, and conversion records do not supersede actual-anchor revision order.

## Test-only cutover

1. Run `corepack pnpm repair:kernel-nta:test`. Review the default dry-run output under the ignored `.local/kernel-nta-repair` directory. It includes source NTA records, old anchors/prices, proposed prices, obsolete estimates and affected snapshots.
2. Run `corepack pnpm apply:kernel-nta-schema:test`. It saves a complete, exact PostgreSQL JSON export before applying `20261007120000_kernel_nta_estimation.sql` and the target-configuration compatibility migration with test-only SSM credentials. The migration preserves existing rows, blocks old Kernel estimate writes and adds NTA metadata and pending snapshot state.
3. Deploy the validated API/jobs/web to test. Keep the normal global schedule unchanged. Production is excluded.
4. Run `corepack pnpm repair:kernel-nta:test -- --apply`. This exports another full backup before data writes, temporarily disables the Kernel update target, validates all required references, atomically converts references and replaces estimates, recalculates affected existing snapshots, and restores the original enabled state. Snapshot failures remain pending and are retried even when the next price refresh makes no changes.
5. Verify actual/manual records and original audit rows are unchanged, no old-provider estimates remain, NTA prices match the dry-run, and pending snapshot work is clear. Run the script again to verify no new price changes or derived records.

The NTA reference for 2026-09-30 is 2026-10-01, 23.60990. With a 6.67 actual anchor, estimates are 6.7285866353 for October 1, 6.7605016328 for October 2, and 6.8349906776 for October 5. The existing October 2 manual price retains selection precedence. October 6 is only estimated after October 7 NTA is published; user-provided comparison prices are not imported as actual anchors.

## Recovery

If the atomic price operation fails, its writes roll back. If snapshot recalculation fails, rerun the repair or normal Kernel refresh to finish pending work. The local report is not marked complete until recalculation and token completion succeed.

For rollback, stop Kernel writers, restore affected anchors, prices, quote cache and snapshot rows from the pre-repair backup in a transaction, and recalculate snapshots from the earliest affected date. Restoring old-provider prices requires temporarily disabling `reject_legacy_kernel_estimate` inside that maintenance transaction; re-enable it before resuming NTA writers. Never run restored legacy values together with the new estimator. Original pre-schema backups use the old backup format; version 7 backups include NTA metadata and `kernel_nta_refresh_state`, and older versions restore missing NTA fields as legacy `open` values.

The publicly reachable NZX website JSON endpoint has no confirmed external stability commitment. Its accessibility does not establish a data-use licence. Fetch failures are logged as provider failures and never cause a market-price fallback.
