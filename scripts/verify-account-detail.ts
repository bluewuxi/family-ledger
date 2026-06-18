import assert from "node:assert/strict";
import {
  convertSnapshotAmount,
  type AccountDetailSnapshotPoint,
  type HoldingSummary,
  type SnapshotWarning
} from "@family-ledger/shared";
import { calculateHoldingsValuation } from "../apps/api/src/services/portfolioValuationService";
import { buildAccountTrend } from "../apps/api/src/services/accountDetailService";

const accountAHoldings: HoldingSummary[] = [
  holding("account-a", "a-stock", "A Stock", "stock", "USD", "2", "100"),
  holding("account-a", "a-cash", "USD Cash", "cash", "USD", "25", null)
];
const accountBHoldings: HoldingSummary[] = [
  holding("account-b", "b-stock", "B Stock", "stock", "USD", "1", "10")
];
const fxRates = [fxRate("USD", "1")];
const accountAPrices = [price("a-stock", "2026-06-15", "80", "USD"), price("a-stock-prev", "2026-06-14", "75", "USD")];
const allPrices = accountAPrices;

void main()
  .then(() => {
    console.log("Account detail verification: success");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function main(): Promise<void> {
  const accountOnlyValuation = calculateHoldingsValuation(accountAHoldings, accountAPrices, fxRates, "USD");
  assert.equal(accountOnlyValuation.totalMarketValue, "185.00");
  assert.equal(accountOnlyValuation.totalUnrealizedGain, "60.00");
  assert.deepEqual(accountOnlyValuation.warnings, []);

  const crossAccountValuation = calculateHoldingsValuation([...accountAHoldings, ...accountBHoldings], allPrices, fxRates, "USD");
  assert.equal(crossAccountValuation.totalMarketValue, null);
  assert.deepEqual(crossAccountValuation.warnings.map((warning) => warning.code), ["MISSING_LATEST_PRICE"]);

  assert.equal(convertSnapshotAmount("100", "NZD", { usdToNzdRate: "1.6000000000", usdToCnyRate: "7.2000000000" }), "160.00");
  assert.equal(convertSnapshotAmount("100", "CNY", { usdToNzdRate: "1.6000000000", usdToCnyRate: "7.2000000000" }), "720.00");

  const snapshotWarning: SnapshotWarning = {
    code: "MISSING_LATEST_PRICE",
    accountId: "account-a",
    accountName: "Account A",
    instrumentId: "a-stock",
    instrumentName: "A Stock",
    instrumentShortName: "A Stock",
    currency: "USD"
  };
  const trend = await buildAccountTrend({
    accountId: "account-a",
    currency: "USD",
    range: "3m",
    today: "2026-06-18",
    rows: [
      trendRow("2026-01-15", "80", [snapshotWarning]),
      trendRow("2026-03-18", "100", []),
      trendRow("2026-04-18", "120", [snapshotWarning]),
      trendRow("2026-06-17", "185", [snapshotWarning])
    ]
  });

  assert.equal(trend.rangeStart, "2026-03-18");
  assert.equal(trend.rangeEnd, "2026-06-18");
  assert.deepEqual(trend.points.map((point) => [point.date, point.marketValue, point.snapshotDate]), [
    ["2026-03-18", "100", "2026-03-18"],
    ["2026-04-18", "120", "2026-04-18"],
    ["2026-06-17", "185", "2026-06-17"],
    ["2026-06-18", "185", "2026-06-17"]
  ]);
  assert.equal(trend.warnings.length, 1);

  const resolvedOldWarningTrend = await buildAccountTrend({
    accountId: "account-a",
    currency: "USD",
    range: "1m",
    today: "2026-06-18",
    rows: [
      trendRow("2026-01-15", "80", [snapshotWarning]),
      trendRow("2026-05-18", "160", []),
      trendRow("2026-06-17", "185", [])
    ]
  });
  assert.deepEqual(resolvedOldWarningTrend.points.map((point) => point.snapshotDate), [
    "2026-05-18",
    "2026-06-17",
    "2026-06-17"
  ]);
  assert.deepEqual(resolvedOldWarningTrend.warnings, []);

  const carryForwardWarningTrend = await buildAccountTrend({
    accountId: "account-a",
    currency: "USD",
    range: "1m",
    today: "2026-06-18",
    rows: [
      trendRow("2026-05-01", "150", [snapshotWarning]),
      trendRow("2026-06-17", "185", [])
    ]
  });
  assert.deepEqual(carryForwardWarningTrend.points.map((point) => point.snapshotDate), [
    "2026-05-01",
    "2026-06-17",
    "2026-06-17"
  ]);
  assert.equal(carryForwardWarningTrend.warnings.length, 1);
}

function holding(
  accountId: string,
  instrumentId: string,
  name: string,
  assetType: HoldingSummary["assetType"],
  currency: HoldingSummary["currency"],
  quantity: string,
  costAmount: string | null
): HoldingSummary {
  return {
    accountId,
    accountName: accountId,
    instrumentId,
    instrumentSymbol: null,
    instrumentName: name,
    instrumentShortName: name,
    assetType,
    currency,
    quantity,
    averageUnitCost: costAmount,
    costAmount,
    costAmountUsd: costAmount,
    warnings: []
  };
}

function price(
  id: string,
  priceDate: string,
  closePrice: string,
  currency: "USD"
) {
  return {
    id,
    instrumentId: id === "a-stock-prev" ? "a-stock" : id,
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

function fxRate(fromCurrency: "USD", rate: string) {
  return {
    id: fromCurrency,
    fromCurrency,
    toCurrency: "USD" as const,
    rateDate: "2026-06-15",
    rate,
    rateType: "valuation" as const,
    provider: "manual",
    providerRateDate: "2026-06-15",
    fetchedAt: "2026-06-15T00:00:00.000Z",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}

function trendRow(
  snapshotDate: string,
  marketValue: string,
  warnings: SnapshotWarning[]
): AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] } {
  return {
    date: snapshotDate,
    snapshotDate,
    marketValue,
    warnings
  };
}
