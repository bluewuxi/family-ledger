import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  CartesianGrid,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  getAppBusinessDate,
  getAppBusinessDayEndInstant,
  getLocalDateString,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type DashboardSummary,
  type DashboardWarning,
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
import { formatHoursMinutes, formatLocalDateTimeNote } from "../lib/timeFormat";
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

interface AllocationPoint {
  name: string;
  value: number;
  percentage: number;
}

interface ColorSplitTrendChartPoint extends TrendChartPoint {
  snapshotPositiveValue: number | null;
  snapshotNegativeValue: number | null;
  snapshotPositiveRange: [number, number] | null;
  snapshotNegativeRange: [number, number] | null;
  livePositiveValue: number | null;
  liveNegativeValue: number | null;
}

interface ColorSplitProfitChartPoint extends ProfitChartPoint {
  profitPositiveValue: number | null;
  profitNegativeValue: number | null;
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
const allocationColors = ["#5A321C", "#F5B52E", "#C77A22", "#D9534F", "#A85A32", "#9C6B2F"];
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
  const [trendRange, setTrendRange] = useState<PortfolioTrendRange>("3m");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [trend, setTrend] = useState<PortfolioTrend | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<InvestmentTransaction[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [businessDayNow, setBusinessDayNow] = useState(() => new Date());

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
        `/portfolio-snapshots?currency=${currency}&includeTrend=true&trendRange=${range}`
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
      const [transactionData, snapshotData] = await Promise.all([
        apiGet<TransactionsResponse>(
          "/transactions?transactionTypes=buy,sell&excludeGeneratedCashLegs=true&excludeCashInstruments=true&limit=10&offset=0"
        ),
        apiGet<PortfolioSnapshotsResponse>(`/portfolio-snapshots?currency=${currency}&limit=16&order=desc`)
      ]);
      setRecentTransactions(transactionData.transactions);
      setRecentSnapshots(snapshotData.snapshots);
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
    { label: "当前估值", value: formatPlainMoneyMetric(dashboard?.totalAssets, dashboardLoading), currency: activeCurrency },
    {
      label: "行情变动",
      value: formatPlainTodayChange(dashboard, dashboardLoading),
      currency: activeCurrency,
      toneClass: signedToneClass(dashboard?.todayChange, preferences.gainColorScheme, 3)
    },
    {
      label: "动态盈亏",
      value: formatSignedMoneyMetric(dashboard?.unrealizedGain, dashboardLoading),
      currency: activeCurrency,
      toneClass: signedToneClass(dashboard?.unrealizedGain, preferences.gainColorScheme, 3)
    },
    { label: "现金", value: formatPlainMoneyMetric(cashValue, dashboardLoading), currency: activeCurrency },
    { label: "当日交易", value: dashboardLoading ? <LoadingState label="加载中" /> : String(dashboard?.dailyTradeCount ?? 0), compact: true },
    { label: "账户数量", value: dashboardLoading ? <LoadingState label="加载中" /> : String(dashboard?.accountCount ?? 0), compact: true }
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
          }))
          .filter((point) => point.portfolioValue !== null || point.totalInvestment !== null);
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
      buildTrendChartData(trendData, dashboard?.totalAssets, dashboard?.quoteDate, new Date(), {
        showLiveConnector: trendRange === "1m"
      }),
    [dashboard?.quoteDate, dashboard?.totalAssets, trendData, trendRange]
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
  const cumulativeMovement = useMemo(
    () => calculateTrendCumulativeMovement(trendChartData),
    [trendChartData]
  );
  const hasPrincipalWarning = (trend?.summary.warnings.length ?? 0) > 0;
  const allocationData = useMemo<AllocationPoint[]>(
    () => {
      const values = (dashboard?.allocations ?? [])
        .filter((account) => account.marketValue !== null)
        .map((account) => ({
          name: account.name,
          value: Number(account.marketValue)
        }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0);
      const total = values.reduce((sum, point) => sum + point.value, 0);

      return values.map((point) => ({
        ...point,
        percentage: total > 0 ? (point.value / total) * 100 : 0
      }));
    },
    [dashboard]
  );
  const holdingAllocationData = useMemo<AllocationPoint[]>(
    () =>
      (dashboard?.holdingAllocations ?? [])
        .filter((allocation) => allocation.marketValue !== null && allocation.percentageOfTotal !== null)
        .map((allocation) => ({
          name: allocation.name,
          value: Number(allocation.marketValue),
          percentage: Number(allocation.percentageOfTotal)
        }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0 && Number.isFinite(point.percentage)),
    [dashboard?.holdingAllocations]
  );
  const trendLoading = snapshotsLoading || !currencyInitialized;
  const allocationLoading = dashboardLoading || !currencyInitialized;
  const allocationDate = dashboard?.quoteDate ?? (dashboard?.quoteFetchedAt ? getLocalDateString(dashboard.quoteFetchedAt) : "暂无日期");

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
        {metrics.map((metric) => (
          <article className={metric.compact ? "metric-card metric-card-compact" : "metric-card"} key={metric.label}>
            <span>{metric.label}</span>
            {metric.currency ? (
              <small className="metric-currency">
                <CurrencyFlagIcon currency={metric.currency} />
                {metric.currency}
              </small>
            ) : null}
            <strong className={metric.toneClass}>{metric.value}</strong>
          </article>
        ))}
      </div>

      {!dashboardLoading && dashboard ? <p className="quote-update-note">{renderQuoteUpdateNote(dashboard)}</p> : null}

      <section className="dashboard-card-flow dashboard-chart-flow" aria-label="资产趋势、持仓分布、账户分布、最新成交和快照净值变动">
        <article className="flow-card chart-panel trend-chart-panel" style={chartToneStyle}>
          <div className="chart-section-header">
            <div>
              <h2>资产趋势</h2>
            </div>
            <div className="chart-header-controls">
              <span className="chart-currency-indicator" aria-label={`当前图表币种 ${activeCurrency}`}>
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
              <div className="chart-range-select">
                <select
                  aria-label="范围"
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
          {snapshotsError ? <p className="form-error">{snapshotsError}</p> : null}
          {hasPrincipalWarning ? (
            <p className="form-error">总投入缺少交易日汇率，请补齐汇率数据后查看累计收益。</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label="正在加载资产趋势" />
          ) : trendData.length === 0 ? (
            <div className="empty-chart-state">暂无快照数据</div>
          ) : (
            <>
              <div className="trend-panel-metrics">
                <div className="trend-movement">
                  <strong className={signedToneClass(cumulativeMovement, preferences.gainColorScheme, 3)}>
                    {formatNullableSignedWholeAmount(cumulativeMovement)}
                  </strong>
                  <span>{activeCurrency}</span>
                  <small>累计收益</small>
                </div>
                <div className="trend-legend" aria-label="图例">
                  <span>
                    <i className="trend-legend-portfolio" />
                    资产净值
                  </span>
                  <span>
                    <i className="trend-legend-principal" />
                    总投入
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
                  <Tooltip
                    shared={false}
                    contentStyle={chartTooltipContentStyle}
                    formatter={(value, name) => [formatTooltipMoney(value), formatTrendTooltipName(String(name))]}
                    labelFormatter={(label) => formatTrendTooltipLabel(String(label))}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="totalInvestment"
                    name="总投入"
                    stroke="none"
                    fill="url(#portfolioTrendPrincipalFill)"
                    dot={false}
                    activeDot={false}
                    connectNulls
                    tooltipType="none"
                  />
                  <Area
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
                    type="monotone"
                    dataKey="snapshotPositiveValue"
                    name="资产净值"
                    stroke={chartPositiveColor}
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="snapshotNegativeValue"
                    name="资产净值"
                    stroke={chartNegativeColor}
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="totalInvestment"
                    stroke={trendPrincipalColor}
                    strokeDasharray="6 5"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="livePositiveValue"
                    name="实时估值"
                    stroke={chartPositiveColor}
                    strokeDasharray="3 5"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="liveNegativeValue"
                    name="实时估值"
                    stroke={chartNegativeColor}
                    strokeDasharray="3 5"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
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
        </article>

        <article className="flow-card chart-panel trend-chart-panel" style={chartToneStyle}>
          <div className="chart-section-header">
            <div>
              <h2>期间盈亏</h2>
            </div>
            <div className="chart-header-controls">
              <span className="chart-currency-indicator" aria-label={`当前图表币种 ${activeCurrency}`}>
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
              <div className="chart-range-select">
                <select
                  aria-label="期间盈亏范围"
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
          {hasPrincipalWarning ? (
            <p className="form-error">总投入缺少交易日汇率，请补齐汇率数据后查看期间盈亏。</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label="正在加载期间盈亏" />
          ) : profitChartData.length === 0 ? (
            <div className="empty-chart-state">暂无期间盈亏数据</div>
          ) : (
            <>
              <div className="trend-panel-metrics profit-panel-metrics">
                <div className="trend-legend" aria-label="图例">
                  <span>
                    <i className="trend-legend-profit" />
                    期间盈亏
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
                  <Tooltip
                    shared={false}
                    contentStyle={chartTooltipContentStyle}
                    formatter={(value) => [formatSignedTooltipMoney(value), "期间盈亏"]}
                    labelFormatter={(label) => formatTrendTooltipLabel(String(label))}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="profitPositiveValue"
                    name="期间盈亏"
                    stroke={chartPositiveColor}
                    fill="url(#portfolioProfitPositiveFill)"
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="profitNegativeValue"
                    name="期间盈亏"
                    stroke={chartNegativeColor}
                    fill="url(#portfolioProfitNegativeFill)"
                    strokeWidth={2.8}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {profitSummary ? (
                <p className="trend-summary">
                  {profitSummary.rangeLabel}，
                  <span className="trend-summary-change">
                    期间盈亏
                    <span className={signedToneClass(profitSummary.changeAmountRaw, preferences.gainColorScheme, 3)}>
                      {profitSummary.changeAmount}
                    </span>
                    （占期初总资产
                    <span className={signedToneClass(profitSummary.changePctRaw, preferences.gainColorScheme, 1)}>
                      {profitSummary.changePct}
                    </span>
                    ）
                  </span>
                </p>
              ) : null}
            </>
          )}
        </article>

        <article className="flow-card allocation-panel holding-allocation-panel">
          <div className="allocation-heading">
            <h2>持仓分布</h2>
            <span>{allocationDate}</span>
          </div>
          {allocationLoading ? (
            <LoadingBlock label="正在加载持仓分布" />
          ) : holdingAllocationData.length === 0 ? (
            <div className="empty-chart-state">暂无持仓估值数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={holdingAllocationData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {holdingAllocationData.map((entry, index) => (
                      <Cell key={entry.name} fill={allocationColors[index % allocationColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipContentStyle}
                    formatter={(value, _name, item) => [formatTooltipMoney(value), (item.payload as AllocationPoint).name]}
                    itemStyle={chartTooltipItemStyle}
                    labelStyle={chartTooltipLabelStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="allocation-list">
                {holdingAllocationData.map((entry, index) => (
                  <div className="allocation-row" key={entry.name}>
                    <span>
                      <i style={{ background: allocationColors[index % allocationColors.length] }} />
                      {entry.name}
                    </span>
                    <strong>
                      {formatChartMoney(entry.value)}
                      <small>{formatPercentage(entry.percentage)}</small>
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="flow-card allocation-panel">
          <div className="allocation-heading">
            <h2>账户分布</h2>
            <span>{allocationDate}</span>
          </div>
          {allocationLoading ? (
            <LoadingBlock label="正在加载账户分布" />
          ) : allocationData.length === 0 ? (
            <div className="empty-chart-state">暂无账户估值数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}>
                    {allocationData.map((entry, index) => (
                      <Cell key={entry.name} fill={allocationColors[index % allocationColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTooltipContentStyle}
                    formatter={(value, _name, item) => [formatTooltipMoney(value), (item.payload as AllocationPoint).name]}
                    itemStyle={chartTooltipItemStyle}
                    labelStyle={chartTooltipLabelStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="allocation-list">
                {allocationData.map((entry, index) => (
                  <div className="allocation-row" key={entry.name}>
                    <span>
                      <i style={{ background: allocationColors[index % allocationColors.length] }} />
                      {entry.name}
                    </span>
                    <strong>
                      {formatChartMoney(entry.value)}
                      <small>{formatPercentage(entry.percentage)}</small>
                    </strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>

        <article className="flow-card activity-panel trade-activity-panel">
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
        </article>

        <article className="flow-card activity-panel snapshot-activity-panel">
          <div className="activity-panel-header">
            <div className="activity-title-with-currency">
              <h2>快照净值变动</h2>
              <span className="chart-currency-indicator">
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
            </div>
          </div>
          {activityLoading ? (
            <LoadingBlock label="正在加载快照净值变动" />
          ) : recentSnapshots.length === 0 ? (
            <div className="empty-chart-state">暂无快照记录</div>
          ) : (
            <div className="activity-table-wrap">
              <div className="activity-list compact-activity-list snapshot-activity-list">
                {buildSnapshotComparisonRows(recentSnapshots).map((row) => (
                  <div className="compact-activity-row snapshot-activity-row" key={row.snapshot.id}>
                    <span className="activity-date">{row.snapshot.snapshotDate}</span>
                    <strong>{formatNullableAmount(row.snapshot.marketValue)}</strong>
                    <span className={signedToneClass(row.changeAmount, preferences.gainColorScheme, 3)}>
                      {formatNullableSignedAmount(row.changeAmount)}
                    </span>
                    <span className={signedToneClass(row.changePct, preferences.gainColorScheme, 1)}>
                      {formatNullableSignedPercent(row.changePct)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      </section>

      {!dashboardLoading && dashboard?.warnings.length ? (
        <section className="dashboard-warning-panel" aria-label="数据提示">
          <h2>数据提示</h2>
          <p>缺少必要数据的指标显示为 --，不会展示不完整的合计金额。</p>
          <div className="holding-warnings">
            {dashboard.warnings.map((warning) => (
              <span className="warning-pill" key={`${warning.code}:${warning.instrumentId}:${warning.currency}`}>
                {formatWarning(warning)}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatPlainMoneyMetric(value: string | null | undefined, loading: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  return value === null || value === undefined ? "--" : formatMetricWholeNumber(value);
}

function formatSignedMoneyMetric(value: string | null | undefined, loading: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  return value === null || value === undefined ? "--" : formatMetricWholeNumber(value, { signed: true });
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

function renderQuoteUpdateNote(dashboard: DashboardSummary): ReactNode {
  if (!dashboard.quoteFetchedAt) {
    return "行情延迟：暂无本次财富足迹报价更新时间。";
  }

  const formattedTime = formatLocalDateTimeNote(dashboard.quoteFetchedAt, dashboard.quoteFetchedAt);

  return (
    <>
      行情估值：更新于 {formattedTime}
      {dashboard.quoteDate ? <span className="quote-date-nowrap"> 报价日期 {dashboard.quoteDate}</span> : null}
    </>
  );
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

function formatWarning(warning: DashboardWarning): string {
  const instrument = `${warning.instrumentShortName} (${warning.currency})`;

  switch (warning.code) {
    case "MISSING_LATEST_PRICE":
      return `${instrument} 缺少最新价格`;
    case "MISSING_PREVIOUS_PRICE":
      return `${instrument} 缺少前一收盘价，无法计算行情变动`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少估值汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用，无法计算动态盈亏`;
  }
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

function buildProfitSummary(chartPoints: ProfitChartPoint[]): {
  rangeLabel: string;
  changeAmount: string;
  changeAmountRaw: string;
  changePct: string;
  changePctRaw: string;
} | null {
  const profitPoints = chartPoints
    .map((point) => ({
      date: point.date,
      value: point.profitValue,
      periodStartValue: point.periodStartValue
    }))
    .filter(
      (point): point is { date: string; value: number; periodStartValue: number | null } =>
        point.value !== null && Number.isFinite(point.value)
    );
  const firstPoint = profitPoints[0];
  const lastPoint = profitPoints.at(-1);

  if (!firstPoint || !lastPoint) {
    return null;
  }

  const changeAmount = lastPoint.value - firstPoint.value;
  const periodStartValue = firstPoint.periodStartValue;
  const changePct =
    periodStartValue === null || periodStartValue === 0 ? null : (changeAmount / Math.abs(periodStartValue)) * 100;
  const endDate = isSyntheticTrendDate(lastPoint.date) ? getAppBusinessDate() : lastPoint.date;

  return {
    rangeLabel: `${firstPoint.date} 至 ${endDate}`,
    changeAmount: formatMetricWholeNumber(changeAmount, { signed: true }),
    changeAmountRaw: String(changeAmount),
    changePct: changePct === null ? "--" : `${formatSignedDisplayPercent(changePct)}%`,
    changePctRaw: changePct === null ? "0" : String(changePct)
  };
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

function buildSnapshotComparisonRows(snapshots: PortfolioSnapshotSummary[]): Array<{
  snapshot: PortfolioSnapshotSummary;
  changeAmount: string | null;
  changePct: string | null;
}> {
  // Activity compares persisted snapshot totals, not each snapshot's latest-price dailyChange fields.
  return snapshots.slice(0, 15).map((snapshot, index) => {
    const previous = snapshots[index + 1];
    const currentValue = parseNullableNumber(snapshot.marketValue);
    const previousValue = parseNullableNumber(previous?.marketValue);
    const changeAmount = currentValue === null || previousValue === null ? null : currentValue - previousValue;
    const changePct = changeAmount === null || previousValue === null || previousValue === 0
      ? null
      : (changeAmount / previousValue) * 100;

    return {
      snapshot,
      changeAmount: changeAmount === null ? null : String(changeAmount),
      changePct: changePct === null ? null : String(changePct)
    };
  });
}

function parseNullableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatNullableAmount(value: string | null | undefined): string {
  return value === null || value === undefined ? "--" : formatDisplayAmount(value);
}

function formatNullableSignedAmount(value: string | null): string {
  return value === null ? "--" : formatSignedDisplayAmount(value);
}

function formatNullableSignedWholeAmount(value: string | null): string {
  return value === null ? "--" : formatMetricWholeNumber(value, { signed: true });
}

function formatNullableSignedPercent(value: string | null): string {
  return value === null ? "--" : `${formatSignedDisplayPercent(value)}%`;
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
      return "总投入";
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
    return [Math.max(0, minValue - padding), maxValue + padding];
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

function buildColorSplitTrendChartData(chartPoints: TrendChartPoint[]): ColorSplitTrendChartPoint[] {
  let carriedTotalInvestment: number | null = null;
  let previousPoint: (TrendChartPoint & { carriedTotalInvestment: number | null }) | null = null;
  const splitPoints: ColorSplitTrendChartPoint[] = [];

  for (const point of chartPoints) {
    if (point.totalInvestment !== null && Number.isFinite(point.totalInvestment)) {
      carriedTotalInvestment = point.totalInvestment;
    }
    const pointWithThreshold = { ...point, carriedTotalInvestment };

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
    livePositiveValue: null,
    liveNegativeValue: null,
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
  const liveIsPositive =
    point.liveValue !== null && point.carriedTotalInvestment !== null
      ? point.liveValue >= point.carriedTotalInvestment
      : true;

  return {
    ...point,
    snapshotPositiveValue: point.snapshotValue !== null && snapshotIsPositive ? point.snapshotValue : null,
    snapshotNegativeValue: point.snapshotValue !== null && !snapshotIsPositive ? point.snapshotValue : null,
    snapshotPositiveRange,
    snapshotNegativeRange,
    livePositiveValue: point.liveValue !== null && liveIsPositive ? point.liveValue : null,
    liveNegativeValue: point.liveValue !== null && !liveIsPositive ? point.liveValue : null
  };
}

function buildColorSplitProfitChartData(chartPoints: ProfitChartPoint[]): ColorSplitProfitChartPoint[] {
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
    profitNegativeValue: point.profitValue !== null && !isPositive ? point.profitValue : null
  };
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

function calculateTrendCumulativeMovement(chartPoints: TrendChartPoint[]): string | null {
  const sortedPoints = [...chartPoints].sort((left, right) => left.date.localeCompare(right.date));
  const latestPortfolioPoint = [...sortedPoints].reverse().find((point) => Number.isFinite(point.value));
  const latestPrincipalPoint = [...sortedPoints].reverse().find((point) => point.totalInvestment !== null);

  if (!latestPortfolioPoint || !latestPrincipalPoint || latestPrincipalPoint.totalInvestment === null) {
    return null;
  }

  return String(latestPortfolioPoint.value - latestPrincipalPoint.totalInvestment);
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

function formatPercentage(value: number): string {
  const formatted = formatDisplayPercent(value);
  return Math.abs(value) < 10 ? ` ${formatted}%` : `${formatted}%`;
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
