import assert from "node:assert/strict";
import {
  calculateHoldings,
  calculatePortfolioSnapshotValuation,
  convertSnapshotAmount,
  type AccountType,
  type AssetType,
  type CurrencyCode,
  type ExchangeRateRecord,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type JobRun,
  type MarketRegion,
  type PortfolioSnapshotValuation,
  type PriceRecord,
  type PriceSource
} from "@family-ledger/shared";
import { generatePortfolioSnapshot } from "../apps/jobs/src/services/portfolioSnapshotGenerationService";

const snapshotDate = "2026-05-22";
const accounts = [account("account-a", "Hatch"), account("account-b", "InvestNow")];
const instruments = [
  instrument("usd-security", "US ETF", "USD", "etf"),
  instrument("nzd-security", "NZ Fund", "NZD", "pie_fund"),
  instrument("usd-cash", "USD Cash", "USD", "cash"),
  instrument("cny-cash", "CNY Cash", "CNY", "cash")
];
const transactions = [
  transaction("t1", "account-a", "usd-security", "buy", "2026-05-20", "2", "50", "100", "USD"),
  transaction("t2", "account-b", "nzd-security", "buy", "2026-05-20", "3", "30", "90", "NZD"),
  transaction("t3", "account-a", "usd-cash", "deposit", "2026-05-20", null, null, "10", "USD"),
  transaction("t4", "account-b", "cny-cash", "deposit", "2026-05-20", null, null, "100", "CNY"),
  transaction("future", "account-a", "usd-security", "buy", "2026-05-23", "100", "1", "100", "USD")
];
const prices = [
  price("p1", "usd-security", "2026-05-22", "70", "USD"),
  price("p2", "usd-security", "2026-05-21", "65", "USD"),
  price("future-price", "usd-security", "2026-05-23", "1000", "USD"),
  price("p3", "nzd-security", "2026-05-22", "40", "NZD"),
  price("p4", "nzd-security", "2026-05-21", "39", "NZD")
];
const rates = [
  rate("r1", "NZD", "2026-05-22", "0.6"),
  rate("r2", "CNY", "2026-05-22", "0.14"),
  rate("future-rate", "NZD", "2026-05-23", "0.9")
];

const holdings = calculateHoldings(
  transactions.filter((record) => record.tradeDate <= snapshotDate),
  accounts,
  instruments
);
const complete = calculatePortfolioSnapshotValuation({
  snapshotDate,
  holdings,
  accounts,
  prices,
  fxRates: rates
});

assert.equal(complete.marketValueUsd, "236.000000");
assert.equal(complete.costUsd, "178.000000");
assert.equal(complete.unrealizedGainUsd, "58.000000");
assert.equal(complete.dailyChangeUsd, "11.800000");
assert.equal(complete.dailyChangePct, "5.26315789");
assert.equal(complete.usdToNzdRate, "1.6666666667");
assert.equal(complete.usdToCnyRate, "7.1428571429");
assert.equal(convertSnapshotAmount(complete.marketValueUsd, "NZD", complete), "393.33");
assert.equal(convertSnapshotAmount(complete.marketValueUsd, "CNY", complete), "1685.71");
assert.equal(complete.accounts.length, 2);
assert.equal(complete.accounts.find((row) => row.accountId === "account-a")?.marketValueUsd, "150.000000");
assert.equal(complete.accounts.find((row) => row.accountId === "account-b")?.marketValueUsd, "86.000000");
assert.deepEqual(complete.warnings, []);

const missingLatest = calculatePortfolioSnapshotValuation({
  snapshotDate,
  holdings,
  accounts,
  prices: prices.filter((record) => record.instrumentId !== "nzd-security"),
  fxRates: rates
});
assert.equal(missingLatest.marketValueUsd, null);
assert.equal(missingLatest.costUsd, null);
assert.equal(missingLatest.unrealizedGainUsd, null);
assert.equal(missingLatest.dailyChangeUsd, null);
assert.deepEqual(missingLatest.warnings.map((warning) => warning.code), ["MISSING_LATEST_PRICE"]);

const missingPrevious = calculatePortfolioSnapshotValuation({
  snapshotDate,
  holdings,
  accounts,
  prices: prices.filter((record) => record.id !== "p4"),
  fxRates: rates
});
assert.equal(missingPrevious.marketValueUsd, "236.000000");
assert.equal(missingPrevious.dailyChangeUsd, null);
assert.equal(missingPrevious.unrealizedGainUsd, "58.000000");
assert.deepEqual(missingPrevious.warnings.map((warning) => warning.code), ["MISSING_PREVIOUS_PRICE"]);

const missingFx = calculatePortfolioSnapshotValuation({
  snapshotDate,
  holdings,
  accounts,
  prices,
  fxRates: rates.filter((record) => record.fromCurrency !== "CNY")
});
assert.equal(missingFx.marketValueUsd, null);
assert.equal(missingFx.dailyChangeUsd, null);
assert.deepEqual(missingFx.warnings.map((warning) => warning.code), ["MISSING_FX_RATE"]);

const unavailableCost = calculatePortfolioSnapshotValuation({
  snapshotDate,
  holdings: holdings.map((holding) =>
    holding.instrumentId === "nzd-security" ? { ...holding, costAmount: null, averageUnitCost: null } : holding
  ),
  accounts,
  prices,
  fxRates: rates
});
assert.equal(unavailableCost.marketValueUsd, "236.000000");
assert.equal(unavailableCost.costUsd, null);
assert.equal(unavailableCost.unrealizedGainUsd, null);
assert.equal(unavailableCost.dailyChangeUsd, "11.800000");
assert.deepEqual(unavailableCost.warnings.map((warning) => warning.code), ["COST_BASIS_UNAVAILABLE"]);

