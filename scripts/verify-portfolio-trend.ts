import assert from "node:assert/strict";
import Decimal from "decimal.js";
import type { ExchangeRateRecord, InvestmentTransaction, PortfolioSnapshotSummary } from "@family-ledger/shared";
import {
  buildPortfolioTrend,
  buildSampledPortfolioPoints,
  calculatePrincipalPoints,
  getTrendRangeStart,
  type PrincipalEvent
} from "../apps/api/src/services/portfolioSnapshotService";

const rates: ExchangeRateRecord[] = [
  valuationRate("CNY", "2026-01-15", "0.1400000000"),
  valuationRate("NZD", "2026-01-15", "0.6000000000"),
  valuationRate("CNY", "2026-02-15", "0.1500000000"),
  valuationRate("NZD", "2026-02-15", "0.6000000000"),
  valuationRate("HKD", "2026-02-15", "0.1280000000"),
  valuationRate("NZD", "2026-03-15", "0.6000000000")
];

const principalEvents: PrincipalEvent[] = [
  { date: "2026-01-15", currency: "CNY", amount: decimal("7000") },
  { date: "2026-01-15", currency: "NZD", amount: decimal("500") },
  { date: "2026-02-15", currency: "USD", amount: decimal("100") },
  { date: "2026-02-15", currency: "HKD", amount: decimal("-780") }
];

const snapshots: PortfolioSnapshotSummary[] = [
  snapshot("2026-03-14", "100"),
  snapshot("2026-03-15", "110"),
  snapshot("2026-04-14", "120"),
  snapshot("2026-05-15", "130"),
  snapshot("2026-06-13", "140")
];

void main();

async function main(): Promise<void> {
  const principal = calculatePrincipalPoints({
    events: principalEvents,
    exactFxRates: rates,
    currency: "NZD",
    rangeStart: "2026-02-01",
    rangeEnd: "2026-03-15",
    inceptionDate: "2026-01-15"
  });

  assert.equal(principal.inceptionDate, "2026-01-15");
  assert.equal(principal.currentTotalInvestment, "2133.600000");
  assert.deepEqual(principal.principalPoints, [
    { date: "2026-02-01", totalInvestment: "2133.333333" },
    { date: "2026-02-15", totalInvestment: "2133.600000" },
    { date: "2026-03-15", totalInvestment: "2133.600000" }
  ]);
  assert.deepEqual(principal.warnings, []);

  const missingFx = calculatePrincipalPoints({
    events: [{ date: "2026-04-01", currency: "CNY", amount: decimal("100") }],
    exactFxRates: [],
    currency: "NZD",
    rangeStart: "2026-04-01",
    rangeEnd: "2026-04-30",
    inceptionDate: "2026-04-01"
  });

  assert.equal(missingFx.currentTotalInvestment, null);
  assert.equal(missingFx.principalPoints.every((point) => point.totalInvestment === null), true);
  assert.equal(missingFx.warnings.length, 2);

  assert.equal(getTrendRangeStart("inception", "2026-06-15", "2026-01-15"), "2026-01-15");
  assert.equal(getTrendRangeStart("3m", "2026-06-15", "2026-01-15"), "2026-03-15");

  const oneYearDaily = buildSampledPortfolioPoints({
    snapshots,
    range: "1y",
    rangeStart: "2026-03-15",
    rangeEnd: "2026-06-15"
  });

  assert.deepEqual(oneYearDaily.map((point) => [point.date, point.portfolioValue, point.snapshotDate]), [
    ["2026-03-15", "110", "2026-03-15"],
    ["2026-04-14", "120", "2026-04-14"],
    ["2026-05-15", "130", "2026-05-15"],
    ["2026-06-13", "140", "2026-06-13"],
    ["2026-06-15", "140", "2026-06-13"]
  ]);

  const shortRangeDaily = buildSampledPortfolioPoints({
    snapshots,
    range: "3m",
    rangeStart: "2026-05-22",
    rangeEnd: "2026-06-15"
  });

  assert.deepEqual(shortRangeDaily.map((point) => [point.date, point.portfolioValue, point.snapshotDate]), [
    ["2026-05-22", "130", "2026-05-15"],
    ["2026-06-13", "140", "2026-06-13"],
    ["2026-06-15", "140", "2026-06-13"]
  ]);

  const longRangeWeekly = buildSampledPortfolioPoints({
    snapshots,
    range: "3y",
    rangeStart: "2024-06-15",
    rangeEnd: "2026-06-15"
  });
  const longRangeDates = longRangeWeekly.map((point) => point.date);
  assert.equal(longRangeDates.includes("2026-06-08"), true);
  assert.equal(longRangeDates.includes("2026-06-15"), true);
  assert.equal(longRangeDates.includes("2026-06-13"), false);

  const historicalTrend = await buildPortfolioTrend({
    currency: "NZD",
    range: "1m",
    today: "2026-03-15",
    snapshots,
    principalTransactions: [],
    exactFxRates: []
  });

  assert.equal(historicalTrend.summary.rangeEnd, "2026-03-15");
  assert.equal(historicalTrend.points.at(-1)?.date, "2026-03-15");
  assert.equal(historicalTrend.points.some((point) => point.date > "2026-03-15"), false);

  const clampedTrend = await buildPortfolioTrend({
    currency: "NZD",
    range: "3m",
    today: "2026-06-15",
    snapshots,
    principalTransactions: [
      transaction("2026-05-22", "opening_balance", "NZD", "1000"),
      transaction("2026-05-27", "deposit", "NZD", "100")
    ],
    exactFxRates: []
  });

  assert.equal(clampedTrend.summary.rangeStart, "2026-05-22");
  assert.equal(clampedTrend.points[0]?.date, "2026-05-22");
  assert.equal(clampedTrend.points.some((point) => point.date < "2026-05-22"), false);
  assert.deepEqual(
    clampedTrend.points.find((point) => point.date === "2026-05-27"),
    {
      date: "2026-05-27",
      portfolioValue: "130",
      snapshotDate: "2026-05-15",
      liveValue: null,
      totalInvestment: "1100.000000"
    }
  );

  console.log("Portfolio trend verification: success");
}

