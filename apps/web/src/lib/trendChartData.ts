import { getAppBusinessDate } from "@family-ledger/shared";

export interface TrendPoint {
  date: string;
  value: number;
}

export interface TrendChartPoint {
  date: string;
  value: number;
  snapshotValue: number | null;
  liveValue: number | null;
  isSynthetic?: boolean;
}

export function buildTrendChartData(
  points: TrendPoint[],
  liveTotalAssets: string | null | undefined,
  liveQuoteDate: string | null | undefined,
  now: Date | string = new Date()
): TrendChartPoint[] {
  const sortedPoints = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const chartPoints: TrendChartPoint[] = sortedPoints.map((point) => ({
    ...point,
    snapshotValue: point.value,
    liveValue: null
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
            snapshotValue: null,
            liveValue
          }
        ]
      : chartPoints;
  }

  if (lastPoint.date > today || !isCurrentBusinessDateQuote(liveQuoteDate, today)) {
    return chartPoints;
  }

  const liveEndpointDate = lastPoint.date === today ? `__live_endpoint__${today}` : today;
  const midpointValue = getLiveCurveMidpointValue(lastPoint.value, liveValue);

  return [
    ...chartPoints.slice(0, -1),
    {
      ...lastPoint,
      liveValue: lastPoint.value
    },
    {
      date: `__live_midpoint__${lastPoint.date}__${liveEndpointDate}`,
      value: midpointValue,
      snapshotValue: null,
      liveValue: midpointValue,
      isSynthetic: true
    },
    {
      date: liveEndpointDate,
      value: liveValue,
      snapshotValue: null,
      liveValue,
      isSynthetic: isSyntheticTrendDate(liveEndpointDate)
    }
  ];
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
