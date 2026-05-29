import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { config as loadDotenv } from "dotenv";
import {
  calculateHoldings,
  calculatePortfolioSnapshotValuation,
  type ExchangeRateRecord,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type PortfolioSnapshotValuation,
  type PortfolioSnapshotValuationAccount,
  type PriceRecord,
  type SnapshotWarning
} from "@family-ledger/shared";

loadDotenv({ path: ".env.test", quiet: true });

const shouldFix = process.argv.includes("--fix");

interface SnapshotRow {
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

interface AccountSnapshotRow {
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
}

interface Mismatch {
  snapshotDate: string;
  detail: string;
}

interface TimingWarning {
  snapshotDate: string;
  detail: string;
}

void main();

async function main(): Promise<void> {
  const supabase = createClient(requiredEnv("SUPABASE_URL"), await resolveServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const [accounts, instruments, transactions, prices, rates, snapshots] = await Promise.all([
    readTable<InvestmentAccount>(supabase, "investment_accounts", accountSelect, mapAccountRow),
    readTable<Instrument>(supabase, "instruments", instrumentSelect, mapInstrumentRow),
    readTable<InvestmentTransaction>(supabase, "transactions", transactionSelect, mapTransactionRow),
    readTable<PriceRecord>(supabase, "instrument_prices", priceSelect, mapPriceRow),
    readTable<ExchangeRateRecord>(supabase, "exchange_rates", exchangeRateSelect, mapExchangeRateRow),
    readSnapshots(supabase)
  ]);

  const accountSnapshots = await readAccountSnapshots(
    supabase,
    snapshots.map((snapshot) => snapshot.id)
  );
  const accountSnapshotsBySnapshotId = groupBy(accountSnapshots, (row) => row.portfolio_snapshot_id);
  const expectedSnapshotDates = getExpectedSnapshotDates(transactions, prices, rates, snapshots);
  const existingSnapshotDates = new Set(snapshots.map((snapshot) => snapshot.snapshot_date));
  const mismatches: Mismatch[] = [];
  const timingWarnings = snapshots.flatMap(detectSnapshotTimingWarning);

  console.log(
    [
      `Loaded test records: accounts=${accounts.length}`,
      `instruments=${instruments.length}`,
      `transactions=${transactions.length}`,
      `prices=${prices.length}`,
      `fxRates=${rates.length}`,
      `snapshots=${snapshots.length}`,
      `accountSnapshots=${accountSnapshots.length}`,
      `expectedSnapshotDates=${expectedSnapshotDates.length}`
    ].join(", ")
  );

  for (const snapshotDate of expectedSnapshotDates) {
    if (!existingSnapshotDates.has(snapshotDate)) {
      mismatches.push({ snapshotDate, detail: "missing portfolio snapshot" });

      if (shouldFix) {
        await upsertSnapshot(
          supabase,
          calculateExpectedValuation(snapshotDate, { accounts, instruments, transactions, prices, rates })
        );
      }
    }
  }

  for (const snapshot of snapshots) {
    const valuation = calculateExpectedValuation(snapshot.snapshot_date, {
      accounts,
      instruments,
      transactions,
      prices,
      rates
    });
    const snapshotMismatches = compareSnapshot(snapshot, accountSnapshotsBySnapshotId.get(snapshot.id) ?? [], valuation);
    mismatches.push(...snapshotMismatches);

    if (shouldFix && snapshotMismatches.length > 0) {
      await upsertSnapshot(supabase, valuation);
    }
  }

  if (mismatches.length === 0) {
    console.log("Portfolio snapshots in test are correct.");
    logTimingWarnings(timingWarnings);
    return;
  }

  console.log(`Portfolio snapshot mismatches found: ${mismatches.length}`);
  for (const mismatch of mismatches) {
    console.log(`- ${mismatch.snapshotDate}: ${mismatch.detail}`);
  }

  if (shouldFix) {
    console.log("Mismatched portfolio snapshots were recalculated and rewritten.");
    logTimingWarnings(timingWarnings);
    return;
  }

  logTimingWarnings(timingWarnings);
  process.exitCode = 1;
}

function detectSnapshotTimingWarning(snapshot: SnapshotRow): TimingWarning[] {
  const parts = getShanghaiTimeParts(snapshot.created_at);

  if (!parts || parts.hour >= 6) {
    return [];
  }

  return [
    {
      snapshotDate: snapshot.snapshot_date,
      detail: `created before the 06:00 Asia/Shanghai cutoff at ${parts.dateTimeLabel}`
    }
  ];
}

function logTimingWarnings(warnings: TimingWarning[]): void {
  if (warnings.length === 0) {
    return;
  }

  console.log(`Portfolio snapshot timing warnings found: ${warnings.length}`);
  for (const warning of warnings) {
    console.log(`- ${warning.snapshotDate}: ${warning.detail}`);
  }
}

function getShanghaiTimeParts(value: string): { hour: number; dateTimeLabel: string } | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.get("hour"));

