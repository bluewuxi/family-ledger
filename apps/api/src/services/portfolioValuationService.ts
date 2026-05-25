import Decimal from "decimal.js";
import type {
  CurrencyCode,
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
  dashboardQuotes: DashboardQuoteRecord[] = []
): DashboardSummary {
  const valuation = calculateValuedHoldings(holdings, prices, fxRates, reportingCurrency, dashboardQuotes);
  const quoteMetadata = getQuoteMetadata(dashboardQuotes);

  return {
    reportingCurrency,
    totalAssets: valuation.totalMarketValue,
    todayChange: valuation.todayChange,
    todayChangePct: valuation.todayChangePct,
    unrealizedGain: valuation.totalUnrealizedGain,
    accountCount: accounts.length,
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
  const fxRatesByCurrency = new Map(
    fxRates
      .filter((rate) => rate.toCurrency === "USD" && rate.rateType === "valuation")
      .map((rate) => [rate.fromCurrency, new Decimal(rate.rate)])
  );
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

        if (holding.costAmount === null) {
          addWarning(warnings, warningKeys, "COST_BASIS_UNAVAILABLE", holding);
          addWarning(rowWarnings, rowWarningKeys, "COST_BASIS_UNAVAILABLE", holding);
          totalUnrealizedGainAvailable = false;
        } else {
          rowUnrealizedGainUsd = rowMarketValueUsd.minus(new Decimal(holding.costAmount).times(fxRate));
          totalUnrealizedGain = totalUnrealizedGain.plus(rowUnrealizedGainUsd);
        }

        const previousPrice = currentQuote
          ? holdingPrices.find((price) => price.priceDate < currentQuote.quoteDate)
          : holdingPrices[1];

        if (!previousPrice) {
          addWarning(warnings, warningKeys, "MISSING_PREVIOUS_PRICE", holding);
          addWarning(rowWarnings, rowWarningKeys, "MISSING_PREVIOUS_PRICE", holding);
          todayChangeAvailable = false;
        } else {
          const previousValue = quantity.times(previousPrice.closePrice).times(fxRate);
          priorPortfolioValue = priorPortfolioValue.plus(previousValue);
          todayChange = todayChange.plus(rowMarketValueUsd.minus(previousValue));
        }
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
    records.sort((left, right) => right.priceDate.localeCompare(left.priceDate));
    records.splice(2);
  }

  return groupedPrices;
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
    currency: holding.currency
  });
}

function formatMoney(amount: Decimal): string {
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function formatPercentage(amount: Decimal): string {
  return amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
