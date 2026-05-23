import Decimal from "decimal.js";
import type {
  CurrencyCode,
  DashboardSummary,
  DashboardWarning,
  DashboardWarningCode,
  FxRateRecord,
  HoldingSummary,
  InvestmentAccount,
  PriceRecord
} from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listLatestFxRates } from "../repositories/fxRateRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listLatestPrices } from "../repositories/priceRepository";
import { listTransactions } from "../repositories/transactionRepository";
import { calculateHoldings } from "./holdingService";

export async function getDashboard(): Promise<DashboardSummary> {
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments);
  const securityInstruments = uniqueBy(
    holdings
      .filter((holding) => holding.assetType !== "cash")
      .map((holding) => ({ instrumentId: holding.instrumentId, currency: holding.currency })),
    (instrument) => instrument.instrumentId
  );
  const foreignCurrencies = unique(
    holdings.filter((holding) => holding.currency !== "NZD").map((holding) => holding.currency)
  );
  const [prices, fxRates] = await Promise.all([
    listLatestPrices(securityInstruments),
    listLatestFxRates(foreignCurrencies)
  ]);

  return calculateDashboardSummary(holdings, accounts, prices, fxRates);
}

export function calculateDashboardSummary(
  holdings: HoldingSummary[],
  accounts: InvestmentAccount[],
  prices: PriceRecord[],
  fxRates: FxRateRecord[]
): DashboardSummary {
  const pricesByInstrument = groupValidPricesByInstrument(holdings, prices);
  const fxRatesByCurrency = new Map(
    fxRates
      .filter((rate) => rate.toCurrency === "NZD")
      .map((rate) => [rate.fromCurrency, new Decimal(rate.rate)])
  );
  const warnings: DashboardWarning[] = [];
  const warningKeys = new Set<string>();
  let totalAssets = new Decimal(0);
  let todayChange = new Decimal(0);
  let priorPortfolioValue = new Decimal(0);
  let unrealizedGain = new Decimal(0);
  let totalAssetsAvailable = true;
  let todayChangeAvailable = true;
  let unrealizedGainAvailable = true;

  for (const holding of holdings) {
    const fxRate = getFxRate(holding.currency, fxRatesByCurrency);

    if (fxRate === null) {
      addWarning(warnings, warningKeys, "MISSING_FX_RATE", holding);
      totalAssetsAvailable = false;
      todayChangeAvailable = false;
      unrealizedGainAvailable = false;
      continue;
    }

    const quantity = new Decimal(holding.quantity);

    if (holding.assetType === "cash") {
      const cashValue = quantity.times(fxRate);
      totalAssets = totalAssets.plus(cashValue);
      priorPortfolioValue = priorPortfolioValue.plus(cashValue);
      continue;
    }

    const holdingPrices = pricesByInstrument.get(holding.instrumentId) ?? [];
    const latestPrice = holdingPrices[0];

    if (!latestPrice) {
      addWarning(warnings, warningKeys, "MISSING_LATEST_PRICE", holding);
      totalAssetsAvailable = false;
      todayChangeAvailable = false;
      unrealizedGainAvailable = false;
      continue;
    }

    const currentValue = quantity.times(latestPrice.closePrice).times(fxRate);
    totalAssets = totalAssets.plus(currentValue);

    if (holding.costAmount === null) {
      addWarning(warnings, warningKeys, "COST_BASIS_UNAVAILABLE", holding);
      unrealizedGainAvailable = false;
    } else {
      unrealizedGain = unrealizedGain.plus(currentValue.minus(new Decimal(holding.costAmount).times(fxRate)));
    }

    const previousPrice = holdingPrices[1];

    if (!previousPrice) {
      addWarning(warnings, warningKeys, "MISSING_PREVIOUS_PRICE", holding);
      todayChangeAvailable = false;
      continue;
    }

    const previousValue = quantity.times(previousPrice.closePrice).times(fxRate);
    priorPortfolioValue = priorPortfolioValue.plus(previousValue);
    todayChange = todayChange.plus(currentValue.minus(previousValue));
  }

  const monetaryDataAvailable = totalAssetsAvailable;
  const dailyDataAvailable = monetaryDataAvailable && todayChangeAvailable;

  return {
    reportingCurrency: "NZD",
    totalAssets: monetaryDataAvailable ? formatMoney(totalAssets) : null,
    todayChange: dailyDataAvailable ? formatMoney(todayChange) : null,
    todayChangePct:
      dailyDataAvailable && !priorPortfolioValue.isZero()
        ? formatPercentage(todayChange.dividedBy(priorPortfolioValue).times(100))
        : null,
    unrealizedGain: monetaryDataAvailable && unrealizedGainAvailable ? formatMoney(unrealizedGain) : null,
    accountCount: accounts.length,
    warnings
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

function getFxRate(currency: CurrencyCode, fxRatesByCurrency: Map<CurrencyCode, Decimal>): Decimal | null {
  if (currency === "NZD") {
    return new Decimal(1);
  }

  return fxRatesByCurrency.get(currency) ?? null;
}

function addWarning(
  warnings: DashboardWarning[],
  warningKeys: Set<string>,
  code: DashboardWarningCode,
  holding: HoldingSummary
): void {
  const key = `${code}:${holding.instrumentId}:${holding.currency}`;

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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
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
