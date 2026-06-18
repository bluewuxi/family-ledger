import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, type NavigateFunction } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Edit3, RefreshCw } from "lucide-react";
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
  const [trendRange, setTrendRange] = useState<PortfolioTrendRange>("3m");
  const [controlsInitialized, setControlsInitialized] = useState(false);
  const [controlsManuallySelected, setControlsManuallySelected] = useState(false);
  const [detail, setDetail] = useState<AccountDetailSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preferencesLoading && !controlsManuallySelected) {
      setReportingCurrency(readStoredDisplayCurrency(accountDetailCurrencyStorageKey) ?? toDisplayCurrency(preferences.preferredCurrency));
      setTrendRange(readStoredTrendRange() ?? "3m");
      setControlsInitialized(true);
    }
  }, [controlsManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (controlsInitialized) {
      void loadDetail(reportingCurrency, trendRange);
    }
  }, [accountId, controlsInitialized, reportingCurrency, trendRange]);

  async function loadDetail(currency: SnapshotDisplayCurrency, range: PortfolioTrendRange) {
    if (!accountId) {
      setError("账户地址缺少账户信息。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<AccountDetailResponse>(
        `/accounts/${encodeURIComponent(accountId)}/detail?currency=${currency}&trendRange=${range}&recentLimit=10`
      );
      setDetail(data.accountDetail);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

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
      <header className="page-header account-header holding-detail-header">
        <div>
          <Link className="text-button holding-detail-back" to="/accounts">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>返回投资账户</span>
          </Link>
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
              label="未实现收益"
              currency={activeCurrency}
              value={formatNullableSignedAmount(detail.currentValue.unrealizedGain)}
              toneClass={signedToneClass(detail.currentValue.unrealizedGain, preferences.gainColorScheme, 3)}
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
                    {trendRangeLabels[detail.trend.range]} · 估值参考日 {detail.currentValue.valuationBusinessDate}
                  </p>
                </div>
                <span className="chart-currency-indicator">
                  <CurrencyFlagIcon currency={activeCurrency} />
                  {activeCurrency}
                </span>
              </div>
              {!chartHasValues ? (
                <div className="empty-chart-state">暂无账户快照数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartRows} margin={{ top: 16, right: 18, bottom: 8, left: 0 }}>
                    <defs>
                      <linearGradient id="accountTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="8%" stopColor="var(--color-chart-line)" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="var(--color-chart-line)" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-chart-grid)" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatCompactAmount(value)} width={68} />
                    <Tooltip
                      contentStyle={chartTooltipContentStyle}
                      formatter={(value) => [formatChartAmount(value, activeCurrency), "账户净值"]}
                      labelFormatter={(label) => String(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-chart-line)"
                      strokeWidth={2.4}
                      fill="url(#accountTrendFill)"
                      connectNulls
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
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
                    <th>数据提示</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.holdings.length === 0 ? (
                    <tr>
                      <td colSpan={9}>暂无当前持仓或现金余额。</td>
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
                        <td>{formatHoldingWarnings(holding)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="account-detail-grid">
            <article className="flow-card holding-detail-panel">
              <div className="holding-detail-section-header">
                <h2>现金余额</h2>
                <span>{detail.cashBalances.length} 项</span>
              </div>
              <div className="table-wrap">
                <table className="holding-detail-table">
                  <thead>
                    <tr>
                      <th>现金标的</th>
                      <th>币种</th>
                      <th className="numeric-cell">余额</th>
                      <th className="numeric-cell">折合 ({activeCurrency})</th>
                      <th>数据提示</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.cashBalances.length === 0 ? (
                      <tr>
                        <td colSpan={5}>暂无现金余额。</td>
                      </tr>
                    ) : (
                      detail.cashBalances.map((cash) => (
                        <tr key={cash.instrumentId}>
                          <td>{cash.instrumentSymbol ? `${cash.instrumentSymbol} - ${cash.instrumentShortName}` : cash.instrumentShortName}</td>
                          <td>{cash.currency}</td>
                          <td className="numeric-cell">{formatDisplayAmount(cash.balance)}</td>
                          <td className="numeric-cell">{formatNullableAmount(cash.marketValue)}</td>
                          <td>{cash.holdingWarnings.length + cash.valuationWarnings.length === 0 ? "正常" : "需检查"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="flow-card holding-detail-panel">
              <div className="holding-detail-section-header">
                <h2>最近交易</h2>
                <span>10 条</span>
              </div>
              <div className="table-wrap">
                <table className="holding-detail-table">
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

          {detail.valuationWarnings.length || detail.snapshotWarnings.length ? (
            <section className="dashboard-warning-panel" aria-label="数据提示">
              <h2>数据提示</h2>
              <p>缺少必要数据的指标显示为 --。请优先补齐价格、汇率或成本基础。</p>
              <div className="holding-warnings">
                {detail.valuationWarnings.map((warning) => (
                  <span className="warning-pill" key={`valuation:${warning.code}:${warning.instrumentId}:${warning.currency}`}>
                    {formatDashboardWarning(warning)}
                  </span>
                ))}
                {detail.snapshotWarnings.map((warning) => (
                  <span className="warning-pill" key={`snapshot:${warning.code}:${warning.instrumentId}:${warning.currency}`}>
                    {formatSnapshotWarning(warning)}
                  </span>
                ))}
              </div>
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
