import assert from "node:assert/strict";
import type {
  ExchangeRateRecord,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction,
  PriceRecord
} from "@family-ledger/shared";
import {
  buildHoldingDetailSummary,
  calculateHoldings,
  selectHoldingDetailTransactions
} from "../apps/api/src/services/holdingService";

const accountA = account("11111111-1111-4111-8111-111111111111", "Account A");
const security = instrument("22222222-2222-4222-8222-222222222222", "ETF", "VGT", "etf", "USD");
const closedSecurity = instrument("33333333-3333-4333-8333-333333333333", "Closed ETF", "CLOSED", "etf", "USD");
const cash = instrument("44444444-4444-4444-8444-444444444444", "USD Cash", "CASH_USD", "cash", "USD");

const transactions: InvestmentTransaction[] = [
  transaction("t1", accountA.id, security.id, "buy", {
    quantity: "10",
    grossAmount: "100",
    settlementCurrency: "USD",
    settlementAmount: "100"
  }),
  transaction("t2", accountA.id, security.id, "dividend", { grossAmount: "12.5", tax: "1.5" }),
  transaction("t3", accountA.id, closedSecurity.id, "buy", { quantity: "1", grossAmount: "10" }),
  transaction("t4", accountA.id, closedSecurity.id, "sell", { quantity: "1", grossAmount: "10" }),
  transaction("t5", accountA.id, cash.id, "withdrawal", {
    grossAmount: "100",
    transactionSource: "generated_cash_leg",
    linkedTransactionId: "t1"
  }),
  transaction("t6", accountA.id, cash.id, "deposit", {
    grossAmount: "11",
    transactionSource: "generated_cash_leg",
    linkedTransactionId: "t2"
  })
];

const holdings = calculateHoldings(transactions, [accountA], [security, closedSecurity, cash], [
  fxRate("usd-usd", "USD", "1")
]);
const currentSecurityHolding = requiredHolding(security.id);
const closedSecurityRelatedTransactions = selectHoldingDetailTransactions(accountA.id, closedSecurity.id, closedSecurity, transactions);
const closedDetail = buildHoldingDetailSummary({
  reportingCurrency: "USD",
  account: accountA,
  instrument: closedSecurity,
  holding: {
    accountId: accountA.id,
    accountName: accountA.name,
    instrumentId: closedSecurity.id,
    instrumentSymbol: closedSecurity.symbol,
    instrumentName: closedSecurity.name,
    instrumentShortName: closedSecurity.shortName,
    assetType: closedSecurity.assetType,
    currency: closedSecurity.currency,
    quantity: "0",
    averageUnitCost: null,
    costAmount: null,
    costAmountUsd: null,
    warnings: []
  },
  hasCurrentPosition: false,
  relatedTransactions: closedSecurityRelatedTransactions,
  allTransactions: transactions,
  prices: [],
  fxRates: []
});

assert.equal(closedDetail.hasCurrentPosition, false);
assert.equal(closedDetail.holding.quantity, "0");
assert.equal(closedDetail.holding.marketValue, "0.00");
assert.equal(closedDetail.holding.unrealizedGain, "0.00");
assert.deepEqual(closedDetail.holding.valuationWarnings, []);

const securityRelatedTransactions = selectHoldingDetailTransactions(accountA.id, security.id, security, transactions);
const securityDetail = buildHoldingDetailSummary({
  reportingCurrency: "USD",
  account: accountA,
  instrument: security,
  holding: currentSecurityHolding,
  hasCurrentPosition: true,
  relatedTransactions: securityRelatedTransactions,
  allTransactions: transactions,
  prices: [
    price("p1", security.id, "2026-01-03", "15", "USD"),
    price("p2", security.id, "2026-01-02", "14", "USD")
  ],
  fxRates: [fxRate("usd-usd", "USD", "1")]
});

assert.equal(securityDetail.holding.quantity, "10");
assert.equal(securityDetail.dividendTransactions.length, 1);
assert.equal(securityDetail.dividendSummary.totalGrossAmount, "12.500000");
assert.equal(securityDetail.dividendSummary.totalTaxAmount, "1.500000");
assert.equal(securityDetail.dividendSummary.latestDividendDate, "2026-01-02");
assert.equal(securityDetail.linkedCashLegs.find((item) => item.parentTransactionId === "t2")?.transaction.grossAmount, "11");
assert.equal(securityDetail.priceContext.movementAmount, "1.000000");
assert.equal(securityDetail.priceContext.movementPct, "7.142857");

const cashRelatedTransactions = selectHoldingDetailTransactions(accountA.id, cash.id, cash, transactions);
assert.equal(cashRelatedTransactions.length, 2);
assert.equal(cashRelatedTransactions[0]?.transactionSource, "generated_cash_leg");

const nonCashRelatedTransactions = selectHoldingDetailTransactions(accountA.id, security.id, security, [
  ...transactions,
  transaction("t7", accountA.id, security.id, "withdrawal", {
    grossAmount: "100",
    transactionSource: "generated_cash_leg",
    linkedTransactionId: "t1"
  })
]);
assert.equal(nonCashRelatedTransactions.some((item) => item.transactionSource === "generated_cash_leg"), false);

console.log("Holding detail verification: success");

function requiredHolding(instrumentId: string) {
  const holding = holdings.find((item) => item.instrumentId === instrumentId);
  assert.ok(holding, `Expected holding for ${instrumentId}.`);
  return holding;
}

function account(id: string, name: string): InvestmentAccount {
  return {
    id,
    name,
    broker: null,
    accountType: "brokerage",
    baseCurrency: "USD",
    marketRegion: "US",
    notes: null,
    tradingInfo: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function instrument(
  id: string,
  name: string,
  symbol: string,
  assetType: Instrument["assetType"],
  currency: Instrument["currency"]
): Instrument {
  return {
    id,
    symbol,
    name,
    shortName: symbol,
    description: null,
    marketRegion: "US",
    exchange: "TEST",
    currency,
    assetType,
    isin: null,
    provider: null,
    priceSource: "manual",
    priceSourceSymbol: null,
    priceSourceExchange: null,
    priceUpdateEnabled: false,
    priceUpdatePriority: 0,
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
  input: Partial<InvestmentTransaction>
): InvestmentTransaction {
  const index = Number(id.slice(1));

  return {
    id,
    accountId,
    instrumentId,
    instrumentSymbol: null,
    instrumentName: null,
    instrumentShortName: null,
    instrumentAssetType: null,
    transactionType,
    tradeDate: `2026-01-${String(index).padStart(2, "0")}`,
    settlementDate: null,
    quantity: null,
    price: null,
    grossAmount: null,
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    transactionSource: "manual",
    linkedTransactionId: null,
    settlementCurrency: null,
    settlementAmount: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    updatedAt: `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    ...input
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

function fxRate(id: string, fromCurrency: ExchangeRateRecord["fromCurrency"], rate: string): ExchangeRateRecord {
  return {
    id,
    fromCurrency,
    toCurrency: "USD",
    rateDate: "2026-01-03",
    rate,
    rateType: "valuation",
    provider: "manual",
    providerRateDate: "2026-01-03",
    fetchedAt: "2026-01-03T00:00:00.000Z",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z"
  };
}
