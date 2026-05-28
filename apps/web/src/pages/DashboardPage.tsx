import { useEffect, useMemo, useState } from "react";
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
  SNAPSHOT_DISPLAY_CURRENCIES,
  type DashboardSummary,
  type DashboardWarning,
  type PortfolioSnapshotSummary,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { ApiClientError, apiGet } from "../lib/apiClient";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingBlock } from "../components/LoadingState";
import { formatDisplayAmount, formatDisplayPercent } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface DashboardResponse {
  dashboard: DashboardSummary;
}

interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
}

type SnapshotRangeDays = 30 | 90 | 365;

interface TrendPoint {
  date: string;
  value: number;
}

interface AllocationPoint {
  name: string;
  value: number;
  percentage: number;
}

const snapshotRanges: SnapshotRangeDays[] = [30, 90, 365];
const allocationColors = ["#08264A", "#F5B52E", "#3D8F67", "#D9534F", "#4D83B8", "#9C6B2F"];
const dashboardCurrencyStorageKey = "family-ledger.dashboard.reportingCurrency";

export function DashboardPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [snapshotRangeDays, setSnapshotRangeDays] = useState<SnapshotRangeDays>(90);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotSummary[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [snapshotsLoading, setSnapshotsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);

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
    if (currencyInitialized) {
      void loadSnapshots(reportingCurrency, snapshotRangeDays);
    }
  }, [currencyInitialized, reportingCurrency, snapshotRangeDays]);

  async function loadDashboard(currency: SnapshotDisplayCurrency) {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const data = await apiGet<DashboardResponse>(`/dashboard?currency=${currency}`);
      setDashboard(data.dashboard);
    } catch (requestError) {
      setDashboardError(toErrorMessage(requestError, "财富足迹请求失败，请稍后重试。"));
    } finally {
      setDashboardLoading(false);
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

  function refreshDashboard() {
    void loadDashboard(reportingCurrency);
    void loadSnapshots(reportingCurrency, snapshotRangeDays);
  }

  const activeCurrency = dashboard?.reportingCurrency ?? reportingCurrency;
  const cashValue = dashboard?.allocations.find((allocation) => allocation.allocationType === "cash")?.marketValue;
  const metrics = [
    { label: "总资产", value: formatPlainMoneyMetric(dashboard?.totalAssets, dashboardLoading), currency: activeCurrency },
    {
      label: "今日变动",
      value: formatPlainTodayChange(dashboard, dashboardLoading),
      currency: activeCurrency,
      toneClass: signedToneClass(dashboard?.todayChange, preferences.gainColorScheme)
    },
    {
      label: "未实现收益",
      value: formatPlainMoneyMetric(dashboard?.unrealizedGain, dashboardLoading),
      currency: activeCurrency,
      toneClass: signedToneClass(dashboard?.unrealizedGain, preferences.gainColorScheme)
    },
    { label: "现金", value: formatPlainMoneyMetric(cashValue, dashboardLoading), currency: activeCurrency },
    { label: "账户数量", value: dashboardLoading ? "加载中..." : String(dashboard?.accountCount ?? 0), compact: true }
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
  const trendLoading = snapshotsLoading || !currencyInitialized;
  const allocationLoading = dashboardLoading || !currencyInitialized;
  const allocationDate = dashboard?.quoteDate ?? dashboard?.quoteFetchedAt?.slice(0, 10) ?? "暂无日期";

  return (
    <section>
      <header className="page-header account-header dashboard-header">
        <div>
          <h1>财富足迹</h1>
          <p>基于当前行情、汇率和每日快照，展示投资组合概览。</p>
        </div>
        <div className="dashboard-controls">
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
            刷新
          </button>
        </div>
      </header>

      {dashboardError ? <p className="form-error">{dashboardError}</p> : null}

      <div className="metric-grid">
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

      {!dashboardLoading && dashboard ? <p className="quote-update-note">{formatQuoteUpdateNote(dashboard)}</p> : null}

      <section className="dashboard-chart-section" aria-label="资产趋势和账户分布">
        <div className="chart-section-header">
          <div>
            <h2>资产趋势</h2>
            <p>来自已生成的组合快照，按当前报告币种显示。</p>
          </div>
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

        {snapshotsError ? <p className="form-error">{snapshotsError}</p> : null}

        <div className="dashboard-chart-grid">
          <article className="chart-panel">
            {trendLoading ? (
              <LoadingBlock label="正在加载资产趋势" />
            ) : trendData.length === 0 ? (
              <div className="empty-chart-state">暂无快照数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} tickLine={false} />
                  <YAxis tickFormatter={(value: number) => formatCompactMoney(value, activeCurrency)} tickLine={false} />
                  <Tooltip
                    formatter={(value) => [`${activeCurrency} ${formatTooltipMoney(value)}`, "总资产"]}
                    labelFormatter={(label) => `日期：${label}`}
                  />
                  <Line type="monotone" dataKey="value" stroke="var(--color-chart-line)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </article>

          <article className="chart-panel allocation-panel">
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
                    <Tooltip formatter={(value, _name, item) => [`${activeCurrency} ${formatTooltipMoney(value)}`, (item.payload as AllocationPoint).name]} />
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
                        {activeCurrency} {formatChartMoney(entry.value)}
                        <small>{formatPercentage(entry.percentage)}</small>
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </div>
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

function formatPlainMoneyMetric(value: string | null | undefined, loading: boolean): string {
  if (loading) {
    return "加载中...";
  }

  return value === null || value === undefined ? "--" : formatDisplayAmount(value);
}

function formatPlainTodayChange(dashboard: DashboardSummary | null, loading: boolean): string {
  if (loading) {
    return "加载中...";
  }

  if (!dashboard || dashboard.todayChange === null) {
    return "--";
  }

  const percentage = dashboard.todayChangePct === null ? "" : ` (${formatDisplayPercent(dashboard.todayChangePct)}%)`;
  return `${formatDisplayAmount(dashboard.todayChange)}${percentage}`;
}

function formatQuoteUpdateNote(dashboard: DashboardSummary): string {
  if (!dashboard.quoteFetchedAt) {
    return "行情延迟：暂无本次财富足迹报价更新时间。";
  }

  const fetchedAt = new Date(dashboard.quoteFetchedAt);
  const formattedTime = Number.isNaN(fetchedAt.getTime())
    ? dashboard.quoteFetchedAt
    : fetchedAt.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
  const quoteDate = dashboard.quoteDate ? `，报价日期 ${dashboard.quoteDate}` : "";

  return `行情延迟：更新时间 ${formattedTime}${quoteDate}`;
}

function formatWarning(warning: DashboardWarning): string {
  const instrument = `${warning.instrumentName} (${warning.currency})`;

  switch (warning.code) {
    case "MISSING_LATEST_PRICE":
      return `${instrument} 缺少最新价格`;
    case "MISSING_PREVIOUS_PRICE":
      return `${instrument} 缺少前一收盘价，无法计算今日变动`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少估值汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用，无法计算未实现收益`;
  }
}

function getSnapshotDateRange(days: SnapshotRangeDays): { from: string; to: string } {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - days + 1);

  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10)
  };
}

function formatShortDate(value: string): string {
  return value.slice(5);
}

function formatChartMoney(value: number): string {
  return formatDisplayAmount(value);
}

function formatTooltipMoney(value: unknown): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? formatChartMoney(numericValue) : "--";
}

function formatPercentage(value: number): string {
  return `${formatDisplayPercent(value)}%`;
}

function formatCompactMoney(value: number, currency: SnapshotDisplayCurrency): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${currency} ${(value / 1_000).toFixed(0)}K`;
  }
  return `${currency} ${value.toFixed(0)}`;
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
