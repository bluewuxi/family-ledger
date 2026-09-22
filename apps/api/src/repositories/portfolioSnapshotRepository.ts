import {
  combineAccountValuations,
  type AccountPurpose,
  convertSnapshotAmount,
  type AccountDetailSnapshotPoint,
  type PortfolioSnapshotValuation,
  type PortfolioAccountSnapshotSummary,
  type PortfolioSnapshotSummary,
  type SnapshotDisplayCurrency,
  type SnapshotWarning
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { readAllRows } from "./readAllRows";

interface PortfolioSnapshotHeaderRow {
  id: string;
  snapshot_date: string;
  usd_to_nzd_rate: string;
  usd_to_cny_rate: string;
  created_at: string;
  updated_at: string;
}

interface PortfolioSnapshotRow extends PortfolioSnapshotHeaderRow {
  total_market_value_usd: string | null;
  total_cost_usd: string | null;
  unrealized_gain_usd: string | null;
  daily_change_usd: string | null;
  daily_change_pct: string | null;
  warnings: unknown;
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
  investment_accounts?: { purpose: string } | null;
}

interface PortfolioAccountSnapshotTrendRow {
  id: string;
  snapshot_date: string;
  account_id: string;
  account_name: string;
  market_value_usd: string | null;
  warnings: unknown;
  portfolio_snapshot_headers?: {
    usd_to_nzd_rate: string;
    usd_to_cny_rate: string;
  } | null;
}

export interface UpsertPortfolioSnapshotResult {
  snapshotId: string;
  accountsWritten: number;
}

export async function listPortfolioSnapshots(input: {
  purpose?: AccountPurpose;
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  order?: "asc" | "desc";
  limit?: number;
}): Promise<PortfolioSnapshotSummary[]> {
  const supabase = await getSupabaseAdmin();
  const snapshots = await listPortfolioSnapshotRows(input);

  if (snapshots.length === 0) {
    return [];
  }

  const snapshotIds = snapshots.map((snapshot) => snapshot.id);
  const { data: accounts, error: accountError } = await listAccountSnapshotRows(supabase, snapshotIds, input.purpose);

  if (accountError) {
    console.error("Failed to list portfolio account snapshots", { error: accountError });
    throw new Error("Failed to list portfolio account snapshots.");
  }

  const accountsBySnapshotId = groupAccountsBySnapshotId(accounts);
  return snapshots.map((snapshot) => mapSnapshotRow(aggregateSnapshotRow(snapshot, accountsBySnapshotId.get(snapshot.id) ?? []), accountsBySnapshotId.get(snapshot.id) ?? [], input.currency));
}

export async function listPortfolioSnapshotTrendRows(input: {
  purpose?: AccountPurpose;
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  order?: "asc" | "desc";
  limit?: number;
}): Promise<PortfolioSnapshotSummary[]> {
  const supabase = await getSupabaseAdmin();
  const snapshots = await listPortfolioSnapshotRows(input);
  if (snapshots.length === 0) return [];
  const { data, error } = await listAccountSnapshotRows(supabase, snapshots.map((snapshot) => snapshot.id), input.purpose);
  if (error) throw new Error("Failed to list investment account snapshots.");
  const accountsBySnapshotId = groupAccountsBySnapshotId(data);
  return snapshots.map((snapshot) => mapSnapshotRow(aggregateSnapshotRow(snapshot, accountsBySnapshotId.get(snapshot.id) ?? []), [], input.currency));
}

export async function listAccountSnapshotTrendRows(input: {
  accountId: string;
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  order?: "asc" | "desc";
  limit?: number;
}): Promise<Array<AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] }>> {
  const supabase = await getSupabaseAdmin();
  let query = supabase
    .from("portfolio_account_snapshots")
    .select(accountSnapshotTrendSelect)
    .eq("account_id", input.accountId)
    .gte("snapshot_date", input.from)
    .lte("snapshot_date", input.to)
    .order("snapshot_date", { ascending: input.order !== "desc" });

  if (input.limit !== undefined) {
    query = query.limit(input.limit);
  }

  const { data, error } = await readAllRows(query.returns<PortfolioAccountSnapshotTrendRow[]>(), input.limit);

  if (error) {
    console.error("Failed to list account snapshot trend rows", { error });
    throw new Error("Failed to list account snapshot trend rows.");
  }

  // Explicit header lookup works both before and after the foreign-key cutover.
  const headers = await listPortfolioSnapshotRows({ ...input, limit: undefined });
  const byDate = new Map(headers.map((header) => [header.snapshot_date, header]));
  return data.map((row) => {
    const header = byDate.get(row.snapshot_date);
    if (!header) throw new Error("Account snapshot header is missing.");
    return mapAccountSnapshotTrendRow({ ...row, portfolio_snapshot_headers: header }, input.currency);
  });
}

