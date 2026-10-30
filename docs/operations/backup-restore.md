# Backup And Restore

Ledger backup is an operator-controlled safety mechanism for the small family ledger. It is not a user-facing export. The current implementation emits format version 8 (local implementation; live migration/deployment pending) for the current schema, as defined by `LEDGER_BACKUP_VERSION` in `apps/jobs/src/services/ledgerBackupBundle.ts`. Historical TEST releases verified version 5 on 2026-10-02 and version 6 on 2026-10-04; these are release-specific observations, not statements about the latest live backup. Verify an actual backup manifest when assessing an environment. Production has not been deployed.

Version history:

- Version 2 introduced snapshot headers and account rows after the 2026-09-23 snapshot cutover.
- Version 3 added spending tables.
- Version 4 introduced the redesigned spending-import schema and exact string serialization for spending amounts.
- Version 5 adds `kernel_price_anchors` and `instrument_prices.is_estimated`.
- Version 6 adds `education_reserve_funds` and `education_reserve_entries`.
- Version 8 serializes every top-level PostgreSQL numeric column in allowlisted tables as decimal text before client decoding. Its writer requires the new exporter marker; versions 2–7 retain original validation/checksum semantics.
- Version 7 adds Kernel NTA metadata and `kernel_nta_refresh_state` for pending snapshot refreshes.

Restore validation checks a backup with the rules for its original version before adding defaults for newer schema fields. Version 2 through version 4 checksums therefore remain valid. Older backups normalize to an empty `kernel_price_anchors` table and `is_estimated = false` only after their original checksums pass. Version-1 restore compatibility remains outside the supported operational scope.

## Backup Scope

The scheduled backup exports only the explicit public-table allowlist used by `public.export_ledger_backup()` and `LEDGER_BACKUP_TABLES`:

- Profiles, roles, accounts, instruments, transactions, currencies, prices, FX rates, Kernel price anchors and NTA refresh state, education reserve funds and entries, snapshot headers and account rows, dashboard quote cache, monthly review notes/status, spending tables, and job audit tables.
- Supabase Auth internals, sessions, password hashes, frontend assets, SSM parameters, service keys, Kernel credentials or cookies, statement file bytes, and decrypted trading account passwords are excluded.

The manifest declares Supabase Auth users as external dependencies. Rows such as `profiles`, `user_roles`, `kernel_price_anchors.created_by_user_id`, spending audit fields, and job audit fields require matching Auth user UUIDs during restore, or an explicit operator remapping step before loading data.

## Consistency

The backup Lambda calls `public.export_ledger_backup()`. PostgreSQL evaluates the function call as one SQL statement, so every exported table is read from one statement snapshot. The RPC orders each table by its stable key before returning JSON.

The Lambda checks for active batch jobs before export and again before S3 write. It blocks recent `started` runs for known market-data and snapshot jobs and ignores stale rows older than one hour while logging them for investigation.

## Exact Numeric Values

