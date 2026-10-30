import type { LedgerBackupRows } from "../repositories/ledgerBackupRepository";

// Financial numeric columns; integer counters and identifiers keep their wire types.
const columns: Record<string, string[]> = {
  transactions: ["quantity", "price", "gross_amount", "fee", "tax", "fx_rate_to_nzd", "settlement_amount"],
  exchange_rates: ["rate"], instrument_prices: ["close_price"],
  dashboard_instrument_quotes: ["quote_price"],
  portfolio_snapshot_headers: ["usd_to_nzd_rate", "usd_to_cny_rate"],
  portfolio_account_snapshots: ["market_value_usd", "cost_usd", "unrealized_gain_usd", "daily_change_usd", "daily_change_pct"],
  kernel_price_anchors: ["kernel_unit_price", "proxy_close"],
  statement_rows: ["amount"], education_reserve_entries: ["amount", "target_amount"]
};

export function validateBackupFinancialValues(rows: LedgerBackupRows): void {
  for (const [table, fields] of Object.entries(columns)) {
    for (const row of rows[table as keyof LedgerBackupRows] ?? []) {
      const record = row as Record<string, unknown>;
      for (const field of fields) {
        const value = record[field];
        if (value !== undefined && value !== null &&
          (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) {
          throw new Error(`Backup ${table}.${field} must be an exact decimal string or null.`);
        }
      }
    }
  }
}
