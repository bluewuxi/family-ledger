import { useMemo } from "react";
import { type AccountDetailSummary, type GainColorScheme } from "@family-ledger/shared";
import { buildTrendChartData } from "../lib/trendChartData";
import { InvestmentTrendChart, getChartToneStyle } from "./InvestmentTrendChart";

export function AccountTrendChart({ detail, view, gainColorScheme }: { detail: AccountDetailSummary; view: "profit" | "assets"; gainColorScheme: GainColorScheme }) {
  const points = useMemo(() => buildTrendChartData(detail.trend.points.map(point => ({ date: point.date,
    snapshotDate: point.snapshotDate, portfolioValue: point.marketValue === null ? null : Number(point.marketValue),
    totalInvestment: point.totalInvestment === null || point.totalInvestment === undefined ? null : Number(point.totalInvestment) })),
    detail.currentValue.marketValue, detail.currentValue.valuationBusinessDate, detail.valuedAt ?? new Date(),
    { currentTotalInvestment: detail.investmentPerformance?.netInvestment }), [detail]);
  if (!points.some(point => point.snapshotValue !== null || point.liveValue !== null)) return <div className="empty-chart-state">暂无账户估值数据</div>;
 return <div style={getChartToneStyle(gainColorScheme)}>
  <div className={view === "profit" ? "trend-panel-metrics profit-panel-metrics" : "trend-panel-metrics"}>
   <div className="trend-legend" aria-label="图例">
    {view === "profit" ? <span><i className="trend-legend-profit" />期间盈利</span> : <>
     <span><i className="trend-legend-portfolio" />资产净值</span><span><i className="trend-legend-principal" />累计净投入</span>
    </>}
   </div>
  </div>
  <InvestmentTrendChart points={points} view={view} gainColorScheme={gainColorScheme} />
 </div>;
}