  if (!Number.isFinite(hour)) {
    return null;
  }

  return {
    hour,
    dateTimeLabel: formatter.format(date)
  };
}

function getExpectedSnapshotDates(
  transactions: InvestmentTransaction[],
  prices: PriceRecord[],
  rates: ExchangeRateRecord[],
  snapshots: SnapshotRow[]
): string[] {
  const firstTransactionDate = transactions.reduce<string | null>(
    (earliest, transaction) =>
      earliest === null || transaction.tradeDate < earliest ? transaction.tradeDate : earliest,
    null
  );
  const dates = new Set(snapshots.map((snapshot) => snapshot.snapshot_date));

  if (firstTransactionDate) {
    for (const price of prices) {
      if (price.priceDate >= firstTransactionDate && hasRatesForSnapshotDate(price.priceDate, rates)) {
        dates.add(price.priceDate);
      }
    }
  }

  return [...dates].sort();
}

function hasRatesForSnapshotDate(snapshotDate: string, rates: ExchangeRateRecord[]): boolean {
  const currencies = new Set(rates.filter((rate) => rate.rateDate <= snapshotDate).map((rate) => rate.fromCurrency));
  return currencies.has("NZD") && currencies.has("CNY");
}

function calculateExpectedValuation(
  snapshotDate: string,
  input: {
    accounts: InvestmentAccount[];
    instruments: Instrument[];
    transactions: InvestmentTransaction[];
    prices: PriceRecord[];
    rates: ExchangeRateRecord[];
  }
): PortfolioSnapshotValuation {
  const holdings = calculateHoldings(
    input.transactions.filter((transaction) => transaction.tradeDate <= snapshotDate),
    input.accounts,
    input.instruments
  );

  return calculatePortfolioSnapshotValuation({
    snapshotDate,
    holdings,
    accounts: input.accounts,
    prices: input.prices.filter((price) => price.priceDate <= snapshotDate),
    fxRates: input.rates.filter((rate) => rate.rateDate <= snapshotDate)
  });
}

function compareSnapshot(
  actual: SnapshotRow,
  accountRows: AccountSnapshotRow[],
  expected: PortfolioSnapshotValuation
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const fields: Array<[string, string | null, string | null]> = [
    ["total_market_value_usd", actual.total_market_value_usd, expected.marketValueUsd],
    ["total_cost_usd", actual.total_cost_usd, expected.costUsd],
    ["unrealized_gain_usd", actual.unrealized_gain_usd, expected.unrealizedGainUsd],
    ["daily_change_usd", actual.daily_change_usd, expected.dailyChangeUsd],
    ["daily_change_pct", actual.daily_change_pct, expected.dailyChangePct],
    ["usd_to_nzd_rate", actual.usd_to_nzd_rate, expected.usdToNzdRate],
    ["usd_to_cny_rate", actual.usd_to_cny_rate, expected.usdToCnyRate]
  ];

  for (const [field, actualValue, expectedValue] of fields) {
    if (!sameNumeric(actualValue, expectedValue)) {
      mismatches.push({
        snapshotDate: expected.snapshotDate,
        detail: `${field} expected ${displayValue(expectedValue)} but found ${displayValue(actualValue)}`
      });
    }
  }

  if (canonicalWarnings(actual.warnings) !== canonicalWarnings(expected.warnings)) {
    mismatches.push({ snapshotDate: expected.snapshotDate, detail: "portfolio warnings differ" });
  }

  mismatches.push(...compareAccountSnapshots(expected.snapshotDate, accountRows, expected.accounts));
  return mismatches;
}

