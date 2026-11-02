import assert from "node:assert/strict";
import { calculateHoldings, validateTransactionTimeline, type InvestmentAccount, type InvestmentTransaction, type Instrument } from "@family-ledger/shared";

const instruments = [{ id: "cash", assetType: "cash", currency: "USD" }, { id: "stock", assetType: "stock", currency: "USD" }] as Instrument[];
function row(id: string, date: string, type: InvestmentTransaction["transactionType"], amount: string): InvestmentTransaction {
  return { id, accountId: "a", instrumentId: type === "buy" || type === "sell" ? "stock" : "cash",
    transactionType: type, tradeDate: date, createdAt: `${date}T00:00:00.000Z`, quantity: type === "buy" || type === "sell" ? amount : null,
    grossAmount: amount, fee: "0", tax: "0", settlementCurrency: type === "buy" || type === "sell" ? "USD" : null,
    settlementAmount: type === "buy" || type === "sell" ? amount : null, transactionSource: "manual", linkedTransactionId: null } as InvestmentTransaction;
}
const deposit = row("deposit", "2026-01-02", "deposit", "10");
const buy = row("buy", "2026-01-03", "buy", "10");
const sell = row("sell", "2026-01-04", "sell", "10");
const check = (before: InvestmentTransaction[], after: InvestmentTransaction[]) => validateTransactionTimeline({ before, after, accounts: [], instruments });
assert.equal(check([], [deposit, buy, sell]).length, 0);
assert.equal(check([], [{ ...deposit, tradeDate: "2026-01-05" }, buy]).length, 1, "Future deposits cannot fund earlier buys");
assert.equal(check([], [deposit, { ...buy, tradeDate: "2026-01-05" }, sell]).length, 1, "Future buys cannot support earlier sells");
assert.equal(check([deposit, buy, sell], [deposit, sell]).length, 1, "Deleting a purchase cannot invalidate a later sale");
assert.equal(check([deposit, buy, sell], [deposit, { ...buy, quantity: "5", settlementAmount: "5" }, sell]).length, 1);
assert.equal(check([deposit, buy], [{ ...deposit, grossAmount: "5" }, buy]).length, 1, "Deposit edits validate later funding");
assert.equal(check([deposit, buy], [buy]).length, 1, "Deleting funding validates downstream buys");
assert.equal(check([deposit, buy], [{ ...deposit, tradeDate: "2026-02-01" }, buy]).length, 1, "Moving funding later cannot fund earlier buys");
assert.equal(check([buy], [buy, row("other", "2026-02-01", "deposit", "1")]).length, 0, "Unchanged legacy deficit allowed");
assert.equal(check([buy], [{ ...buy, settlementAmount: "9" }]).length, 0, "Improved legacy deficit allowed");
assert.equal(check([buy], [{ ...buy, settlementAmount: "11" }]).length, 1, "Worsened legacy deficit rejected");
assert.equal(check([], [row("withdraw", "2026-01-01", "withdrawal", "5")]).length, 0, "Explicit liabilities remain supported");
const cashLeg = { ...row("leg", buy.tradeDate, "withdrawal", "10"), transactionSource: "generated_cash_leg", linkedTransactionId: buy.id } as InvestmentTransaction;
assert.equal(check([], [deposit, buy, cashLeg, row("next", "2026-01-04", "buy", "1")]).length, 1, "Cash leg counted exactly once");
assert.equal(check([], [deposit, buy, cashLeg, { ...row("dividend", "2026-01-04", "buy", "1"), settlementAmount: "0" }]).length, 0, "Cash leg is not double counted");
assert.equal(check([], [{ ...deposit, tradeDate: buy.tradeDate, createdAt: "2026-01-03T00:00:01.000Z" }, buy]).length, 1, "Same-day order is creation time then ID");
assert.equal(check([deposit, buy, sell], [deposit, { ...buy, accountId: "b" }, sell]).length, 2, "Reassignment checks old and new account");
assert.equal(check([buy], [{ ...buy, settlementAmount: "10.0000000001" }]).length, 1, "Deficit comparisons use exact decimals");
const existingDeficit = [buy, row("late", "2026-02-01", "deposit", "10")];
assert.equal(check(existingDeficit, [{ ...buy, tradeDate: "2025-12-31" }, existingDeficit[1]]).length, 0, "Unchanged deficit remains allowed despite equal final balances");
assert.throws(() => check([deposit, buy], [deposit, { ...buy, instrumentId: "other" }]), /reference data/);
assert.equal(check([], [
  { ...deposit, tradeDate: buy.tradeDate, createdAt: "2026-01-03T00:00:00+00:00" },
  buy
]).length, 1, "Equivalent database and API timestamp spellings must use the ID tie-breaker");
assert.equal(check([], [
  { ...deposit, id: "a", tradeDate: buy.tradeDate, createdAt: "2026-01-03T00:00:00.000Z" },
  { ...buy, id: "z", createdAt: "2026-01-03T00:00:00+00:00" }
]).length, 0, "Canonical order survives database serialization");
assert.equal(check([], [
  { ...deposit, id: "a", tradeDate: buy.tradeDate, createdAt: "2026-01-03T00:00:00.000001+00:00" },
  { ...buy, id: "z", createdAt: "2026-01-03T00:00:00.000Z" }
]).length, 1, "Microsecond history must sort after an earlier millisecond instant");
const microsecondHistory = [
  { ...buy, id: "a", transactionType: "opening_position", quantity: "2", createdAt: "2026-01-03T00:00:00.000001+00:00" },
  { ...buy, id: "z", transactionType: "sell", quantity: "1", createdAt: "2026-01-03T00:00:00.000Z" }
] as InvestmentTransaction[];
assert.equal(calculateHoldings(microsecondHistory, [{id: "a", name: "Account"}] as InvestmentAccount[], instruments)[0].costAmount,
  null, "Holdings uses the same normalized chronological order as mutation validation");
console.log("Transaction timeline verification: success");
