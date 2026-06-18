# Backup And Restore

Ledger backup V1 is an operator-controlled safety mechanism for the small family ledger. It is not a user-facing export UI.

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

For an empty test database:

1. Apply all Supabase migrations through at least the backup manifest's `migrationHighWaterMark`.
2. Recreate Supabase Auth users with matching UUIDs where possible. If UUIDs cannot match, prepare a reviewed user-id remapping for `profiles`, `user_roles`, audit fields, and `job_runs.triggered_by_user_id`.
3. Run `verify:backup` and `restore:backup:dry-run`.
4. Load public tables in the dry-run restore order.
5. Recreate or reset SSM trading-password parameters separately; V1 backups do not contain decrypted trading passwords.
6. Run normal app validation, including holdings, dashboard, market data, snapshots, typecheck, and build.

Production restore should first be rehearsed against a disposable test Supabase project.
