import assert from "node:assert/strict";
import type {
  FxRateRecord,
  HoldingSummary,
  InvestmentAccount,
  PriceRecord
} from "@family-ledger/shared";
import { calculateDashboardSummary } from "../apps/api/src/services/dashboardService";

const accounts = [account("account-a"), account("account-b"), account("empty-account")];
const usdSecurity = holding("usd-security", "US ETF", "etf", "USD", "2", "100");
const nzdSecurity = holding("nzd-security", "NZ Fund", "pie_fund", "NZD", "3", "90");
const usdCash = holding("usd-cash", "USD Cash", "cash", "USD", "10", null);
const holdings = [usdSecurity, nzdSecurity, usdCash];
const prices = [
  price("usd-latest", usdSecurity.instrumentId, "2026-05-22", "70", "USD"),
  price("usd-previous", usdSecurity.instrumentId, "2026-05-21", "65", "USD"),
  price("nzd-latest", nzdSecurity.instrumentId, "2026-05-22", "40", "NZD"),
  price("nzd-previous", nzdSecurity.instrumentId, "2026-05-21", "39", "NZD")
];
const fxRates = [fxRate("usd-nzd", "USD", "1.5")];

const complete = calculateDashboardSummary(holdings, accounts, prices, fxRates);
assert.deepEqual(complete, {
  reportingCurrency: "NZD",
  totalAssets: "345.00",
  todayChange: "18.00",
  todayChangePct: "5.50",
  unrealizedGain: "90.00",
  accountCount: 3,
  warnings: []
});

const missingLatest = calculateDashboardSummary(
  holdings,
  accounts,
  prices.filter((record) => record.instrumentId !== nzdSecurity.instrumentId),
  fxRates
);
assert.equal(missingLatest.totalAssets, null);
assert.equal(missingLatest.todayChange, null);
assert.equal(missingLatest.todayChangePct, null);
assert.equal(missingLatest.unrealizedGain, null);
assert.deepEqual(missingLatest.warnings.map((warning) => warning.code), ["MISSING_LATEST_PRICE"]);

const missingPrevious = calculateDashboardSummary(
  holdings,
  accounts,
  prices.filter((record) => record.id !== "nzd-previous"),
  fxRates
);
assert.equal(missingPrevious.totalAssets, "345.00");
assert.equal(missingPrevious.todayChange, null);
assert.equal(missingPrevious.todayChangePct, null);
assert.equal(missingPrevious.unrealizedGain, "90.00");
assert.deepEqual(missingPrevious.warnings.map((warning) => warning.code), ["MISSING_PREVIOUS_PRICE"]);

const missingFx = calculateDashboardSummary(holdings, accounts, prices, []);
assert.equal(missingFx.totalAssets, null);
assert.equal(missingFx.todayChange, null);
assert.equal(missingFx.todayChangePct, null);
assert.equal(missingFx.unrealizedGain, null);
assert.deepEqual(missingFx.warnings.map((warning) => warning.code), ["MISSING_FX_RATE", "MISSING_FX_RATE"]);

const missingCost = calculateDashboardSummary(
  [usdSecurity, { ...nzdSecurity, costAmount: null }, usdCash],
  accounts,
  prices,
  fxRates
);
assert.equal(missingCost.totalAssets, "345.00");
assert.equal(missingCost.todayChange, "18.00");
assert.equal(missingCost.todayChangePct, "5.50");
assert.equal(missingCost.unrealizedGain, null);
assert.deepEqual(missingCost.warnings.map((warning) => warning.code), ["COST_BASIS_UNAVAILABLE"]);

const zeroPrior = calculateDashboardSummary(
  [holding("new-position", "New Position", "stock", "NZD", "1", "0")],
  [],
  [
    price("new-latest", "new-position", "2026-05-22", "10", "NZD"),
    price("new-previous", "new-position", "2026-05-21", "0", "NZD")
  ],
  []
);
assert.equal(zeroPrior.totalAssets, "10.00");
assert.equal(zeroPrior.todayChange, "10.00");
assert.equal(zeroPrior.todayChangePct, null);

const rounded = calculateDashboardSummary(
  [holding("rounded-position", "Rounded Position", "stock", "NZD", "1", "0")],
  [],
  [
    price("rounded-latest", "rounded-position", "2026-05-22", "1.005", "NZD"),
    price("rounded-previous", "rounded-position", "2026-05-21", "0", "NZD")
  ],
  []
);
assert.equal(rounded.totalAssets, "1.01");

console.log("Dashboard calculation verification: success");

function account(id: string): InvestmentAccount {
  return {
    id,
    name: id,
    broker: null,
    accountType: "brokerage",
    baseCurrency: "NZD",
    marketRegion: "NZ",
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function holding(
  instrumentId: string,
  instrumentName: string,
  assetType: HoldingSummary["assetType"],
  currency: HoldingSummary["currency"],
  quantity: string,
  costAmount: string | null
): HoldingSummary {
  return {
    accountId: "account-a",
    accountName: "Account",
    instrumentId,
    instrumentSymbol: null,
    instrumentName,
    assetType,
    currency,
    quantity,
    averageUnitCost: costAmount,
    costAmount,
    warnings: costAmount === null && assetType !== "cash" ? ["COST_BASIS_UNAVAILABLE"] : []
  };
}

function price(
  id: string,
  instrumentId: string,
  priceDate: string,
  closePrice: string,
  currency: PriceRecord["currency"]
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

function fxRate(id: string, fromCurrency: FxRateRecord["fromCurrency"], rate: string): FxRateRecord {
  return {
    id,
    fromCurrency,
    toCurrency: "NZD",
    rateDate: "2026-05-22",
    rate,
    source: "manual",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z"
  };
}