function compareAccountSnapshots(
  snapshotDate: string,
  actualRows: AccountSnapshotRow[],
  expectedRows: PortfolioSnapshotValuationAccount[]
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  const actualByAccount = new Map(actualRows.map((row) => [row.account_id, row]));
  const expectedByAccount = new Map(expectedRows.map((row) => [row.accountId, row]));

  for (const actual of actualRows) {
    if (!expectedByAccount.has(actual.account_id)) {
      mismatches.push({ snapshotDate, detail: `stale account snapshot exists for account ${actual.account_name}` });
    }
  }

  for (const expected of expectedRows) {
    const actual = actualByAccount.get(expected.accountId);
    if (!actual) {
      mismatches.push({ snapshotDate, detail: `missing account snapshot for ${expected.accountName}` });
      continue;
    }

    const fields: Array<[string, string | null, string | null]> = [
      ["market_value_usd", actual.market_value_usd, expected.marketValueUsd],
      ["cost_usd", actual.cost_usd, expected.costUsd],
      ["unrealized_gain_usd", actual.unrealized_gain_usd, expected.unrealizedGainUsd],
      ["daily_change_usd", actual.daily_change_usd, expected.dailyChangeUsd],
      ["daily_change_pct", actual.daily_change_pct, expected.dailyChangePct]
    ];

    for (const [field, actualValue, expectedValue] of fields) {
      if (!sameNumeric(actualValue, expectedValue)) {
        mismatches.push({
          snapshotDate,
          detail: `${expected.accountName}.${field} expected ${displayValue(expectedValue)} but found ${displayValue(actualValue)}`
        });
      }
    }

    if (actual.account_name !== expected.accountName) {
      mismatches.push({ snapshotDate, detail: `account name for ${expected.accountId} is stale` });
    }

    if (canonicalWarnings(actual.warnings) !== canonicalWarnings(expected.warnings)) {
      mismatches.push({ snapshotDate, detail: `${expected.accountName}.warnings differ` });
    }
  }

  return mismatches;
}

