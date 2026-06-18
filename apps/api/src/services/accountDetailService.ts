import Decimal from "decimal.js";
import {
  getAppBusinessDate,
  PORTFOLIO_TREND_RANGES,
  type AccountDetailCashBalance,
  type AccountDetailRecentTransaction,
  type AccountDetailSnapshotPoint,
  type AccountDetailSummary,
  type AccountDetailTrend,
  type AuthenticatedUser,
  type DashboardWarning,
  type HoldingSummary,
  type InvestmentTransaction,
  type PortfolioSnapshotSummary,
  type PortfolioTrendRange,
  type SnapshotDisplayCurrency,
  type SnapshotWarning,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { findAccountById, listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listAccountSnapshotTrendRows } from "../repositories/portfolioSnapshotRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { calculateHoldings } from "./holdingService";
import { buildSampledPortfolioPoints, getTrendRangeStart } from "./portfolioSnapshotService";
import { calculateHoldingsValuation } from "./portfolioValuationService";
import { resolveReportingCurrency } from "./reportingCurrencyService";
import { listValuationRatesForHoldings } from "./valuationMarketDataService";

const earliestDate = "0001-01-01";
const defaultRecentLimit = 10;
const maxRecentLimit = 50;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getAccountDetail(input: {
  accountId?: string;
  currency?: string;
  trendRange?: string;
  recentLimit?: string;
  user?: AuthenticatedUser;
}): Promise<AccountDetailSummary> {
  const accountId = requiredUuid(input.accountId, "accountId");
  const [reportingCurrency, trendRange, recentLimit] = await Promise.all([
    resolveReportingCurrency(input),
    Promise.resolve(optionalTrendRange(input.trendRange)),
    Promise.resolve(optionalRecentLimit(input.recentLimit))
  ]);
  const account = await findAccountById(accountId);

  if (!account) {
    throw new ApiRequestError("NOT_FOUND", "Account was not found.", 404);
  }

  const valuationBusinessDate = getAppBusinessDate();
  const [transactions, accounts, instruments, trend] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments(),
    buildAccountTrend({ accountId, currency: reportingCurrency, range: trendRange, today: valuationBusinessDate })
  ]);
  const accountTransactions = transactions.filter((transaction) => transaction.accountId === accountId);
  const preliminaryHoldings = calculateHoldings(transactions, accounts, instruments)
    .filter((holding) => holding.accountId === accountId);
  const securityInstruments = uniqueBy(
    preliminaryHoldings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => ({ instrumentId: holding.instrumentId, currency: holding.currency })),
    (instrument) => instrument.instrumentId
  );
  const [prices, fxRates] = await Promise.all([
    listLatestPrices(securityInstruments),
    listValuationRatesForHoldings({
      valuationDate: valuationBusinessDate,
      transactions: accountTransactions,
      holdings: preliminaryHoldings,
      reportingCurrency
    })
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments, fxRates)
    .filter((holding) => holding.accountId === accountId);
  const valuation = calculateHoldingsValuation(holdings, prices, fxRates, reportingCurrency);
  const recentTransactions = buildRecentTransactions(accountTransactions, recentLimit);
  const latestSnapshot = trend.points
    .filter((point): point is AccountDetailSnapshotPoint & { snapshotDate: string } => point.snapshotDate !== null)
    .sort((left, right) => right.snapshotDate.localeCompare(left.snapshotDate))
    [0] ?? null;

  return {
    reportingCurrency,
    account,
    currentValue: {
      marketValue: valuation.totalMarketValue,
      cashMarketValue: sumValuedHoldings(valuation.holdings, (holding) => holding.assetType === "cash"),
      nonCashMarketValue: sumValuedHoldings(valuation.holdings, (holding) => holding.assetType !== "cash"),
      unrealizedGain: valuation.totalUnrealizedGain,
      holdingCount: valuation.holdings.filter((holding) => holding.assetType !== "cash").length,
      cashBalanceCount: valuation.holdings.filter((holding) => holding.assetType === "cash").length,
      valuationBusinessDate
    },
    holdings: valuation.holdings,
    cashBalances: buildCashBalances(valuation.holdings),
    recentTransactions,
    trend,
    latestSnapshot,
    valuationWarnings: valuation.warnings,
    snapshotWarnings: trend.warnings
  };
}

export async function buildAccountTrend(input: {
  accountId: string;
  currency: SnapshotDisplayCurrency;
  range: PortfolioTrendRange;
  today?: string;
  rows?: Array<AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] }>;
}): Promise<AccountDetailTrend> {
  const rangeEnd = input.today ?? getAppBusinessDate();
  const rows =
    input.rows ?? await listAccountSnapshotTrendRows({
      accountId: input.accountId,
      from: earliestDate,
      to: rangeEnd,
      currency: input.currency,
      order: "asc"
    });
  const firstSnapshotDate = rows.find((row) => row.marketValue !== null)?.snapshotDate ?? rows[0]?.snapshotDate ?? null;
  const rangeStart = input.range === "inception"
    ? (firstSnapshotDate ?? rangeEnd)
    : getTrendRangeStart(input.range, rangeEnd, firstSnapshotDate);
  const sampled = buildSampledPortfolioPoints({
    snapshots: rows.map(toPortfolioSnapshotSummary),
    range: input.range,
    rangeStart,
    rangeEnd
  });

  return {
    range: input.range,
    rangeStart,
    rangeEnd,
    currency: input.currency,
    points: sampled.map((point) => ({
      date: point.date,
      snapshotDate: point.snapshotDate,
      marketValue: point.portfolioValue
    })),
    warnings: collectSampledSnapshotWarnings(rows, sampled)
  };
}

