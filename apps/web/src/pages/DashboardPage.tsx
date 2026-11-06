import { InvestmentDistributionPanel } from "../components/InvestmentDistributionPanel";
import { useAuth } from "../lib/authContext";
import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { InvestmentTrendChart, getChartToneStyle, formatChartMoney } from "../components/InvestmentTrendChart";
import { useValuation } from "../lib/useValuation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { InvestmentPerformanceCard } from "../components/InvestmentPerformanceCard";
import { ValuationStatus } from "../components/ValuationStatus";
import { DistributionPanel } from "../components/DistributionPanel";
import { RefreshCw } from "lucide-react";
import {
  getAppBusinessDate,
  getAppBusinessDayEndInstant,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type DashboardSummary,
  type InvestmentDashboardSummary,
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
  dashboard: InvestmentDashboardSummary;
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
const dashboardCurrencyStorageKey = "family-ledger.dashboard.reportingCurrency";
export function DashboardPage() {
  const { session } = useAuth();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [trendView, setTrendView] = useState<"profit" | "assets">("profit");
  const [trendRange, setTrendRange] = useState<PortfolioTrendRange>("1y");
  const { data: dashboardResponse, loading: dashboardLoading, refreshing, nextRefreshAt, error: dashboardError, reload: reloadDashboard } = useValuation<DashboardResponse>(currencyInitialized ? `/dashboard?currency=${reportingCurrency}` : null);
  const dashboard = dashboardResponse?.dashboard ?? null;
  const snapshotSequence = useRef(0);
  const activitySequence = useRef(0);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [trend, setTrend] = useState<PortfolioTrend | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<InvestmentTransaction[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [businessDayNow, setBusinessDayNow] = useState(() => new Date());
  const trendPanelRef = useRef<HTMLElement>(null);
  const [trendPanelHeight, setTrendPanelHeight] = useState(480);

const loadDashboard = useEventCallback(async function(_currency: SnapshotDisplayCurrency, _options: { showLoading?: boolean } = {}) { await reloadDashboard(); });
const loadSnapshots = useEventCallback(async function(currency: SnapshotDisplayCurrency, range: PortfolioTrendRange, bypassCache: boolean = false) {
    const id = ++snapshotSequence.current;
    setSnapshotsLoading(trend === null);
    setSnapshotsError(null);

    try {
      const data = await apiGet<PortfolioSnapshotsResponse>(
        `/portfolio-snapshots?purpose=investment&currency=${currency}&includeTrend=true&trendRange=${range}${bypassCache ? "&bypassCache=true" : ""}`, { cacheMs: 60_000, bypassCache }
      );
      if (id !== snapshotSequence.current) return;
      setSnapshots(data.snapshots);
      setTrend(data.trend ?? null);
    } catch (requestError) {
      if (id !== snapshotSequence.current) return;
      setSnapshotsError(toErrorMessage(requestError, "资产趋势请求失败，请稍后重试。"));

    } finally {
      if (id === snapshotSequence.current) setSnapshotsLoading(false);
    }
  });
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
    if (!currencyInitialized) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && !refreshing && nextRefreshAt !== null && Date.now() >= new Date(nextRefreshAt).getTime()) observeAsync(loadDashboard(reportingCurrency, { showLoading: false }));
    }, 30_000);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && !refreshing && nextRefreshAt !== null && Date.now() >= new Date(nextRefreshAt).getTime()) {
        observeAsync(loadDashboard(reportingCurrency, { showLoading: false }));
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [currencyInitialized, reportingCurrency, refreshing, nextRefreshAt, loadDashboard]);

  useEffect(() => {
    if (currencyInitialized) {
      observeAsync(loadSnapshots(reportingCurrency, trendRange));
    }
  }, [currencyInitialized, reportingCurrency, trendRange, loadSnapshots]);

  useEffect(() => {
    if (currencyInitialized) {
      observeAsync(loadActivity());
    }
  }, [currencyInitialized]);

  useEffect(() => () => { snapshotSequence.current++; activitySequence.current++; }, []);

async function loadActivity(options: { showLoading?: boolean } = {}) {
    const id = ++activitySequence.current;
    const showLoading = options.showLoading ?? true;

    if (showLoading) {
      setActivityLoading(true);
    }
    setActivityError(null);

    try {
      const transactionData = await apiGet<TransactionsResponse>("/transactions?purpose=investment&transactionTypes=buy,sell&excludeGeneratedCashLegs=true&excludeCashInstruments=true&limit=10&offset=0");
      if (id === activitySequence.current) setRecentTransactions(transactionData.transactions);
    } catch (requestError) {
      if (id !== activitySequence.current) return;
      setActivityError(toErrorMessage(requestError, "最新动态请求失败，请稍后重试。"));
    } finally {
      if (showLoading && id === activitySequence.current) {
        setActivityLoading(false);
      }
    }
  }

  function refreshDashboard() {
    observeAsync(reloadDashboard(true));
    observeAsync(loadSnapshots(reportingCurrency, trendRange, true));
    observeAsync(loadActivity());
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
    () => {
      // Range selection also refreshes the business-day clock before new history arrives.
      void trendRange;
      return buildTrendChartData(trendData, dashboard?.totalAssets, dashboard?.valuationMetadata ? getAppBusinessDate(dashboard.valuationMetadata.valuedAt) : dashboard?.quoteDate, new Date(), {
        currentTotalInvestment: dashboard?.investmentPerformance?.netInvestment
      });
    },
    [dashboard?.quoteDate, dashboard?.valuationMetadata, dashboard?.investmentPerformance?.netInvestment, dashboard?.totalAssets, trendData, trendRange]
  );
  const trendSummary = useMemo(
    () => buildTrendSummary(trendChartData),
    [trendChartData]
  );
  const profitChartData = useMemo(
    () => buildProfitChartData(trendChartData),
    [trendChartData]
  );
  const profitSummary = useMemo(
    () => buildProfitSummary(profitChartData),
    [profitChartData]
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

      {refreshing && !dashboardLoading ? <p role="status">正在更新行情，当前显示已有估值。</p> : null}
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
              <InvestmentTrendChart points={trendChartData} view="assets" gainColorScheme={preferences.gainColorScheme} />
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
              <InvestmentTrendChart points={trendChartData} view="profit" gainColorScheme={preferences.gainColorScheme} />
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
        <InvestmentDistributionPanel dashboard={dashboard} loading={allocationLoading} isAdmin={session?.user.role === "admin"} onRetry={() => observeAsync(reloadDashboard())} />
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
