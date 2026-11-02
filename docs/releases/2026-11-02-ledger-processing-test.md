# Ledger processing TEST release

Issue: #124. Scope: approved ledger processing reliability plan and the necessary complete-manifest encoding correction.

## Pre-release verification

- Starting application commit: `4a59904d90d2968edfefdcf5904e45f39d0c369f`.
- User authorized TEST backup, migrations, independent configuration, registration, push and automatic deployment. Historical snapshot repair requires a separate confirmation after read-only audit.
- Paused automatic deployment and scheduled jobs, drained jobs, and briefly held API execution during schema cutover. Restored API execution and the configured schedules after configuration verification. Snapshot Lambda execution remains held with reserved concurrency zero until the historical repair decision; schedule configuration is prepared and verified as daily.
- Created an encrypted TEST backup at `2026-11-02T08:13:20.409Z`, downloaded it to ignored local storage, and passed backup verification and restore dry-run (6,016 rows). This used the deployed pre-migration backup code.
- Applied only the three `20261102` migrations in one transaction. Verified guarded snapshot RPC, removal of its old public signature, private replacement-helper denial, replay-function restrictions and empty replay state. Counts remained 125 transactions, 148 snapshot headers, and 11 accounts. Repair watermark initialized null; no historical snapshots were changed.
- Executed a reviewed CloudFormation configuration-only change set: API CORS adds `idempotency-key`; snapshot schedule becomes daily at 06:30 Asia/Shanghai. No Lambda artifact was replaced by that independent configuration update. Stack returned `UPDATE_COMPLETE`; CORS and all schedule states were checked.
- Complete migration registration exceeded the SSM standard-parameter size. Added lossless versioned Brotli encoding with legacy gzip decoding, preserving all paths/hashes and the 4,096-byte rejection. Deployment fixtures, old/new state round-trips, changed-manifest rejection, typecheck and build passed.

## Read-only historical snapshot audit

Loaded 148 stored dates and calculated 164 expected dates. Found 16 missing dates (2026-09-12 through 2026-11-01, weekend gaps) and valuation differences on 2026-10-23 and 2026-10-29 affecting KiwiSaver and aggregate values. There are 32 field/date mismatch entries in total. Three early-generation warnings concern 2026-05-25 through 2026-05-27. Full output remains in ignored local storage; no repair command was run.

## Delivery and acceptance

Automatic application delivery is pending the final registration and push. Record the final commit and workflow result after completion. Real-login responsive acceptance remains pending and is not implied by automated publication verification. Do not invoke snapshot catch-up or re-enable the held snapshot executor before the historical-repair decision.
