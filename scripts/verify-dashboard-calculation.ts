import assert from "node:assert/strict";
import { calculateHoldings as calculateLedgerHoldings } from "@family-ledger/shared";
import { calculateInvestmentPerformance } from "../apps/api/src/services/investmentPerformanceService";
import { buildValuationMetadata } from "../apps/api/src/services/valuationMetadataService";
import type {
  ExchangeRateRecord,
  DashboardQuoteRecord,
  HoldingSummary,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction,
  PriceRecord
} from "@family-ledger/shared";
import { calculateDashboardSummary, countDailyTrades, refreshDashboardQuotes } from "../apps/api/src/services/dashboardService";
import type {
  FetchLatestInstrumentQuotesInput,
  InstrumentQuoteProviderResult,
  IInstrumentQuoteProvider
} from "../apps/api/src/providers/IInstrumentQuoteProvider";
import { calculateHoldingsValuation, calculateTradingDayChange } from "../apps/api/src/services/portfolioValuationService";

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
const fxRates = [fxRate("nzd-usd", "NZD", "0.6666666667"), fxRate("cny-usd", "CNY", "0.14")];

const dayInstrument = { ...instrument(usdSecurity.instrumentId, "yahoo_finance", "TEST", "USD"), marketRegion: "US" as const };
const dayQuote = dashboardQuote("day-live", usdSecurity.instrumentId, "2026-05-22", "70", "USD", "2026-05-23T01:00:00Z");
const dayChange = calculateTradingDayChange(holdings, [dayInstrument], prices, fxRates, "USD", [dayQuote], "2026-05-23");
assert.deepEqual(dayChange, { todayChange: "10.00", todayChangePct: "7.69" });
assert.deepEqual(calculateTradingDayChange(holdings, [dayInstrument], prices, fxRates, "USD", [], "2026-05-24"), { todayChange: "0.00", todayChangePct: null });
assert.deepEqual(calculateTradingDayChange([nzdSecurity, usdCash], [], [], [], "USD", [], "2026-05-23"), { todayChange: "0.00", todayChangePct: null });
assert.deepEqual(calculateTradingDayChange(holdings, [dayInstrument], prices, fxRates, "USD", [], "2026-05-23"), { todayChange: "0.00", todayChangePct: null });
assert.equal(calculateTradingDayChange([usdSecurity], [dayInstrument], prices.filter(p=>p.id!=="usd-previous"), fxRates, "USD", [dayQuote], "2026-05-23").todayChange, null);
const fundInstrument = { ...instrument(nzdSecurity.instrumentId, "kernel_estimate", "FUND", "NZD", "pie_fund"), marketRegion: "NZ" as const };
const estimatedFundPrices = prices.map(p=>p.id === "nzd-latest" ? {...p, isEstimated:true} : p);
assert.deepEqual(calculateTradingDayChange([nzdSecurity], [fundInstrument], estimatedFundPrices, fxRates, "NZD", [], "2026-05-22"), {todayChange:"3.00",todayChangePct:"2.56"});
assert.equal(calculateTradingDayChange([usdSecurity], [dayInstrument], prices, fxRates, "USD", [dashboardQuote("day-quote", usdSecurity.instrumentId, "2026-05-22", "60", "USD", "2026-05-23T01:00:00Z")], "2026-05-23").todayChange, "-10.00");
assert.deepEqual(calculateTradingDayChange([usdSecurity], [dayInstrument], prices, fxRates, "USD", [{...dayQuote, quoteDate:"2026-05-21"}], "2026-05-23"), {todayChange:"0.00",todayChangePct:null});
assert.deepEqual(calculateTradingDayChange([nzdSecurity], [fundInstrument], prices, fxRates, "NZD", [], "2026-05-22"), {todayChange:"0.00",todayChangePct:null});