async function listPortfolioSnapshotRows(input: {
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  order?: "asc" | "desc";
  limit?: number;
}): Promise<PortfolioSnapshotHeaderRow[]> {
  const supabase = await getSupabaseAdmin();
  let snapshotQuery = supabase
    .from("portfolio_snapshot_headers")
    .select(snapshotSelect)
    .gte("snapshot_date", input.from)
    .lte("snapshot_date", input.to)
    .order("snapshot_date", { ascending: input.order !== "desc" });

  if (input.limit !== undefined) {
    snapshotQuery = snapshotQuery.limit(input.limit);
  }

  const { data: snapshots, error: snapshotError } = await readAllRows(snapshotQuery.returns<PortfolioSnapshotHeaderRow[]>(), input.limit);

  if (snapshotError) {
    console.error("Failed to list portfolio snapshots", { error: snapshotError });
    throw new Error("Failed to list portfolio snapshots.");
  }

  if (!snapshots || snapshots.length === 0) {
    return [];
  }

  return snapshots;
}

export async function listSnapshotDatesFrom(fromDate: string): Promise<string[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await readAllRows(supabase
    .from("portfolio_snapshot_headers")
    .select("snapshot_date")
    .gte("snapshot_date", fromDate)
    .order("snapshot_date", { ascending: true })
    .returns<Array<{ snapshot_date: string }>>());

  if (error) {
    throw new Error("Failed to list affected portfolio snapshots.");
  }

  return data.map((row) => row.snapshot_date);
}

export async function upsertPortfolioSnapshot(
  valuation: PortfolioSnapshotValuation
): Promise<UpsertPortfolioSnapshotResult> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase.rpc("upsert_portfolio_snapshot", { valuation });
  if (error || typeof data !== "string") {
    throw new Error("Failed to atomically write portfolio snapshot.");
  }
  return { snapshotId: data, accountsWritten: valuation.accounts.length };
}

const snapshotSelect = [
  "id",
  "snapshot_date",
  "usd_to_nzd_rate",
  "usd_to_cny_rate",
  "created_at",
  "updated_at"
].join(", ");

function aggregateSnapshotRow(
  snapshot: PortfolioSnapshotHeaderRow,
  accounts: PortfolioAccountSnapshotRow[]
): PortfolioSnapshotRow {
  const total = combineAccountValuations(snapshot.snapshot_date, accounts.map((account) => ({
    accountId: account.account_id,
    accountName: account.account_name,
    marketValueUsd: account.market_value_usd,
    costUsd: account.cost_usd,
    unrealizedGainUsd: account.unrealized_gain_usd,
    dailyChangeUsd: account.daily_change_usd,
    dailyChangePct: account.daily_change_pct,
    warnings: parseWarnings(account.warnings)
  })), snapshot.usd_to_nzd_rate, snapshot.usd_to_cny_rate);
  return {
    ...snapshot,
    total_market_value_usd: total.marketValueUsd,
    total_cost_usd: total.costUsd,
    unrealized_gain_usd: total.unrealizedGainUsd,
    daily_change_usd: total.dailyChangeUsd,
    daily_change_pct: total.dailyChangePct,
    warnings: total.warnings
  };
}

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

const accountSnapshotTrendSelect = [
  "id",
  "snapshot_date",
  "account_id",
  "account_name",
  "market_value_usd",
  "warnings"
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

function mapAccountSnapshotTrendRow(
  row: PortfolioAccountSnapshotTrendRow,
  currency: SnapshotDisplayCurrency
): AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] } {
  const rates = {
    usdToNzdRate: row.portfolio_snapshot_headers!.usd_to_nzd_rate,
    usdToCnyRate: row.portfolio_snapshot_headers!.usd_to_cny_rate
  };

  return {
    date: row.snapshot_date,
    snapshotDate: row.snapshot_date,
    marketValue: convertSnapshotAmount(row.market_value_usd, currency, rates),
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

async function listAccountSnapshotRows(
  supabase: Awaited<ReturnType<typeof getSupabaseAdmin>>,
  snapshotIds: string[],
  purpose?: AccountPurpose
) {
  const rows: PortfolioAccountSnapshotRow[] = [];
  // Bound URL size and paginate within each batch; history must never silently truncate.
  for (let start = 0; start < snapshotIds.length; start += 50) {
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from("portfolio_account_snapshots")
        .select(`${accountSnapshotSelect}, investment_accounts!inner(purpose)`)
        .in("portfolio_snapshot_id", snapshotIds.slice(start, start + 50))
        .order("id", { ascending: true }).range(offset, offset + 499);
      if (purpose) query = query.eq("investment_accounts.purpose", purpose);
      const { data, error } = await query.returns<PortfolioAccountSnapshotRow[]>();
      if (error) return { data: rows, error };
      rows.push(...data);
      if (data.length < 500) break;
    }
  }
  rows.sort((left, right) => left.account_name.localeCompare(right.account_name) || left.account_id.localeCompare(right.account_id));
  return { data: rows, error: null };
}

function parseWarnings(value: unknown): SnapshotWarning[] {
  return Array.isArray(value) ? (value as SnapshotWarning[]) : [];
}
