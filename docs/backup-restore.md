# Backup And Restore

Ledger backup is an operator-controlled safety mechanism for the small family ledger. It is not a user-facing export. The current implementation emits format version 5 after the Kernel price-estimation migration is applied. The shared test environment has emitted version 5 since the 2026-10-02 Kernel market-data release under issue #97. Production has not been deployed.

Version history:

- Version 2 introduced snapshot headers and account rows after the 2026-09-23 snapshot cutover.
- Version 3 added spending tables.
- Version 4 introduced the redesigned spending-import schema and exact string serialization for spending amounts.
- Version 5 adds `kernel_price_anchors` and `instrument_prices.is_estimated`.

Restore validation checks a backup with the rules for its original version before adding defaults for newer schema fields. Version 2 through version 4 checksums therefore remain valid. Older backups normalize to an empty `kernel_price_anchors` table and `is_estimated = false` only after their original checksums pass. Version-1 restore compatibility remains outside the supported operational scope.

## Backup Scope

The scheduled backup exports only the explicit public-table allowlist used by `public.export_ledger_backup()` and `LEDGER_BACKUP_TABLES`:

- Profiles, roles, accounts, instruments, transactions, currencies, prices, FX rates, Kernel price anchors, snapshot headers and account rows, dashboard quote cache, monthly review notes/status, spending tables, and job audit tables.
- Supabase Auth internals, sessions, password hashes, frontend assets, SSM parameters, service keys, Kernel credentials or cookies, statement file bytes, and decrypted trading account passwords are excluded.

The manifest declares Supabase Auth users as external dependencies. Rows such as `profiles`, `user_roles`, `kernel_price_anchors.created_by_user_id`, spending audit fields, and job audit fields require matching Auth user UUIDs during restore, or an explicit operator remapping step before loading data.

## Consistency

The backup Lambda calls `public.export_ledger_backup()`. PostgreSQL evaluates the function call as one SQL statement, so every exported table is read from one statement snapshot. The RPC orders each table by its stable key before returning JSON.

The Lambda checks for active batch jobs before export and again before S3 write. It blocks recent `started` runs for known market-data and snapshot jobs and ignores stale rows older than one hour while logging them for investigation.

## Exact Numeric Values

Version 4 serializes spending amounts as strings. Version 5 also serializes Kernel anchor prices and proxy values as strings. The legacy `proxy_close` column now carries the aligned `USF.NZ` raw opening value. These values must stay strings throughout verification and restore so JavaScript cannot truncate PostgreSQL `numeric` precision. Existing numeric values from older tables retain their established backup representation.

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

The dry run validates checksums, table presence, duplicate primary keys, internal foreign-key relationships, restore order, and required external Supabase Auth user ids. In version 5, `kernel_price_anchors` is restored after instruments and before `instrument_prices`; each anchor must reference the seeded Kernel target and an external creator id.

## Restore Procedure

For an empty isolated rehearsal database:

1. Apply all Supabase migrations through at least the manifest's `migrationHighWaterMark`. Version 5 requires `20261002090000_add_kernel_price_estimation.sql`; current deployments must also apply `20261002120000_align_kernel_proxy_dates.sql` before accepting new Kernel anchors.
2. Recreate Supabase Auth users with matching UUIDs where possible. Otherwise prepare a reviewed mapping for profiles, roles, anchor creators, spending audit fields, and job trigger users.
3. Run `verify:backup` and `restore:backup:dry-run` against the untouched backup file.
4. Generate normalized rows with `restore:backup:dry-run -- --file <backup.json.gz> --output-tables <normalized-file.json>` and load them in the reported order. Restore snapshot headers and account rows; never insert into the derived `portfolio_snapshots` view.
5. Preserve or remap retained statement S3 object versions separately. Database backups contain metadata, not PDF or CSV bytes.
6. Recreate or reset SSM trading-password parameters separately; backups do not contain decrypted values.
7. Run holdings, dashboard, market-data, Kernel estimation, snapshot, backup, typecheck, and build checks.

The test environment contains real family data. Rehearse restores only in an isolated database. Applying migrations or restoring data to test or production requires a separate authorized deployment operation.

## Spending Compatibility

Pre-version-4 backups are validated as originally saved. They restore only when legacy spending tables are empty; nonempty legacy records fail explicitly instead of being silently converted or discarded. Version-4 and version-5 spending rows use the redesigned schema, including nullable `statement_id` for manual rows and exact string amounts.

CSV and PDF metadata includes exact retained S3 versions. Pending upload versions expire after seven days and are not permanent backup sources. Retained source copies survive undo and unlink, but the source bytes remain outside the ledger bundle.
