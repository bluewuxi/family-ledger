import Decimal from "decimal.js";
import {
  selectLatestPriceRecordsByDistinctDates,
  selectPreferredExchangeRateRecord
} from "@family-ledger/shared";
import type {
  CurrencyCode,
  DashboardAccountSummary,
  DashboardAllocationSummary,
  DashboardHoldingAllocationSummary,
  DashboardQuoteRecord,
  DashboardSummary,
  DashboardWarning,
  DashboardWarningCode,
  ExchangeRateRecord,
  HoldingSummary,
  HoldingsValuationSummary,
  InvestmentAccount,
  PriceRecord,
  SnapshotDisplayCurrency,
  ValuedHoldingSummary
} from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";

export const reportingCurrencies = ["NZD", "USD", "CNY"] as const satisfies readonly SnapshotDisplayCurrency[];

export function parseReportingCurrency(value: string | undefined): SnapshotDisplayCurrency {
  if (value === undefined || value === "") {
    return "NZD";
  }

  if (reportingCurrencies.includes(value as SnapshotDisplayCurrency)) {
    return value as SnapshotDisplayCurrency;
  }

  throw new ApiRequestError("VALIDATION_ERROR", "currency must be NZD, USD, or CNY.", 400);
}

export function calculateDashboardSummary(
  holdings: HoldingSummary[],
  accounts: InvestmentAccount[],
  prices: PriceRecord[],
  fxRates: ExchangeRateRecord[],
  reportingCurrency: SnapshotDisplayCurrency = "NZD",
  dashboardQuotes: DashboardQuoteRecord[] = [],
  dailyTradeCount = 0
): DashboardSummary {
  const valuation = calculateValuedHoldings(holdings, prices, fxRates, reportingCurrency, dashboardQuotes);
  const quoteMetadata = getQuoteMetadata(dashboardQuotes);
  const dashboardAccounts = buildDashboardAccounts(valuation.holdings, accounts);

  return {
    reportingCurrency,
    totalAssets: valuation.totalMarketValue,
    todayChange: valuation.todayChange,
    todayChangePct: valuation.todayChangePct,
    unrealizedGain: valuation.totalUnrealizedGain,
    dailyTradeCount,
    accountCount: accounts.length,
    accounts: dashboardAccounts,
    allocations: buildDashboardAllocations(valuation.holdings, accounts),
    holdingAllocations: buildDashboardHoldingAllocations(valuation.holdings, valuation.totalMarketValue),
    quoteFetchedAt: quoteMetadata.fetchedAt,
    quoteDate: quoteMetadata.quoteDate,
    warnings: valuation.warnings
  };
}

export function calculateHoldingsValuation(
  holdings: HoldingSummary[],
  prices: PriceRecord[],
  fxRates: ExchangeRateRecord[],
  reportingCurrency: SnapshotDisplayCurrency = "NZD"
): HoldingsValuationSummary {
  const valuation = calculateValuedHoldings(holdings, prices, fxRates, reportingCurrency);

  return {
    reportingCurrency,
    totalMarketValue: valuation.totalMarketValue,
    totalUnrealizedGain: valuation.totalUnrealizedGain,
    warnings: valuation.warnings,
    holdings: valuation.holdings
  };
}

interface PortfolioValuation {
  totalMarketValue: string | null;
  todayChange: string | null;
  todayChangePct: string | null;
  totalUnrealizedGain: string | null;
  warnings: DashboardWarning[];
  holdings: ValuedHoldingSummary[];
}

