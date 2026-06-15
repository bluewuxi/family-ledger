import assert from "node:assert/strict";
import Decimal from "decimal.js";
import type { ExchangeRateRecord, PortfolioSnapshotSummary } from "@family-ledger/shared";
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

  const monthly = buildSampledPortfolioPoints({
    snapshots,
    range: "1y",
    rangeStart: "2026-03-15",
    rangeEnd: "2026-06-15"
  });

  assert.deepEqual(monthly.map((point) => [point.date, point.portfolioValue, point.snapshotDate]), [
    ["2026-03-15", "110", "2026-03-15"],
    ["2026-04-15", "120", "2026-04-14"],
    ["2026-05-15", "130", "2026-05-15"],
    ["2026-06-15", "140", "2026-06-13"]
  ]);

  const weekly = buildSampledPortfolioPoints({
    snapshots,
    range: "3m",
    rangeStart: "2026-05-25",
    rangeEnd: "2026-06-15"
  });

  assert.deepEqual(weekly.map((point) => [point.date, point.portfolioValue, point.snapshotDate]), [
    ["2026-05-25", "130", "2026-05-15"],
    ["2026-06-01", "130", "2026-05-15"],
    ["2026-06-08", "130", "2026-05-15"],
    ["2026-06-15", "140", "2026-06-13"]
  ]);

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
