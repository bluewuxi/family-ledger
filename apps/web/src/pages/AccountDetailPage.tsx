import { PageBackLink } from "../components/PageBackLink";
import { AccountTrendChart } from "../components/AccountTrendChart";
import { useValuation } from "../lib/useValuation";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, type NavigateFunction } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Edit3, RefreshCw } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ASSET_TYPE_LABELS,
  MARKET_REGION_LABELS,
  PORTFOLIO_TREND_RANGES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  type AccountDetailSummary,
  type DashboardWarning,
  type PortfolioTrendRange,
  type SnapshotDisplayCurrency,
  type SnapshotWarning,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingBlock } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet } from "../lib/apiClient";
import {
  formatHoldingInstrument,
  formatHoldingLatestPrice,
  formatHoldingQuantity,
  formatHoldingWarnings
} from "../lib/holdingDisplay";
import {
  formatDisplayAmount,
  formatDisplayPrice,
  formatSignedDisplayAmount
} from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";
import { isInteractiveRowTarget, isRowActivationKey } from "../lib/tableInteraction";

interface AccountDetailResponse {
  accountDetail: AccountDetailSummary;
}

interface AccountTrendChartRow {
  date: string;
  value: number | null;
  snapshotDate: string | null;
}

const accountDetailCurrencyStorageKey = "family-ledger.account-detail.reportingCurrency";
const trendRangeStorageKey = "family-ledger.account-detail.trendRange";
const trendRangeLabels: Record<PortfolioTrendRange, string> = {
  "1m": "1个月",
  "3m": "3个月",
  "1y": "1年",
  "3y": "3年",
  "5y": "5年",
  inception: "成立以来"
};

const chartTooltipContentStyle = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text)"
};

