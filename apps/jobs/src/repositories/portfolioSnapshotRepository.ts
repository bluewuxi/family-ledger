import type {
  ExchangeRateRecord,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction,
  PortfolioSnapshotValuation,
  PriceRecord
} from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";

interface AccountRow {
  id: string;
  name: string;
  broker: string | null;
  account_type: InvestmentAccount["accountType"];
  base_currency: InvestmentAccount["baseCurrency"];
  market_region: InvestmentAccount["marketRegion"];
  notes: string | null;
  trading_info: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface InstrumentRow {
  id: string;
  symbol: string | null;
  name: string;
  short_name: string;
  description: string | null;
  market_region: Instrument["marketRegion"];
  exchange: string | null;
  currency: Instrument["currency"];
  asset_type: Instrument["assetType"];
  isin: string | null;
  provider: string | null;
  price_source: Instrument["priceSource"];
  price_source_symbol: string | null;
  price_source_exchange: string | null;
  price_update_enabled: boolean;
  price_update_priority: number;
  source_url: string | null;
  source_checked_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionRow {
  id: string;
  account_id: string;
  instrument_id: string;
  transaction_type: InvestmentTransaction["transactionType"];
  trade_date: string;
  settlement_date: string | null;
  quantity: string | null;
  price: string | null;
  gross_amount: string | null;
  fee: string;
  tax: string;
  currency: InvestmentTransaction["currency"];
  adjustment_direction: InvestmentTransaction["adjustmentDirection"];
  transaction_source: InvestmentTransaction["transactionSource"];
  linked_transaction_id: string | null;
  settlement_currency: InvestmentTransaction["settlementCurrency"];
  settlement_amount: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PriceRow {
  id: string;
  instrument_id: string;
  price_date: string;
  close_price: string;
  currency: Instrument["currency"];
  provider: string;
  source_symbol: string | null;
  is_adjusted: boolean;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ExchangeRateRow {
  id: string;
  rate_date: string;
  from_currency: ExchangeRateRecord["fromCurrency"];
  to_currency: ExchangeRateRecord["toCurrency"];
  rate: string;
  rate_type: ExchangeRateRecord["rateType"];
  provider: string;
  provider_rate_date: string | null;
  fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SnapshotIdRow {
  id: string;
}

export interface UpsertPortfolioSnapshotResult {
  snapshotId: string;
  accountsWritten: number;
}

export async function listSnapshotAccounts(): Promise<InvestmentAccount[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("investment_accounts")
    .select(accountSelect)
    .order("name", { ascending: true })
    .returns<AccountRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot accounts.");
  }

  return data.map(mapAccountRow);
}

export async function listSnapshotInstruments(): Promise<Instrument[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instruments")
    .select(instrumentSelect)
    .returns<InstrumentRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot instruments.");
  }

  return data.map(mapInstrumentRow);
}

export async function listSnapshotTransactions(snapshotDate: string): Promise<InvestmentTransaction[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("transactions")
    .select(transactionSelect)
    .lte("trade_date", snapshotDate)
    .order("trade_date", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<TransactionRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot transactions.");
  }

  return data.map(mapTransactionRow);
}

export async function listSnapshotPrices(snapshotDate: string): Promise<PriceRecord[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("instrument_prices")
    .select(priceSelect)
    .lte("price_date", snapshotDate)
    .order("price_date", { ascending: false })
    .returns<PriceRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot prices.");
  }

  return data.map(mapPriceRow);
}

export async function listSnapshotExchangeRates(snapshotDate: string): Promise<ExchangeRateRecord[]> {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select(exchangeRateSelect)
    .lte("rate_date", snapshotDate)
    .eq("rate_type", "valuation")
    .eq("to_currency", "USD")
    .order("rate_date", { ascending: false })
    .returns<ExchangeRateRow[]>();

  if (error) {
    throw new Error("Failed to list snapshot exchange rates.");
  }

  return data.map(mapExchangeRateRow);
}

export async function upsertPortfolioSnapshot(
  valuation: PortfolioSnapshotValuation
): Promise<UpsertPortfolioSnapshotResult> {
  const supabase = await getSupabaseAdmin();
  const { data: snapshot, error: snapshotError } = await supabase
    .from("portfolio_snapshots")
    .upsert(toSnapshotRow(valuation), { onConflict: "snapshot_date" })
    .select("id")
    .single<SnapshotIdRow>();

  if (snapshotError) {
    throw new Error("Failed to upsert portfolio snapshot.");
  }

  const accountRows = valuation.accounts.map((account) => ({
    portfolio_snapshot_id: snapshot.id,
    snapshot_date: valuation.snapshotDate,
    account_id: account.accountId,
    account_name: account.accountName,
    market_value_usd: account.marketValueUsd,
    cost_usd: account.costUsd,
    unrealized_gain_usd: account.unrealizedGainUsd,
    daily_change_usd: account.dailyChangeUsd,
    daily_change_pct: account.dailyChangePct,
    warnings: account.warnings
  }));

  if (accountRows.length === 0) {
    return { snapshotId: snapshot.id, accountsWritten: 0 };
  }

  const { error: accountError } = await supabase
    .from("portfolio_account_snapshots")
    .upsert(accountRows, { onConflict: "snapshot_date,account_id" });

  if (accountError) {
    throw new Error("Failed to upsert portfolio account snapshots.");
  }

  return { snapshotId: snapshot.id, accountsWritten: accountRows.length };
}

const accountSelect = [
  "id",
  "name",
  "broker",
  "account_type",
  "base_currency",
  "market_region",
  "notes",
  "trading_info",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

const instrumentSelect = [
  "id",
  "symbol",
  "name",
  "short_name",
  "description",
  "market_region",
  "exchange",
  "currency",
  "asset_type",
  "isin",
  "provider",
  "price_source",
  "price_source_symbol",
  "price_source_exchange",
  "price_update_enabled",
  "price_update_priority",
  "source_url",
  "source_checked_at",
  "created_by_user_id",
  "updated_by_user_id",
  "notes",
  "created_at",
  "updated_at"
].join(", ");

const transactionSelect = [
  "id",
  "account_id",
  "instrument_id",
  "transaction_type",
  "trade_date",
  "settlement_date",
  "quantity",
  "price",
  "gross_amount",
  "fee",
  "tax",
  "currency",
  "adjustment_direction",
  "transaction_source",
  "linked_transaction_id",
  "settlement_currency",
  "settlement_amount",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

const priceSelect = [
  "id",
  "instrument_id",
  "price_date",
  "close_price",
  "currency",
  "provider",
  "source_symbol",
  "is_adjusted",
  "fetched_at",
  "created_at",
  "updated_at"
].join(", ");

const exchangeRateSelect = [
  "id",
  "rate_date",
  "from_currency",
  "to_currency",
  "rate",
  "rate_type",
  "provider",
  "provider_rate_date",
  "fetched_at",
  "created_at",
  "updated_at"
].join(", ");

function toSnapshotRow(valuation: PortfolioSnapshotValuation) {
  return {
    snapshot_date: valuation.snapshotDate,
    total_market_value_usd: valuation.marketValueUsd,
    total_cost_usd: valuation.costUsd,
    unrealized_gain_usd: valuation.unrealizedGainUsd,
    daily_change_usd: valuation.dailyChangeUsd,
    daily_change_pct: valuation.dailyChangePct,
    usd_to_nzd_rate: valuation.usdToNzdRate,
    usd_to_cny_rate: valuation.usdToCnyRate,
    warnings: valuation.warnings
  };
}

function mapAccountRow(row: AccountRow): InvestmentAccount {
  return {
    id: row.id,
    name: row.name,
    broker: row.broker,
    accountType: row.account_type,
    baseCurrency: row.base_currency,
    marketRegion: row.market_region,
    notes: row.notes,
    tradingInfo: row.trading_info,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInstrumentRow(row: InstrumentRow): Instrument {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    shortName: row.short_name,
    description: row.description,
    marketRegion: row.market_region,
    exchange: row.exchange,
    currency: row.currency,
    assetType: row.asset_type,
    isin: row.isin,
    provider: row.provider,
    priceSource: row.price_source,
    priceSourceSymbol: row.price_source_symbol,
    priceSourceExchange: row.price_source_exchange,
    priceUpdateEnabled: row.price_update_enabled,
    priceUpdatePriority: row.price_update_priority,
    sourceUrl: row.source_url,
    sourceCheckedAt: row.source_checked_at,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTransactionRow(row: TransactionRow): InvestmentTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    instrumentId: row.instrument_id,
    transactionType: row.transaction_type,
    tradeDate: row.trade_date,
    settlementDate: row.settlement_date,
    quantity: row.quantity,
    price: row.price,
    grossAmount: row.gross_amount,
    fee: row.fee,
    tax: row.tax,
    currency: row.currency,
    adjustmentDirection: row.adjustment_direction,
    transactionSource: row.transaction_source,
    linkedTransactionId: row.linked_transaction_id,
    settlementCurrency: row.settlement_currency,
    settlementAmount: row.settlement_amount,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapExchangeRateRow(row: ExchangeRateRow): ExchangeRateRecord {
  return {
    id: row.id,
    rateDate: row.rate_date,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: row.rate,
    rateType: row.rate_type,
    provider: row.provider,
    providerRateDate: row.provider_rate_date,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPriceRow(row: PriceRow): PriceRecord {
  return {
    id: row.id,
    instrumentId: row.instrument_id,
    priceDate: row.price_date,
    closePrice: row.close_price,
    currency: row.currency,
    source: row.provider,
    sourceSymbol: row.source_symbol,
    isAdjusted: row.is_adjusted,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
