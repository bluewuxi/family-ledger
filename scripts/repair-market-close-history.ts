import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateHoldings,
  calculatePortfolioSnapshotValuation,
  type ExchangeRateRecord,
  type Instrument,
  type InstrumentPriceRecord,
  type InvestmentAccount,
  type InvestmentTransaction,
  type PortfolioSnapshotValuation,
  type PriceRecord
} from "@family-ledger/shared";
import { findSuspectMarketClosePrices } from "../apps/jobs/src/services/marketClosePolicy";

interface SnapshotRow {
  id: string;
  snapshot_date: string;
}

interface RepairPriceRecord extends InstrumentPriceRecord {
  priceSource: Instrument["priceSource"];
  sourceExchange: string | null;
  instrumentName: string;
  instrumentSymbol: string | null;
}

export interface MarketCloseRepairPlan {
  suspectPrices: Array<
    RepairPriceRecord & {
      reason: string;
      checkedAt: string;
    }
  >;
  affectedSnapshotDates: string[];
}

interface RepairDataSet {
  accounts: InvestmentAccount[];
  instruments: Instrument[];
  transactions: InvestmentTransaction[];
  prices: RepairPriceRecord[];
  rates: ExchangeRateRecord[];
  snapshots: SnapshotRow[];
}

const shouldApply = process.argv.includes("--apply");
const envName = parseEnvName(process.argv);
const prodConfirmation = parseArgValue(process.argv, "--confirm-prod-repair");

if (isMainModule()) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  loadDotenv({ path: `.env.${envName}`, quiet: true });
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const supabaseProjectRef = getSupabaseProjectRef(supabaseUrl);

  const supabase = createClient(supabaseUrl, await resolveServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const data = await readRepairDataSet(supabase);
  const plan = createMarketCloseRepairPlan(data);

  console.log(`Market close history repair (${envName}, ${shouldApply ? "apply" : "dry-run"})`);
  console.log(`Supabase project: ${supabaseProjectRef} (${supabaseUrl})`);
  console.log(`Suspect instrument_prices rows: ${plan.suspectPrices.length}`);

  for (const price of plan.suspectPrices) {
    console.log(
      [
        `- ${price.priceDate}`,
        price.instrumentSymbol ?? price.instrumentId,
        price.instrumentName,
        price.provider,
        price.sourceExchange ?? "unknown-exchange",
        price.closePrice,
        `fetched=${price.fetchedAt ?? "null"}`,
        `created=${price.createdAt}`,
        price.reason
      ].join(" | ")
    );
  }

  if (plan.affectedSnapshotDates.length > 0) {
    console.log(`Affected snapshots: ${plan.affectedSnapshotDates.join(", ")}`);
  }

  if (!shouldApply) {
    console.log("Dry-run only. Re-run with --apply to delete suspect prices and recalculate affected snapshots.");
    return;
  }

  if (envName === "prod" && prodConfirmation !== supabaseProjectRef) {
    throw new Error(`Prod repair requires --confirm-prod-repair=${supabaseProjectRef}.`);
  }

  const backupPath = await writeRepairBackup(envName, supabaseProjectRef, plan);
  console.log(`Repair backup written: ${backupPath}`);

  const result = await applyMarketCloseRepair({
    plan,
    data,
    deleteInstrumentPricesByIds: async (ids) => {
      await deleteInstrumentPricesByIds(supabase, ids);
    },
    upsertSnapshot: async (valuation) => {
      await upsertSnapshot(supabase, valuation);
    }
  });

  console.log(
    `Repair applied: deletedPrices=${result.deletedPrices}, recalculatedSnapshots=${result.recalculatedSnapshots}`
  );
}

