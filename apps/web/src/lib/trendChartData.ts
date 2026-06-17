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
    })
    .filter((point) => point.profitValue !== null);
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
