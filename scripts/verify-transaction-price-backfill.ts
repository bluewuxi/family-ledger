import assert from "node:assert/strict";
import type { Instrument, InvestmentTransaction } from "@family-ledger/shared";
import { buildTransactionPriceRecordInput } from "../apps/api/src/services/transactionService";

const stock = instrument("instrument-stock", "SMH.L", "stock", "USD");
const cash = instrument("instrument-cash", "CASH_USD", "cash", "USD");

const pastBuyPrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    tradeDate: "2026-06-22",
    price: "124.9"
  }),
  stock,
  "2026-06-24"
);
assert.deepEqual(pastBuyPrice, {
  instrumentId: "instrument-stock",
  priceDate: "2026-06-22",
  closePrice: "124.9",
  currency: "USD",
  provider: "manual",
  sourceSymbol: "SMH.L",
  isAdjusted: false,
  fetchedAt: "2026-06-24T10:26:41.679Z"
});

const pastSellPrice = buildTransactionPriceRecordInput(
  transaction("sell", {
    tradeDate: "2026-06-22",
    price: "125.5"
  }),
  stock,
  "2026-06-24"
);
assert.equal(pastSellPrice?.closePrice, "125.5");

const currentBusinessDatePrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    tradeDate: "2026-06-24",
    price: "124.9"
  }),
  stock,
  "2026-06-24"
);
assert.equal(currentBusinessDatePrice, null);

const dividendPrice = buildTransactionPriceRecordInput(
  transaction("dividend", {
    tradeDate: "2026-06-22",
    price: null
  }),
  stock,
  "2026-06-24"
);
assert.equal(dividendPrice, null);

const cashPrice = buildTransactionPriceRecordInput(
  transaction("buy", {
    instrumentId: cash.id,
    tradeDate: "2026-06-22",
    price: "1"
  }),
  cash,
  "2026-06-24"
);
assert.equal(cashPrice, null);

console.log("Transaction price backfill verification: success");

function transaction(
  transactionType: InvestmentTransaction["transactionType"],
  values: Partial<InvestmentTransaction>
): InvestmentTransaction {
  return {
    id: "transaction-a",
    accountId: "account-a",
    instrumentId: "instrument-stock",
    instrumentSymbol: "SMH.L",
    instrumentName: "VanEck Semiconductor UCITS ETF Acc",
    instrumentShortName: "SMH.L",
    instrumentAssetType: "stock",
    transactionType,
    tradeDate: "2026-06-22",
    settlementDate: null,
    quantity: "1",
    price: "124.9",
    grossAmount: "124.900000",
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    transactionSource: "manual",
    linkedTransactionId: null,
    settlementCurrency: "USD",
    settlementAmount: "124.900000",
    notes: null,
    createdByUserId: "user-a",
    updatedByUserId: "user-a",
    createdAt: "2026-06-24T10:26:41.679Z",
    updatedAt: "2026-06-24T10:26:41.679Z",
    ...values
  };
}

function instrument(
  id: string,
  symbol: string,
  assetType: Instrument["assetType"],
  currency: Instrument["currency"]
): Instrument {
  return {
    id,
    symbol,
    name: symbol,
    shortName: symbol,
    description: null,
    marketRegion: "US",
    exchange: "TEST",
    currency,
    assetType,
    isin: null,
    provider: null,
    priceSource: "manual",
    priceSourceSymbol: symbol,
    priceSourceExchange: "TEST",
    priceUpdateEnabled: false,
    priceUpdatePriority: 0,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-06-24T00:00:00.000Z",
    updatedAt: "2026-06-24T00:00:00.000Z"
  };
}
