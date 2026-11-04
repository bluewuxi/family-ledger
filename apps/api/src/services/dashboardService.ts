import { getNextQuoteRefreshAt, getQuotes as refreshDashboardQuotes } from "./priceAcquisitionService";
import { completeInvestmentPerformance } from "./investmentPerformanceService";
import { timed } from "../utils/timing";
import { parseQuoteMode } from "./quoteMode";
import type {
  AuthenticatedUser,
  DashboardSummary,
  Instrument,
  InvestmentAccount,
  InvestmentTransaction
} from "@family-ledger/shared";
import { calculateHoldings, getAppBusinessDate } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateDashboardSummary, calculateHoldingsValuation, calculateTradingDayChange } from "./portfolioValuationService";
import { resolveReportingCurrency } from "./reportingCurrencyService";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";
import { getInvestmentPerformance } from "./investmentPerformanceService";
import { buildValuationMetadata } from "./valuationMetadataService";

export { calculateDashboardSummary } from "./portfolioValuationService";

export async function getDashboard(input: { currency?: string; user?: AuthenticatedUser; quoteMode?: string } = {}): Promise<DashboardSummary> {
  return (await getCurrentInvestmentPortfolio(input)).dashboard;
}

export async function getCurrentInvestmentPortfolio(input: { currency?: string; user?: AuthenticatedUser; quoteMode?: string } = {}) {
  parseQuoteMode(input.quoteMode);
  const quoteRefreshWarnings: string[] = [];
  const now = new Date();
  const businessDate = getAppBusinessDate(now);
  const reportingCurrency = await resolveReportingCurrency(input);
  const [transactions, accounts, instruments] = await Promise.all([
    timed("portfolio.transactions", () => listTransactions({ purpose: "investment", to: businessDate })),
    listAccounts(),
    listInstruments()
  ]);
  const { accounts: investmentAccounts, transactions: investmentTransactions } = selectInvestmentLedger(accounts, transactions);
  const currentTransactions = investmentTransactions.filter(transaction => transaction.tradeDate <= businessDate);
  const preliminaryHoldings = calculateHoldings(currentTransactions, investmentAccounts, instruments);
  const securityInstruments = uniqueBy(
    preliminaryHoldings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => ({ instrumentId: holding.instrumentId, currency: holding.currency })),
    (instrument) => instrument.instrumentId
  );
  const [prices, fxRates, preliminaryPerformance] = await Promise.all([
    timed("portfolio.prices", () => listLatestPrices(securityInstruments)),
    listValuationRatesForHoldings({
      valuationDate: businessDate,
      transactions: currentTransactions,
      holdings: preliminaryHoldings,
      reportingCurrency
    }),
    timed("portfolio.performance", () => getInvestmentPerformance({ totalAssets: null, transactions: currentTransactions, currency: reportingCurrency, businessDate }))
  ]);
  const holdings = calculateHoldings(currentTransactions, investmentAccounts, instruments, { fxRates });
  const dashboardQuotes = await timed("portfolio.quotes", () => refreshDashboardQuotes({ holdings, instruments, now, quoteMode: input.quoteMode, quoteRefreshWarnings }));
  const dailyTradeCount = countDailyTrades(investmentTransactions, instruments, businessDate);

  const dashboard = calculateDashboardSummary(holdings, investmentAccounts, prices, fxRates, reportingCurrency, dashboardQuotes, dailyTradeCount);
  const valuedHoldings = calculateHoldingsValuation(holdings, prices, fxRates, reportingCurrency, dashboardQuotes);
  const investmentPerformance = completeInvestmentPerformance(preliminaryPerformance, dashboard.totalAssets);
  const valuationMetadata = { ...buildValuationMetadata(valuedHoldings.holdings, fxRates, now, reportingCurrency), nextRefreshAt: await getNextQuoteRefreshAt(holdings, instruments, dashboardQuotes, now) };
  return {
    dashboard: { ...dashboard, quoteRefreshWarnings, ...calculateTradingDayChange(holdings, instruments, prices, fxRates, reportingCurrency, dashboardQuotes, businessDate, dashboard.totalAssets), investmentPerformance, valuationMetadata },
    holdings: { ...valuedHoldings, quoteRefreshWarnings, investmentPerformance, valuationMetadata }
  };
}

export function selectInvestmentLedger(accounts: InvestmentAccount[], transactions: InvestmentTransaction[]) {
  const investmentAccounts = accounts.filter((account) => account.purpose === "investment");
  const investmentAccountIds = new Set(investmentAccounts.map((account) => account.id));
  return {
    accounts: investmentAccounts,
    transactions: transactions.filter((transaction) => investmentAccountIds.has(transaction.accountId))
  };
}

export function countDailyTrades(transactions: InvestmentTransaction[], instruments: Instrument[], businessDate: string): number {
  const instrumentsById = new Map(instruments.map((instrument) => [instrument.id, instrument]));

  return transactions.filter((transaction) => {
    const instrumentAssetType = transaction.instrumentAssetType ?? instrumentsById.get(transaction.instrumentId)?.assetType ?? null;

    return (
      transaction.tradeDate === businessDate &&
      (transaction.transactionType === "buy" || transaction.transactionType === "sell") &&
      transaction.transactionSource !== "generated_cash_leg" &&
      instrumentAssetType !== "cash"
    );
  }).length;
}


export { getQuotes as refreshDashboardQuotes } from "./priceAcquisitionService";

function uniqueBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = keyOf(value);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
