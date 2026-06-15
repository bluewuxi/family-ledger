import Decimal from "decimal.js";
import {
  getAppBusinessDate,
  PORTFOLIO_TREND_RANGES,
  type AuthenticatedUser,
  type CurrencyCode,
  type ExchangeRateRecord,
  type InvestmentTransaction,
  type PortfolioPrincipalPoint,
  type PortfolioSnapshotSummary,
  type PortfolioTrend,
  type PortfolioTrendPoint,
  type PortfolioTrendRange,
  type PortfolioTrendSummary,
  type PortfolioTrendWarning,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { listExactValuationRatesToUsdForDates } from "../repositories/fxRateRepository";
import { listPortfolioSnapshots, listPortfolioSnapshotTrendRows } from "../repositories/portfolioSnapshotRepository";
import { listManualPrincipalTransactionsUntil } from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { resolveReportingCurrency } from "./reportingCurrencyService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const earliestDate = "0001-01-01";

export interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
  trend?: PortfolioTrend;
}

interface SnapshotQuery {
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  limit?: number;
  order: "asc" | "desc";
}

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

export async function getPortfolioSnapshots(input: {
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotSummary[]> {
  const query = await resolveSnapshotQuery(input);
  return listPortfolioSnapshots(query);
}

export async function getPortfolioSnapshotsResponse(input: {
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  includeTrend?: string;
  trendRange?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotsResponse> {
  const query = await resolveSnapshotQuery(input);
  const snapshots = await listPortfolioSnapshots(query);

  if (!optionalBoolean("includeTrend", input.includeTrend)) {
    return { snapshots };
  }

  return {
    snapshots,
    trend: await buildPortfolioTrend({
      currency: query.currency,
      range: optionalTrendRange(input.trendRange),
      today: query.to
    })
  };
}

export async function buildPortfolioTrend(input: {
  currency: SnapshotDisplayCurrency;
  range: PortfolioTrendRange;
  today?: string;
  snapshots?: PortfolioSnapshotSummary[];
  principalTransactions?: InvestmentTransaction[];
  exactFxRates?: ExchangeRateRecord[];
}): Promise<PortfolioTrend> {
  const rangeEnd = input.today ?? getAppBusinessDate();
  validateDate("today", rangeEnd);

  const principalTransactions =
    input.principalTransactions ?? await listManualPrincipalTransactionsUntil(rangeEnd);
  const principalEvents = principalTransactions.map(toPrincipalEvent);
  const inceptionDate = principalEvents[0]?.date ?? null;
  const requestedRangeStart = getTrendRangeStart(input.range, rangeEnd, inceptionDate);
  const rangeStart = inceptionDate && requestedRangeStart < inceptionDate ? inceptionDate : requestedRangeStart;
  const allSnapshots =
    input.snapshots ?? await listPortfolioSnapshotTrendRows({ from: earliestDate, to: rangeEnd, currency: input.currency, order: "asc" });
  const exactFxRates =
    input.exactFxRates ?? await listExactValuationRatesToUsdForDates(
      principalEvents.map((event) => event.date),
      getRequiredPrincipalFxCurrencies(principalEvents, input.currency)
    );
  const principal = calculatePrincipalPoints({
    events: principalEvents,
    exactFxRates,
    currency: input.currency,
    rangeStart,
    rangeEnd,
    inceptionDate
  });
  const portfolioPoints = buildSampledPortfolioPoints({
    snapshots: allSnapshots,
    range: input.range,
    rangeStart,
    rangeEnd
  });
  const points = mergeTrendPoints(portfolioPoints, principal.principalPoints);

  return {
    points,
    principalPoints: principal.principalPoints,
    summary: {
      range: input.range,
      rangeStart,
      rangeEnd,
      currency: input.currency,
      inceptionDate,
      currentTotalInvestment: principal.currentTotalInvestment,
      cumulativeMovement: null,
      warnings: principal.warnings
    }
  };
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

export function getTrendRangeStart(
  range: PortfolioTrendRange,
  rangeEnd: string,
  inceptionDate: string | null
): string {
  switch (range) {
    case "1m":
      return subtractMonths(rangeEnd, 1);
    case "3m":
      return subtractMonths(rangeEnd, 3);
    case "1y":
      return subtractMonths(rangeEnd, 12);
    case "3y":
      return subtractMonths(rangeEnd, 36);
    case "5y":
      return subtractMonths(rangeEnd, 60);
    case "inception":
      return inceptionDate ?? rangeEnd;
  }
}

export function buildSampledPortfolioPoints(input: {
  snapshots: PortfolioSnapshotSummary[];
  range: PortfolioTrendRange;
  rangeStart: string;
  rangeEnd: string;
}): Array<Omit<PortfolioTrendPoint, "totalInvestment">> {
  const snapshots = [...input.snapshots].sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate));
  const targetDates = getPortfolioTargetDates({
    snapshots,
    range: input.range,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd
  });

  return targetDates.map((date) => {
    const snapshot = findSnapshotAsOf(snapshots, date);

    return {
      date,
      portfolioValue: snapshot?.marketValue ?? null,
      snapshotDate: snapshot?.snapshotDate ?? null,
      liveValue: null
    };
  });
}

function toPrincipalEvent(transaction: InvestmentTransaction): PrincipalEvent {
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

function getRequiredPrincipalFxCurrencies(
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

function getPortfolioTargetDates(input: {
  snapshots: PortfolioSnapshotSummary[];
  range: PortfolioTrendRange;
  rangeStart: string;
  rangeEnd: string;
}): string[] {
  const snapshotDates = input.snapshots
    .map((snapshot) => snapshot.snapshotDate)
    .filter((date) => date >= input.rangeStart && date <= input.rangeEnd);
  const firstSnapshotDate = input.snapshots.find((snapshot) =>
    snapshot.snapshotDate >= input.rangeStart && snapshot.snapshotDate <= input.rangeEnd && snapshot.marketValue !== null
  )?.snapshotDate;

  if (!shouldSamplePortfolioSnapshots(input.range, input.rangeStart, input.rangeEnd)) {
    return uniqueValues([
      input.rangeStart,
      ...snapshotDates,
      input.rangeEnd
    ]).sort();
  }

  return uniqueValues([
    input.rangeStart,
    ...(firstSnapshotDate ? [firstSnapshotDate] : []),
    ...weeklyTargets(input.rangeStart, input.rangeEnd)
  ]).sort();
}

function shouldSamplePortfolioSnapshots(range: PortfolioTrendRange, rangeStart: string, rangeEnd: string): boolean {
  return (range === "3y" || range === "5y" || range === "inception") && monthsBetween(rangeStart, rangeEnd) >= 24;
}

function weeklyTargets(rangeStart: string, rangeEnd: string): string[] {
  const targets: string[] = [];
  let cursor = parseIsoDate(rangeEnd);

  while (formatIsoDate(cursor) >= rangeStart) {
    targets.push(formatIsoDate(cursor));
    cursor = addUtcDays(cursor, -7);
  }

  return targets;
}

function findSnapshotAsOf(
  snapshots: PortfolioSnapshotSummary[],
  targetDate: string
): PortfolioSnapshotSummary | null {
  let selected: PortfolioSnapshotSummary | null = null;

  for (const snapshot of snapshots) {
    if (snapshot.snapshotDate > targetDate) {
      break;
    }
    selected = snapshot;
  }

  return selected;
}

function mergeTrendPoints(
  portfolioPoints: Array<Omit<PortfolioTrendPoint, "totalInvestment">>,
  principalPoints: PortfolioPrincipalPoint[]
): PortfolioTrendPoint[] {
  const portfolioByDate = new Map(portfolioPoints.map((point) => [point.date, point]));
  const sortedPortfolioPoints = [...portfolioPoints].sort((left, right) => left.date.localeCompare(right.date));
  const principalByDate = new Map(principalPoints.map((point) => [point.date, point.totalInvestment]));
  const dates = uniqueValues([...portfolioByDate.keys(), ...principalByDate.keys()]).sort();

  return dates.map((date) => {
    const portfolioPoint = portfolioByDate.get(date) ?? findPortfolioPointAsOf(sortedPortfolioPoints, date);

    return {
      date,
      portfolioValue: portfolioPoint?.portfolioValue ?? null,
      snapshotDate: portfolioPoint?.snapshotDate ?? null,
      liveValue: portfolioPoint?.liveValue ?? null,
      totalInvestment: principalByDate.get(date) ?? null
    };
  });
}

function findPortfolioPointAsOf(
  points: Array<Omit<PortfolioTrendPoint, "totalInvestment">>,
  targetDate: string
): Omit<PortfolioTrendPoint, "totalInvestment"> | null {
  let selected: Omit<PortfolioTrendPoint, "totalInvestment"> | null = null;

  for (const point of points) {
    if (point.date > targetDate) {
      break;
    }
    if (point.portfolioValue !== null) {
      selected = point;
    }
  }

  return selected;
}

async function resolveSnapshotQuery(input: {
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  user?: AuthenticatedUser;
}): Promise<SnapshotQuery> {
  const currency = await resolveReportingCurrency(input);
  const today = getAppBusinessDate();
  const to = input.to ?? today;
  const limit = optionalLimit(input.limit);
  const order = optionalOrder(input.order);
  const latestMode = limit !== undefined && input.from === undefined;
  const from = input.from ?? (latestMode ? earliestDate : to);

  validateDate("from", from);
  validateDate("to", to);

  if (from > to) {
    throw new ApiRequestError("VALIDATION_ERROR", "from cannot be after to.", 400);
  }

  return { from, to, currency, limit, order: order ?? "asc" };
}

function validateDate(name: string, value: string): void {
  if (!datePattern.test(value)) {
    throw new ApiRequestError("VALIDATION_ERROR", `${name} must use YYYY-MM-DD format.`, 400);
  }
}

function optionalLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const limit = Number(value);

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new ApiRequestError("VALIDATION_ERROR", "limit must be an integer between 1 and 200.", 400);
  }

  return limit;
}

function optionalOrder(value: string | undefined): "asc" | "desc" | undefined {
  if (!value) {
    return undefined;
  }

  if (value !== "asc" && value !== "desc") {
    throw new ApiRequestError("VALIDATION_ERROR", "order must be asc or desc.", 400);
  }

  return value;
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

function optionalBoolean(name: string, value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ApiRequestError("VALIDATION_ERROR", `${name} must be true or false.`, 400);
}

function subtractMonths(value: string, months: number): string {
  const date = parseIsoDate(value);
  return formatIsoDate(monthTarget(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()));
}

function monthsBetween(start: string, end: string): number {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const monthCount =
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    endDate.getUTCMonth() -
    startDate.getUTCMonth();

  return endDate.getUTCDate() >= startDate.getUTCDate() ? monthCount : monthCount - 1;
}

function monthTarget(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDecimal(value: Decimal): string {
  return value.toFixed(6);
}

function fxRateKey(currency: CurrencyCode, rateDate: string): string {
  return `${currency}:${rateDate}`;
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}
