import { strict as assert } from "node:assert";
import {
  buildAccountChanges,
  buildTradeActivity,
  calculateMonthlyBridge,
  collectSnapshotWarnings,
  getMonthlySnapshotWindows
} from "../apps/api/src/services/monthlySummaryService";
import type { InvestmentTransaction, PortfolioSnapshotSummary, SnapshotWarning } from "@family-ledger/shared";

const complete = calculateMonthlyBridge({
  startValue: "1000.000000",
  endValue: "1300.000000",
  netPrincipalFlow: "200.000000",
  cashAdjustmentImpact: "-10.000000"
});

assert.equal(complete.assetChange, "300.000000");
assert.equal(complete.valuationMovement, "110.000000");

const missingSnapshot = calculateMonthlyBridge({
  startValue: null,
  endValue: "1300.000000",
  netPrincipalFlow: "200.000000",
  cashAdjustmentImpact: "0.000000"
});

assert.equal(missingSnapshot.assetChange, null);
assert.equal(missingSnapshot.valuationMovement, null);

const missingFlow = calculateMonthlyBridge({
  startValue: "1000.000000",
  endValue: "1300.000000",
  netPrincipalFlow: null,
  cashAdjustmentImpact: "0.000000"
});

assert.equal(missingFlow.assetChange, "300.000000");
assert.equal(missingFlow.valuationMovement, null);

const windows = getMonthlySnapshotWindows("2026-06");

assert.deepEqual(windows.startWindow, { from: "0001-01-01", to: "2026-05-31" });
assert.deepEqual(windows.endWindow, { from: "2026-06-01", to: "2026-06-30" });

const accountWarning: SnapshotWarning = {
  code: "MISSING_LATEST_PRICE",
  accountId: "account-a",
  accountName: "Account A",
  instrumentId: "instrument-a",
  instrumentName: "Instrument A",
  instrumentShortName: "A",
  currency: "USD"
};

const startSnapshot = snapshot({
  snapshotDate: "2026-05-31",
  accounts: [
    accountSnapshot({ accountId: "account-a", accountName: "Account A", marketValue: "1000.000000", warnings: [accountWarning] })
  ]
});
const endSnapshot = snapshot({
  snapshotDate: "2026-06-30",
  accounts: [
    accountSnapshot({ accountId: "account-a", accountName: "Account A", marketValue: "1100.000000", warnings: [accountWarning] }),
    accountSnapshot({ accountId: "account-b", accountName: "Account B", marketValue: "500.000000" }),
    accountSnapshot({ accountId: "account-c", accountName: "Account C", marketValue: null })
  ]
});
const accountChanges = buildAccountChanges(startSnapshot, endSnapshot);

assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.changeAmount, "100.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.warnings.length, 1);
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.startValue, "0.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.changePct, null);
assert.equal(accountChanges.find((account) => account.accountId === "account-c")?.changeAmount, null);
assert.deepEqual(buildAccountChanges(null, endSnapshot), []);
assert.equal(collectSnapshotWarnings(startSnapshot, endSnapshot).length, 1);

const trade = transaction({
  id: "trade-a",
  transactionType: "buy",
  transactionSource: "manual",
  linkedTransactionId: null,
  instrumentId: "instrument-a"
});
const generatedCashLeg = transaction({
  id: "cash-leg-a",
  transactionType: "withdrawal",
  transactionSource: "generated_cash_leg",
  linkedTransactionId: "trade-a",
  instrumentId: "cash-usd"
});
const standaloneGeneratedCashLeg = transaction({
  id: "cash-leg-b",
  transactionType: "withdrawal",
  transactionSource: "generated_cash_leg",
  linkedTransactionId: "missing-trade",
  instrumentId: "cash-usd"
});
const tradeActivity = buildTradeActivity([standaloneGeneratedCashLeg, generatedCashLeg, trade]);

assert.equal(tradeActivity.length, 1);
assert.equal(tradeActivity[0]?.transaction.id, "trade-a");
assert.equal(tradeActivity[0]?.linkedCashLeg?.id, "cash-leg-a");

console.log("Monthly summary bridge verification passed.");

function snapshot(input: {
  snapshotDate: string;
  accounts: PortfolioSnapshotSummary["accounts"];
}): PortfolioSnapshotSummary {
  return {
    id: input.snapshotDate,
    snapshotDate: input.snapshotDate,
    currency: "USD",
    marketValue: "1000.000000",
    cost: null,
    unrealizedGain: null,
    dailyChange: null,
    dailyChangePct: null,
    usdToNzdRate: "1.6000000000",
    usdToCnyRate: "7.2000000000",
    warnings: [],
    accounts: input.accounts,
    createdAt: `${input.snapshotDate}T00:00:00.000Z`,
    updatedAt: `${input.snapshotDate}T00:00:00.000Z`
  };
}

function accountSnapshot(input: {
  accountId: string;
  accountName: string;
  marketValue: string | null;
  warnings?: SnapshotWarning[];
}): PortfolioSnapshotSummary["accounts"][number] {
  return {
    accountId: input.accountId,
    accountName: input.accountName,
    currency: "USD",
    marketValue: input.marketValue,
    cost: null,
    unrealizedGain: null,
    dailyChange: null,
    dailyChangePct: null,
    warnings: input.warnings ?? []
  };
}

function transaction(input: {
  id: string;
  transactionType: InvestmentTransaction["transactionType"];
  transactionSource: InvestmentTransaction["transactionSource"];
  linkedTransactionId: string | null;
  instrumentId: string;
}): InvestmentTransaction {
  return {
    id: input.id,
    accountId: "account-a",
    instrumentId: input.instrumentId,
    instrumentSymbol: "A",
    instrumentName: "Instrument A",
    instrumentShortName: "A",
    instrumentAssetType: input.instrumentId === "cash-usd" ? "cash" : "stock",
    transactionType: input.transactionType,
    tradeDate: "2026-06-15",
    settlementDate: "2026-06-17",
    quantity: "1",
    price: "10",
    grossAmount: "10",
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    transactionSource: input.transactionSource,
    linkedTransactionId: input.linkedTransactionId,
    settlementCurrency: input.transactionType === "buy" ? "USD" : null,
    settlementAmount: input.transactionType === "buy" ? "10" : null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z"
  };
}
