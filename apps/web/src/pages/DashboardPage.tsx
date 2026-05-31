import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
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
  type Instrument,
  type InvestmentTransaction,
  type PortfolioSnapshotSummary,
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
import { buildTrendChartData, isSyntheticTrendDate, type TrendChartPoint, type TrendPoint } from "../lib/trendChartData";

interface DashboardResponse {
  dashboard: DashboardSummary;
}

interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
}

interface TransactionsResponse {
  transactions: InvestmentTransaction[];
}

interface InstrumentsResponse {
  instruments: Instrument[];
}

interface AllocationPoint {
  name: string;
  value: number;
  percentage: number;
}

type SnapshotRangeDays = 7 | 30 | 90 | 365;

const snapshotRanges: SnapshotRangeDays[] = [7, 30, 90, 365];
const dashboardAutoRefreshIntervalMs = 60 * 1000;
const allocationColors = ["#08264A", "#F5B52E", "#3D8F67", "#D9534F", "#4D83B8", "#9C6B2F"];
const dashboardCurrencyStorageKey = "family-ledger.dashboard.reportingCurrency";
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
  color: "var(--color-brand-leaf)",
  fontWeight: 600
};

export function DashboardPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [snapshotRangeDays, setSnapshotRangeDays] = useState<SnapshotRangeDays>(90);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<InvestmentTransaction[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
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
      void loadSnapshots(reportingCurrency, snapshotRangeDays);
    }
  }, [currencyInitialized, reportingCurrency, snapshotRangeDays]);

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

  async function loadSnapshots(currency: SnapshotDisplayCurrency, days: SnapshotRangeDays) {
    setSnapshotsLoading(true);
    setSnapshotsError(null);

    try {
      const { from, to } = getSnapshotDateRange(days);
      const data = await apiGet<PortfolioSnapshotsResponse>(
        `/portfolio-snapshots?from=${from}&to=${to}&currency=${currency}`
      );
      setSnapshots(data.snapshots);
    } catch (requestError) {
      setSnapshotsError(toErrorMessage(requestError, "资产趋势请求失败，请稍后重试。"));
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
      const [transactionData, snapshotData, instrumentData] = await Promise.all([
        apiGet<TransactionsResponse>(
          "/transactions?transactionTypes=buy,sell&excludeGeneratedCashLegs=true&excludeCashInstruments=true&limit=10&offset=0"
        ),
        apiGet<PortfolioSnapshotsResponse>(`/portfolio-snapshots?currency=${currency}&limit=16&order=desc`),
        apiGet<InstrumentsResponse>("/instruments")
      ]);
      setInstruments(instrumentData.instruments);
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
    void loadSnapshots(reportingCurrency, snapshotRangeDays);
    void loadActivity(reportingCurrency);
  }

  const activeCurrency = dashboard?.reportingCurrency ?? reportingCurrency;
  const cashValue = dashboard?.allocations.find((allocation) => allocation.allocationType === "cash")?.marketValue;
  const businessDayNote = useMemo(() => buildBusinessDayCountdownParts(businessDayNow), [businessDayNow]);
  const accountNames = useMemo(
    () => new Map((dashboard?.accounts ?? []).map((account) => [account.accountId, account.accountName])),
    [dashboard?.accounts]
  );
  const instrumentsById = useMemo(() => new Map(instruments.map((instrument) => [instrument.id, instrument])), [instruments]);
  const metrics = [
    { label: "总资产", value: formatPlainMoneyMetric(dashboard?.totalAssets, dashboardLoading), currency: activeCurrency },
    {
      label: "最新变动",
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
    () =>
      snapshots
        .filter((snapshot) => snapshot.marketValue !== null)
        .map((snapshot) => ({
          date: snapshot.snapshotDate,
          value: Number(snapshot.marketValue)
        }))
        .filter((point) => Number.isFinite(point.value)),
    [snapshots]
  );
  const trendChartData = useMemo(
    () => buildTrendChartData(trendData, dashboard?.totalAssets, dashboard?.quoteDate),
    [dashboard?.quoteDate, dashboard?.totalAssets, trendData]
  );
  const trendSummary = useMemo(
    () => buildTrendSummary(trendData, trendChartData),
    [trendChartData, trendData]
  );
  const trendValueDomain = useMemo(() => getTrendValueDomain(trendChartData), [trendChartData]);
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
          <p>基于当前行情、汇率，展示投资组合概览。</p>
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

      <section className="dashboard-card-flow dashboard-chart-flow" aria-label="资产趋势、持仓分布、账户分布、最新成交和净值变动">
        <article className="flow-card chart-panel trend-chart-panel">
          <div className="chart-section-header">
            <div>
              <h2>资产趋势</h2>
              <p>来自已生成的组合快照，按当前报告币种显示。</p>
            </div>
            <div className="chart-header-controls">
              <span className="chart-currency-indicator" aria-label={`当前图表币种 ${activeCurrency}`}>
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
              <div className="range-toggle" aria-label="快照范围">
                {snapshotRanges.map((days) => (
                  <button
                    className={snapshotRangeDays === days ? "active" : undefined}
                    key={days}
                    type="button"
                    onClick={() => setSnapshotRangeDays(days)}
                  >
                    {days}天
                  </button>
                ))}
              </div>
            </div>
          </div>
          {snapshotsError ? <p className="form-error">{snapshotsError}</p> : null}
          {trendLoading ? (
            <LoadingBlock label="正在加载资产趋势" />
          ) : trendData.length === 0 ? (
            <div className="empty-chart-state">暂无快照数据</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendChartData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatTrendTickDate} tickLine={false} />
                  <YAxis
                    domain={trendValueDomain}
                    tickFormatter={(value: number) => formatCompactMoney(value)}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={chartTooltipContentStyle}
                    formatter={(value, name) => [formatTooltipMoney(value), name === "liveValue" ? "今日估值" : "总资产"]}
                    labelFormatter={(label) => formatTrendTooltipLabel(String(label))}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="snapshotValue"
                    stroke="var(--color-chart-line)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="liveValue"
                    stroke="var(--color-chart-line)"
                    strokeDasharray="5 5"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </LineChart>
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
                      <strong>{formatTransactionInstrument(transaction, instrumentsById)}</strong>
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
              <h2>净值变动</h2>
              <span className="chart-currency-indicator">
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
            </div>
          </div>
          {activityLoading ? (
            <LoadingBlock label="正在加载净值变动" />
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
      行情延迟：更新于 {formattedTime}
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
      return `${instrument} 缺少前一收盘价，无法计算最新变动`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少估值汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用，无法计算动态盈亏`;
  }
}

function buildTrendSummary(points: TrendPoint[], chartPoints: TrendChartPoint[]): {
  rangeLabel: string;
  initialValue: string;
  changeAmount: string;
  changeAmountRaw: string;
  changePct: string;
  changePctRaw: string;
} | null {
  const firstPoint = points[0];
  const lastPoint = chartPoints.at(-1);

  if (!firstPoint || !lastPoint || !Number.isFinite(firstPoint.value) || !Number.isFinite(lastPoint.value)) {
    return null;
  }

  const changeAmount = lastPoint.value - firstPoint.value;
  const changePct = firstPoint.value === 0 ? null : (changeAmount / firstPoint.value) * 100;
  const endDate = isSyntheticTrendDate(lastPoint.date) ? getAppBusinessDate() : lastPoint.date;

  return {
    rangeLabel: `${firstPoint.date} 至 ${endDate}`,
    initialValue: formatDisplayAmount(firstPoint.value),
    changeAmount: formatSignedDisplayAmount(changeAmount),
    changeAmountRaw: String(changeAmount),
    changePct: changePct === null ? "--" : `${formatSignedDisplayPercent(changePct)}%`,
    changePctRaw: changePct === null ? "0" : String(changePct)
  };
}

function formatTransactionInstrument(
  transaction: InvestmentTransaction,
  instrumentsById: Map<string, Instrument>
): string {
  const instrument = instrumentsById.get(transaction.instrumentId);
  return transaction.instrumentShortName ?? instrument?.shortName ?? transaction.instrumentName ?? instrument?.name ?? "未知标的";
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

function formatNullableSignedPercent(value: string | null): string {
  return value === null ? "--" : `${formatSignedDisplayPercent(value)}%`;
}

function getSnapshotDateRange(days: SnapshotRangeDays): { from: string; to: string } {
  const to = getAppBusinessDate();
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);

  return {
    from: fromDate.toISOString().slice(0, 10),
    to
  };
}

function formatShortDate(value: string): string {
  return value.slice(5);
}

function formatTrendTickDate(value: string): string {
  return isSyntheticTrendDate(value) ? "" : formatShortDate(value);
}

function formatTrendTooltipLabel(value: string): string {
  return isSyntheticTrendDate(value) ? "今日估值连接线" : `日期：${value}`;
}

function getTrendValueDomain(points: TrendChartPoint[]): [number, number] {
  const values = points.map((point) => point.value).filter(Number.isFinite);

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

function formatChartMoney(value: number): string {
  return Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatChartMoney(numericValue) : "--";
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
