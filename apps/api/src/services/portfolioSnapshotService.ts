import Decimal from "decimal.js";
import {
  getAppBusinessDate,
  PORTFOLIO_TREND_RANGES,
  type AuthenticatedUser,
  type ExchangeRateRecord,
  type InvestmentTransaction,
  type PortfolioPrincipalPoint,
  type PortfolioSnapshotSummary,
  type PortfolioTrend,
  type PortfolioTrendPoint,
  type PortfolioTrendRange,
  type Pagination,
  type SnapshotComparison,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { listExactValuationRatesToUsdForDates } from "../repositories/fxRateRepository";
import { listPortfolioSnapshots, listPortfolioSnapshotTrendRows } from "../repositories/portfolioSnapshotRepository";
import { listManualPrincipalTransactionsUntil } from "../repositories/transactionRepository";
import { ApiRequestError } from "../utils/apiError";
import { resolveReportingCurrency } from "./reportingCurrencyService";
import { optionalAccountPurpose } from "./accountPurpose";
import { calculatePrincipalPoints, getRequiredPrincipalFxCurrencies, toPrincipalEvent, type PrincipalEvent } from "./principalService";
export { calculatePrincipalPoints, type PrincipalEvent } from "./principalService";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const earliestDate = "0001-01-01";

export interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
  trend?: PortfolioTrend;
  pagination?: Pagination;
  comparisons?: Record<string, SnapshotComparison>;
}

interface SnapshotQuery {
  from: string;
  to: string;
  currency: SnapshotDisplayCurrency;
  limit?: number;
  order: "asc" | "desc";
}

export async function getPortfolioSnapshots(input: {
  purpose?: string;
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotSummary[]> {
  const query = await resolveSnapshotQuery(input);
  return listPortfolioSnapshots({ ...query, purpose: optionalAccountPurpose(input.purpose) });
}

export async function getPortfolioSnapshotsResponse(input: {
  purpose?: string;
  from?: string;
  to?: string;
  currency?: string;
  limit?: string;
  order?: string;
  includeTrend?: string;
  offset?: string;
  includeComparison?: string;
  trendRange?: string;
  user?: AuthenticatedUser;
}): Promise<PortfolioSnapshotsResponse> {
  const query = await resolveSnapshotQuery(input);
  const includeComparison = optionalBoolean("includeComparison", input.includeComparison);
  const paginated = input.offset !== undefined || includeComparison;
  let result: PortfolioSnapshotsResponse;
  if (paginated) {
    const offset = input.offset === undefined ? 0 : Number(input.offset);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiRequestError("VALIDATION_ERROR", "offset must be a non-negative integer.", 400);
    const history = await listPortfolioSnapshots({ from: earliestDate, to: query.to, currency: query.currency, order: "asc", purpose: optionalAccountPurpose(input.purpose) });
    result = paginateSnapshotHistory(history, { ...query, offset, limit: query.limit ?? 20 }, includeComparison);
  } else {
    result = { snapshots: await listPortfolioSnapshots({ ...query, purpose: optionalAccountPurpose(input.purpose) }) };
  }

  if (!optionalBoolean("includeTrend", input.includeTrend)) {
    return result;
  }

  return {
    ...result,
    trend: await buildPortfolioTrend({
      currency: query.currency,
      range: optionalTrendRange(input.trendRange),
      today: query.to
    })
  };
}

export function paginateSnapshotHistory(history: PortfolioSnapshotSummary[], query: { from: string; to: string; order: "asc" | "desc"; offset: number; limit: number }, includeComparison: boolean): PortfolioSnapshotsResponse {
  const chronological = [...history].sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate));
  const comparisons: Record<string, SnapshotComparison> = {};
  chronological.forEach((snapshot, index) => {
    const previous = chronological[index - 1];
    const change = snapshot.marketValue !== null && previous?.marketValue !== null && previous?.marketValue !== undefined
      ? new Decimal(snapshot.marketValue).minus(previous.marketValue) : null;
    comparisons[snapshot.id] = {
      previousSnapshotDate: previous?.snapshotDate ?? null,
      changeAmount: change?.toFixed(2) ?? null,
      changePct: change !== null && previous?.marketValue && new Decimal(previous.marketValue).gt(0)
        ? change.div(previous.marketValue).times(100).toFixed(4) : null
    };
  });
  const filtered = chronological.filter(snapshot => snapshot.snapshotDate >= query.from && snapshot.snapshotDate <= query.to);
  if (query.order === "desc") filtered.reverse();
  const snapshots = filtered.slice(query.offset, query.offset + query.limit);
  return { snapshots, pagination: { limit: query.limit, offset: query.offset, total: filtered.length, hasMore: query.offset + query.limit < filtered.length },
    ...(includeComparison ? { comparisons: Object.fromEntries(snapshots.map(snapshot => [snapshot.id, comparisons[snapshot.id]])) } : {}) };
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
    input.principalTransactions ?? await listManualPrincipalTransactionsUntil(rangeEnd, "investment");
  const principalEvents = principalTransactions.map(toPrincipalEvent);
  const inceptionDate = principalEvents[0]?.date ?? null;
  const requestedRangeStart = getTrendRangeStart(input.range, rangeEnd, inceptionDate);
  const rangeStart = inceptionDate && requestedRangeStart < inceptionDate ? inceptionDate : requestedRangeStart;
  const allSnapshots =
    input.snapshots ?? await listPortfolioSnapshotTrendRows({ from: earliestDate, to: rangeEnd, currency: input.currency, order: "asc", purpose: "investment" });
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
  const points = mergeTrendPoints(portfolioPoints, principal.principalPoints, allSnapshots, principalEvents);

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

function getPortfolioTargetDates(input: {
  snapshots: PortfolioSnapshotSummary[];
  range: PortfolioTrendRange;
  rangeStart: string;
  rangeEnd: string;
}): string[] {
  const snapshotDates = input.snapshots
    .map((snapshot) => snapshot.snapshotDate)
    .filter((date) => date >= input.rangeStart && date <= input.rangeEnd);
  return uniqueValues([input.rangeStart, ...snapshotDates, input.rangeEnd]).sort();
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
  principalPoints: PortfolioPrincipalPoint[],
  snapshots: PortfolioSnapshotSummary[],
  principalEvents: PrincipalEvent[]
): PortfolioTrendPoint[] {
  const portfolioByDate = new Map(portfolioPoints.map((point) => [point.date, point]));
  const sortedSnapshots = [...snapshots].sort((left, right) => left.snapshotDate.localeCompare(right.snapshotDate));
  const principalByDate = new Map(principalPoints.map((point) => [point.date, point.totalInvestment]));
  const dates = uniqueValues([...portfolioByDate.keys(), ...principalByDate.keys()]).sort();

  return dates.map((date) => {
    // Resolve event dates from the full history, before chart sampling.
    const snapshot = findSnapshotAsOf(sortedSnapshots, date);
    const portfolioPoint = portfolioByDate.get(date);
    const snapshotDate = snapshot?.snapshotDate ?? null;
    const hasUnvaluedFlow = snapshotDate !== null && principalEvents.some(
      (event) => event.date > snapshotDate && event.date <= date
    );

    return {
      date,
      portfolioValue: hasUnvaluedFlow ? null : snapshot?.marketValue ?? null,
      snapshotDate,
      liveValue: portfolioPoint?.liveValue ?? null,
      totalInvestment: principalByDate.get(date) ?? null
    };
  });
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

function monthTarget(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}


function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}
