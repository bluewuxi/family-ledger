import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateLedgerBackupPayload, type LedgerBackupPayload } from "../apps/jobs/src/services/ledgerBackupBundle";

const RESTORE_ORDER = [
  "currencies",
  "profiles",
  "user_roles",
  "investment_accounts",
  "instruments",
  "exchange_rates",
  "instrument_prices",
  "transactions",
  "portfolio_snapshots",
  "portfolio_account_snapshots",
  "dashboard_instrument_quotes",
  "job_runs",
  "data_provider_runs"
] as const;

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const backupFile = parseBackupFile(process.argv.slice(2));
  const payload = readBackupPayload(backupFile);

  validateLedgerBackupPayload(payload);
  validatePrimaryKeys(payload);
  validateInternalReferences(payload);

  const externalUserIds = collectExternalUserIds(payload);

  console.log("Backup restore dry-run: success");
  console.log(`Environment: ${payload.manifest.environment}`);
  console.log(`Generated at: ${payload.manifest.generatedAt}`);
  console.log(`Total rows: ${payload.manifest.totalRows}`);
  console.log(`Restore order: ${RESTORE_ORDER.join(", ")}`);
  console.log(`External Supabase Auth user ids required or remapped: ${externalUserIds.size}`);
}

function readBackupPayload(path: string): LedgerBackupPayload {
  if (!existsSync(path)) {
    throw new Error(`Backup file does not exist: ${path}`);
  }

  const raw = readFileSync(path);
  const json = path.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return JSON.parse(json) as LedgerBackupPayload;
}

function parseBackupFile(args: string[]): string {
  const fileFlagIndex = args.indexOf("--file");
  const value = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : null;

  if (!value) {
    throw new Error("Usage: corepack pnpm restore:backup:dry-run -- --file <backup.json.gz>");
  }

  return value;
}

function validatePrimaryKeys(payload: LedgerBackupPayload): void {
  for (const table of payload.manifest.tables) {
    const rows = payload.tables[table.name] as Array<Record<string, unknown>>;
    const primaryKey = table.name === "currencies" ? "code" : "id";
    const values = rows.map((row) => row[primaryKey]).filter((value) => value !== null && value !== undefined);

    if (values.length !== rows.length) {
      throw new Error(`Restore dry-run failed: ${table.name} has rows without ${primaryKey}.`);
    }

    if (new Set(values).size !== values.length) {
      throw new Error(`Restore dry-run failed: ${table.name} has duplicate ${primaryKey} values.`);
    }
  }
}

function validateInternalReferences(payload: LedgerBackupPayload): void {
  const accounts = idSet(payload.tables.investment_accounts);
  const instruments = idSet(payload.tables.instruments);
  const snapshots = idSet(payload.tables.portfolio_snapshots);
  const jobRuns = idSet(payload.tables.job_runs);
  const currencies = new Set((payload.tables.currencies as Array<Record<string, unknown>>).map((row) => String(row.code)));

  requireKnownValues(payload.tables.investment_accounts, "investment_accounts", "base_currency", currencies);
  requireKnownValues(payload.tables.instruments, "instruments", "currency", currencies);
  requireKnownValues(payload.tables.transactions, "transactions", "account_id", accounts);
  requireKnownValues(payload.tables.transactions, "transactions", "instrument_id", instruments);
  requireKnownValues(payload.tables.transactions, "transactions", "currency", currencies);
  requireKnownValues(payload.tables.exchange_rates, "exchange_rates", "from_currency", currencies);
  requireKnownValues(payload.tables.exchange_rates, "exchange_rates", "to_currency", currencies);
  requireKnownValues(payload.tables.instrument_prices, "instrument_prices", "instrument_id", instruments);
  requireKnownValues(payload.tables.instrument_prices, "instrument_prices", "currency", currencies);
  requireKnownValues(payload.tables.portfolio_account_snapshots, "portfolio_account_snapshots", "portfolio_snapshot_id", snapshots);
  requireKnownValues(payload.tables.portfolio_account_snapshots, "portfolio_account_snapshots", "account_id", accounts);
  requireKnownValues(payload.tables.dashboard_instrument_quotes, "dashboard_instrument_quotes", "instrument_id", instruments);
  requireKnownValues(payload.tables.dashboard_instrument_quotes, "dashboard_instrument_quotes", "currency", currencies);
  requireKnownValues(payload.tables.data_provider_runs, "data_provider_runs", "job_run_id", jobRuns);
}

function collectExternalUserIds(payload: LedgerBackupPayload): Set<string> {
  const userIds = new Set<string>();

  collectValues(payload.tables.profiles, "id", userIds);
  collectValues(payload.tables.user_roles, "user_id", userIds);
  collectValues(payload.tables.investment_accounts, "created_by_user_id", userIds);
  collectValues(payload.tables.investment_accounts, "updated_by_user_id", userIds);
  collectValues(payload.tables.instruments, "created_by_user_id", userIds);
  collectValues(payload.tables.instruments, "updated_by_user_id", userIds);
  collectValues(payload.tables.transactions, "created_by_user_id", userIds);
  collectValues(payload.tables.transactions, "updated_by_user_id", userIds);
  collectValues(payload.tables.job_runs, "triggered_by_user_id", userIds);

  return userIds;
}

function requireKnownValues(rows: unknown[], tableName: string, column: string, allowedValues: Set<string>): void {
  for (const row of rows as Array<Record<string, unknown>>) {
    const value = row[column];

    if (value === null || value === undefined) {
      continue;
    }

    if (!allowedValues.has(String(value))) {
      throw new Error(`Restore dry-run failed: ${tableName}.${column} references missing value ${String(value)}.`);
    }
  }
}

function idSet(rows: unknown[]): Set<string> {
  return new Set((rows as Array<Record<string, unknown>>).map((row) => String(row.id)));
}

function collectValues(rows: unknown[], column: string, output: Set<string>): void {
  for (const row of rows as Array<Record<string, unknown>>) {
    const value = row[column];

    if (value !== null && value !== undefined) {
      output.add(String(value));
    }
  }
}
