import {
  convertSnapshotAmount,
  type PortfolioAccountSnapshotSummary,
  type PortfolioSnapshotSummary,
  type SnapshotDisplayCurrency,
  type SnapshotWarning
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface PortfolioSnapshotRow {
  id: string;
  snapshot_date: string;
  total_market_value_usd: string | null;
  total_cost_usd: string | null;
  unrealized_gain_usd: string | null;
  daily_change_usd: string | null;
  daily_change_pct: string | null;
  usd_to_nzd_rate: string;
  usd_to_cny_rate: string;
  warnings: unknown;
  created_at: string;
  updated_at: string;
}

interface PortfolioAccountSnapshotRow {
  id: string;
  portfolio_snapshot_id: string;
  snapshot_date: string;
  account_id: string;
  account_name: string;
  market_value_usd: string | null;
  cost_usd: string | null;
  unrealized_gain_usd: string | null;
  daily_change_usd: string | null;
  daily_change_pct: string | null;
  warnings: unknown;
  created_at: string;
  updated_at: string;
}

export async function listPortfolioSnapshots(input: {
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
}): Promise<PortfolioSnapshotSummary[]> {
  const supabase = await getSupabaseAdmin();
  const { data: snapshots, error: snapshotError } = await supabase
    .from("portfolio_snapshots")
    .select(snapshotSelect)
    .gte("snapshot_date", input.from)
    .lte("snapshot_date", input.to)
    .order("snapshot_date", { ascending: true })
    .returns<PortfolioSnapshotRow[]>();

  if (snapshotError) {
    console.error("Failed to list portfolio snapshots", { error: snapshotError });
    throw new Error("Failed to list portfolio snapshots.");
  }

  if (snapshots.length === 0) {
    return [];
  }

  const snapshotIds = snapshots.map((snapshot) => snapshot.id);
  const { data: accounts, error: accountError } = await supabase
    .from("portfolio_account_snapshots")
    .select(accountSnapshotSelect)
    .in("portfolio_snapshot_id", snapshotIds)
    .order("account_name", { ascending: true })
    .returns<PortfolioAccountSnapshotRow[]>();

  if (accountError) {
    console.error("Failed to list portfolio account snapshots", { error: accountError });
    throw new Error("Failed to list portfolio account snapshots.");
  }

  const accountsBySnapshotId = groupAccountsBySnapshotId(accounts);
  return snapshots.map((snapshot) => mapSnapshotRow(snapshot, accountsBySnapshotId.get(snapshot.id) ?? [], input.currency));
}

const snapshotSelect = [
  "id",
  "snapshot_date",
  "total_market_value_usd",
  "total_cost_usd",
  "unrealized_gain_usd",
  "daily_change_usd",
  "daily_change_pct",
  "usd_to_nzd_rate",
  "usd_to_cny_rate",
  "warnings",
  "created_at",
  "updated_at"
].join(", ");

const accountSnapshotSelect = [
  "id",
  "portfolio_snapshot_id",
  "snapshot_date",
  "account_id",
  "account_name",
  "market_value_usd",
  "cost_usd",
  "unrealized_gain_usd",
  "daily_change_usd",
  "daily_change_pct",
  "warnings",
  "created_at",
  "updated_at"
].join(", ");

function mapSnapshotRow(
  row: PortfolioSnapshotRow,
  accountRows: PortfolioAccountSnapshotRow[],
  currency: SnapshotDisplayCurrency
): PortfolioSnapshotSummary {
  const rates = { usdToNzdRate: row.usd_to_nzd_rate, usdToCnyRate: row.usd_to_cny_rate };

  return {
    id: row.id,
    snapshotDate: row.snapshot_date,
    currency,
    marketValue: convertSnapshotAmount(row.total_market_value_usd, currency, rates),
    cost: convertSnapshotAmount(row.total_cost_usd, currency, rates),
    unrealizedGain: convertSnapshotAmount(row.unrealized_gain_usd, currency, rates),
    dailyChange: convertSnapshotAmount(row.daily_change_usd, currency, rates),
    dailyChangePct: row.daily_change_pct,
    usdToNzdRate: row.usd_to_nzd_rate,
    usdToCnyRate: row.usd_to_cny_rate,
    warnings: parseWarnings(row.warnings),
    accounts: accountRows.map((account) => mapAccountSnapshotRow(account, currency, rates)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAccountSnapshotRow(
  row: PortfolioAccountSnapshotRow,
  currency: SnapshotDisplayCurrency,
  rates: { usdToNzdRate: string; usdToCnyRate: string }
): PortfolioAccountSnapshotSummary {
  return {
    accountId: row.account_id,
    accountName: row.account_name,
    currency,
    marketValue: convertSnapshotAmount(row.market_value_usd, currency, rates),
    cost: convertSnapshotAmount(row.cost_usd, currency, rates),
    unrealizedGain: convertSnapshotAmount(row.unrealized_gain_usd, currency, rates),
    dailyChange: convertSnapshotAmount(row.daily_change_usd, currency, rates),
    dailyChangePct: row.daily_change_pct,
    warnings: parseWarnings(row.warnings)
  };
}

function groupAccountsBySnapshotId(
  rows: PortfolioAccountSnapshotRow[]
): Map<string, PortfolioAccountSnapshotRow[]> {
  const grouped = new Map<string, PortfolioAccountSnapshotRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.portfolio_snapshot_id) ?? [];
    current.push(row);
    grouped.set(row.portfolio_snapshot_id, current);
  }

  return grouped;
}

function parseWarnings(value: unknown): SnapshotWarning[] {
  return Array.isArray(value) ? (value as SnapshotWarning[]) : [];
}
