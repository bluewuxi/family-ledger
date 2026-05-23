import assert from "node:assert/strict";
import type { Instrument, InvestmentAccount, InvestmentTransaction } from "@family-ledger/shared";
import { calculateHoldings } from "../apps/api/src/services/holdingService";

const accountA = account("account-a", "主账户");
const accountB = account("account-b", "备用账户");
const stock = instrument("stock-main", "ETF", "VGT", "etf", "USD");
const zeroStock = instrument("stock-zero", "已清仓", "ZERO", "stock", "USD");
const oversoldStock = instrument("stock-oversold", "超卖标的", "SHORT", "stock", "USD");
const cash = instrument("cash-usd", "美元现金", "CASH_USD", "cash", "USD");
const zeroCash = instrument("cash-zero", "零余额现金", "CASH_ZERO", "cash", "NZD");
const negativeCash = instrument("cash-negative", "负余额现金", "CASH_NEG", "cash", "NZD");

const transactions: InvestmentTransaction[] = [
  transaction("1", accountA.id, stock.id, "buy", { quantity: "10", grossAmount: "100", fee: "2", tax: "1" }),
  transaction("2", accountA.id, stock.id, "buy", { quantity: "10", grossAmount: "200" }),
  transaction("3", accountA.id, stock.id, "dividend", { grossAmount: "20", tax: "3" }),
  transaction("4", accountA.id, stock.id, "sell", { quantity: "5", grossAmount: "75", fee: "99", tax: "88" }),
  transaction("5", accountB.id, stock.id, "buy", { quantity: "2", grossAmount: "40" }),
  transaction("6", accountA.id, zeroStock.id, "buy", { quantity: "1", grossAmount: "10" }),
  transaction("7", accountA.id, zeroStock.id, "sell", { quantity: "1", grossAmount: "10" }),
  transaction("8", accountA.id, oversoldStock.id, "buy", { quantity: "2", grossAmount: "20" }),
  transaction("9", accountA.id, oversoldStock.id, "sell", { quantity: "3", grossAmount: "30" }),
  transaction("10", accountA.id, cash.id, "deposit", { grossAmount: "100" }),
  transaction("11", accountA.id, cash.id, "interest", { grossAmount: "5" }),
  transaction("12", accountA.id, cash.id, "fee", { fee: "2" }),
  transaction("13", accountA.id, cash.id, "tax", { tax: "1" }),
  transaction("14", accountA.id, cash.id, "withdrawal", { grossAmount: "10" }),
  transaction("15", accountA.id, cash.id, "adjustment", { grossAmount: "3", adjustmentDirection: "decrease" }),
  transaction("16", accountA.id, cash.id, "adjustment", { grossAmount: "1", adjustmentDirection: "increase" }),
  transaction("17", accountA.id, zeroCash.id, "deposit", { grossAmount: "5", currency: "NZD" }),
  transaction("18", accountA.id, zeroCash.id, "withdrawal", { grossAmount: "5", currency: "NZD" }),
  transaction("19", accountA.id, negativeCash.id, "withdrawal", { grossAmount: "7", currency: "NZD" })
];

const holdings = calculateHoldings(
  [...transactions].reverse(),
  [accountA, accountB],
  [stock, zeroStock, oversoldStock, cash, zeroCash, negativeCash]
);

const mainSecurity = requiredHolding(accountA.id, stock.id);
assert.equal(mainSecurity.quantity, "15");
assert.equal(mainSecurity.averageUnitCost, "15.15");
assert.equal(mainSecurity.costAmount, "227.25");
assert.deepEqual(mainSecurity.warnings, []);

const separatedSecurity = requiredHolding(accountB.id, stock.id);
assert.equal(separatedSecurity.quantity, "2");
assert.equal(separatedSecurity.costAmount, "40");

assert.equal(findHolding(accountA.id, zeroStock.id), undefined);

const oversold = requiredHolding(accountA.id, oversoldStock.id);
assert.equal(oversold.quantity, "-1");
assert.equal(oversold.averageUnitCost, null);
assert.equal(oversold.costAmount, null);
assert.deepEqual(oversold.warnings, ["NEGATIVE_POSITION", "COST_BASIS_UNAVAILABLE"]);

const cashBalance = requiredHolding(accountA.id, cash.id);
assert.equal(cashBalance.quantity, "90");
assert.equal(cashBalance.averageUnitCost, null);
assert.equal(cashBalance.costAmount, null);
assert.deepEqual(cashBalance.warnings, []);

assert.equal(findHolding(accountA.id, zeroCash.id), undefined);

const overdrawnCash = requiredHolding(accountA.id, negativeCash.id);
assert.equal(overdrawnCash.quantity, "-7");
assert.deepEqual(overdrawnCash.warnings, ["NEGATIVE_POSITION"]);

console.log("Holdings calculation verification: success");

function requiredHolding(accountId: string, instrumentId: string) {
  const holding = findHolding(accountId, instrumentId);
  assert.ok(holding, `Expected holding for ${accountId}/${instrumentId}.`);
  return holding;
}

function findHolding(accountId: string, instrumentId: string) {
  return holdings.find((holding) => holding.accountId === accountId && holding.instrumentId === instrumentId);
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
    description: null,
    marketRegion: currency === "NZD" ? "NZ" : "US",
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
  return {
    id,
    accountId,
    instrumentId,
    transactionType,
    tradeDate: `2026-01-${id.padStart(2, "0")}`,
    settlementDate: null,
    quantity: null,
    price: null,
    grossAmount: null,
    fee: "0",
    tax: "0",
    currency: "USD",
    fxRateToNzd: null,
    adjustmentDirection: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `2026-01-${id.padStart(2, "0")}T00:00:00.000Z`,
    updatedAt: `2026-01-${id.padStart(2, "0")}T00:00:00.000Z`,
    ...input
  };
}