function decimal(value: string) {
  return new Decimal(value);
}

function valuationRate(fromCurrency: ExchangeRateRecord["fromCurrency"], rateDate: string, rate: string): ExchangeRateRecord {
  return {
    id: `${fromCurrency}:${rateDate}`,
    fromCurrency,
    toCurrency: "USD",
    rateDate,
    rate,
    rateType: "valuation",
    provider: "test",
    providerRateDate: rateDate,
    fetchedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function snapshot(snapshotDate: string, marketValue: string): PortfolioSnapshotSummary {
  return {
    id: `snapshot-${snapshotDate}`,
    snapshotDate,
    currency: "NZD",
    marketValue,
    cost: null,
    unrealizedGain: null,
    dailyChange: null,
    dailyChangePct: null,
    usdToNzdRate: "0.6000000000",
    usdToCnyRate: "0.1400000000",
    warnings: [],
    accounts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function transaction(
  tradeDate: string,
  transactionType: "opening_balance" | "deposit",
  currency: "NZD",
  grossAmount: string
): InvestmentTransaction {
  return {
    id: `transaction-${tradeDate}`,
    accountId: "account",
    instrumentId: "cash",
    instrumentSymbol: "CASH_NZD",
    instrumentName: "NZD Cash",
    instrumentShortName: "NZD现金",
    instrumentAssetType: "cash",
    transactionType,
    tradeDate,
    settlementDate: null,
    quantity: null,
    price: null,
    grossAmount,
    fee: "0",
    tax: "0",
    currency,
    adjustmentDirection: null,
    transactionSource: "manual",
    linkedTransactionId: null,
    settlementCurrency: null,
    settlementAmount: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `${tradeDate}T00:00:00.000Z`,
    updatedAt: `${tradeDate}T00:00:00.000Z`
  };
}
