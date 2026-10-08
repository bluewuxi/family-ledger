import { buildColorSplitTrendChartData, buildColorSplitProfitChartData } from "../lib/trendChartSeries";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { InvestmentPerformanceCard } from "../components/InvestmentPerformanceCard";
import { ValuationStatus } from "../components/ValuationStatus";
import { DistributionPanel } from "../components/DistributionPanel";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  getAppBusinessDate,
  getAppBusinessDayEndInstant,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type DashboardSummary,
  type GainColorScheme,
  type InvestmentTransaction,
  type PortfolioSnapshotSummary,
  type PortfolioTrend,
  type PortfolioTrendRange,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { ApiClientError, apiGet } from "../lib/apiClient";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingBlock, LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import {
  formatDisplayAmount,
  formatDisplayPercent,
  formatSignedDisplayAmount,
  formatSignedDisplayPercent
} from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";
import { formatHoursMinutes } from "../lib/timeFormat";
import {
  buildProfitChartData,
  buildTrendChartData,
  isSyntheticTrendDate,
  type ProfitChartPoint,
  type TrendChartPoint,
  type TrendPoint
} from "../lib/trendChartData";


interface DashboardResponse {
  dashboard: DashboardSummary;
}

interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
  trend?: PortfolioTrend;
}

interface TransactionsResponse {
  transactions: InvestmentTransaction[];
}

const trendRanges: Array<{ value: PortfolioTrendRange; label: string }> = [
  { value: "1m", label: "近1月" },
  { value: "3m", label: "近3月" },
  { value: "1y", label: "近1年" },
  { value: "3y", label: "近3年" },
  { value: "5y", label: "近5年" },
  { value: "inception", label: "投资以来" }
];
const dashboardAutoRefreshIntervalMs = 5 * 60 * 1000;
const dashboardCurrencyStorageKey = "family-ledger.dashboard.reportingCurrency";
const trendPrincipalColor = "#8A5A24";
const chartPositiveColor = "var(--color-chart-positive)";
const chartNegativeColor = "var(--color-chart-negative)";
const chartTooltipContentStyle = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  boxShadow: "var(--shadow-soft)"
};
const chartTooltipLabelStyle = {
  color: "var(--color-text)",
  fontWeight: 600
};
const chartTooltipItemStyle = {
  color: "var(--color-brand-gold)",
  fontWeight: 600
};

type ChartToneStyle = CSSProperties & {
  "--color-chart-positive": string;
  "--color-chart-negative": string;
};

