import { strict as assert } from "node:assert";
import Decimal from "decimal.js";
import {
  buildAccountChanges,
  buildTradeActivity,
  calculateMonthlyBridge,
  calculateSyntheticStartBaseline,
  collectSnapshotWarnings,
  getMonthlySnapshotWindows
} from "../apps/api/src/services/monthlySummaryService";
import { parseMonthlyReportMonth } from "../apps/api/src/services/monthlyReportMonth";
import type { InvestmentTransaction, PortfolioSnapshotSummary, PriceRecord, SnapshotWarning } from "@family-ledger/shared";

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

const initialMonthBridge = calculateMonthlyBridge({
  startValue: "500.000000",
  endValue: "550.000000",
  netPrincipalFlow: "0.000000",
  cashAdjustmentImpact: "0.000000"
});

assert.equal(initialMonthBridge.assetChange, "50.000000");
assert.equal(initialMonthBridge.valuationMovement, "50.000000");

const syntheticStartBaseline = calculateSyntheticStartBaseline({
  transactions: [
    transaction({
      id: "opening-security",
      transactionType: "opening_position",
      transactionSource: "manual",
      linkedTransactionId: null,
      instrumentId: "instrument-a",
      quantity: "10",
      grossAmount: "100"
    }),
    transaction({
      id: "opening-cash",
      transactionType: "opening_balance",
      transactionSource: "manual",
      linkedTransactionId: null,
      instrumentId: "cash-usd",
      grossAmount: "50"
    })
  ],
  currency: "USD",
  prices: [price({ instrumentId: "instrument-a", priceDate: "2026-06-15", closePrice: "15", currency: "USD" })],
  fxRates: []
});

assert.equal(syntheticStartBaseline.amount?.toFixed(6), "200.000000");
assert.equal(syntheticStartBaseline.amountsByAccount.get("account-a")?.toFixed(6), "200.000000");
assert.equal(syntheticStartBaseline.warnings.length, 0);

const missingOpeningPriceBaseline = calculateSyntheticStartBaseline({
  transactions: [
    transaction({
      id: "opening-security-missing-price",
      transactionType: "opening_position",
      transactionSource: "manual",
      linkedTransactionId: null,
      instrumentId: "instrument-a",
      quantity: "10",
      grossAmount: "100"
    })
  ],
  currency: "USD",
  prices: [],
  fxRates: []
});

assert.equal(missingOpeningPriceBaseline.amount, null);
assert.equal(missingOpeningPriceBaseline.amountsByAccount.get("account-a"), null);
assert.equal(missingOpeningPriceBaseline.warnings[0]?.code, "MISSING_OPENING_PRICE");

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
const accountChanges = buildAccountChanges({
  startSnapshot,
  endSnapshot,
  netPrincipalFlowsByAccount: new Map<string, Decimal | null>([
    ["account-a", new Decimal("20")],
    ["account-b", new Decimal("500")]
  ]),
  cashAdjustmentImpactsByAccount: new Map<string, Decimal | null>([
    ["account-a", new Decimal("-5")]
  ]),
  totalValuationMovement: "85.000000"
});

assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.changeAmount, "100.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.assetChange, "100.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.netPrincipalFlow, "20.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.cashAdjustmentImpact, "-5.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.valuationMovement, "85.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.valuationContributionPct, "100.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-a")?.warnings.length, 1);
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.startValue, "0.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.netPrincipalFlow, "500.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.valuationMovement, "0.000000");
assert.equal(accountChanges.find((account) => account.accountId === "account-b")?.changePct, null);
assert.equal(accountChanges.find((account) => account.accountId === "account-c")?.changeAmount, null);
assert.deepEqual(buildAccountChanges({ startSnapshot: null, endSnapshot: null }), []);
assert.equal(collectSnapshotWarnings(startSnapshot, endSnapshot).length, 1);

const initialMonthEndSnapshot = snapshot({
  snapshotDate: "2026-05-31",
  accounts: [
    accountSnapshot({ accountId: "account-init", accountName: "Init Account", marketValue: "550.000000" })
  ]
});
const initialMonthAccountChanges = buildAccountChanges({
  startSnapshot: null,
  endSnapshot: initialMonthEndSnapshot,
  reportingCurrency: "USD",
  syntheticStartValuesByAccount: new Map<string, Decimal | null>([["account-init", new Decimal("500")]]),
  netPrincipalFlowsByAccount: new Map<string, Decimal | null>([["account-init", new Decimal("0")]]),
  totalValuationMovement: "50.000000"
});
const initialMonthAccount = initialMonthAccountChanges.find((account) => account.accountId === "account-init");
assert.equal(initialMonthAccountChanges.length, 1);
assert.equal(initialMonthAccount?.startValue, "500.000000");
assert.equal(initialMonthAccount?.endValue, "550.000000");
assert.equal(initialMonthAccount?.assetChange, "50.000000");
assert.equal(initialMonthAccount?.netPrincipalFlow, "0.000000");
assert.equal(initialMonthAccount?.valuationMovement, "50.000000");
assert.equal(initialMonthAccount?.valuationContributionPct, "100.000000");

const missingFlowAccountChanges = buildAccountChanges({
  startSnapshot,
  endSnapshot,
  netPrincipalFlowsByAccount: new Map<string, Decimal | null>([["account-a", null]]),
  cashAdjustmentImpactsByAccount: new Map<string, Decimal | null>(),
  totalValuationMovement: "100.000000"
});
assert.equal(missingFlowAccountChanges.find((account) => account.accountId === "account-a")?.netPrincipalFlow, null);
assert.equal(missingFlowAccountChanges.find((account) => account.accountId === "account-a")?.valuationMovement, null);

const zeroTotalContribution = buildAccountChanges({
  startSnapshot,
  endSnapshot,
  totalValuationMovement: "0.000000"
});
assert.equal(zeroTotalContribution.find((account) => account.accountId === "account-a")?.valuationContributionPct, null);

assert.equal(parseMonthlyReportMonth("2026-06", "2026-06"), "2026-06");
assert.throws(() => parseMonthlyReportMonth("2026-07", "2026-06"), /未来月份/);

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
  quantity?: string | null;
  grossAmount?: string | null;
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
    quantity: input.quantity ?? "1",
    price: "10",
    grossAmount: input.grossAmount ?? "10",
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

function price(input: {
  instrumentId: string;
  priceDate: string;
  closePrice: string;
  currency: PriceRecord["currency"];
}): PriceRecord {
  return {
    id: `${input.instrumentId}:${input.priceDate}`,
    instrumentId: input.instrumentId,
    priceDate: input.priceDate,
    closePrice: input.closePrice,
    currency: input.currency,
    source: "manual",
    sourceSymbol: null,
    isAdjusted: false,
    createdAt: `${input.priceDate}T00:00:00.000Z`,
    updatedAt: `${input.priceDate}T00:00:00.000Z`
  };
}