export function AccountDetailPage() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [trendRange, setTrendRange] = useState<PortfolioTrendRange>("1y");
  const [controlsInitialized, setControlsInitialized] = useState(false);
  const [controlsManuallySelected, setControlsManuallySelected] = useState(false);
  const [trendView, setTrendView] = useState<"profit" | "assets">("profit");
  const { data: response, loading, refreshing, error, reload } = useValuation<AccountDetailResponse>(accountId && controlsInitialized ? `/accounts/${encodeURIComponent(accountId)}/detail?currency=${reportingCurrency}&trendRange=1y&recentLimit=10` : null);
  const detail = response?.accountDetail ?? null;
  const [selectedTrend, setSelectedTrend] = useState<AccountDetailSummary["trend"] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  useEffect(() => {
    if (!detail || !accountId) return;
    let active = true;
    setSelectedTrend(null);
    setTrendError(null);
    if (detail.trend.range === trendRange) { setTrendLoading(false); return; }
    setTrendLoading(true);
    void apiGet<AccountDetailResponse>(`/accounts/${encodeURIComponent(accountId)}/detail?currency=${reportingCurrency}&trendRange=${trendRange}&recentLimit=10&quoteMode=cached`)
      .then(result => { if (active) setSelectedTrend(result.accountDetail.trend); })
      .catch(failure => { if (active) setTrendError(failure instanceof Error ? failure.message : "账户趋势加载失败，请重试。"); })
      .finally(() => { if (active) setTrendLoading(false); });
    return () => { active = false; };
  }, [accountId, detail, reportingCurrency, trendRange]);
  const chartDetail = detail ? { ...detail, trend: selectedTrend ?? detail.trend } : null;

  useEffect(() => {
    if (!preferencesLoading && !controlsManuallySelected) {
      setReportingCurrency(readStoredDisplayCurrency(accountDetailCurrencyStorageKey) ?? toDisplayCurrency(preferences.preferredCurrency));
      setTrendRange(readStoredTrendRange() ?? "1y");
      setControlsInitialized(true);
    }
  }, [controlsManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  async function loadDetail(_currency: SnapshotDisplayCurrency, _range: PortfolioTrendRange) { await reload(); }

  const activeCurrency = detail?.reportingCurrency ?? reportingCurrency;
  const pageLoading = loading || !controlsInitialized;
  const chartRows = useMemo<AccountTrendChartRow[]>(
    () =>
      (detail?.trend.points ?? []).map((point) => ({
        date: point.date,
        value: point.marketValue === null ? null : Number(point.marketValue),
        snapshotDate: point.snapshotDate
      })),
    [detail?.trend.points]
  );
  const chartHasValues = chartRows.some((row) => row.value !== null && Number.isFinite(row.value));

  return (
    <section>
      <header className="page-header account-header holding-detail-header account-detail-header">
        <div>
          <PageBackLink to="/accounts" label="投资账户" />
          <PageTitle route="/accounts">账户详情</PageTitle>
          <p>
            {detail
              ? `${detail.account.name} · ${detail.account.broker ?? "未填写平台"} · ${MARKET_REGION_LABELS[detail.account.marketRegion]}`
              : "查看单个账户的当前估值、趋势、持仓、现金余额和最近交易。"}
          </p>
        </div>
        <div className="dashboard-controls account-detail-controls">
          <CurrencySelect
            label="报告币种"
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
              writeStoredDisplayCurrency(accountDetailCurrencyStorageKey, nextCurrency);
              setControlsManuallySelected(true);
              setReportingCurrency(nextCurrency);
            }}
            disabled={!controlsInitialized}
          />

          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadDetail(reportingCurrency, trendRange)}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
          <button className="secondary-button" type="button" onClick={() => navigate("/accounts")}>
            <Edit3 size={17} aria-hidden="true" />
            <span>返回编辑</span>
          </button>
        </div>
      </header>

      {refreshing && !loading ? <p role="status">正在更新行情，当前显示已有估值。</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {pageLoading ? (
        <LoadingBlock label="正在加载账户详情" />
      ) : detail ? (
        <>
          <div className="metric-grid holdings-metrics account-detail-metrics">
            <MetricCard label="当前总额" currency={activeCurrency} value={formatNullableAmount(detail.currentValue.marketValue)} />
            <MetricCard label="现金" currency={activeCurrency} value={formatNullableAmount(detail.currentValue.cashMarketValue)} />
            <MetricCard label="非现金资产" currency={activeCurrency} value={formatNullableAmount(detail.currentValue.nonCashMarketValue)} />
            <MetricCard
              label="投资收益"
              currency={activeCurrency}
              value={formatNullableSignedAmount(detail.investmentPerformance?.investmentProfit ?? null)}
              toneClass={signedToneClass(detail.investmentPerformance?.investmentProfit ?? null, preferences.gainColorScheme, 3)}
            />
            <MetricCard label="当前持仓数" value={String(detail.currentValue.holdingCount)} />
            <MetricCard label="最新快照日期" value={detail.latestSnapshot?.snapshotDate ?? "--"} />
          </div>

          <section className="account-detail-grid">
            <article className="flow-card chart-panel account-detail-trend-panel">
              <div className="chart-section-header">
                <div>
                  <h2>账户趋势</h2>
                  <p>
                    {trendRangeLabels[chartDetail?.trend.range ?? detail.trend.range]} · 估值参考日 {detail.currentValue.valuationBusinessDate}
                  </p>
                </div>
          <label className="chart-range-select account-detail-range-select">
            趋势范围
            <select
              value={trendRange}
              onChange={(event) => {
                const nextRange = event.target.value as PortfolioTrendRange;
                writeStoredTrendRange(nextRange);
                setControlsManuallySelected(true);
                setTrendRange(nextRange);
              }}
              disabled={!controlsInitialized}
            >
              {PORTFOLIO_TREND_RANGES.map((range) => (
                <option key={range} value={range}>
                  {trendRangeLabels[range]}
                </option>
              ))}
            </select>
          </label>
              </div>
              <div className="trend-tabs" role="tablist" aria-label="账户趋势">
                {(["profit", "assets"] as const).map(view => <button type="button" role="tab" aria-selected={trendView === view} key={view} onClick={() => setTrendView(view)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "profit" : event.key === "End" ? "assets" : view === "profit" ? "assets" : "profit"; setTrendView(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next === "profit" ? 0 : 1]?.focus(); } }} tabIndex={trendView === view ? 0 : -1}>{view === "profit" ? "期间盈利" : "资产趋势"}</button>)}
              </div>
              {trendError ? <p className="form-error">{trendError}</p> : null}
              {trendLoading ? <LoadingBlock label="正在加载账户趋势" /> : chartDetail ? <AccountTrendChart detail={chartDetail} view={trendView} gainColorScheme={preferences.gainColorScheme} /> : null}
            </article>

            <article className="flow-card holding-detail-panel">
              <h2>账户信息</h2>
              <dl className="detail-list">
                <DetailRow label="账户名称" value={detail.account.name} />
                <DetailRow label="券商/平台" value={detail.account.broker ?? "-"} />
                <DetailRow label="账户类型" value={ACCOUNT_TYPE_LABELS[detail.account.accountType]} />
                <DetailRow label="基准货币" value={detail.account.baseCurrency} />
                <DetailRow label="主要市场" value={MARKET_REGION_LABELS[detail.account.marketRegion]} />
                <DetailRow label="备注" value={detail.account.notes ?? "-"} />
              </dl>
            </article>
          </section>

          <section className="flow-card holding-detail-panel">
            <div className="holding-detail-section-header">
              <h2>当前持仓</h2>
              <span>{detail.holdings.length} 项</span>
            </div>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>标的</th>
                    <th>类型</th>
                    <th>币种</th>
                    <th className="numeric-cell">数量/现金余额</th>
                    <th className="numeric-cell">平均成本</th>
                    <th className="numeric-cell">最新价格</th>
                    <th className="numeric-cell">市值 ({activeCurrency})</th>
                    <th className="numeric-cell">未实现收益</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.holdings.length === 0 ? (
                    <tr>
                      <td colSpan={8}>暂无当前持仓或现金余额。</td>
                    </tr>
                  ) : (
                    detail.holdings.map((holding) => (
                      <tr
                        className="clickable-detail-row"
                        key={`${holding.accountId}:${holding.instrumentId}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`查看持仓详情 ${formatHoldingInstrument(holding)}`}
                        onClick={(event) => handleHoldingRowClick(event, holding, navigate)}
                        onKeyDown={(event) => handleHoldingRowKeyDown(event, holding, navigate)}
                      >
                        <td>{formatHoldingInstrument(holding)}</td>
                        <td>{ASSET_TYPE_LABELS[holding.assetType]}</td>
                        <td>{holding.currency}</td>
                        <td className="numeric-cell">{formatHoldingQuantity(holding)}</td>
                        <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost) : "-"}</td>
                        <td className="numeric-cell">{formatHoldingLatestPrice(holding)}</td>
                        <td className="numeric-cell">{formatNullableAmount(holding.marketValue)}</td>
                        <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, preferences.gainColorScheme, 3)}`}>
                          {formatNullableSignedAmount(holding.unrealizedGain)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <article className="flow-card holding-detail-panel">
              <div className="holding-detail-section-header">
                <h2>最近交易</h2>
                <span>10 条</span>
              </div>
              <div className="table-wrap">
                <table className="holding-detail-table account-recent-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>类型</th>
                      <th>标的</th>
                      <th className="numeric-cell">金额</th>
                      <th>结算现金</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5}>暂无交易记录。</td>
                      </tr>
                    ) : (
                      detail.recentTransactions.map((row) => (
                        <tr key={row.transaction.id}>
                          <td>{row.transaction.tradeDate}</td>
                          <td>{TRANSACTION_TYPE_LABELS[row.transaction.transactionType]}</td>
                          <td>{formatTransactionInstrument(row.transaction)}</td>
                          <td className="numeric-cell">{formatTransactionAmount(row.transaction)}</td>
                          <td>{row.linkedCashLeg ? formatTransactionAmount(row.linkedCashLeg) : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {detail.warnings?.length ? (
            <section className="dashboard-warning-panel" aria-label="数据提示">
              <h2>数据提示</h2><p>缺少必要数据的指标显示为 --。请补齐对应价格、汇率或成本基础。</p>
              <div className="holding-warnings">{detail.warnings.map((warning, index) => <span className="warning-pill" key={index}>{[warning.instrumentShortName, warning.currency, warning.date, warning.message].filter(Boolean).join(" · ")}</span>)}</div>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  currency,
  toneClass
}: {
  label: string;
  value: ReactNode;
  currency?: SnapshotDisplayCurrency;
  toneClass?: string;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      {currency ? (
        <small className="metric-currency">
          <CurrencyFlagIcon currency={currency} />
          {currency}
        </small>
      ) : null}
      <strong className={toneClass}>{value}</strong>
    </article>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function handleHoldingRowClick(
  event: MouseEvent<HTMLTableRowElement>,
  holding: ValuedHoldingSummary,
  navigate: NavigateFunction
) {
  if (!isInteractiveRowTarget(event.target, event.currentTarget)) {
    navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`);
  }
}

function handleHoldingRowKeyDown(
  event: KeyboardEvent<HTMLTableRowElement>,
  holding: ValuedHoldingSummary,
  navigate: NavigateFunction
) {
  if (!isRowActivationKey(event.key) || isInteractiveRowTarget(event.target, event.currentTarget)) {
    return;
  }

  event.preventDefault();
  navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`);
}

function formatNullableAmount(value: string | null): string {
  return value === null ? "--" : formatDisplayAmount(value);
}

function formatNullableSignedAmount(value: string | null): string {
  return value === null ? "--" : formatSignedDisplayAmount(value);
}

function formatChartAmount(value: unknown, currency: SnapshotDisplayCurrency): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${currency} ${formatDisplayAmount(String(value))}`
    : "--";
}

function formatCompactAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }

  return String(value);
}

function formatTransactionInstrument(transaction: AccountDetailSummary["recentTransactions"][number]["transaction"]): string {
  return transaction.instrumentSymbol
    ? `${transaction.instrumentSymbol} - ${transaction.instrumentShortName ?? transaction.instrumentName ?? "-"}`
    : transaction.instrumentShortName ?? transaction.instrumentName ?? "-";
}

function formatTransactionAmount(transaction: AccountDetailSummary["recentTransactions"][number]["transaction"]): string {
  if (transaction.grossAmount) {
    return `${transaction.currency} ${formatDisplayAmount(transaction.grossAmount)}`;
  }

  if (transaction.fee !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.fee)}`;
  }

  if (transaction.tax !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.tax)}`;
  }

  return "-";
}

function formatDashboardWarning(warning: DashboardWarning): string {
  return `${warning.instrumentShortName}：${formatWarningCode(warning.code)} (${warning.currency})`;
}

function formatSnapshotWarning(warning: SnapshotWarning): string {
  return `${warning.instrumentShortName}：快照${formatWarningCode(warning.code)} (${warning.currency})`;
}

function formatWarningCode(code: string): string {
  switch (code) {
    case "MISSING_LATEST_PRICE":
      return "缺少最新价格";
    case "MISSING_PREVIOUS_PRICE":
      return "缺少前一价格";
    case "MISSING_FX_RATE":
      return "缺少汇率";
    case "COST_BASIS_UNAVAILABLE":
      return "成本基础不可用";
    default:
      return code;
  }
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

function readStoredTrendRange(): PortfolioTrendRange | null {
  const value = window.localStorage.getItem(trendRangeStorageKey);
  return PORTFOLIO_TREND_RANGES.includes(value as PortfolioTrendRange) ? (value as PortfolioTrendRange) : null;
}

function writeStoredTrendRange(value: PortfolioTrendRange): void {
  window.localStorage.setItem(trendRangeStorageKey, value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "账户详情请求失败，请稍后重试。";
}
