import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type AccountDetailSummary, type GainColorScheme } from "@family-ledger/shared";
import { buildProfitChartData, buildTrendChartData, isSyntheticTrendDate } from "../lib/trendChartData";
import { buildColorSplitProfitChartData, buildColorSplitTrendChartData } from "../lib/trendChartSeries";
import { formatDisplayAmount } from "../lib/numberFormat";

export function AccountTrendChart({ detail, view, gainColorScheme }: { detail: AccountDetailSummary; view: "profit" | "assets"; gainColorScheme: GainColorScheme }) {
  const points = useMemo(() => buildTrendChartData(detail.trend.points.map(point => ({ date: point.date,
    snapshotDate: point.snapshotDate, portfolioValue: point.marketValue === null ? null : Number(point.marketValue),
    totalInvestment: point.totalInvestment === null || point.totalInvestment === undefined ? null : Number(point.totalInvestment) })),
    detail.currentValue.marketValue, detail.currentValue.valuationBusinessDate, detail.valuedAt ?? new Date(),
    { currentTotalInvestment: detail.investmentPerformance?.netInvestment }), [detail]);
  const profit = useMemo(() => buildColorSplitProfitChartData(buildProfitChartData(points)), [points]);
  const assets = useMemo(() => buildColorSplitTrendChartData(points), [points]);
  const chartData: Array<{ date: string }> = view === "profit" ? profit : assets;
  const positive = gainColorScheme === "red_positive" ? "#c94d44" : "#2d8a68";
  const negative = gainColorScheme === "red_positive" ? "#2d8a68" : "#c94d44";
  if (!points.some(point => point.snapshotValue !== null || point.liveValue !== null)) return <div className="empty-chart-state">暂无账户估值数据</div>;
  return <ResponsiveContainer width="100%" height={300}>
    <AreaChart data={chartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
      <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={date => {
        const value = String(date);
        if (value.startsWith("__chart_crossing__")) return "";
        return isSyntheticTrendDate(value) ? "当前" : value.slice(5);
      }} />
      <YAxis tickLine={false} axisLine={false} width={68} tickFormatter={value => formatDisplayAmount(value)} />
      <Tooltip content={({ active, payload }) => {
        const point = payload?.[0]?.payload as { date: string; snapshotDate?: string | null; profitValue?: number | null; snapshotValue?: number | null; totalInvestment?: number | null } | undefined;
        if (!active || !point || point.date.startsWith("__chart_crossing__")) return null;
        const value = view === "profit" ? point.profitValue : point.snapshotValue;
        return <div className="chart-tooltip"><strong>{isSyntheticTrendDate(point.date) ? "当前估值" : point.date}</strong><p>{view === "profit" ? "期间盈利" : "账户资产"}：{detail.reportingCurrency} {value === null || value === undefined ? "--" : formatDisplayAmount(value)}</p>{point.totalInvestment !== undefined ? <p>净投入：{point.totalInvestment === null ? "--" : formatDisplayAmount(point.totalInvestment)}</p> : null}<p>快照日期：{point.snapshotDate ?? "动态估值"}</p></div>;
      }} />
      {view === "profit" ? <>
        <Area type="linear" dataKey="profitPositiveValue" name="期间盈利" stroke={positive} fill={positive} fillOpacity={0.14} connectNulls={false} dot={false} isAnimationActive={false} />
        <Area type="linear" dataKey="profitNegativeValue" name="期间盈利" stroke={negative} fill={negative} fillOpacity={0.14} connectNulls={false} dot={false} isAnimationActive={false} />
      </> : <>
        <Area type="linear" dataKey="snapshotPositiveValue" name="账户资产" stroke={positive} fill={positive} fillOpacity={0.14} connectNulls={false} dot={false} isAnimationActive={false} />
        <Area type="linear" dataKey="snapshotNegativeValue" name="账户资产" stroke={negative} fill={negative} fillOpacity={0.14} connectNulls={false} dot={false} isAnimationActive={false} />
        <Line type="stepAfter" dataKey="totalInvestment" name="净投入" stroke="#8A5A24" dot={false} connectNulls={false} isAnimationActive={false} />
      </>}
    </AreaChart>
  </ResponsiveContainer>;
}
