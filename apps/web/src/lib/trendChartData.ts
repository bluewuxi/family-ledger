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
  options: { showLiveConnector?: boolean } = {}
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

  if (parsedLiveValue === null || !Number.isFinite(parsedLiveValue)) {
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
            snapshotValue: liveValue,
            liveValue: options.showLiveConnector === false ? null : liveValue,
            totalInvestment: null
          }
        ]
      : chartPoints;
  }

  if (lastPoint.date > today || !isCurrentBusinessDateQuote(liveQuoteDate, today)) {
    return chartPoints;
  }

  if (lastPoint.snapshotValue === null) {
    // A chart fallback (such as principal) is not a valuation baseline.
    const endpoint = {
      date: today,
      value: liveValue,
      snapshotValue: options.showLiveConnector === false ? liveValue : null,
      liveValue: options.showLiveConnector === false ? null : liveValue,
      totalInvestment: lastPoint.date === today ? lastPoint.totalInvestment : null
    };
    return [...(lastPoint.date === today ? chartPoints.slice(0, -1) : chartPoints), endpoint];
  }

  if (options.showLiveConnector === false) {
    if (lastPoint.date === today) {
      return [
        ...chartPoints.slice(0, -1),
        {
          ...lastPoint,
          value: liveValue,
          snapshotValue: liveValue,
          liveValue: null
        }
      ];
    }

    return [
      ...chartPoints,
      {
        date: today,
        value: liveValue,
        snapshotValue: liveValue,
        liveValue: null,
        totalInvestment: null
      }
    ];
  }

  const liveEndpointDate = lastPoint.date === today ? `__live_endpoint__${today}` : today;
  const startValue = lastPoint.snapshotValue ?? lastPoint.value;
  const midpointValue = getLiveCurveMidpointValue(startValue, liveValue);

  return [
    ...chartPoints.slice(0, -1),
    {
      ...lastPoint,
      liveValue: startValue
    },
    {
      date: `__live_midpoint__${lastPoint.date}__${liveEndpointDate}`,
      value: midpointValue,
      snapshotValue: null,
      liveValue: midpointValue,
      totalInvestment: null,
      isSynthetic: true
    },
    {
      date: liveEndpointDate,
      value: liveValue,
      snapshotValue: null,
      liveValue,
      totalInvestment: null,
      isSynthetic: isSyntheticTrendDate(liveEndpointDate)
    }
  ];
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

function getLiveCurveMidpointValue(startValue: number, endValue: number): number {
  const midpointValue = (startValue + endValue) / 2;
  const delta = endValue - startValue;
  const direction = delta >= 0 ? 1 : -1;
  const curveLift = Math.max(Math.abs(delta) * 0.15, Math.max(Math.abs(startValue), Math.abs(endValue)) * 0.0015, 1);

  return midpointValue + direction * curveLift;
}

function firstFiniteValue(...values: Array<number | null>): number {
  for (const value of values) {
    if (value !== null && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}
