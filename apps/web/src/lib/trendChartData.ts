import { getAppBusinessDate } from "@family-ledger/shared";

export interface TrendPoint {
  date: string;
  portfolioValue: number | null;
  totalInvestment: number | null;
  snapshotDate?: string | null;
}

export interface TrendChartPoint {
  date: string;
  value: number;
  snapshotValue: number | null;
  liveValue: number | null;
  totalInvestment: number | null;
  snapshotDate?: string | null;
  isSynthetic?: boolean;
}

export interface ProfitChartPoint {
  date: string;
  value: number;
  profitValue: number | null;
  periodStartValue: number | null;
  snapshotDate?: string | null;
  isSynthetic?: boolean;
}

export function getLiveValuationDot(points: TrendChartPoint[]): false | { r: number } {
  // A single live value has no line segment; make it visible without joining a data gap.
  return points.filter((point) => point.liveValue !== null).length === 1 ? { r: 4 } : false;
}

export function buildTrendChartData(
  points: TrendPoint[],
  liveTotalAssets: string | null | undefined,
  liveQuoteDate: string | null | undefined,
  now: Date | string = new Date(),
  options: { currentTotalInvestment?: string | null } = {}
): TrendChartPoint[] {
  const sortedPoints = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const chartPoints: TrendChartPoint[] = sortedPoints.map((point) => ({
    date: point.date,
    value: firstFiniteValue(point.portfolioValue, point.totalInvestment),
    snapshotValue: point.portfolioValue,
    liveValue: null,
    totalInvestment: point.totalInvestment,
    snapshotDate: point.snapshotDate ?? null
  }));
  const parsedLiveValue = liveTotalAssets === null || liveTotalAssets === undefined ? null : Number(liveTotalAssets);

  if (parsedLiveValue === null || !Number.isFinite(parsedLiveValue) || options.currentTotalInvestment === null) {
    return chartPoints;
  }

  const liveValue = parsedLiveValue;
  const today = getAppBusinessDate(now);
  const lastPoint = chartPoints.at(-1);

  if (!lastPoint) {
    return isCurrentBusinessDateQuote(liveQuoteDate, today)
      ? [
          {
            date: today,
            value: liveValue,
            snapshotValue: null,
            liveValue,
            totalInvestment: options.currentTotalInvestment === undefined ? null : Number(options.currentTotalInvestment),
            isSynthetic: true
          }
        ]
      : chartPoints;
  }

  if (lastPoint.date > today || !isCurrentBusinessDateQuote(liveQuoteDate, today)) {
    return chartPoints;
  }

  const principal = options.currentTotalInvestment === undefined ? (lastPoint.date === today ? lastPoint.totalInvestment : null)
    : options.currentTotalInvestment === null ? null : Number(options.currentTotalInvestment);
  const endpoint: TrendChartPoint = {
    date: lastPoint.date === today && lastPoint.snapshotValue !== null ? `__live_endpoint__${today}` : today,
    value: liveValue,
    snapshotValue: null,
    liveValue,
    totalInvestment: principal,
    isSynthetic: true
  };
  // Keep historical gaps and actual closes; the live valuation is a separate marker.
  return [...(lastPoint.date === today && lastPoint.snapshotValue === null ? chartPoints.slice(0, -1) : chartPoints), endpoint];
}

export function buildProfitChartData(chartPoints: TrendChartPoint[]): ProfitChartPoint[] {
  let carriedTotalInvestment: number | null = null;
  let periodStartProfit: number | null = null;
  let periodStartValue: number | null = null;

  return chartPoints
    .filter((point) => !point.date.startsWith("__live_midpoint__"))
    .map((point) => {
      if (point.totalInvestment !== null && Number.isFinite(point.totalInvestment)) {
        carriedTotalInvestment = point.totalInvestment;
      }

      const portfolioValue = point.snapshotValue ?? point.liveValue;
      const cumulativeProfit =
        portfolioValue !== null && carriedTotalInvestment !== null
          ? portfolioValue - carriedTotalInvestment
          : null;
      if (cumulativeProfit !== null && periodStartProfit === null) {
        periodStartProfit = cumulativeProfit;
        periodStartValue = portfolioValue;
      }
      const periodProfit =
        cumulativeProfit !== null && periodStartProfit !== null ? cumulativeProfit - periodStartProfit : null;

      return {
        date: point.date,
        value: periodProfit ?? 0,
        profitValue: periodProfit,
        periodStartValue,
        snapshotDate: point.snapshotDate ?? null,
        isSynthetic: point.isSynthetic
      };
    });
}

export function calculateTrendCumulativeMovement(chartPoints: TrendChartPoint[]): string | null {
  let principal: number | null = null;
  let latest: TrendChartPoint | undefined;
  for (const point of chartPoints) {
    if (point.isSynthetic && point.date.startsWith("__live_midpoint__")) continue;
    if (point.totalInvestment !== null) principal = point.totalInvestment;
    latest = point;
  }
  const value = latest?.liveValue ?? latest?.snapshotValue;
  return value === null || value === undefined || principal === null || !Number.isFinite(value)
    ? null : String(value - principal);
}

export function isSyntheticTrendDate(value: string): boolean {
  return value.startsWith("__live_");
}

function isCurrentBusinessDateQuote(quoteDate: string | null | undefined, today: string): boolean {
  return quoteDate !== null && quoteDate !== undefined && quoteDate >= today;
}

function firstFiniteValue(...values: Array<number | null>): number {
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}