function calculateValuedHoldings(
  holdings: HoldingSummary[],
  prices: PriceRecord[],
  fxRates: ExchangeRateRecord[],
  reportingCurrency: SnapshotDisplayCurrency,
  dashboardQuotes: DashboardQuoteRecord[] = []
): PortfolioValuation {
  if (holdings.length === 0) {
    return {
      totalMarketValue: "0.00",
      todayChange: "0.00",
      todayChangePct: null,
      totalUnrealizedGain: "0.00",
      warnings: [],
      holdings: []
    };
  }

  const pricesByInstrument = groupValidPricesByInstrument(holdings, prices);
  const quotesByInstrument = groupValidQuotesByInstrument(holdings, dashboardQuotes);
  const fxRatesByCurrency = groupLatestUsdRatesByCurrency(fxRates);
  const displayRate = getDisplayRate(reportingCurrency, fxRatesByCurrency);
  const warnings: DashboardWarning[] = [];
  const warningKeys = new Set<string>();
  const valuedHoldings: ValuedHoldingSummary[] = [];
  let totalMarketValue = new Decimal(0);
  let todayChange = new Decimal(0);
  let priorPortfolioValue = new Decimal(0);
  let totalUnrealizedGain = new Decimal(0);
  let totalMarketValueAvailable = true;
  let todayChangeAvailable = true;
  let totalUnrealizedGainAvailable = true;

  for (const holding of holdings) {
    const rowWarnings: DashboardWarning[] = [];
    const rowWarningKeys = new Set<string>();
    const fxRate = getCurrencyToUsdRate(holding.currency, fxRatesByCurrency);
    const quantity = new Decimal(holding.quantity);
    let rowMarketValueUsd: Decimal | null = null;
    let rowUnrealizedGainUsd: Decimal | null = null;
    let latestPrice: PriceRecord | null = null;

    if (fxRate === null) {
      addWarning(warnings, warningKeys, "MISSING_FX_RATE", holding);
      addWarning(rowWarnings, rowWarningKeys, "MISSING_FX_RATE", holding);
      totalMarketValueAvailable = false;
      todayChangeAvailable = false;
      totalUnrealizedGainAvailable = false;
    } else if (holding.assetType === "cash") {
      rowMarketValueUsd = quantity.times(fxRate);
      totalMarketValue = totalMarketValue.plus(rowMarketValueUsd);
      priorPortfolioValue = priorPortfolioValue.plus(rowMarketValueUsd);
    } else {
      const holdingPrices = pricesByInstrument.get(holding.instrumentId) ?? [];
      const currentQuote = quotesByInstrument.get(holding.instrumentId) ?? null;
      latestPrice = currentQuote ? dashboardQuoteToPriceRecord(currentQuote) : (holdingPrices[0] ?? null);

      if (!latestPrice) {
        addWarning(warnings, warningKeys, "MISSING_LATEST_PRICE", holding);
        addWarning(rowWarnings, rowWarningKeys, "MISSING_LATEST_PRICE", holding);
        totalMarketValueAvailable = false;
        todayChangeAvailable = false;
        totalUnrealizedGainAvailable = false;
      } else {
        rowMarketValueUsd = quantity.times(latestPrice.closePrice).times(fxRate);
        totalMarketValue = totalMarketValue.plus(rowMarketValueUsd);

        const holdingCostUsd = getHoldingCostUsd(holding, fxRate);

        if (holdingCostUsd === null) {
          addWarning(warnings, warningKeys, "COST_BASIS_UNAVAILABLE", holding);
          addWarning(rowWarnings, rowWarningKeys, "COST_BASIS_UNAVAILABLE", holding);
          totalUnrealizedGainAvailable = false;
        } else {
          rowUnrealizedGainUsd = rowMarketValueUsd.minus(holdingCostUsd);
          totalUnrealizedGain = totalUnrealizedGain.plus(rowUnrealizedGainUsd);
        }

        const previousPrice = currentQuote
          ? (holdingPrices.find((price) => price.priceDate < currentQuote.quoteDate) ?? holdingPrices[0])
          : holdingPrices[1];
        const baselinePrice = previousPrice ?? latestPrice;

        const previousValue = quantity.times(baselinePrice.closePrice).times(fxRate);
        priorPortfolioValue = priorPortfolioValue.plus(previousValue);
        todayChange = todayChange.plus(rowMarketValueUsd.minus(previousValue));
      }
    }

    valuedHoldings.push({
      ...holding,
      reportingCurrency,
      marketValue: rowMarketValueUsd && displayRate ? formatMoney(rowMarketValueUsd.times(displayRate)) : null,
      unrealizedGain:
        rowUnrealizedGainUsd && displayRate ? formatMoney(rowUnrealizedGainUsd.times(displayRate)) : null,
      latestPrice: latestPrice?.closePrice ?? null,
      latestPriceDate: latestPrice?.priceDate ?? null,
      valuationWarnings: rowWarnings
    });
  }

  const displayDataAvailable = displayRate !== null;
  const dailyDataAvailable = totalMarketValueAvailable && todayChangeAvailable;

  return {
    totalMarketValue:
      totalMarketValueAvailable && displayDataAvailable ? formatMoney(totalMarketValue.times(displayRate)) : null,
    todayChange: dailyDataAvailable && displayDataAvailable ? formatMoney(todayChange.times(displayRate)) : null,
    todayChangePct:
      dailyDataAvailable && !priorPortfolioValue.isZero()
        ? formatPercentage(todayChange.dividedBy(priorPortfolioValue).times(100))
        : null,
    totalUnrealizedGain:
      totalMarketValueAvailable && totalUnrealizedGainAvailable && displayDataAvailable
        ? formatMoney(totalUnrealizedGain.times(displayRate))
        : null,
    warnings,
    holdings: valuedHoldings
  };
}