Version 4 serializes spending amounts as strings. Version 5 also serializes Kernel anchor prices and proxy values as strings. Version 7 adds NTA metadata and pending Kernel snapshot refresh state. The compatibility `proxy_close` value is interpreted using `proxy_value_type`: published NTA for `nta`, historical open for `open`. Older backups restore absent metadata as `open`; restore actual anchor roots before derived references. These values must stay strings throughout verification and restore so JavaScript cannot truncate PostgreSQL `numeric` precision. Existing numeric values from older tables retain their established backup representation, including JSON numbers for several investment fields. Formats through version 7 are not uniformly lossless: ordinary JavaScript numeric parsing may change high-significance decimals before checksums are generated. Converting an already-parsed number to a string cannot recover lost precision. Local G1 implementation is complete, but applying `20261031090000_lossless_ledger_backup.sql` and deploying compatible jobs remain separately authorized prerequisites; historical precision cannot be repaired by this change. See G1 in the [remediation plan](../plans/2026-10-30-rules-review-and-remediation.md#g1--lossless-backup-serialization-open-p1); no affected live backup has been established by this review.

## Storage

Backups are written as gzipped JSON:

```text
backups/{env}/YYYY/MM/DD/family-ledger-{env}-{timestamp}.json.gz
```

The backup bucket uses SSE-S3 (`AES256`), blocks public access, enables versioning, expires current and noncurrent backup versions after 30 days, and removes expired delete markers.

Lambda IAM is limited to `s3:PutObject` for `backups/{env}/*`. Local operators who run manual backup or restore checks need their own AWS permissions for the relevant S3 object operations and CloudFormation stack output lookup.

## Checksums

Backup JSON uses stable serialization:

- Tables appear in allowlist order.
- Rows appear in database RPC order.
- Object keys are sorted before hashing and file serialization.
- SHA-256 protects every table, the combined payload, and the S3 content-checksum metadata.

Use:

```powershell
corepack pnpm verify:backup -- --file <backup.json.gz>
```

The verifier validates the manifest version, original table list, row counts, per-table checksums, payload checksum, migration high-water mark, and version-specific numeric representations before any normalization.

## Restore Dry Run

Before any real restore, run:

```powershell
corepack pnpm restore:backup:dry-run -- --file <backup.json.gz>
```

The dry run validates a file and can produce normalized output; it does not connect to or load a destination database, verify that Auth users exist there, or prove a successful restore. It validates checksums, table presence, duplicate primary keys, internal foreign-key relationships, restore order, and required external Supabase Auth user ids. In version 5, `kernel_price_anchors` is restored after instruments and before `instrument_prices`; each anchor must reference the seeded Kernel target and an external creator id.

## Restore Procedure

For an empty isolated rehearsal database, retain the original backup unchanged. Record source format and target schema/code revisions before loading. `migrationHighWaterMark` is a code-defined format compatibility floor, not a complete source migration attestation; deployment approval uses the full manifest. Never replay migrations against a populated live database.

1. Apply all Supabase migrations through at least the manifest's `migrationHighWaterMark`. Version 5 introduced `20261002090000_add_kernel_price_estimation.sql`; version 6 requires the education schema, and version 7 requires the Kernel NTA schema and target-configuration compatibility migration through `20261007130000_kernel_nta_target_configuration.sql`. Historical proxy-session alignment alone does not establish current-schema readiness.
2. Recreate Supabase Auth users with matching UUIDs where possible. Otherwise prepare a reviewed mapping for profiles, roles, anchor creators, spending and education audit fields, and job trigger users.
3. Run `verify:backup` and `restore:backup:dry-run` against the untouched backup file.
4. Generate normalized rows with `restore:backup:dry-run -- --file <backup.json.gz> --output-tables <normalized-file.json>` and load them in the reported dependency order in one transaction with required deferred/self-reference checks. Explicitly resolve schema-created singleton/seed rows and Auth mappings first; abort on unexpected conflicts rather than skipping rows. Restore snapshot headers and account rows; never insert into the derived `portfolio_snapshots` view.
5. Preserve or remap retained statement S3 object versions separately. Database backups contain metadata, not PDF or CSV bytes.
6. Recreate or reset SSM trading-password parameters separately; backups do not contain decrypted values.
7. Compare row identities/counts and exact financial values against a trustworthy source, verify foreign keys/roles, linked cash legs, snapshot structure, pending Kernel state, and expected holdings/valuation. A legacy numeric-only backup cannot prove source precision that was already lost. Run applicable focused checks and typecheck/build when validating changed restore code; these checks alone do not compare restored data. Preserve rehearsal evidence separately from a file dry-run.

The test environment contains real family data. Rehearse restores only in an isolated database. Applying migrations or restoring data to test or production requires a separate authorized deployment operation.

## Spending Compatibility

Pre-version-4 backups are validated as originally saved. They restore only when legacy spending tables are empty; nonempty legacy records fail explicitly instead of being silently converted or discarded. Version-4 through version-7 spending rows use the redesigned schema, including nullable `statement_id` for manual rows and exact string amounts.

CSV and PDF metadata includes exact retained S3 versions. Pending upload versions expire after seven days and are not permanent backup sources. Retained source copies survive undo and unlink, but the source bytes remain outside the ledger bundle.

## Recovery evidence and operator cadence

Single-statement consistency, checksums, original numeric fidelity, and successful restoration are separate guarantees. Earlier cutover rehearsals establish only their recorded schema/format scope; current-format synthetic version-8 recovery is now verified locally as described below; external/live-environment dependencies remain outside that evidence. Reuse compatible evidence before scheduling a new exercise. No live backup was inspected by this documentation work.

Check backup status before authorized destructive repairs. Investigate when there has been no successful backup in 48 hours. Rehearse recovery at least quarterly and after format changes, using isolated targets and protected source files. This operator policy adds no automation or recovery-time guarantee and does not change 30-day retention. Real-backup access and live migration/restore operations require their applicable explicit scope.

## Format 8 verification

Run `corepack pnpm verify:backup` and `corepack pnpm verify:backup-precision-db`. The latter creates an isolated loopback PostgreSQL cluster, applies the new exporter migration to a synthetic predecessor fixture, parses real RPC JSON, and restores numeric values for exact equality. It checks maximum-significance values, negative/zero/null values, row order and service-only execution. It does not establish a full current-ledger restore rehearsal (G3). Format 8 rejects numeric JSON financial fields and legacy aggregate snapshot table shapes; a new writer with an old exporter fails closed, including empty backups. Preserve the migration approval gate before any later TEST release.

## Current-format isolated recovery evidence (2026-10-31)

Run `corepack pnpm verify:backup-restore-db` on Windows with PostgreSQL 17 installed under Program Files. The script creates its own loopback cluster without project credentials, replays all 44 current migrations (including the unapplied local G1 migration), and clones that schema into a second database before inserting source fixtures. It does not apply SQL to TEST or production.

The real exporter produces a version-8 gzip bundle; the actual restore dry-run CLI validates and normalizes it, and the shared restore-order constant drives transactional loading into the second database. All 21 allowlisted tables contain synthetic records, including trading cash links, snapshot header/account rows, exact numeric extremes, spending/document-version metadata, education, actual/derived Kernel anchors, pending Kernel refresh state, profiles/roles, quotes, monthly notes and job/provider audit records. Re-export comparison checks every value and identity in every table. Independent checks verify expected cash/quantity/snapshot totals and RPC access restrictions. Corrupted checksums, missing Auth users and late load failures are rejected; failed loads leave no partial ledger rows. Schema-created singleton and seed rows are explicitly cleared only in the disposable target before loading.

Evidence reconciliation: the September snapshot-cutover archive rehearsal covered its historical schema; versions 3–6 release records primarily establish checksum/file dry-run validation; G1 proved the numeric wrapper with a synthetic predecessor. This test adds the current full-schema/full-table bundle restore path. Independent review found empty-table coverage and an unrealistic pending-state reference; both were corrected and the full check rerun successfully.

This is a synthetic local recovery rehearsal, not recovery of the live environment. Synthetic retained object key/version metadata is preserved, but real S3 byte availability, live Auth UUID remapping/provider setup, SSM password recovery and operational recovery time were not tested. Those external prerequisites still require an authorized operator check before a real restore. No fixture contains real financial data, credentials, or personal statements. Historical numeric precision already lost remains unrecoverable.
