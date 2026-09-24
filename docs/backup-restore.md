# Backup And Restore

Ledger backup is an operator-controlled safety mechanism for the small family ledger. It is not a user-facing export UI. Version 2 stores snapshot headers and account rows and is the baseline for future restores after the test cutover on 2026-09-23. Test contains real family data; production has not been deployed. Restoring version-1 backups is outside the supported operational scope. Existing legacy conversion code is retained for the completed rollout, without additional compatibility work.

## Backup Scope

The scheduled backup exports only the explicit public-table allowlist used by `public.export_ledger_backup()` and `LEDGER_BACKUP_TABLES`:

- Profiles, roles, accounts, instruments, transactions, currencies, prices, FX rates, snapshots, dashboard quote cache, monthly review notes/status, and job audit tables.
- Supabase Auth internals, sessions, password hashes, frontend assets, SSM parameters, service keys, and decrypted trading account passwords are excluded.

The manifest declares Supabase Auth users as external dependencies. Rows such as `profiles`, `user_roles`, and audit user ids require matching Auth user UUIDs during restore, or an explicit operator remapping step before loading data.

## Consistency

The backup Lambda calls the database RPC `public.export_ledger_backup()`. PostgreSQL evaluates the function call as one SQL statement, so all exported tables are read from one statement snapshot. The RPC orders each table by its stable key (`id`, or `code` for `currencies`) before returning JSON.

The Lambda still checks for active batch jobs before export and again before S3 write. It blocks recent `started` runs for the known batch jobs and ignores stale rows older than one hour while logging them for investigation.

## Storage

Backups are written as gzipped JSON:

```text
backups/{env}/YYYY/MM/DD/family-ledger-{env}-{timestamp}.json.gz
```

The backup bucket uses SSE-S3 (`AES256`), blocks public access, enables versioning, expires current and noncurrent backup versions after 30 days, and removes expired delete markers.

Lambda IAM is limited to `s3:PutObject` for `backups/{env}/*`. Local operators who run manual backup or restore checks need their own AWS permissions for the relevant S3 object operations and CloudFormation stack output lookup.

## Checksums

Backup JSON is serialized with stable JSON rules:

- Tables appear in the allowlist order.
- Rows appear in database RPC order.
- Object keys are sorted before hashing and file serialization.
- `null`, dates, timestamps, and numeric JSON values are preserved as returned by Postgres/PostgREST.
- SHA-256 is used for per-table checksums, the payload checksum, and S3 metadata content checksum.

Use:

```powershell
corepack pnpm verify:backup -- --file <backup.json.gz>
```

## Restore Dry Run

Before any real restore, run:

```powershell
corepack pnpm restore:backup:dry-run -- --file <backup.json.gz>
```

The dry run validates manifest checksums, table presence, duplicate primary keys, internal foreign-key references, restore order, and the count of required external Supabase Auth user ids.

## Restore Procedure

For an empty isolated rehearsal database, using a post-cutover version-2 backup:

1. Apply all Supabase migrations through at least the backup manifest's `migrationHighWaterMark`, including `20260922091000_cut_over_derived_portfolio_snapshots`.
2. Recreate Supabase Auth users with matching UUIDs where possible. If UUIDs cannot match, prepare a reviewed user-id remapping for `profiles`, `user_roles`, audit fields, and `job_runs.triggered_by_user_id`.
3. Run `verify:backup` and `restore:backup:dry-run`.
4. Use `restore:backup:dry-run -- --file <backup.json.gz> --output-tables <new-normalized-file.json>` to obtain validated table rows, then load them in the dry-run restore order. Restore headers and account rows; never insert into the derived `portfolio_snapshots` view.
5. Recreate or reset SSM trading-password parameters separately; backups do not contain decrypted trading passwords.
6. Run normal app validation, including holdings, dashboard, market data, snapshots, typecheck, and build.

The test environment contains real family data. Rehearse restores in an isolated database, not in the live test database. No production release has been performed.

## Version 3 spending extension (prepared)

Version 3 adds `spending_accounts`, `account_statements`, and `statement_rows` to the allowlisted single-snapshot export and restore order. Version-2 files remain valid; restore validates their original checksums first and initializes the three missing tables as empty. Existing version-1 compatibility validation is retained. Live backups remain version 2 until the spending migration and updated jobs are deployed.

Spending audit fields also reference external Supabase Auth users. PDF metadata is backed up, including the exact S3 object version, but PDF bytes are not in the database bundle. Retain the dedicated statement bucket and all object versions; replacement, unlinking, and statement deletion do not delete objects. Restoring into another storage environment requires copying those versions or remapping metadata explicitly.