function groupValidQuotesByInstrument(
  holdings: HoldingSummary[],
  quotes: DashboardQuoteRecord[]
): Map<string, DashboardQuoteRecord> {
  const instrumentCurrencies = new Map(holdings.map((holding) => [holding.instrumentId, holding.currency]));
  const groupedQuotes = new Map<string, DashboardQuoteRecord>();

  for (const quote of quotes) {
    if (instrumentCurrencies.get(quote.instrumentId) !== quote.currency) {
      continue;
    }

    const existing = groupedQuotes.get(quote.instrumentId);
    if (!existing || quote.fetchedAt > existing.fetchedAt) {
      groupedQuotes.set(quote.instrumentId, quote);
    }
  }

  return groupedQuotes;
}

function dashboardQuoteToPriceRecord(quote: DashboardQuoteRecord): PriceRecord {
  return {
    id: quote.id,
    instrumentId: quote.instrumentId,
    priceDate: quote.quoteDate,
    closePrice: quote.quotePrice,
    currency: quote.currency,
    source: quote.provider,
    sourceSymbol: quote.sourceSymbol,
    isAdjusted: false,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt
  };
}

function getQuoteMetadata(quotes: DashboardQuoteRecord[]): { fetchedAt: string | null; quoteDate: string | null } {
  if (quotes.length === 0) {
    return { fetchedAt: null, quoteDate: null };
  }

  return {
    fetchedAt: quotes.map((quote) => quote.fetchedAt).sort().at(-1) ?? null,
    quoteDate: quotes.map((quote) => quote.quoteDate).sort().at(-1) ?? null
  };
}

function groupValidPricesByInstrument(
  holdings: HoldingSummary[],
  prices: PriceRecord[]
): Map<string, PriceRecord[]> {
  const instrumentCurrencies = new Map(holdings.map((holding) => [holding.instrumentId, holding.currency]));
  const groupedPrices = new Map<string, PriceRecord[]>();

  for (const price of prices) {
    if (instrumentCurrencies.get(price.instrumentId) !== price.currency) {
      continue;
    }

    const records = groupedPrices.get(price.instrumentId) ?? [];
    records.push(price);
    groupedPrices.set(price.instrumentId, records);
  }

  for (const records of groupedPrices.values()) {
    records.splice(0, records.length, ...selectLatestPriceRecordsByDistinctDates(records, 2));
  }

  return groupedPrices;
}

