import assert from "node:assert/strict";
import type { InvestmentAccount, InvestmentTransaction } from "@family-ledger/shared";
import { ACCOUNT_PURPOSES, combineAccountValuations } from "@family-ledger/shared";
import { parseCreateAccountInput, parseUpdateAccountInput } from "../apps/api/src/services/accountService";
import { optionalAccountPurpose } from "../apps/api/src/services/accountPurpose";
import { selectInvestmentLedger } from "../apps/api/src/services/dashboardService";

assert.deepEqual(ACCOUNT_PURPOSES, ["investment", "daily_expense", "education"]);
const createInput = { name: "账户", accountType: "bank", baseCurrency: "USD", marketRegion: "US" };
assert.equal(parseCreateAccountInput(createInput).purpose, "investment");
assert.equal(parseUpdateAccountInput({ name: "新名称" }).purpose, undefined);
for (const purpose of ACCOUNT_PURPOSES) {
  assert.equal(parseCreateAccountInput({ ...createInput, purpose }).purpose, purpose);
  assert.equal(parseUpdateAccountInput({ purpose }).purpose, purpose);
  assert.equal(optionalAccountPurpose(purpose), purpose);
}
for (const purpose of ["", "school", null, [], 1]) {
  assert.throws(() => parseCreateAccountInput({ ...createInput, purpose }));
  assert.throws(() => parseUpdateAccountInput({ purpose }));
}
const valuation = { accountId: "one", accountName: "One", marketValueUsd: "100.000001", costUsd: "120",
  unrealizedGainUsd: "-19.999999", dailyChangeUsd: "1", dailyChangePct: "999", warnings: [] };
const aggregate = (rows: Parameters<typeof combineAccountValuations>[1]) => combineAccountValuations("2026-01-01", rows, "1.6", "7");
assert.equal(aggregate([]).marketValueUsd, "0.000000");
assert.equal(aggregate([]).dailyChangePct, null);
assert.equal(aggregate([valuation]).dailyChangePct, "1.01010100");
assert.equal(aggregate([{ ...valuation, costUsd: null }]).costUsd, null);
assert.equal(aggregate([{ ...valuation, marketValueUsd: null }]).dailyChangeUsd, null);
assert.equal(aggregate([{ ...valuation, dailyChangeUsd: "100.000001" }]).dailyChangePct, null);
assert.equal(aggregate([valuation, valuation]).marketValueUsd, "200.000002");
const accounts = [account("invest", "investment"), account("daily", "daily_expense"), account("school", "education")];
const transactions = [transaction("invest"), transaction("daily"), transaction("school")];
assert.deepEqual(selectInvestmentLedger(accounts, transactions).transactions.map((item) => item.accountId), ["invest"]);
assert.deepEqual(
  selectInvestmentLedger(accounts.map((item) => item.id === "daily" ? { ...item, purpose: "investment" } : item), transactions)
    .transactions.map((item) => item.accountId),
  ["invest", "daily"]
);
console.log("Account purpose verification: success");

function account(id: string, purpose: InvestmentAccount["purpose"]): InvestmentAccount {
  return {
    id, name: id, broker: null, accountType: "bank", purpose, baseCurrency: "NZD", marketRegion: "NZ",
    notes: null, tradingInfo: null, createdByUserId: null, updatedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function transaction(accountId: string): InvestmentTransaction {
  return {
    id: `${accountId}-transaction`, accountId, instrumentId: "cash", transactionType: "deposit",
    tradeDate: "2026-01-01", settlementDate: null, quantity: null, price: null, grossAmount: "100",
    fee: "0", tax: "0", currency: "NZD", adjustmentDirection: null, transactionSource: "manual",
    linkedTransactionId: null, settlementCurrency: null, settlementAmount: null, notes: null,
    createdByUserId: null, updatedByUserId: null, createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
