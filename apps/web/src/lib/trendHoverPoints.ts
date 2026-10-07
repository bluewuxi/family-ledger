import type { PortfolioTrendRange } from "@family-ledger/shared";
import type { TrendChartPoint, ProfitChartPoint } from "./trendChartData";

export function selectTrendHoverDates(points: Array<TrendChartPoint | ProfitChartPoint>, range: PortfolioTrendRange): Set<string> {
  const valid = points.filter(point => Number.isFinite(point.value) && ("snapshotValue" in point ? point.snapshotValue !== null || point.liveValue !== null : point.profitValue !== null || point.isSynthetic === true));
  const dates = valid.map(point => point.date.replace("__live_endpoint__", ""));
  const span = dates.length ? (Date.parse(dates[dates.length - 1]!) - Date.parse(dates[0]!)) / 86400000 : 0;
  const cadence = range === "1m" ? "day" : range === "3m" ? "week" : range === "inception" ? span >= 365 ? "month" : span > 31 ? "week" : "day" : "month";
  const buckets = new Map<string, string>();
  valid.forEach((point, index) => {
    const date = dates[index]!;
    const key = cadence === "month" ? date.slice(0, 7) : cadence === "week" ? String(Math.floor((Date.parse(date) / 86400000 + 3) / 7)) : date;
    buckets.set(key, point.date);
  });
  return new Set([...buckets.values(), ...(valid.length ? [valid[0]!.date, valid[valid.length - 1]!.date] : [])]);
}