function groupLatestUsdRatesByCurrency(fxRates: ExchangeRateRecord[]): Map<CurrencyCode, Decimal> {
  const ratesByCurrencyAndDate = new Map<CurrencyCode, Map<string, ExchangeRateRecord[]>>();

  for (const rate of fxRates) {
    if (rate.toCurrency !== "USD" || rate.rateType !== "valuation") {
      continue;
    }

    const ratesByDate = ratesByCurrencyAndDate.get(rate.fromCurrency) ?? new Map<string, ExchangeRateRecord[]>();
    const ratesForDate = ratesByDate.get(rate.rateDate) ?? [];
    ratesForDate.push(rate);
    ratesByDate.set(rate.rateDate, ratesForDate);
    ratesByCurrencyAndDate.set(rate.fromCurrency, ratesByDate);
  }

  const ratesByCurrency = new Map<CurrencyCode, Decimal>();

  for (const [currency, ratesByDate] of ratesByCurrencyAndDate) {
    const [latestDate] = [...ratesByDate.keys()].sort((left, right) => right.localeCompare(left));
    const selected = latestDate ? selectPreferredExchangeRateRecord(ratesByDate.get(latestDate) ?? []) : null;

    if (selected) {
      ratesByCurrency.set(currency, new Decimal(selected.rate));
    }
  }

  return ratesByCurrency;
}

function getCurrencyToUsdRate(currency: CurrencyCode, fxRatesByCurrency: Map<CurrencyCode, Decimal>): Decimal | null {
  if (currency === "USD") {
    return new Decimal(1);
  }

  return fxRatesByCurrency.get(currency) ?? null;
}

function getDisplayRate(
  currency: SnapshotDisplayCurrency,
  fxRatesByCurrency: Map<CurrencyCode, Decimal>
): Decimal | null {
  if (currency === "USD") {
    return new Decimal(1);
  }

  const currencyToUsd = fxRatesByCurrency.get(currency);
  return currencyToUsd && !currencyToUsd.isZero() ? new Decimal(1).dividedBy(currencyToUsd) : null;
}

function getHoldingCostUsd(holding: HoldingSummary, latestFxRate: Decimal): Decimal | null {
  if (holding.costAmountUsd !== undefined) {
    return holding.costAmountUsd === null ? null : new Decimal(holding.costAmountUsd);
  }

  return holding.costAmount === null ? null : new Decimal(holding.costAmount).times(latestFxRate);
}

function addWarning(
  warnings: DashboardWarning[],
  warningKeys: Set<string>,
  code: DashboardWarningCode,
  holding: HoldingSummary
): void {
  const key = `${code}:${holding.accountId}:${holding.instrumentId}:${holding.currency}`;

  if (warningKeys.has(key)) {
    return;
  }

  warningKeys.add(key);
  warnings.push({
    code,
    instrumentId: holding.instrumentId,
    instrumentName: holding.instrumentName,
    instrumentShortName: holding.instrumentShortName,
    currency: holding.currency
  });
}

function buildDashboardAccounts(
  holdings: ValuedHoldingSummary[],
  accounts: InvestmentAccount[]
): DashboardAccountSummary[] {
  const accountValues = new Map<string, Decimal>();
  const unavailableAccountIds = new Set<string>();

  for (const account of accounts) {
    accountValues.set(account.id, new Decimal(0));
  }

  for (const holding of holdings) {
    if (holding.marketValue === null) {
      unavailableAccountIds.add(holding.accountId);
      continue;
    }

    const currentValue = accountValues.get(holding.accountId) ?? new Decimal(0);
    accountValues.set(holding.accountId, currentValue.plus(holding.marketValue));
  }

  return accounts.map((account) => ({
    accountId: account.id,
    accountName: account.name,
    marketValue: unavailableAccountIds.has(account.id) ? null : formatMoney(accountValues.get(account.id) ?? new Decimal(0))
  }));
}