async function upsertSnapshot(supabase: ReturnType<typeof createClient>, valuation: PortfolioSnapshotValuation): Promise<void> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from("portfolio_snapshots")
    .upsert(
      {
        snapshot_date: valuation.snapshotDate,
        total_market_value_usd: valuation.marketValueUsd,
        total_cost_usd: valuation.costUsd,
        unrealized_gain_usd: valuation.unrealizedGainUsd,
        daily_change_usd: valuation.dailyChangeUsd,
        daily_change_pct: valuation.dailyChangePct,
        usd_to_nzd_rate: valuation.usdToNzdRate,
        usd_to_cny_rate: valuation.usdToCnyRate,
        warnings: valuation.warnings
      },
      { onConflict: "snapshot_date" }
    )
    .select("id")
    .single<{ id: string }>();

  if (snapshotError) {
    throw new Error(`Failed to upsert portfolio snapshot ${valuation.snapshotDate}: ${snapshotError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("portfolio_account_snapshots")
    .delete()
    .eq("portfolio_snapshot_id", snapshot.id);

  if (deleteError) {
    throw new Error(`Failed to clear account snapshots for ${valuation.snapshotDate}: ${deleteError.message}`);
  }

  if (valuation.accounts.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("portfolio_account_snapshots").insert(
    valuation.accounts.map((account) => ({
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
    }))
  );

  if (insertError) {
    throw new Error(`Failed to insert account snapshots for ${valuation.snapshotDate}: ${insertError.message}`);
  }
}

async function resolveServiceRoleKey(): Promise<string> {
  const ssm = new SSMClient({ region: requiredEnv("AWS_REGION") });
  const response = await ssm.send(
    new GetParameterCommand({
      Name: requiredEnv("SUPABASE_SECRET_KEY_SSM_PARAM"),
      WithDecryption: true
    })
  );

  if (!response.Parameter?.Value) {
    throw new Error("Required Supabase service role key SSM parameter could not be resolved.");
  }

  return response.Parameter.Value;
}

async function readTable<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
  mapRow: (row: Record<string, unknown>) => T
): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select).returns<Record<string, unknown>[]>();

  if (error) {
    throw new Error(`Failed to read ${table}: ${error.message}`);
  }

  return data.map(mapRow);
}

async function readSnapshots(supabase: ReturnType<typeof createClient>): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select(snapshotSelect)
    .order("snapshot_date", { ascending: true })
    .returns<SnapshotRow[]>();

  if (error) {
    throw new Error(`Failed to read portfolio_snapshots: ${error.message}`);
  }

  return data;
}

async function readAccountSnapshots(
  supabase: ReturnType<typeof createClient>,
  snapshotIds: string[]
): Promise<AccountSnapshotRow[]> {
  if (snapshotIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("portfolio_account_snapshots")
    .select(accountSnapshotSelect)
    .in("portfolio_snapshot_id", snapshotIds)
    .returns<AccountSnapshotRow[]>();

  if (error) {
    throw new Error(`Failed to read portfolio_account_snapshots: ${error.message}`);
  }

  return data;
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  return grouped;
}

function canonicalWarnings(value: unknown): string {
  const warnings = Array.isArray(value) ? (value as SnapshotWarning[]) : [];
  return JSON.stringify(
    warnings
      .map((warning) => ({
        code: warning.code,
        accountId: warning.accountId,
        accountName: warning.accountName,
        instrumentId: warning.instrumentId,
        instrumentName: warning.instrumentName,
        currency: warning.currency
      }))
      .sort((left, right) =>
        `${left.code}:${left.accountId}:${left.instrumentId}:${left.currency}`.localeCompare(
          `${right.code}:${right.accountId}:${right.instrumentId}:${right.currency}`
        )
      )
  );
}

function displayValue(value: string | null): string {
  return value === null ? "null" : value;
}

function sameNumeric(left: string | null, right: string | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return new Decimal(left).eq(new Decimal(right));
}

function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

const accountSelect = [
  "id",
  "name",
  "broker",
  "account_type",
  "base_currency",
  "market_region",
  "notes",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at"
].join(", ");

const instrumentSelect = [
  "id",
  "symbol",
  "name",
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
  "portfolio_snapshot_id",
  "snapshot_date",
  "account_id",
  "account_name",
  "market_value_usd",
  "cost_usd",
  "unrealized_gain_usd",
  "daily_change_usd",
  "daily_change_pct",
  "warnings"
].join(", ");

function mapAccountRow(row: Record<string, unknown>): InvestmentAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    broker: nullableString(row.broker),
    accountType: row.account_type as InvestmentAccount["accountType"],
    baseCurrency: row.base_currency as InvestmentAccount["baseCurrency"],
    marketRegion: row.market_region as InvestmentAccount["marketRegion"],
    notes: nullableString(row.notes),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapInstrumentRow(row: Record<string, unknown>): Instrument {
  return {
    id: String(row.id),
    symbol: nullableString(row.symbol),
    name: String(row.name),
    description: nullableString(row.description),
    marketRegion: row.market_region as Instrument["marketRegion"],
    exchange: nullableString(row.exchange),
    currency: row.currency as Instrument["currency"],
    assetType: row.asset_type as Instrument["assetType"],
    isin: nullableString(row.isin),
    provider: nullableString(row.provider),
    priceSource: row.price_source as Instrument["priceSource"],
    priceSourceSymbol: nullableString(row.price_source_symbol),
    priceSourceExchange: nullableString(row.price_source_exchange),
    priceUpdateEnabled: Boolean(row.price_update_enabled),
    priceUpdatePriority: Number(row.price_update_priority),
    sourceUrl: nullableString(row.source_url),
    sourceCheckedAt: nullableString(row.source_checked_at),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    notes: nullableString(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTransactionRow(row: Record<string, unknown>): InvestmentTransaction {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    instrumentId: String(row.instrument_id),
    transactionType: row.transaction_type as InvestmentTransaction["transactionType"],
    tradeDate: String(row.trade_date),
    settlementDate: nullableString(row.settlement_date),
    quantity: nullableString(row.quantity),
    price: nullableString(row.price),
    grossAmount: nullableString(row.gross_amount),
    fee: String(row.fee),
    tax: String(row.tax),
    currency: row.currency as InvestmentTransaction["currency"],
    adjustmentDirection: row.adjustment_direction as InvestmentTransaction["adjustmentDirection"],
    transactionSource: row.transaction_source as InvestmentTransaction["transactionSource"],
    linkedTransactionId: nullableString(row.linked_transaction_id),
    settlementCurrency: row.settlement_currency as InvestmentTransaction["settlementCurrency"],
    settlementAmount: nullableString(row.settlement_amount),
    notes: nullableString(row.notes),
    createdByUserId: nullableString(row.created_by_user_id),
    updatedByUserId: nullableString(row.updated_by_user_id),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapPriceRow(row: Record<string, unknown>): PriceRecord {
  return {
    id: String(row.id),
    instrumentId: String(row.instrument_id),
    priceDate: String(row.price_date),
    closePrice: String(row.close_price),
    currency: row.currency as PriceRecord["currency"],
    source: nullableString(row.provider),
    sourceSymbol: nullableString(row.source_symbol),
    isAdjusted: Boolean(row.is_adjusted),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapExchangeRateRow(row: Record<string, unknown>): ExchangeRateRecord {
  return {
    id: String(row.id),
    rateDate: String(row.rate_date),
    fromCurrency: row.from_currency as ExchangeRateRecord["fromCurrency"],
    toCurrency: row.to_currency as ExchangeRateRecord["toCurrency"],
    rate: String(row.rate),
    rateType: row.rate_type as ExchangeRateRecord["rateType"],
    provider: String(row.provider),
    providerRateDate: nullableString(row.provider_rate_date),
    fetchedAt: nullableString(row.fetched_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
