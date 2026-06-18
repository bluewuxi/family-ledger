import assert from "node:assert/strict";
import type { CreateInvestmentTransactionInput, Instrument, InvestmentTransaction } from "@family-ledger/shared";
import {
  buildGeneratedCashLegInput,
  calculateSettlementCashAmount
} from "../apps/api/src/services/transactionService";

const cashInstrument = instrument("cash-usd", "USD Cash", "cash", "USD");

const netDividendAmount = calculateSettlementCashAmount(input("dividend", { grossAmount: "12.5", tax: "1.5" }));
assert.equal(netDividendAmount.toFixed(6), "11.000000");

const dividendCashLeg = buildGeneratedCashLegInput(
  transaction("dividend-a", "dividend", {
    grossAmount: "12.5",
    tax: "1.5",
    settlementCurrency: "USD",
    settlementAmount: "11.000000"
  }),
  cashInstrument
);
assert.equal(dividendCashLeg?.transactionType, "deposit");
assert.equal(dividendCashLeg?.grossAmount, "11.000000");
assert.equal(dividendCashLeg?.transactionSource, "generated_cash_leg");
assert.equal(dividendCashLeg?.linkedTransactionId, "dividend-a");
assert.equal(dividendCashLeg?.notes, "自动现金流水：股息入账");

const fullyWithheldDividend = buildGeneratedCashLegInput(
  transaction("dividend-b", "dividend", {
    grossAmount: "10",
    tax: "10",
    settlementCurrency: "USD",
    settlementAmount: "0.000000"
  }),
  cashInstrument
);
assert.equal(fullyWithheldDividend, null);

const buyCashLeg = buildGeneratedCashLegInput(
  transaction("buy-a", "buy", {
    grossAmount: "10",
    settlementCurrency: "USD",
    settlementAmount: "10.000000"
  }),
  cashInstrument
);
assert.equal(buyCashLeg?.transactionType, "withdrawal");

assert.throws(
  () => calculateSettlementCashAmount(input("dividend", { grossAmount: "10", tax: "10.01" })),
  /Dividend tax cannot exceed grossAmount/
);

console.log("Dividend cash-leg verification: success");

function input(
  transactionType: CreateInvestmentTransactionInput["transactionType"],
  values: Partial<CreateInvestmentTransactionInput>
): CreateInvestmentTransactionInput {
  return {
    accountId: "account-a",
    instrumentId: "instrument-a",
    transactionType,
    tradeDate: "2026-06-15",
    settlementDate: null,
    quantity: null,
    price: null,
    grossAmount: null,
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    notes: null,
    ...values
  };
}

function transaction(
  id: string,
  transactionType: InvestmentTransaction["transactionType"],
  values: Partial<InvestmentTransaction>
): InvestmentTransaction {
  return {
    id,
    accountId: "account-a",
    instrumentId: "instrument-a",
    instrumentSymbol: null,
    instrumentName: null,
    instrumentShortName: null,
    instrumentAssetType: "stock",
    transactionType,
    tradeDate: "2026-06-15",
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
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...values
  };
}

function instrument(
  id: string,
  name: string,
  assetType: Instrument["assetType"],
  currency: Instrument["currency"]
): Instrument {
  return {
    id,
    symbol: id,
    name,
    shortName: name,
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
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}