function buildDashboardAllocations(
  holdings: ValuedHoldingSummary[],
  accounts: InvestmentAccount[]
): DashboardAllocationSummary[] {
  const accountValues = new Map<string, Decimal>();
  const unavailableAccountIds = new Set<string>();
  let cashValue = new Decimal(0);
  let cashValueAvailable = true;

  for (const account of accounts) {
    accountValues.set(account.id, new Decimal(0));
  }

  for (const holding of holdings) {
    if (holding.marketValue === null) {
      if (holding.assetType === "cash") {
        cashValueAvailable = false;
      } else {
        unavailableAccountIds.add(holding.accountId);
      }
      continue;
    }

    if (holding.assetType === "cash") {
      cashValue = cashValue.plus(holding.marketValue);
      continue;
    }

    const currentValue = accountValues.get(holding.accountId) ?? new Decimal(0);
    accountValues.set(holding.accountId, currentValue.plus(holding.marketValue));
  }

  const accountAllocations = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    marketValue: unavailableAccountIds.has(account.id) ? null : formatMoney(accountValues.get(account.id) ?? new Decimal(0)),
    allocationType: "account" as const
  }));

  return [
    ...accountAllocations,
    {
      id: "cash",
      name: "现金",
      marketValue: cashValueAvailable ? formatMoney(cashValue) : null,
      allocationType: "cash"
    }
  ];
}

function buildDashboardHoldingAllocations(
  holdings: ValuedHoldingSummary[],
  totalAssets: string | null
): DashboardHoldingAllocationSummary[] {
  const aggregates = new Map<string, DashboardHoldingAllocationAccumulator>();

  for (const holding of holdings) {
    const key = holding.assetType === "cash" ? "cash" : holding.instrumentId;
    const existing = aggregates.get(key) ?? {
      id: key,
      name: holding.assetType === "cash" ? "现金" : holding.instrumentShortName,
      assetType: holding.assetType,
      allocationType: holding.assetType === "cash" ? "cash" : "instrument",
      marketValue: new Decimal(0),
      marketValueAvailable: true
    };

    if (holding.marketValue === null) {
      existing.marketValueAvailable = false;
    } else if (existing.marketValueAvailable) {
      existing.marketValue = existing.marketValue.plus(holding.marketValue);
    }

    aggregates.set(key, existing);
  }

  const total = totalAssets === null ? null : new Decimal(totalAssets);
  const canCalculatePercentage = total !== null && total.gt(0);

  return [...aggregates.values()]
    .map((aggregate) => {
      const marketValue = aggregate.marketValueAvailable ? formatMoney(aggregate.marketValue) : null;

      return {
        id: aggregate.id,
        name: aggregate.name,
        assetType: aggregate.assetType,
        marketValue,
        percentageOfTotal:
          marketValue !== null && canCalculatePercentage
            ? formatPercentage(new Decimal(marketValue).dividedBy(total).times(100))
            : null,
        allocationType: aggregate.allocationType
      };
    })
    .sort(compareHoldingAllocations);
}

interface DashboardHoldingAllocationAccumulator {
  id: string;
  name: string;
  assetType: DashboardHoldingAllocationSummary["assetType"];
  allocationType: DashboardHoldingAllocationSummary["allocationType"];
  marketValue: Decimal;
  marketValueAvailable: boolean;
}

function compareHoldingAllocations(
  left: DashboardHoldingAllocationSummary,
  right: DashboardHoldingAllocationSummary
): number {
  const leftRank = holdingAllocationRank(left);
  const rightRank = holdingAllocationRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const leftValue = left.marketValue === null ? null : new Decimal(left.marketValue);
  const rightValue = right.marketValue === null ? null : new Decimal(right.marketValue);

  if (leftValue !== null && rightValue !== null && !leftValue.equals(rightValue)) {
    return rightValue.comparedTo(leftValue);
  }

  return left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
}

function holdingAllocationRank(allocation: DashboardHoldingAllocationSummary): number {
  if (allocation.marketValue === null) {
    return allocation.allocationType === "cash" ? 3 : 2;
  }

  return allocation.allocationType === "cash" ? 1 : 0;
}

function formatMoney(amount: Decimal): string {
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function formatPercentage(amount: Decimal): string {
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