function collectSampledSnapshotWarnings(
  rows: Array<AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] }>,
  sampled: Array<{ snapshotDate: string | null }>
): SnapshotWarning[] {
  const sampledSnapshotDates = new Set(
    sampled
      .map((point) => point.snapshotDate)
      .filter((snapshotDate): snapshotDate is string => snapshotDate !== null)
  );

  return uniqueSnapshotWarnings(
    rows
      .filter((row) => row.snapshotDate !== null && sampledSnapshotDates.has(row.snapshotDate))
      .flatMap((row) => row.warnings)
  );
}

function buildCashBalances(holdings: ValuedHoldingSummary[]): AccountDetailCashBalance[] {
  return holdings
    .filter((holding) => holding.assetType === "cash")
    .map((holding) => ({
      instrumentId: holding.instrumentId,
      instrumentSymbol: holding.instrumentSymbol,
      instrumentName: holding.instrumentName,
      instrumentShortName: holding.instrumentShortName,
      currency: holding.currency,
      balance: holding.quantity,
      marketValue: holding.marketValue,
      holdingWarnings: holding.warnings,
      valuationWarnings: holding.valuationWarnings
    }));
}

function buildRecentTransactions(
  transactions: InvestmentTransaction[],
  limit: number
): AccountDetailRecentTransaction[] {
  const linkedCashLegs = new Map(
    transactions
      .filter((transaction) => transaction.transactionSource === "generated_cash_leg" && transaction.linkedTransactionId)
      .map((transaction) => [transaction.linkedTransactionId as string, transaction])
  );

  return transactions
    .filter((transaction) => transaction.transactionSource !== "generated_cash_leg")
    .sort(compareTransactionsDesc)
    .slice(0, limit)
    .map((transaction) => ({
      transaction,
      linkedCashLeg: linkedCashLegs.get(transaction.id) ?? null
    }));
}

function compareTransactionsDesc(left: InvestmentTransaction, right: InvestmentTransaction): number {
  return (
    right.tradeDate.localeCompare(left.tradeDate) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function sumValuedHoldings(
  holdings: ValuedHoldingSummary[],
  predicate: (holding: ValuedHoldingSummary) => boolean
): string | null {
  const selected = holdings.filter(predicate);

  if (selected.length === 0) {
    return "0.00";
  }

  let total = new Decimal(0);

  for (const holding of selected) {
    if (holding.marketValue === null) {
      return null;
    }

    total = total.plus(holding.marketValue);
  }

  return total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function toPortfolioSnapshotSummary(
  point: AccountDetailSnapshotPoint & { warnings: SnapshotWarning[] }
): PortfolioSnapshotSummary {
  return {
    id: `${point.snapshotDate ?? point.date}:account`,
    snapshotDate: point.snapshotDate ?? point.date,
    currency: "USD",
    marketValue: point.marketValue,
    cost: null,
    unrealizedGain: null,
    dailyChange: null,
    dailyChangePct: null,
    usdToNzdRate: "1",
    usdToCnyRate: "1",
    warnings: point.warnings,
    accounts: [],
    createdAt: `${point.snapshotDate ?? point.date}T00:00:00.000Z`,
    updatedAt: `${point.snapshotDate ?? point.date}T00:00:00.000Z`
  };
}

function optionalTrendRange(value: string | undefined): PortfolioTrendRange {
  if (!value) {
    return "3m";
  }

  if (!PORTFOLIO_TREND_RANGES.includes(value as PortfolioTrendRange)) {
    throw new ApiRequestError("VALIDATION_ERROR", "trendRange is invalid.", 400);
  }

  return value as PortfolioTrendRange;
}

function optionalRecentLimit(value: string | undefined): number {
  if (!value) {
    return defaultRecentLimit;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > maxRecentLimit) {
    throw new ApiRequestError("VALIDATION_ERROR", `recentLimit must be an integer between 1 and ${maxRecentLimit}.`, 400);
  }

  return limit;
}

function requiredUuid(value: string | undefined, field: string): string {
  if (!value) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} is required.`, 400);
  }

  if (!uuidPattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${field} id is invalid.`, 400);
  }

  return value;
}

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

function uniqueSnapshotWarnings(warnings: SnapshotWarning[]): SnapshotWarning[] {
  const unique = new Map<string, SnapshotWarning>();

  for (const warning of warnings) {
    unique.set(
      [
        warning.code,
        warning.accountId,
        warning.instrumentId,
        warning.currency
      ].join(":"),
      warning
    );
  }

  return [...unique.values()];
}
