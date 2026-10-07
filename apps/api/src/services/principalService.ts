import Decimal from "decimal.js";
import type { CurrencyCode, ExchangeRateRecord, InvestmentTransaction, PortfolioPrincipalPoint, PortfolioTrendWarning, SnapshotDisplayCurrency } from "@family-ledger/shared";

export interface PrincipalEvent {
  date: string;
  currency: CurrencyCode;
  amount: Decimal;
}

interface ConvertedPrincipalEvent {
  date: string;
  amount: Decimal;
}

interface PrincipalCalculation {
  inceptionDate: string | null;
  currentTotalInvestment: string | null;
  principalPoints: PortfolioPrincipalPoint[];
  warnings: PortfolioTrendWarning[];
}

export function calculatePrincipalPoints(input: {
  events: PrincipalEvent[];
  exactFxRates: ExchangeRateRecord[];
  currency: SnapshotDisplayCurrency;
  rangeStart: string;
  rangeEnd: string;
  inceptionDate: string | null;
}): PrincipalCalculation {
  const ratesByCurrencyAndDate = new Map(input.exactFxRates.map((rate) => [fxRateKey(rate.fromCurrency, rate.rateDate), rate]));
  const convertedEvents: ConvertedPrincipalEvent[] = [];
  const warnings = new Map<string, PortfolioTrendWarning>();

  for (const event of input.events) {
    const conversion = convertPrincipalEventAmount(event, input.currency, ratesByCurrencyAndDate);

    for (const warning of conversion.warnings) {
      warnings.set(`${warning.code}:${warning.transactionDate}:${warning.currency}`, warning);
    }

    if (conversion.amount !== null) {
      convertedEvents.push({ date: event.date, amount: conversion.amount });
    }
  }

  if (warnings.size > 0) {
    return {
      inceptionDate: input.inceptionDate,
      currentTotalInvestment: null,
      principalPoints: buildPrincipalPointDates(input.events, input.rangeStart, input.rangeEnd).map((date) => ({
        date,
        totalInvestment: null
      })),
      warnings: [...warnings.values()]
    };
  }

  const principalDates = buildPrincipalPointDates(input.events, input.rangeStart, input.rangeEnd);

  return {
    inceptionDate: input.inceptionDate,
    currentTotalInvestment: formatDecimal(sumPrincipalAsOf(convertedEvents, input.rangeEnd)),
    principalPoints: principalDates.map((date) => ({
      date,
      totalInvestment: formatDecimal(sumPrincipalAsOf(convertedEvents, date))
    })),
    warnings: []
  };
}

export function toPrincipalEvent(transaction: InvestmentTransaction): PrincipalEvent {
  const direction = transaction.transactionType === "withdrawal" ? -1 : 1;
  return {
    date: transaction.tradeDate,
    currency: transaction.currency,
    amount: new Decimal(transaction.grossAmount ?? "0").times(direction)
  };
}

function convertPrincipalEventAmount(
  event: PrincipalEvent,
  displayCurrency: SnapshotDisplayCurrency,
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>
): { amount: Decimal | null; warnings: PortfolioTrendWarning[] } {
  if (event.currency === displayCurrency) {
    return { amount: event.amount, warnings: [] };
  }

  const warnings: PortfolioTrendWarning[] = [];
  const sourceRate = getExactUsdRate(event.currency, event.date, ratesByCurrencyAndDate);
  const displayRate = getExactUsdRate(displayCurrency, event.date, ratesByCurrencyAndDate);

  if (sourceRate === null) {
    warnings.push({ code: "MISSING_PRINCIPAL_FX_RATE", transactionDate: event.date, currency: event.currency });
  }

  if (displayRate === null) {
    warnings.push({ code: "MISSING_PRINCIPAL_FX_RATE", transactionDate: event.date, currency: displayCurrency });
  }

  if (warnings.length > 0 || sourceRate === null || displayRate === null) {
    return { amount: null, warnings };
  }

  const amountUsd = event.amount.times(sourceRate);
  return { amount: amountUsd.dividedBy(displayRate), warnings: [] };
}

function getExactUsdRate(
  currency: CurrencyCode,
  rateDate: string,
  ratesByCurrencyAndDate: Map<string, ExchangeRateRecord>
): Decimal | null {
  if (currency === "USD") {
    return new Decimal(1);
  }

  const rate = ratesByCurrencyAndDate.get(fxRateKey(currency, rateDate));
  return rate ? new Decimal(rate.rate) : null;
}

export function getRequiredPrincipalFxCurrencies(
  events: PrincipalEvent[],
  displayCurrency: SnapshotDisplayCurrency
): CurrencyCode[] {
  const currencies = new Set<CurrencyCode>();

  for (const event of events) {
    if (event.currency !== displayCurrency && event.currency !== "USD") {
      currencies.add(event.currency);
    }
    if (event.currency !== displayCurrency && displayCurrency !== "USD") {
      currencies.add(displayCurrency);
    }
  }

  return [...currencies];
}

function buildPrincipalPointDates(events: PrincipalEvent[], rangeStart: string, rangeEnd: string): string[] {
  return uniqueValues([
    rangeStart,
    ...events
      .map((event) => event.date)
      .filter((date) => date >= rangeStart && date <= rangeEnd),
    rangeEnd
  ]).sort();
}

function sumPrincipalAsOf(events: ConvertedPrincipalEvent[], date: string): Decimal {
  return events.reduce(
    (sum, event) => event.date <= date ? sum.plus(event.amount) : sum,
    new Decimal(0)
  );
}

function formatDecimal(value: Decimal): string {
  return value.toFixed(6);
}

function fxRateKey(currency: CurrencyCode, rateDate: string): string {
  return `${currency}:${rateDate}`;
}

function uniqueValues<T>(values: T[]): T[] { return [...new Set(values)]; }
