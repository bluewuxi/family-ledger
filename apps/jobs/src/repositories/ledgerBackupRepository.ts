import { getSupabaseAdmin } from "../db/supabaseServer";

export const LEDGER_BACKUP_TABLES = [
  { name: "profiles", orderColumn: "id" },
  { name: "user_roles", orderColumn: "id" },
  { name: "currencies", orderColumn: "code" },
  { name: "investment_accounts", orderColumn: "id" },
  { name: "instruments", orderColumn: "id" },
  { name: "transactions", orderColumn: "id" },
  { name: "exchange_rates", orderColumn: "id" },
  { name: "instrument_prices", orderColumn: "id" },
  { name: "portfolio_snapshots", orderColumn: "id" },
  { name: "portfolio_account_snapshots", orderColumn: "id" },
  { name: "dashboard_instrument_quotes", orderColumn: "id" },
  { name: "monthly_reviews", orderColumn: "month" },
  { name: "job_runs", orderColumn: "id" },
  { name: "data_provider_runs", orderColumn: "id" }
] as const;

export type LedgerBackupTableName = (typeof LEDGER_BACKUP_TABLES)[number]["name"];
export type LedgerBackupRows = Record<LedgerBackupTableName, unknown[]>;

export async function exportLedgerTables(input: { excludedJobRunId?: string | null } = {}): Promise<LedgerBackupRows> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("export_ledger_backup", { excluded_job_run_id: input.excludedJobRunId ?? null })
    .single<Partial<LedgerBackupRows>>();

  if (error || !data) {
    throw new Error("Failed to export ledger backup snapshot.");
  }

  return normalizeLedgerBackupRows(data);
}

export function normalizeLedgerBackupRows(data: Partial<LedgerBackupRows>): LedgerBackupRows {
  const rows = {} as LedgerBackupRows;

  for (const table of LEDGER_BACKUP_TABLES) {
    const tableRows = data[table.name];

    if (!Array.isArray(tableRows)) {
      throw new Error(`Ledger backup snapshot is missing ${table.name}.`);
    }

    rows[table.name] = tableRows;
  }

  return rows;
}