export function createMarketCloseRepairPlan(
  data: Pick<RepairDataSet, "prices" | "snapshots" | "transactions" | "rates">
): MarketCloseRepairPlan {
  const suspectPrices = findSuspectMarketClosePrices(data.prices);
  const earliestAffectedDate = suspectPrices.map((price) => price.priceDate).sort()[0] ?? null;
  const suspectIds = new Set(suspectPrices.map((price) => price.id));
  const remainingPrices = data.prices.filter((price) => !suspectIds.has(price.id));
  const affectedSnapshotDates =
    earliestAffectedDate === null
      ? []
      : uniqueSorted([
          ...data.snapshots
            .map((snapshot) => snapshot.snapshot_date)
            .filter((snapshotDate) => snapshotDate >= earliestAffectedDate),
          ...getExpectedSnapshotDates(data.transactions, remainingPrices, data.rates).filter(
            (snapshotDate) => snapshotDate >= earliestAffectedDate
          )
        ]);

  return { suspectPrices, affectedSnapshotDates };
}

export async function applyMarketCloseRepair(input: {
  plan: MarketCloseRepairPlan;
  data: RepairDataSet;
  deleteInstrumentPricesByIds: (ids: string[]) => Promise<void>;
  upsertSnapshot: (valuation: PortfolioSnapshotValuation) => Promise<void>;
}): Promise<{ deletedPrices: number; recalculatedSnapshots: number }> {
  const suspectIds = new Set(input.plan.suspectPrices.map((price) => price.id));

  if (suspectIds.size === 0) {
    return { deletedPrices: 0, recalculatedSnapshots: 0 };
  }

  const remainingPrices = input.data.prices.filter((price) => !suspectIds.has(price.id));

  await input.deleteInstrumentPricesByIds([...suspectIds]);

  for (const snapshotDate of input.plan.affectedSnapshotDates) {
    await input.upsertSnapshot(
      calculateSnapshotValuation(snapshotDate, {
        ...input.data,
        prices: remainingPrices
      })
    );
  }

  return {
    deletedPrices: suspectIds.size,
    recalculatedSnapshots: input.plan.affectedSnapshotDates.length
  };
}

async function writeRepairBackup(
  env: "test" | "prod",
  supabaseProjectRef: string,
  plan: MarketCloseRepairPlan
): Promise<string> {
  const backupDir = path.resolve("tmp", "market-close-repair");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `${env}-${supabaseProjectRef}-${timestamp}.json`);

  await mkdir(backupDir, { recursive: true });
  await writeFile(
    backupPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        env,
        supabaseProjectRef,
        affectedSnapshotDates: plan.affectedSnapshotDates,
        suspectPrices: plan.suspectPrices
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return backupPath;
}

function getExpectedSnapshotDates(
  transactions: InvestmentTransaction[],
  prices: RepairPriceRecord[],
  rates: ExchangeRateRecord[]
): string[] {
  const firstTransactionDate = transactions.reduce<string | null>(
    (earliest, transaction) =>
      earliest === null || transaction.tradeDate < earliest ? transaction.tradeDate : earliest,
    null
  );

  if (!firstTransactionDate) {
    return [];
  }

  const dates = new Set<string>();
  for (const price of prices) {
    if (price.priceDate >= firstTransactionDate && hasRatesForSnapshotDate(price.priceDate, rates)) {
      dates.add(price.priceDate);
    }
  }

  return uniqueSorted([...dates]);
}