export function DashboardPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [trendView, setTrendView] = useState<"profit" | "assets">("profit");
  const [trendRange, setTrendRange] = useState<PortfolioTrendRange>("1y");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [trend, setTrend] = useState<PortfolioTrend | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<InvestmentTransaction[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [businessDayNow, setBusinessDayNow] = useState(() => new Date());
  const trendPanelRef = useRef<HTMLElement>(null);
  const [trendPanelHeight, setTrendPanelHeight] = useState(480);

  useEffect(() => {
    const panel = trendPanelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setTrendPanelHeight(panel.getBoundingClientRect().height));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setBusinessDayNow(new Date()), 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(dashboardCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadDashboard(reportingCurrency);
    }
  }, [currencyInitialized, reportingCurrency]);

  useEffect(() => {
    if (!currencyInitialized) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadDashboard(reportingCurrency, { showLoading: false });
    }, dashboardAutoRefreshIntervalMs);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void loadDashboard(reportingCurrency, { showLoading: false });
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currencyInitialized, reportingCurrency]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadSnapshots(reportingCurrency, trendRange);
    }
  }, [currencyInitialized, reportingCurrency, trendRange]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadActivity(reportingCurrency);
    }
  }, [currencyInitialized, reportingCurrency]);

  async function loadDashboard(currency: SnapshotDisplayCurrency, options: { showLoading?: boolean } = {}) {
    const showLoading = options.showLoading ?? true;

    if (showLoading) {
      setDashboardLoading(true);
    }
    setDashboardError(null);

    try {
      const data = await apiGet<DashboardResponse>(`/dashboard?currency=${currency}`);
      setDashboard(data.dashboard);
    } catch (requestError) {
      setDashboardError(toErrorMessage(requestError, "财富足迹请求失败，请稍后重试。"));
    } finally {
      if (showLoading) {
        setDashboardLoading(false);
      }
    }
  }

  async function loadSnapshots(currency: SnapshotDisplayCurrency, range: PortfolioTrendRange) {
    setSnapshotsLoading(true);
    setSnapshotsError(null);

    try {
      const data = await apiGet<PortfolioSnapshotsResponse>(
        `/portfolio-snapshots?purpose=investment&currency=${currency}&includeTrend=true&trendRange=${range}`
      );
      setSnapshots(data.snapshots);
      setTrend(data.trend ?? null);
    } catch (requestError) {
      setSnapshotsError(toErrorMessage(requestError, "资产趋势请求失败，请稍后重试。"));
      setTrend(null);
    } finally {
      setSnapshotsLoading(false);
    }
  }

  async function loadActivity(currency: SnapshotDisplayCurrency, options: { showLoading?: boolean } = {}) {
    const showLoading = options.showLoading ?? true;

    if (showLoading) {
      setActivityLoading(true);
    }
    setActivityError(null);

    try {
      const transactionData = await apiGet<TransactionsResponse>("/transactions?purpose=investment&transactionTypes=buy,sell&excludeGeneratedCashLegs=true&excludeCashInstruments=true&limit=10&offset=0");
      setRecentTransactions(transactionData.transactions);
    } catch (requestError) {
      setActivityError(toErrorMessage(requestError, "最新动态请求失败，请稍后重试。"));
    } finally {
      if (showLoading) {
        setActivityLoading(false);
      }
    }
  }

  function refreshDashboard() {
    void loadDashboard(reportingCurrency);
    void loadSnapshots(reportingCurrency, trendRange);
    void loadActivity(reportingCurrency);
  }

  const activeCurrency = dashboard?.reportingCurrency ?? reportingCurrency;
  const cashValue = dashboard?.allocations.find((allocation) => allocation.allocationType === "cash")?.marketValue;
  const businessDayNote = useMemo(() => buildBusinessDayCountdownParts(businessDayNow), [businessDayNow]);
  const accountNames = useMemo(
    () => new Map((dashboard?.accounts ?? []).map((account) => [account.accountId, account.accountName])),
    [dashboard?.accounts]
  );
  const metrics = [
    { label: "本日变动", value: formatPlainTodayChange(dashboard, dashboardLoading), currency: activeCurrency, toneClass: signedToneClass(dashboard?.todayChange, preferences.gainColorScheme, 3) },
    { label: "现金", value: formatPlainMoneyMetric(cashValue, dashboardLoading), currency: activeCurrency, toneClass: undefined }
  ];

  const trendData = useMemo<TrendPoint[]>(
    () => {
      const trendPoints = trend?.points;

      if (trendPoints && trendPoints.length > 0) {
        return trendPoints
          .map((point) => ({
            date: point.date,
            portfolioValue: parseNullableNumber(point.portfolioValue),
            totalInvestment: parseNullableNumber(point.totalInvestment),
            snapshotDate: point.snapshotDate
          }));
      }

      return snapshots
        .filter((snapshot) => snapshot.marketValue !== null)
        .map((snapshot) => ({
          date: snapshot.snapshotDate,
          portfolioValue: parseNullableNumber(snapshot.marketValue),
          totalInvestment: null,
          snapshotDate: snapshot.snapshotDate
        }))
        .filter((point) => point.portfolioValue !== null);
    },
    [snapshots, trend?.points]
  );
  const trendChartData = useMemo(
    () =>
      buildTrendChartData(trendData, dashboard?.totalAssets, dashboard?.valuationMetadata ? getAppBusinessDate(dashboard.valuationMetadata.valuedAt) : dashboard?.quoteDate, new Date(), {
        currentTotalInvestment: dashboard?.investmentPerformance?.netInvestment
      }),
    [dashboard?.quoteDate, dashboard?.valuationMetadata, dashboard?.investmentPerformance?.netInvestment, dashboard?.totalAssets, trendData, trendRange]
  );
  const colorSplitTrendChartData = useMemo(
    () => buildColorSplitTrendChartData(trendChartData),
    [trendChartData]
  );
  const trendSummary = useMemo(
    () => buildTrendSummary(trendChartData),
    [trendChartData]
  );
  const profitChartData = useMemo(
    () => buildProfitChartData(trendChartData),
    [trendChartData]
  );
  const colorSplitProfitChartData = useMemo(
    () => buildColorSplitProfitChartData(profitChartData),
    [profitChartData]
  );
  const profitSummary = useMemo(
    () => buildProfitSummary(profitChartData),
    [profitChartData]
  );
  const trendValueDomain = useMemo(() => getTrendValueDomain(trendChartData), [trendChartData]);
  const hoverDates = new Set((trendView === "assets" ? trendChartData : profitChartData).map(point => point.date));
  const profitValueDomain = useMemo(() => getProfitValueDomain(profitChartData), [profitChartData]);
  const profitValueTicks = useMemo(() => getProfitValueTicks(profitValueDomain), [profitValueDomain]);
  const profitAxisDomain = useMemo<[number, number]>(
    () => [profitValueTicks[0] ?? 0, profitValueTicks.at(-1) ?? 1],
    [profitValueTicks]
  );
  const chartToneStyle = useMemo(
    () => getChartToneStyle(preferences.gainColorScheme),
    [preferences.gainColorScheme]
  );
  const hasPrincipalWarning = (trend?.summary.warnings.length ?? 0) > 0 || (dashboard?.investmentPerformance?.warnings.length ?? 0) > 0;
  const trendLoading = snapshotsLoading || !currencyInitialized;
  const allocationLoading = dashboardLoading || !currencyInitialized;

  return (
    <section>
      <header className="page-header account-header dashboard-header">
        <div>
          <PageTitle route="/dashboard">
            财富足迹
            <span className="dashboard-title-tagline">资金永无眠</span>
          </PageTitle>
          <p>基于当前或延迟行情、汇率，展示投资组合概览。</p>
        </div>
        <p className="business-day-note dashboard-business-day-note-mobile">
          交易日 <span>{businessDayNote.businessDate}</span> 将于 <span>{businessDayNote.remainingTime}</span> 结束
        </p>
        <div className="dashboard-controls dashboard-header-controls">
          <CurrencySelect
            label="报告币种"
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
                writeStoredDisplayCurrency(dashboardCurrencyStorageKey, nextCurrency);
                setCurrencyManuallySelected(true);
                setReportingCurrency(nextCurrency);
            }}
            disabled={!currencyInitialized}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={refreshDashboard}
            disabled={dashboardLoading || snapshotsLoading || !currencyInitialized}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {dashboardError ? <p className="form-error">{dashboardError}</p> : null}

      <p className="business-day-note dashboard-business-day-note-desktop">
        交易日 <span>{businessDayNote.businessDate}</span> 将于 <span>{businessDayNote.remainingTime}</span> 结束
      </p>

      <div className="metric-grid dashboard-metric-grid">
        <article className="metric-card"><span>当前估值</span><small className="metric-currency"><CurrencyFlagIcon currency={activeCurrency} />{activeCurrency}</small><strong>{formatPlainMoneyMetric(dashboard?.totalAssets, dashboardLoading)}</strong></article>
        <InvestmentPerformanceCard performance={dashboard?.investmentPerformance} currency={activeCurrency} loading={dashboardLoading} wholeAmounts />
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            {metric.currency ? (
              <small className="metric-currency">
                <CurrencyFlagIcon currency={metric.currency} />
                {metric.currency}
              </small>
            ) : null}
            <strong className={metric.toneClass}>{metric.value}</strong>
            {metric.label === "本日变动" ? <small>仅计入本交易日有实时或预估数据的标的</small> : null}
          </article>
        ))}
      </div>

      <p className="dashboard-secondary-stats">当日交易 {dashboardLoading ? "--" : dashboard?.dailyTradeCount ?? 0} · 账户数量 {dashboardLoading ? "--" : dashboard?.accountCount ?? 0}</p>
      {!dashboardLoading && dashboard ? <ValuationStatus metadata={dashboard.valuationMetadata} performance={dashboard.investmentPerformance} warnings={dashboard.warnings} /> : null}

      <section className="dashboard-card-flow dashboard-chart-flow" aria-label="投资趋势、持仓分布、证券账户与现金和最新成交">
        <article ref={trendPanelRef} className="flow-card chart-panel trend-chart-panel" style={chartToneStyle} id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${trendView}`}>
          <div className="chart-section-header">
            <div className="trend-tabs" role="tablist" aria-label="趋势视图">
              {(["profit", "assets"] as const).map(view => <button key={view} id={`trend-tab-${view}`} type="button" role="tab" aria-selected={trendView === view} aria-controls="trend-panel" tabIndex={trendView === view ? 0 : -1} onClick={() => setTrendView(view)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "profit" : event.key === "End" ? "assets" : view === "profit" ? "assets" : "profit";
                setTrendView(next);
                document.getElementById(`trend-tab-${next}`)?.focus();
              }}>{view === "profit" ? "期间盈利" : "资产趋势"}</button>)}
            </div>
            <div className="chart-header-controls">
              <span className="chart-currency-indicator" aria-label={`当前图表币种 ${activeCurrency}`}>
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
              <div className="chart-range-select">
                <select
                  aria-label="趋势范围"
                  value={trendRange}
                  onChange={(event) => setTrendRange(event.target.value as PortfolioTrendRange)}
                  disabled={trendLoading}
                >
                  {trendRanges.map((range) => (
                    <option key={range.value} value={range.value}>
                      {range.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        {trendView === "assets" ? <>
          {snapshotsError ? <p className="form-error">{snapshotsError}</p> : null}
          {hasPrincipalWarning ? (
            <p className="form-error">累计净投入缺少交易日汇率，请补齐汇率数据后查看累计收益。</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label="正在加载资产趋势" />
          ) : trendChartData.length === 0 ? (
            <div className="empty-chart-state">暂无快照数据</div>
          ) : (
            <>
              <div className="trend-panel-metrics">
                <div className="trend-legend" aria-label="图例">
                  <span>
                    <i className="trend-legend-portfolio" />
                    资产净值
                  </span>
                  <span>
                    <i className="trend-legend-principal" />
                    累计净投入
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={colorSplitTrendChartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="portfolioTrendPositiveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="8%" stopColor={chartPositiveColor} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={chartPositiveColor} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="portfolioTrendNegativeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="8%" stopColor={chartNegativeColor} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={chartNegativeColor} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="portfolioTrendPrincipalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="12%" stopColor={trendPrincipalColor} stopOpacity={0.18} />
                      <stop offset="96%" stopColor={trendPrincipalColor} stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatTrendTickDate} tickLine={false} />
                  <YAxis
                    domain={trendValueDomain}
                    tickFormatter={(value: number) => formatCompactMoney(value)}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} content={({ active, payload, label }) => <TrendHoverTooltip active={active} payload={payload} label={label} dates={hoverDates} profit={false} />} />
                  <Area
                    isAnimationActive={false}
                    type="stepAfter"
                    dataKey="totalInvestment"
                    name="累计净投入"
                    stroke="none"
                    fill="url(#portfolioTrendPrincipalFill)"
                    dot={false}
                    activeDot={false}
                    connectNulls
                    tooltipType="none"
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="snapshotPositiveRange"
                    name="资产净值"
                    stroke="none"
                    fill="url(#portfolioTrendPositiveFill)"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="snapshotNegativeRange"
                    name="资产净值"
                    stroke="none"
                    fill="url(#portfolioTrendNegativeFill)"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="snapshotPositiveValue"
                    name="资产净值"
                    stroke={chartPositiveColor}
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={props => renderTrendHoverDot(props, hoverDates)}
                    connectNulls={false}
                  />
                  <Line
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="snapshotNegativeValue"
                    name="资产净值"
                    stroke={chartNegativeColor}
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={props => renderTrendHoverDot(props, hoverDates)}
                    connectNulls={false}
                  />
                  <Line
                    isAnimationActive={false}
                    type="stepAfter"
                    dataKey="totalInvestment"
                    stroke={trendPrincipalColor}
                    strokeDasharray="6 5"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={props => renderTrendHoverDot(props, hoverDates)}
                    connectNulls
                  />


                </AreaChart>
              </ResponsiveContainer>
              {trendSummary ? (
                <p className="trend-summary">
                  {trendSummary.rangeLabel}，初始值 {trendSummary.initialValue}，
                  <span className="trend-summary-change">
                    总资产变动
                    <span className={signedToneClass(trendSummary.changeAmountRaw, preferences.gainColorScheme, 3)}>
                      {trendSummary.changeAmount}
                    </span>
                    （
                    <span className={signedToneClass(trendSummary.changePctRaw, preferences.gainColorScheme, 1)}>
                      {trendSummary.changePct}
                    </span>
                    ）
                  </span>
                </p>
              ) : null}
            </>
          )}
        </> : null}
        {trendView === "profit" ? <>
          {hasPrincipalWarning ? (
            <p className="form-error">累计净投入缺少交易日汇率，请补齐汇率数据后查看期间盈利。</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label="正在加载期间盈利" />
          ) : profitChartData.length === 0 ? (
            <div className="empty-chart-state">暂无期间盈利数据</div>
          ) : (
            <>
              <div className="trend-panel-metrics profit-panel-metrics">
                <div className="trend-legend" aria-label="图例">
                  <span>
                    <i className="trend-legend-profit" />
                    期间盈利
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={colorSplitProfitChartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="portfolioProfitPositiveFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="8%" stopColor={chartPositiveColor} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={chartPositiveColor} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="portfolioProfitNegativeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="8%" stopColor={chartNegativeColor} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={chartNegativeColor} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatTrendTickDate} tickLine={false} />
                  <YAxis
                    domain={profitAxisDomain}
                    ticks={profitValueTicks}
                    tickFormatter={(value: number) => formatCompactMoney(value)}
                    tickLine={false}
                    width={72}
                  />
                  <ReferenceLine y={0} stroke="var(--color-chart-grid)" strokeWidth={1.4} />
                  <Tooltip cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} content={({ active, payload, label }) => <TrendHoverTooltip active={active} payload={payload} label={label} dates={hoverDates} profit={true} />} />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="profitPositiveValue"
                    name="期间盈利"
                    stroke={chartPositiveColor}
                    fill="url(#portfolioProfitPositiveFill)"
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={props => renderTrendHoverDot(props, hoverDates)}
                    connectNulls={false}
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="profitNegativeValue"
                    name="期间盈利"
                    stroke={chartNegativeColor}
                    fill="url(#portfolioProfitNegativeFill)"
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={props => renderTrendHoverDot(props, hoverDates)}
                    connectNulls={false}
                  />


                </AreaChart>
              </ResponsiveContainer>
              <p className="panel-description">所选期间内的盈利变化，已扣除净投入变化。起点为期间首个有效估值；悬停或轻触曲线可查看数值；最新节点为当前估值。</p>
              {profitSummary ? (
                <p className="trend-summary">
                  {profitSummary.rangeLabel}，
                  <span className="trend-summary-change">
                    期间盈利
                    <span className={signedToneClass(profitSummary.changeAmountRaw, preferences.gainColorScheme, 3)}>
                      {profitSummary.changeAmount}
                    </span>
                  </span>
                </p>
              ) : null}
            </>
          )}
        </> : null}
        </article>

        <article className="flow-card activity-panel trade-activity-panel" style={{ height: trendPanelHeight }}>
          <div className="activity-panel-header">
            <h2>最新成交</h2>
            <span>10 条</span>
          </div>
          {activityError ? <p className="form-error">{activityError}</p> : null}
          {activityLoading ? (
            <LoadingBlock label="正在加载最新成交" />
          ) : recentTransactions.length === 0 ? (
            <div className="empty-chart-state">暂无买卖交易</div>
          ) : (
            <div className="activity-table-wrap">
              <div className="activity-list compact-activity-list trade-activity-list">
                {recentTransactions.map((transaction) => (
                  <div className="compact-activity-row trade-activity-row" key={transaction.id}>
                    <span className="activity-date">{transaction.tradeDate}</span>
                    <span className="activity-account">{accountNames.get(transaction.accountId) ?? "-"}</span>
                    <span className="activity-trade-instrument">
                      <span
                        className={`trade-type ${transaction.transactionType === "buy" ? "trade-type-buy" : "trade-type-sell"}`}
                      >
                        {formatTransactionType(transaction)}
                      </span>
                      <strong>{formatTransactionInstrument(transaction)}</strong>
                    </span>
                    <span className="activity-quantity-currency">
                      <span>{formatTransactionQuantityPrice(transaction)}</span>
                      <span className="currency-inline">
                        <CurrencyFlagIcon currency={transaction.currency} />
                        {transaction.currency}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link className="activity-more-link" to="/transactions">更多...</Link>
        </article>
        <DistributionPanel title="持仓分布" rows={(dashboard?.holdingAllocations ?? []).map(row => ({ id: row.id, name: row.name, marketValue: row.marketValue }))} total={dashboard?.totalAssets} loading={allocationLoading} />
        <DistributionPanel title="证券账户与现金" description="各账户仅统计证券市值，现金统一汇总。占比以全部投资资产为分母。" rows={dashboard?.allocations ?? []} total={dashboard?.totalAssets} loading={allocationLoading} />


      </section>

    </section>
  );
}

function formatPlainMoneyMetric(value: string | null | undefined, loading: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  return value === null || value === undefined ? "--" : formatMetricWholeNumber(value);
}

function formatPlainTodayChange(dashboard: DashboardSummary | null, loading: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  if (!dashboard || dashboard.todayChange === null) {
    return "--";
  }

  return (
    <span className="metric-inline-pair">
      <span>{formatMetricWholeNumber(dashboard.todayChange, { signed: true })}</span>
      {dashboard.todayChangePct === null ? null : (
        <span className="metric-inline-secondary">{formatSignedDisplayPercent(dashboard.todayChangePct)}%</span>
      )}
    </span>
  );
}

function formatMetricWholeNumber(value: string | number, options: { signed?: boolean } = {}): string {
  const numericValue = Number(String(value).trim());

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  const roundedValue = Math.round(numericValue);
  const formatted = Math.abs(roundedValue).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

  if (options.signed && roundedValue > 0) {
    return `+${formatted}`;
  }

  if (roundedValue < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function buildBusinessDayCountdownParts(now: Date): { businessDate: string; remainingTime: string } {
  const businessDate = getAppBusinessDate(now);
  const endInstant = new Date(getAppBusinessDayEndInstant(now));
  const remainingMinutes = Math.max(0, Math.ceil((endInstant.getTime() - now.getTime()) / 60_000));

  return {
    businessDate,
    remainingTime: formatHoursMinutes(remainingMinutes)
  };
}

function buildTrendSummary(chartPoints: TrendChartPoint[]): {
  rangeLabel: string;
  initialValue: string;
  changeAmount: string;
  changeAmountRaw: string;
  changePct: string;
  changePctRaw: string;
} | null {
  const portfolioPoints = chartPoints
    .map((point) => ({
      date: point.date,
      value: point.liveValue ?? point.snapshotValue
    }))
    .filter((point): point is { date: string; value: number } => point.value !== null && Number.isFinite(point.value));
  const firstPoint = portfolioPoints[0];
  const lastPoint = portfolioPoints.at(-1);

  if (!firstPoint || !lastPoint) {
    return null;
  }

  const changeAmount = lastPoint.value - firstPoint.value;
  const changePct = firstPoint.value === 0 ? null : (changeAmount / firstPoint.value) * 100;
  const endDate = isSyntheticTrendDate(lastPoint.date) ? getAppBusinessDate() : lastPoint.date;

  return {
    rangeLabel: `${firstPoint.date} 至 ${endDate}`,
    initialValue: formatChartMoney(firstPoint.value),
    changeAmount: formatMetricWholeNumber(changeAmount, { signed: true }),
    changeAmountRaw: String(changeAmount),
    changePct: changePct === null ? "--" : `${formatSignedDisplayPercent(changePct)}%`,
    changePctRaw: changePct === null ? "0" : String(changePct)
  };
}

function buildProfitSummary(chartPoints: ProfitChartPoint[]): { rangeLabel: string; changeAmount: string; changeAmountRaw: string } | null {
  const points = chartPoints.filter(point => point.profitValue !== null && Number.isFinite(point.profitValue));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const amount = last.profitValue! - first.profitValue!;
  const endDate = isSyntheticTrendDate(last.date) ? getAppBusinessDate() : last.date;
  return { rangeLabel: `实际统计起点 ${first.date} 至 ${endDate}`, changeAmount: formatMetricWholeNumber(amount, { signed: true }), changeAmountRaw: String(amount) };
}

function formatTransactionInstrument(transaction: InvestmentTransaction): string {
  return transaction.instrumentShortName ?? transaction.instrumentName ?? transaction.instrumentSymbol ?? "未知标的";
}

function formatTransactionType(transaction: InvestmentTransaction): string {
  return transaction.transactionType === "buy" ? "买入" : "卖出";
}

function formatTransactionQuantityPrice(transaction: InvestmentTransaction): string {
  if (transaction.quantity === null || transaction.price === null) {
    return "--";
  }

  return `${formatDisplayAmount(transaction.quantity)}@${formatDisplayAmount(transaction.price)}`;
}

function parseNullableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatShortDate(value: string): string {
  return value.slice(5);
}

function formatTrendTickDate(value: string): string {
  return isSyntheticChartDate(value) ? "" : formatShortDate(value);
}

function formatTrendTooltipLabel(value: string): string {
  if (isSyntheticTrendDate(value)) {
    return "当前估值连接线";
  }
  if (isChartCrossingDate(value)) {
    return "盈亏分界点";
  }

  return `日期：${value}`;
}

function formatTrendTooltipName(value: string): string {
  switch (value) {
    case "snapshotValue":
    case "snapshotPositiveValue":
    case "snapshotNegativeValue":
      return "资产净值";
    case "totalInvestment":
      return "累计净投入";
    case "liveValue":
    case "livePositiveValue":
    case "liveNegativeValue":
      return "当前估值";
    default:
      return value;
  }
}

function isSyntheticChartDate(value: string): boolean {
  return isSyntheticTrendDate(value) || isChartCrossingDate(value);
}

function isChartCrossingDate(value: string): boolean {
  return value.startsWith("__chart_crossing__");
}

function getTrendValueDomain(points: TrendChartPoint[]): [number, number] {
  const values = points
    .flatMap((point) => [point.snapshotValue, point.liveValue, point.totalInvestment])
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;

  if (valueRange === 0) {
    const padding = Math.max(Math.abs(maxValue) * 0.01, 1);
    return [minValue < 0 ? minValue - padding : Math.max(0, minValue - padding), maxValue + padding];
  }

  const padding = valueRange * 0.2;
  return [Math.max(0, minValue - padding), maxValue + padding];
}

function getProfitValueDomain(points: ProfitChartPoint[]): [number, number] {
  const values = points
    .map((point) => point.profitValue)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (values.length === 0) {
    return [0, 1];
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;

  if (valueRange === 0) {
    const padding = Math.max(Math.abs(maxValue) * 0.05, 1);
    return [minValue - padding, maxValue + padding];
  }

  const padding = valueRange * 0.2;
  return [minValue - padding, maxValue + padding];
}

function getChartToneStyle(gainColorScheme: GainColorScheme): ChartToneStyle {
  const positiveColor = gainColorScheme === "red_positive" ? "var(--color-gain-red)" : "var(--color-gain-green)";
  const negativeColor = gainColorScheme === "red_positive" ? "var(--color-gain-green)" : "var(--color-gain-red)";

  return {
    "--color-chart-positive": positiveColor,
    "--color-chart-negative": negativeColor
  };
}

function getProfitValueTicks(domain: [number, number]): number[] {
  const [minValue, maxValue] = domain;
  const valueRange = maxValue - minValue;

  if (!Number.isFinite(valueRange) || valueRange <= 0) {
    return [0];
  }

  const step = getNiceTickStep(valueRange / 4);
  const lowerTick = Math.floor(minValue / step) * step;
  const upperTick = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let tick = lowerTick; tick <= upperTick + step * 0.5; tick += step) {
    ticks.push(Math.abs(tick) < step / 1_000_000 ? 0 : tick);
  }

  if (!ticks.some((tick) => tick === 0)) {
    ticks.push(0);
    ticks.sort((left, right) => left - right);
  }

  return Array.from(new Set(ticks));
}

function getNiceTickStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;

  if (normalizedStep <= 1) {
    return magnitude;
  }
  if (normalizedStep <= 2) {
    return magnitude * 2;
  }
  if (normalizedStep <= 5) {
    return magnitude * 5;
  }

  return magnitude * 10;
}

function formatChartMoney(value: number): string {
  return Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatChartMoney(numericValue) : "--";
}

function formatSignedTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatMetricWholeNumber(numericValue, { signed: true }) : "--";
}

function formatCompactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    const scaledValue = value / 1_000_000;
    const decimals = Math.abs(scaledValue) < 10 ? 2 : Math.abs(scaledValue) < 100 ? 1 : 0;
    return `${scaledValue.toFixed(decimals)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

function toDisplayCurrency(value: string): SnapshotDisplayCurrency {
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(value as SnapshotDisplayCurrency)
    ? (value as SnapshotDisplayCurrency)
    : "CNY";
}

function readStoredDisplayCurrency(key: string): SnapshotDisplayCurrency | null {
  const value = window.localStorage.getItem(key);
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(value as SnapshotDisplayCurrency)
    ? (value as SnapshotDisplayCurrency)
    : null;
}

function writeStoredDisplayCurrency(key: string, value: SnapshotDisplayCurrency): void {
  window.localStorage.setItem(key, value);
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}


function renderTrendHoverDot(props: unknown, dates: Set<string>): ReactNode {
  const point = props as { cx?: number; cy?: number; fill?: string; payload?: { date?: string } };
  return point.payload?.date && dates.has(point.payload.date) ? <circle cx={point.cx} cy={point.cy} r={5} fill={point.fill} stroke="var(--color-surface)" strokeWidth={2} /> : <g />;
}

function TrendHoverTooltip({ active, payload, label, dates, profit }: { active?: boolean; payload?: readonly { payload?: unknown }[]; label?: unknown; dates: Set<string>; profit: boolean }) {
  if (!active || typeof label !== "string" || !dates.has(label)) return null;
  const point = payload?.[0]?.payload as { value?: number | null; totalInvestment?: number | null; snapshotDate?: string } | undefined;
  if (!point || point.value == null) return null;
  return <div style={{ ...chartTooltipContentStyle, padding: "10px 12px" }}>
    <div style={chartTooltipLabelStyle}>{point.snapshotDate ?? label.replace("__live_endpoint__", "")}{label.startsWith("__live_endpoint__") ? " · 当前估值" : ""}</div>
    <div style={chartTooltipItemStyle}>{profit ? "期间盈利" : "资产净值"}：{profit ? formatSignedTooltipMoney(point.value) : formatTooltipMoney(point.value)}</div>
    {!profit && point.totalInvestment != null ? <div>累计净投入：{formatTooltipMoney(point.totalInvestment)}</div> : null}
  </div>;
}