void main();

async function main(): Promise<void> {
  const generatedSnapshots = new Map<string, PortfolioSnapshotValuation>();
  const firstGeneration = await generatePortfolioSnapshot({
    snapshotDate,
    startedAt: "2026-05-22T01:00:00.000Z",
    now: () => new Date("2026-05-22T01:00:01.000Z"),
    snapshotRepository: fakeSnapshotRepository(generatedSnapshots),
    jobRunRepository: fakeJobRunRepository()
  });
  const secondGeneration = await generatePortfolioSnapshot({
    snapshotDate,
    startedAt: "2026-05-22T01:05:00.000Z",
    now: () => new Date("2026-05-22T01:05:01.000Z"),
    snapshotRepository: fakeSnapshotRepository(generatedSnapshots),
    jobRunRepository: fakeJobRunRepository()
  });
  assert.equal(firstGeneration.snapshotId, secondGeneration.snapshotId);
  assert.equal(generatedSnapshots.size, 1);
  assert.equal(generatedSnapshots.get(snapshotDate)?.marketValueUsd, "236.000000");

  console.log("Portfolio snapshot calculation verification: success");
}

function fakeSnapshotRepository(store: Map<string, PortfolioSnapshotValuation>) {
  return {
    listSnapshotAccounts: async () => accounts,
    listSnapshotInstruments: async () => instruments,
    listSnapshotTransactions: async (date: string) => transactions.filter((record) => record.tradeDate <= date),
    listSnapshotPrices: async (date: string) => prices.filter((record) => record.priceDate <= date),
    listSnapshotExchangeRates: async (date: string) => rates.filter((record) => record.rateDate <= date),
    upsertPortfolioSnapshot: async (valuation: PortfolioSnapshotValuation) => {
      store.set(valuation.snapshotDate, valuation);
      return { snapshotId: `snapshot-${valuation.snapshotDate}`, accountsWritten: valuation.accounts.length };
    }
  };
}

function fakeJobRunRepository() {
  return {
    createJobRun: async (input: { jobName: string; jobStartedAt: string }): Promise<JobRun> =>
      jobRun("job-started", input.jobName, "started", input.jobStartedAt),
    finishJobRun: async (
      id: string,
      input: {
        status: "succeeded" | "failed";
        finishedAt: string;
        recordsInserted?: number;
        recordsSkipped?: number;
        errorMessage?: string | null;
      }
    ): Promise<JobRun> => ({
      ...jobRun(id, "generate-portfolio-snapshots", input.status, "2026-05-22T01:00:00.000Z"),
      jobFinishedAt: input.finishedAt,
      recordsInserted: input.recordsInserted ?? 0,
      recordsSkipped: input.recordsSkipped ?? 0,
      errorMessage: input.errorMessage ?? null
    })
  };
}

function account(id: string, name: string): InvestmentAccount {
  return {
    id,
    name,
    broker: null,
    accountType: "brokerage" satisfies AccountType,
    baseCurrency: "USD",
    marketRegion: "US",
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function instrument(
  id: string,
  name: string,
  currency: CurrencyCode,
  assetType: AssetType
): Instrument {
  return {
    id,
    symbol: id,
    name,
    description: null,
    marketRegion: "US" satisfies MarketRegion,
    exchange: "TEST",
    currency,
    assetType,
    isin: null,
    provider: null,
    priceSource: "manual" satisfies PriceSource,
    priceSourceSymbol: id,
    priceSourceExchange: null,
    priceUpdateEnabled: false,
    priceUpdatePriority: 9,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function transaction(
  id: string,
  accountId: string,
  instrumentId: string,
  transactionType: InvestmentTransaction["transactionType"],
  tradeDate: string,
  quantity: string | null,
  priceValue: string | null,
  grossAmount: string | null,
  currency: CurrencyCode
): InvestmentTransaction {
  return {
    id,
    accountId,
    instrumentId,
    transactionType,
    tradeDate,
    settlementDate: null,
    quantity,
    price: priceValue,
    grossAmount,
    fee: "0",
    tax: "0",
    currency,
    adjustmentDirection: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `${tradeDate}T00:00:00.000Z`,
    updatedAt: `${tradeDate}T00:00:00.000Z`
  };
}

function price(
  id: string,
  instrumentId: string,
  priceDate: string,
  closePrice: string,
  currency: CurrencyCode
): PriceRecord {
  return {
    id,
    instrumentId,
    priceDate,
    closePrice,
    currency,
    source: "manual",
    sourceSymbol: null,
    isAdjusted: false,
    createdAt: `${priceDate}T00:00:00.000Z`,
    updatedAt: `${priceDate}T00:00:00.000Z`
  };
}

function rate(id: string, fromCurrency: CurrencyCode, rateDate: string, rateValue: string): ExchangeRateRecord {
  return {
    id,
    rateDate,
    fromCurrency,
    toCurrency: "USD",
    rate: rateValue,
    rateType: "valuation",
    provider: "manual",
    providerRateDate: rateDate,
    fetchedAt: `${rateDate}T00:00:00.000Z`,
    createdAt: `${rateDate}T00:00:00.000Z`,
    updatedAt: `${rateDate}T00:00:00.000Z`
  };
}

function jobRun(
  id: string,
  jobName: string,
  status: JobRun["status"],
  startedAt: string
): JobRun {
  return {
    id,
    jobName,
    status,
    jobStartedAt: startedAt,
    jobFinishedAt: null,
    recordsInserted: 0,
    recordsSkipped: 0,
    errorMessage: null,
    createdAt: startedAt,
    updatedAt: startedAt
  };
}