function hasRatesForSnapshotDate(snapshotDate: string, rates: ExchangeRateRecord[]): boolean {
  const currencies = new Set(rates.filter((rate) => rate.rateDate <= snapshotDate).map((rate) => rate.fromCurrency));
  return currencies.has("NZD") && currencies.has("CNY");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function calculateSnapshotValuation(
  snapshotDate: string,
  data: Omit<RepairDataSet, "snapshots">
): PortfolioSnapshotValuation {
  const holdings = calculateHoldings(
    data.transactions.filter((transaction) => transaction.tradeDate <= snapshotDate),
    data.accounts,
    data.instruments
  );

  return calculatePortfolioSnapshotValuation({
    snapshotDate,
    holdings,
    accounts: data.accounts,
    prices: data.prices.filter((price) => price.priceDate <= snapshotDate).map(toPriceRecord),
    fxRates: data.rates.filter((rate) => rate.rateDate <= snapshotDate)
  });
}

async function readRepairDataSet(supabase: ReturnType<typeof createClient>): Promise<RepairDataSet> {
  const [accounts, instruments, transactions, priceRows, rates, snapshots] = await Promise.all([
    readTable<InvestmentAccount>(supabase, "investment_accounts", accountSelect, mapAccountRow),
    readTable<Instrument>(supabase, "instruments", instrumentSelect, mapInstrumentRow),
    readTable<InvestmentTransaction>(supabase, "transactions", transactionSelect, mapTransactionRow),
    readTable<InstrumentPriceRecord>(supabase, "instrument_prices", priceSelect, mapInstrumentPriceRow),
    readTable<ExchangeRateRecord>(supabase, "exchange_rates", exchangeRateSelect, mapExchangeRateRow),
    readSnapshots(supabase)
  ]);
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));
  const prices = priceRows.map((price) => {
    const instrument = instrumentsById.get(price.instrumentId);
    if (!instrument) {
      throw new Error(`Instrument price ${price.id} references missing instrument ${price.instrumentId}.`);
    }

    return {
      ...price,
      priceSource: instrument.priceSource,
      sourceExchange: instrument.priceSourceExchange ?? instrument.exchange,
      instrumentName: instrument.name,
      instrumentSymbol: instrument.symbol
    };
  });

  return { accounts, instruments, transactions, prices, rates, snapshots };
}

async function deleteInstrumentPricesByIds(supabase: ReturnType<typeof createClient>, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const { error } = await supabase.from("instrument_prices").delete().in("id", ids);

  if (error) {
    throw new Error(`Failed to delete suspect instrument_prices rows: ${error.message}`);
  }
}

async function upsertSnapshot(
  supabase: ReturnType<typeof createClient>,
  valuation: PortfolioSnapshotValuation
): Promise<void> {
  const { data: snapshot, error: snapshotError } = await supabase
    .from("portfolio_snapshots")
    .upsert(toSnapshotRow(valuation), { onConflict: "snapshot_date" })
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
    .select("id, snapshot_date")
    .order("snapshot_date", { ascending: true })
    .returns<SnapshotRow[]>();

  if (error) {
    throw new Error(`Failed to read portfolio_snapshots: ${error.message}`);
  }

  return data;
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

function toPriceRecord(price: InstrumentPriceRecord): PriceRecord {
  return {
    id: price.id,
    instrumentId: price.instrumentId,
    priceDate: price.priceDate,
    closePrice: price.closePrice,
    currency: price.currency,
    source: price.provider,
    sourceSymbol: price.sourceSymbol,
    isAdjusted: price.isAdjusted,
    createdAt: price.createdAt,
    updatedAt: price.updatedAt
  };
}

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

function parseEnvName(args: string[]): "test" | "prod" {
  const value = parseArgValue(args, "--env") ?? "test";

  if (value !== "test" && value !== "prod") {
    throw new Error("--env must be test or prod.");
  }

  return value;
}

function parseArgValue(args: string[], name: string): string | undefined {
  const inlineArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (inlineArg) {
    return inlineArg.slice(name.length + 1);
  }

  const flagIndex = args.findIndex((arg) => arg === name);
  return flagIndex >= 0 ? args[flagIndex + 1] : undefined;
}

function getSupabaseProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "unknown-project";
  } catch {
    return "unknown-project";
  }
}

function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

function isMainModule(): boolean {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
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

function mapInstrumentPriceRow(row: Record<string, unknown>): InstrumentPriceRecord {
  return {
    id: String(row.id),
    instrumentId: String(row.instrument_id),
    priceDate: String(row.price_date),
    closePrice: String(row.close_price),
    currency: row.currency as InstrumentPriceRecord["currency"],
    provider: String(row.provider),
    sourceSymbol: nullableString(row.source_symbol),
    isAdjusted: Boolean(row.is_adjusted),
    fetchedAt: nullableString(row.fetched_at),
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
