import type { TrendChartPoint, ProfitChartPoint } from "./trendChartData";

interface ColorSplitTrendChartPoint extends TrendChartPoint {
  snapshotPositiveValue: number | null;
  snapshotNegativeValue: number | null;
  snapshotPositiveRange: [number, number] | null;
  snapshotNegativeRange: [number, number] | null;
}

interface ColorSplitProfitChartPoint extends ProfitChartPoint {
  profitPositiveValue: number | null;
  profitNegativeValue: number | null;
}

export function buildColorSplitTrendChartData(chartPoints: TrendChartPoint[]): ColorSplitTrendChartPoint[] {
  let carriedTotalInvestment: number | null = null;
  let previousPoint: (TrendChartPoint & { carriedTotalInvestment: number | null }) | null = null;
  const splitPoints: ColorSplitTrendChartPoint[] = [];

  for (const point of chartPoints) {
    if (point.totalInvestment !== null && Number.isFinite(point.totalInvestment)) {
      carriedTotalInvestment = point.totalInvestment;
    }
    // The live endpoint belongs to the displayed curve without altering saved snapshots.
    const pointWithThreshold = { ...point, snapshotValue: point.snapshotValue ?? point.liveValue, carriedTotalInvestment };

    const crossingPoint = buildTrendCrossingPoint(previousPoint, pointWithThreshold);
    if (crossingPoint) {
      splitPoints.push(crossingPoint);
    }

    splitPoints.push(toColorSplitTrendPoint(pointWithThreshold));
    previousPoint = pointWithThreshold;
  }

  return splitPoints;
}

function buildTrendCrossingPoint(
  previousPoint: (TrendChartPoint & { carriedTotalInvestment: number | null }) | null,
  point: TrendChartPoint & { carriedTotalInvestment: number | null }
): ColorSplitTrendChartPoint | null {
  if (
    previousPoint?.snapshotValue === null ||
    previousPoint?.snapshotValue === undefined ||
    previousPoint.carriedTotalInvestment === null ||
    point.snapshotValue === null ||
    point.carriedTotalInvestment === null
  ) {
    return null;
  }

  const previousDifference = previousPoint.snapshotValue - previousPoint.carriedTotalInvestment;
  const currentDifference = point.snapshotValue - point.carriedTotalInvestment;

  if (previousDifference === 0 || currentDifference === 0 || Math.sign(previousDifference) === Math.sign(currentDifference)) {
    return null;
  }

  const crossingRatio = previousDifference / (previousDifference - currentDifference);
  const crossingInvestment =
    previousPoint.carriedTotalInvestment +
    (point.carriedTotalInvestment - previousPoint.carriedTotalInvestment) * crossingRatio;

  return {
    date: `__chart_crossing__trend__${previousPoint.date}__${point.date}`,
    value: crossingInvestment,
    snapshotValue: crossingInvestment,
    liveValue: null,
    totalInvestment: crossingInvestment,
    snapshotPositiveValue: crossingInvestment,
    snapshotNegativeValue: crossingInvestment,
    snapshotPositiveRange: [crossingInvestment, crossingInvestment],
    snapshotNegativeRange: [crossingInvestment, crossingInvestment],
    snapshotDate: point.snapshotDate ?? null,
    isSynthetic: true
  };
}

function toColorSplitTrendPoint(
  point: TrendChartPoint & { carriedTotalInvestment: number | null }
): ColorSplitTrendChartPoint {
  const snapshotIsPositive =
    point.snapshotValue !== null && point.carriedTotalInvestment !== null
      ? point.snapshotValue >= point.carriedTotalInvestment
      : true;
  const snapshotPositiveRange =
    point.snapshotValue !== null && point.carriedTotalInvestment !== null && snapshotIsPositive
      ? ([point.carriedTotalInvestment, point.snapshotValue] satisfies [number, number])
      : null;
  const snapshotNegativeRange =
    point.snapshotValue !== null && point.carriedTotalInvestment !== null && !snapshotIsPositive
      ? ([point.snapshotValue, point.carriedTotalInvestment] satisfies [number, number])
      : null;
  return {
    ...point,
    snapshotPositiveValue: point.snapshotValue !== null && snapshotIsPositive ? point.snapshotValue : null,
    snapshotNegativeValue: point.snapshotValue !== null && !snapshotIsPositive ? point.snapshotValue : null,
    snapshotPositiveRange,
    snapshotNegativeRange,
  };
}

export function buildColorSplitProfitChartData(chartPoints: ProfitChartPoint[]): ColorSplitProfitChartPoint[] {
  const splitPoints: ColorSplitProfitChartPoint[] = [];

  for (const point of chartPoints) {
    const previousPoint = splitPoints.at(-1);
    const crossingPoint = buildProfitCrossingPoint(previousPoint, point);
    if (crossingPoint) {
      splitPoints.push(crossingPoint);
    }

    splitPoints.push(toColorSplitProfitPoint(point));
  }

  return splitPoints;
}

function buildProfitCrossingPoint(
  previousPoint: ColorSplitProfitChartPoint | undefined,
  point: ProfitChartPoint
): ColorSplitProfitChartPoint | null {
  if (
    previousPoint?.profitValue === null ||
    previousPoint?.profitValue === undefined ||
    point.profitValue === null ||
    previousPoint.profitValue === 0 ||
    point.profitValue === 0 ||
    Math.sign(previousPoint.profitValue) === Math.sign(point.profitValue)
  ) {
    return null;
  }

  return {
    date: `__chart_crossing__profit__${previousPoint.date}__${point.date}`,
    value: 0,
    profitValue: 0,
    profitPositiveValue: 0,
    profitNegativeValue: 0,
    periodStartValue: point.periodStartValue,
    snapshotDate: point.snapshotDate ?? null,
    isSynthetic: true
  };
}

function toColorSplitProfitPoint(point: ProfitChartPoint): ColorSplitProfitChartPoint {
  const isPositive = point.profitValue !== null ? point.profitValue >= 0 : true;

  return {
    ...point,
    profitPositiveValue: point.profitValue !== null && isPositive ? point.profitValue : null,
    profitNegativeValue: point.profitValue !== null && !isPositive ? point.profitValue : null,
  };
}
