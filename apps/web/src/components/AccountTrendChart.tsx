import { useUiLanguage } from "../i18n/LanguageProvider";
import { dashboardCopy as copy } from "../i18n/investmentCopy";
import { useMemo } from "react";
import { type AccountDetailSummary, type GainColorScheme } from "@family-ledger/shared";
import { buildTrendChartData } from "../lib/trendChartData";
import { InvestmentTrendChart, getChartToneStyle } from "./InvestmentTrendChart";

export function AccountTrendChart({ detail, view, gainColorScheme }: { detail: AccountDetailSummary; view: "profit" | "assets"; gainColorScheme: GainColorScheme }) {
  const { language } = useUiLanguage();
  const points = useMemo(() => buildTrendChartData(detail.trend.points.map(point => ({ date: point.date,
    snapshotDate: point.snapshotDate, portfolioValue: point.marketValue === null ? null : Number(point.marketValue),
    totalInvestment: point.totalInvestment === null || point.totalInvestment === undefined ? null : Number(point.totalInvestment) })),
    detail.currentValue.marketValue, detail.currentValue.valuationBusinessDate, detail.valuedAt ?? new Date(),
    { currentTotalInvestment: detail.investmentPerformance?.netInvestment }), [detail]);
  if (!points.some(point => point.snapshotValue !== null || point.liveValue !== null)) return <div className="empty-chart-state">{copy("noAccountValues", language)}</div>;
 return <div style={getChartToneStyle(gainColorScheme)}>
  <div className={view === "profit" ? "trend-panel-metrics profit-panel-metrics" : "trend-panel-metrics"}>
   <div className="trend-legend" aria-label={copy("legend", language)}>
    {view === "profit" ? <span><i className="trend-legend-profit" />{copy("periodProfit", language)}</span> : <>
     <span><i className="trend-legend-portfolio" />{copy("netAssets", language)}</span><span><i className="trend-legend-principal" />{copy("netInvestment", language)}</span>
    </>}
   </div>
  </div>
  <InvestmentTrendChart points={points} view={view} gainColorScheme={gainColorScheme} />
 </div>;
}