const complete = calculateDashboardSummary(holdings, accounts, prices, fxRates);
assert.deepEqual(complete, {
  reportingCurrency: "NZD",
  totalAssets: "345.00",
  todayChange: "18.00",
  todayChangePct: "5.50",
  unrealizedGain: "90.00",
  dailyTradeCount: 0,
  accountCount: 3,
  accounts: [
    { accountId: "account-a", accountName: "account-a", marketValue: "345.00" },
    { accountId: "account-b", accountName: "account-b", marketValue: "0.00" },
    { accountId: "empty-account", accountName: "empty-account", marketValue: "0.00" }
  ],
  allocations: [
    { id: "account-a", name: "account-a", marketValue: "330.00", allocationType: "account" },
    { id: "account-b", name: "account-b", marketValue: "0.00", allocationType: "account" },
    { id: "empty-account", name: "empty-account", marketValue: "0.00", allocationType: "account" },
    { id: "cash", name: "现金", marketValue: "15.00", allocationType: "cash" }
  ],
  holdingAllocations: [
    { id: "usd-security", name: "US ETF", assetType: "etf", marketValue: "210.00", percentageOfTotal: "60.87", allocationType: "instrument" },
    { id: "nzd-security", name: "NZ Fund", assetType: "pie_fund", marketValue: "120.00", percentageOfTotal: "34.78", allocationType: "instrument" },
    { id: "cash", name: "现金", assetType: "cash", marketValue: "15.00", percentageOfTotal: "4.35", allocationType: "cash" }
  ],
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const duplicateProviderPrices = calculateDashboardSummary(
  [holding("provider-dedupe", "Provider Dedupe", "stock", "USD", "1", "0")],
  accounts,
  [
    price("provider-latest-yahoo", "provider-dedupe", "2026-05-22", "12", "USD", "Yahoo Finance"),
    price("provider-latest-manual", "provider-dedupe", "2026-05-22", "10", "USD", "manual"),
    price("provider-previous", "provider-dedupe", "2026-05-21", "8", "USD", "manual")
  ],
  fxRates
);
assert.equal(duplicateProviderPrices.totalAssets, "15.00");
assert.equal(duplicateProviderPrices.todayChange, "3.00");

const duplicateProviderFx = calculateDashboardSummary(
  [holding("fx-dedupe", "FX Dedupe", "stock", "CNY", "1", "0")],
  accounts,
  [
    price("fx-latest", "fx-dedupe", "2026-05-22", "10", "CNY"),
    price("fx-previous", "fx-dedupe", "2026-05-21", "8", "CNY")
  ],
  [
    fxRate("cny-provider", "CNY", "0.10", "Provider"),
    fxRate("cny-manual", "CNY", "0.20", "manual"),
    fxRate("nzd-usd", "NZD", "0.5")
  ]
);
assert.equal(duplicateProviderFx.totalAssets, "4.00");
assert.equal(duplicateProviderFx.todayChange, "0.80");

const valuedHoldings = calculateHoldingsValuation(holdings, prices, fxRates, "NZD");
assert.equal(valuedHoldings.totalMarketValue, "345.00");
assert.equal(valuedHoldings.totalUnrealizedGain, "90.00");
assert.equal(valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.instrumentShortName, "US ETF");
assert.equal(valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.marketValue, "210.00");
assert.equal(
  valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.unrealizedGain,
  "60.00"
);
assert.equal(valuedHoldings.holdings.find((holding) => holding.instrumentId === usdSecurity.instrumentId)?.latestPrice, "70");

const completeUsd = calculateDashboardSummary(holdings, accounts, prices, fxRates, "USD");
assert.deepEqual(completeUsd, {
  reportingCurrency: "USD",
  totalAssets: "230.00",
  todayChange: "12.00",
  todayChangePct: "5.50",
  unrealizedGain: "60.00",
  dailyTradeCount: 0,
  accountCount: 3,
  accounts: [
    { accountId: "account-a", accountName: "account-a", marketValue: "230.00" },
    { accountId: "account-b", accountName: "account-b", marketValue: "0.00" },
    { accountId: "empty-account", accountName: "empty-account", marketValue: "0.00" }
  ],
  allocations: [
    { id: "account-a", name: "account-a", marketValue: "220.00", allocationType: "account" },
    { id: "account-b", name: "account-b", marketValue: "0.00", allocationType: "account" },
    { id: "empty-account", name: "empty-account", marketValue: "0.00", allocationType: "account" },
    { id: "cash", name: "现金", marketValue: "10.00", allocationType: "cash" }
  ],
  holdingAllocations: [
    { id: "usd-security", name: "US ETF", assetType: "etf", marketValue: "140.00", percentageOfTotal: "60.87", allocationType: "instrument" },
    { id: "nzd-security", name: "NZ Fund", assetType: "pie_fund", marketValue: "80.00", percentageOfTotal: "34.78", allocationType: "instrument" },
    { id: "cash", name: "现金", assetType: "cash", marketValue: "10.00", percentageOfTotal: "4.35", allocationType: "cash" }
  ],
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const completeCny = calculateDashboardSummary(holdings, accounts, prices, fxRates, "CNY");
assert.deepEqual(completeCny, {
  reportingCurrency: "CNY",
  totalAssets: "1642.86",
  todayChange: "85.71",
  todayChangePct: "5.50",
  unrealizedGain: "428.57",
  dailyTradeCount: 0,
  accountCount: 3,
  accounts: [
    { accountId: "account-a", accountName: "account-a", marketValue: "1642.86" },
    { accountId: "account-b", accountName: "account-b", marketValue: "0.00" },
    { accountId: "empty-account", accountName: "empty-account", marketValue: "0.00" }
  ],
  allocations: [
    { id: "account-a", name: "account-a", marketValue: "1571.43", allocationType: "account" },
    { id: "account-b", name: "account-b", marketValue: "0.00", allocationType: "account" },
    { id: "empty-account", name: "empty-account", marketValue: "0.00", allocationType: "account" },
    { id: "cash", name: "现金", marketValue: "71.43", allocationType: "cash" }
  ],
  holdingAllocations: [
    { id: "usd-security", name: "US ETF", assetType: "etf", marketValue: "1000.00", percentageOfTotal: "60.87", allocationType: "instrument" },
    { id: "nzd-security", name: "NZ Fund", assetType: "pie_fund", marketValue: "571.43", percentageOfTotal: "34.78", allocationType: "instrument" },
    { id: "cash", name: "现金", assetType: "cash", marketValue: "71.43", percentageOfTotal: "4.35", allocationType: "cash" }
  ],
  quoteFetchedAt: null,
  quoteDate: null,
  warnings: []
});

const intradayQuote = dashboardQuote(
  "usd-dashboard-quote",
  usdSecurity.instrumentId,
  "2026-05-23",
  "75",
  "USD",
  "2026-05-23T10:00:00.000Z"
);
const currentQuoteDashboard = calculateDashboardSummary(holdings, accounts, prices, fxRates, "NZD", [intradayQuote]);
assert.equal(currentQuoteDashboard.totalAssets, "360.00");
assert.equal(currentQuoteDashboard.todayChange, "18.00");
assert.equal(currentQuoteDashboard.todayChangePct, "5.26");
assert.equal(currentQuoteDashboard.unrealizedGain, "105.00");
assert.equal(currentQuoteDashboard.quoteFetchedAt, "2026-05-23T10:00:00.000Z");
assert.equal(currentQuoteDashboard.quoteDate, "2026-05-23");

const quoteWithoutPriorClose = dashboardQuote(
  "usd-early-dashboard-quote",
  usdSecurity.instrumentId,
  "2026-05-20",
  "75",
  "USD",
  "2026-05-20T10:00:00.000Z"
);
const latestCloseBaselineDashboard = calculateDashboardSummary(
  [usdSecurity],
  accounts,
  [price("usd-latest-only", usdSecurity.instrumentId, "2026-05-22", "70", "USD")],
  fxRates,
  "NZD",
  [quoteWithoutPriorClose]
);
assert.equal(latestCloseBaselineDashboard.totalAssets, "225.00");
assert.equal(latestCloseBaselineDashboard.todayChange, "15.00");
assert.deepEqual(latestCloseBaselineDashboard.warnings, []);

const quoteWithoutAnyStoredClose = calculateDashboardSummary([usdSecurity], accounts, [], fxRates, "NZD", [
  quoteWithoutPriorClose
]);
assert.equal(quoteWithoutAnyStoredClose.totalAssets, "225.00");
assert.equal(quoteWithoutAnyStoredClose.todayChange, "0.00");
assert.equal(quoteWithoutAnyStoredClose.todayChangePct, "0.00");
assert.deepEqual(quoteWithoutAnyStoredClose.warnings, []);

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
assert.equal(missingPrevious.todayChange, "15.00");
assert.equal(missingPrevious.todayChangePct, "4.55");
assert.equal(missingPrevious.unrealizedGain, "90.00");
assert.deepEqual(missingPrevious.warnings, []);

const missingFx = calculateDashboardSummary(holdings, accounts, prices, []);
assert.equal(missingFx.totalAssets, null);
assert.equal(missingFx.todayChange, null);
assert.equal(missingFx.todayChangePct, null);
assert.equal(missingFx.unrealizedGain, null);
assert.deepEqual(missingFx.warnings.map((warning) => warning.code), ["MISSING_FX_RATE"]);

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
  fxRates
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
  fxRates
);
assert.equal(rounded.totalAssets, "1.01");

const duplicateUsdSecurity = { ...usdSecurity, accountId: "account-b", quantity: "1", costAmount: "50" };
const aggregatedHoldingAllocations = calculateDashboardSummary(
  [nzdSecurity, usdCash, duplicateUsdSecurity, usdSecurity],
  accounts,
  prices,
  fxRates
);
assert.deepEqual(aggregatedHoldingAllocations.holdingAllocations, [
  { id: "usd-security", name: "US ETF", assetType: "etf", marketValue: "315.00", percentageOfTotal: "70.00", allocationType: "instrument" },
  { id: "nzd-security", name: "NZ Fund", assetType: "pie_fund", marketValue: "120.00", percentageOfTotal: "26.67", allocationType: "instrument" },
  { id: "cash", name: "现金", assetType: "cash", marketValue: "15.00", percentageOfTotal: "3.33", allocationType: "cash" }
]);

const unavailableHoldingAllocations = calculateDashboardSummary(
  [usdSecurity, nzdSecurity, usdCash],
  accounts,
  prices.filter((record) => record.instrumentId !== nzdSecurity.instrumentId),
  fxRates
);
assert.deepEqual(unavailableHoldingAllocations.holdingAllocations, [
  { id: "usd-security", name: "US ETF", assetType: "etf", marketValue: "210.00", percentageOfTotal: null, allocationType: "instrument" },
  { id: "cash", name: "现金", assetType: "cash", marketValue: "15.00", percentageOfTotal: null, allocationType: "cash" },
  { id: "nzd-security", name: "NZ Fund", assetType: "pie_fund", marketValue: null, percentageOfTotal: null, allocationType: "instrument" }
]);

const zeroTotalHoldingAllocations = calculateDashboardSummary(
  [holding("zero-position", "Zero Position", "stock", "NZD", "0", "0")],
  accounts,
  [price("zero-latest", "zero-position", "2026-05-22", "10", "NZD")],
  fxRates
);
assert.deepEqual(zeroTotalHoldingAllocations.holdingAllocations, [
  { id: "zero-position", name: "Zero Position", assetType: "stock", marketValue: "0.00", percentageOfTotal: null, allocationType: "instrument" }
]);

const cashInstrument = instrument("cash-instrument", "manual", "CASH_NZD", "NZD", "cash");
const securityInstrument = instrument(usdSecurity.instrumentId, "yahoo_finance", "US_TEST", "USD", "etf");
assert.equal(
  countDailyTrades(
    [
      transaction("trade-a", usdSecurity.instrumentId, "buy", "2026-05-23", "manual", "etf"),
      transaction("trade-b", usdSecurity.instrumentId, "sell", "2026-05-23", "manual", "etf"),
      transaction("trade-c", usdSecurity.instrumentId, "buy", "2026-05-22", "manual", "etf"),
      transaction("trade-d", usdSecurity.instrumentId, "buy", "2026-05-23", "generated_cash_leg", "etf"),
      transaction("trade-e", cashInstrument.id, "buy", "2026-05-23", "manual", "cash")
    ],
    [securityInstrument, cashInstrument],
    "2026-05-23"
  ),
  2
);

// A closed loss must survive replacement of the current position.
const ledgerCash = { ...cashInstrument, id: "ledger-cash", currency: "USD" as const };
const ledgerSecurity = { ...securityInstrument, id: "ledger-security" };
function ledgerEntry(id: string, kind: InvestmentTransaction["transactionType"], amount: string, cash = false, generated = false): InvestmentTransaction {
  return { ...transaction(id, cash ? ledgerCash.id : ledgerSecurity.id, kind, id.startsWith("buy2") ? "2026-05-21" : "2026-05-20", generated ? "generated_cash_leg" : "manual", cash ? "cash" : "etf"),
    grossAmount: amount, quantity: cash ? null : "1", price: cash ? null : amount };
}
const lossLedger = [ledgerEntry("initial", "deposit", "100", true), ledgerEntry("buy1", "buy", "100"),
  ledgerEntry("buy1cash", "withdrawal", "100", true, true), ledgerEntry("sell1", "sell", "80"),
  ledgerEntry("sell1cash", "deposit", "80", true, true), ledgerEntry("buy2", "buy", "50"), ledgerEntry("buy2cash", "withdrawal", "50", true, true)];
const lossHoldings = calculateLedgerHoldings(lossLedger, accounts, [ledgerCash, ledgerSecurity]);
const liveLossQuote = dashboardQuote("loss-quote", ledgerSecurity.id, "2026-05-22", "55", "USD");
const lossPrices = [price("loss-close", ledgerSecurity.id, "2026-05-21", "52", "USD")];
const lossDashboard = calculateDashboardSummary(lossHoldings, accounts, lossPrices, [], "USD", [liveLossQuote]);
const lossValuation = calculateHoldingsValuation(lossHoldings, lossPrices, [], "USD", [liveLossQuote]);
assert.equal(lossDashboard.totalAssets, "85.00");
assert.equal(lossDashboard.unrealizedGain, "5.00");
assert.equal(lossValuation.totalMarketValue, lossDashboard.totalAssets);
assert.equal(lossValuation.totalUnrealizedGain, lossDashboard.unrealizedGain);
assert.equal(lossValuation.holdings.find(row => row.instrumentId === ledgerSecurity.id)?.latestPriceKind, "quote");
const cumulative = calculateInvestmentPerformance({ transactions: lossLedger, businessDate: "2026-05-22", currency: "USD", totalAssets: lossDashboard.totalAssets, exactFxRates: [] });
assert.equal(cumulative.netInvestment, "100.000000");
assert.equal(cumulative.investmentProfit, "-15.00");
assert.equal(cumulative.profitPercentageOfAssets, "-17.6471");
assert.equal(calculateInvestmentPerformance({ transactions: [...lossLedger, { ...ledgerEntry("future-input", "deposit", "100", true), tradeDate: "2026-05-23" }], businessDate: "2026-05-22", currency: "USD", totalAssets: "85", exactFxRates: [] }).investmentProfit, "-15.00");
const allClosed = [...lossLedger.slice(0, 5)];
const closedValue = calculateHoldingsValuation(calculateLedgerHoldings(allClosed, accounts, [ledgerCash, ledgerSecurity]), [], [], "USD");
assert.equal(closedValue.totalMarketValue, "80.00");
assert.equal(calculateInvestmentPerformance({ transactions: allClosed, businessDate: "2026-05-22", currency: "USD", totalAssets: closedValue.totalMarketValue, exactFxRates: [] }).investmentProfit, "-20.00");
const incomeLedger = [...lossLedger, ledgerEntry("dividend", "dividend", "5"), ledgerEntry("dividendcash", "deposit", "5", true, true),
  ledgerEntry("interest", "interest", "2", true), { ...ledgerEntry("fee", "fee", "0", true), fee: "1" }, { ...ledgerEntry("tax", "tax", "0", true), tax: "1" }];
const incomeValue = calculateHoldingsValuation(calculateLedgerHoldings(incomeLedger, accounts, [ledgerCash, ledgerSecurity]), lossPrices, [], "USD", [liveLossQuote]);
assert.equal(calculateInvestmentPerformance({ transactions: incomeLedger, businessDate: "2026-05-22", currency: "USD", totalAssets: incomeValue.totalMarketValue, exactFxRates: [] }).investmentProfit, "-10.00");
const transferLedger = [...lossLedger, ledgerEntry("internal-out", "withdrawal", "30", true), { ...ledgerEntry("internal-in", "deposit", "30", true), accountId: "account-b" }];
assert.equal(calculateInvestmentPerformance({ transactions: transferLedger, businessDate: "2026-05-22", currency: "USD", totalAssets: "85", exactFxRates: [] }).investmentProfit, "-15.00");
const cashFlows = [...lossLedger, ledgerEntry("external-in", "deposit", "20", true), ledgerEntry("external-out", "withdrawal", "10", true)];
assert.equal(calculateInvestmentPerformance({ transactions: cashFlows, businessDate: "2026-05-22", currency: "USD", totalAssets: "95", exactFxRates: [] }).investmentProfit, "-15.00");
const opening = [{ ...ledgerEntry("opening", "opening_position", "100"), tradeDate: "2026-05-20" }];
assert.equal(calculateInvestmentPerformance({ transactions: opening, businessDate: "2026-05-22", currency: "USD", totalAssets: "105", exactFxRates: [] }).investmentProfit, "5.00");
for (const totalAssets of ["0", "-1", null]) {
  assert.equal(calculateInvestmentPerformance({ transactions: lossLedger, businessDate: "2026-05-22", currency: "USD", totalAssets, exactFxRates: [] }).profitPercentageOfAssets, null);
}
const missingPrincipalFx = calculateInvestmentPerformance({ transactions: [{ ...ledgerEntry("fx-input", "deposit", "100", true), currency: "NZD" }], businessDate: "2026-05-22", currency: "USD", totalAssets: "85", exactFxRates: [] });
assert.equal(missingPrincipalFx.investmentProfit, null);
assert.equal(missingPrincipalFx.warnings.length, 1);
const exactPrincipalRate = { ...fxRates[0]!, rateDate: "2026-05-20", rate: "0.5" };
assert.equal(calculateInvestmentPerformance({ transactions: [{ ...ledgerEntry("fx-input", "deposit", "100", true), currency: "NZD" }], businessDate: "2026-05-22", currency: "USD", totalAssets: "55", exactFxRates: [exactPrincipalRate] }).investmentProfit, "5.00");
assert.equal(calculateInvestmentPerformance({ transactions: [], businessDate: "2026-05-22", currency: "USD", totalAssets: "0", exactFxRates: [] }).investmentProfit, "0.00");
const metadata = buildValuationMetadata(lossValuation.holdings, [], new Date("2026-05-22T10:00:00Z"), "USD");
assert.equal(metadata.quotedHoldingCount, 1);
assert.equal(metadata.storedPriceHoldingCount, 0);

const quoteInstrument = instrument(usdSecurity.instrumentId, "yahoo_finance", "US_TEST", "USD");
let fetchCount = 0;
const provider: IInstrumentQuoteProvider = {
  name: "Yahoo Finance",
  async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
    fetchCount += 1;
    return {
      provider: this.name,
      fetchedAt: input.fetchedAt,
      quotes: input.instruments.map((providerInstrument) => ({
        instrumentId: providerInstrument.instrumentId,
        sourceSymbol: providerInstrument.sourceSymbol,
        quoteDate: "2026-05-23",
        quotePrice: "80",
        currency: providerInstrument.currency
      }))
    };
  }
};
const storedQuotes = new Map<string, DashboardQuoteRecord>([
  [
    usdSecurity.instrumentId,
    dashboardQuote(
      "fresh-dashboard-quote",
      usdSecurity.instrumentId,
      "2026-05-23",
      "79",
      "USD",
      "2026-05-23T10:56:00.000Z",
      "Yahoo Finance"
    )
  ]
]);
const quoteRepository = {
  async listDashboardQuotes(): Promise<DashboardQuoteRecord[]> {
    return [...storedQuotes.values()];
  },
  async upsertDashboardQuote(input: {
    instrumentId: string;
    quoteDate: string;
    quotePrice: string;
    currency: DashboardQuoteRecord["currency"];
    provider: string;
    sourceSymbol?: string | null;
    fetchedAt: string;
  }): Promise<DashboardQuoteRecord> {
    const record = dashboardQuote(
      `quote-${input.instrumentId}`,
      input.instrumentId,
      input.quoteDate,
      input.quotePrice,
      input.currency,
      input.fetchedAt,
      input.provider
    );
    storedQuotes.set(input.instrumentId, record);
    return record;
  }
};

void verifyDashboardQuoteCache()
  .then(() => {
    console.log("Dashboard calculation verification: success");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

async function verifyDashboardQuoteCache(): Promise<void> {
  const freshQuotes = await refreshDashboardQuotes({
    holdings: [usdSecurity],
    instruments: [quoteInstrument],
    now: new Date("2026-05-23T11:00:00.000Z"),
    providers: { yahoo_finance: provider },
    dashboardQuoteRepository: quoteRepository
  });
  assert.equal(fetchCount, 0);
  assert.equal(freshQuotes[0]?.quotePrice, "79");

  const staleQuotes = await refreshDashboardQuotes({
    holdings: [usdSecurity],
    instruments: [quoteInstrument],
    now: new Date("2026-05-23T11:02:00.000Z"),
    providers: { yahoo_finance: provider },
    dashboardQuoteRepository: quoteRepository
  });
  assert.equal(fetchCount, 1);
  assert.equal(staleQuotes[0]?.quotePrice, "80");

  const staleOnlyRepository = {
    async listDashboardQuotes(): Promise<DashboardQuoteRecord[]> {
      return [
        dashboardQuote(
          "stale-dashboard-quote",
          usdSecurity.instrumentId,
          "2026-05-20",
          "70",
          "USD",
          "2026-05-23T10:00:00.000Z",
          "Yahoo Finance"
        )
      ];
    },
    async upsertDashboardQuote(): Promise<DashboardQuoteRecord> {
      throw new Error("Unexpected dashboard quote upsert.");
    }
  };
  const missingRefreshProvider: IInstrumentQuoteProvider = {
    name: "Yahoo Finance",
    async fetchLatestQuotes(input: FetchLatestInstrumentQuotesInput): Promise<InstrumentQuoteProviderResult> {
      return {
        provider: this.name,
        fetchedAt: input.fetchedAt,
        quotes: []
      };
    }
  };
  const missingRefreshQuotes = await refreshDashboardQuotes({
    holdings: [usdSecurity],
    instruments: [quoteInstrument],
    now: new Date("2026-05-23T10:06:00.000Z"),
    providers: { yahoo_finance: missingRefreshProvider },
    dashboardQuoteRepository: staleOnlyRepository
  });
  assert.deepEqual(missingRefreshQuotes, []);
}

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
    instrumentShortName: instrumentName,
    assetType,
    currency,
    quantity,
    averageUnitCost: costAmount,
    costAmount,
    warnings: costAmount === null && assetType !== "cash" ? ["COST_BASIS_UNAVAILABLE"] : []
  };
}

function transaction(
  id: string,
  instrumentId: string,
  transactionType: InvestmentTransaction["transactionType"],
  tradeDate: string,
  transactionSource: InvestmentTransaction["transactionSource"],
  instrumentAssetType: InvestmentTransaction["instrumentAssetType"]
): InvestmentTransaction {
  return {
    id,
    accountId: "account-a",
    instrumentId,
    instrumentSymbol: null,
    instrumentName: null,
    instrumentShortName: null,
    instrumentAssetType,
    transactionType,
    tradeDate,
    settlementDate: null,
    quantity: transactionType === "buy" || transactionType === "sell" ? "1" : null,
    price: transactionType === "buy" || transactionType === "sell" ? "1" : null,
    grossAmount: transactionType === "buy" || transactionType === "sell" ? "1" : null,
    fee: "0",
    tax: "0",
    currency: "USD",
    adjustmentDirection: null,
    transactionSource,
    linkedTransactionId: null,
    settlementCurrency: null,
    settlementAmount: null,
    notes: null,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: `${tradeDate}T00:00:00.000Z`,
    updatedAt: `${tradeDate}T00:00:00.000Z`
  };
}

function price(
  id: string,
  instrumentId: string,
  priceDate: string,
  closePrice: string,
  currency: PriceRecord["currency"],
  source = "manual"
): PriceRecord {
  return {
    id,
    instrumentId,
    priceDate,
    closePrice,
    currency,
    source,
    sourceSymbol: null,
    isAdjusted: false,
    createdAt: `${priceDate}T00:00:00.000Z`,
    updatedAt: `${priceDate}T00:00:00.000Z`
  };
}

function instrument(
  id: string,
  priceSource: Instrument["priceSource"],
  priceSourceSymbol: string,
  currency: Instrument["currency"],
  assetType: Instrument["assetType"] = "etf"
): Instrument {
  return {
    id,
    symbol: priceSourceSymbol,
    name: priceSourceSymbol,
    shortName: priceSourceSymbol,
    description: null,
    marketRegion: "US",
    exchange: "NASDAQ",
    currency,
    assetType,
    isin: null,
    provider: null,
    priceSource,
    priceSourceSymbol,
    priceSourceExchange: null,
    priceUpdateEnabled: true,
    priceUpdatePriority: 100,
    sourceUrl: null,
    sourceCheckedAt: null,
    createdByUserId: null,
    updatedByUserId: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function dashboardQuote(
  id: string,
  instrumentId: string,
  quoteDate: string,
  quotePrice: string,
  currency: DashboardQuoteRecord["currency"],
  fetchedAt: string,
  provider = "manual"
): DashboardQuoteRecord {
  return {
    id,
    instrumentId,
    quoteDate,
    quotePrice,
    currency,
    provider,
    sourceSymbol: null,
    fetchedAt,
    createdAt: fetchedAt,
    updatedAt: fetchedAt
  };
}

function fxRate(
  id: string,
  fromCurrency: ExchangeRateRecord["fromCurrency"],
  rate: string,
  provider = "manual"
): ExchangeRateRecord {
  return {
    id,
    fromCurrency,
    toCurrency: "USD",
    rateDate: "2026-05-22",
    rate,
    rateType: "valuation",
    provider,
    providerRateDate: "2026-05-22",
    fetchedAt: "2026-05-22T00:00:00.000Z",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z"
  };
}
