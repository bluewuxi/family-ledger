import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Printer, RefreshCw, RotateCcw, Save } from "lucide-react";
import {
  formatDateTimeInTimeZone,
  getAppBusinessDate,
  SNAPSHOT_DISPLAY_CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  type AuthenticatedUser,
  type InvestmentTransaction,
  type MonthlyCashAdjustmentSummary,
  type MonthlyReview,
  type MonthlyReviewStatus,
  type MonthlySummary,
  type MonthlySummaryWarning,
  type MonthlyTradeActivitySummary,
  type SnapshotDisplayCurrency,
  type SnapshotWarning
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet, apiPatch } from "../lib/apiClient";
import { formatDisplayAmount, formatSignedDisplayAmount, formatSignedDisplayPercent } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface MonthlySummaryResponse {
  user: AuthenticatedUser;
  monthlySummary: MonthlySummary;
}

interface MonthlyReviewResponse {
  user: AuthenticatedUser;
  monthlyReview: MonthlyReview;
}

const monthlySummaryCurrencyStorageKey = "family-ledger.monthly-summary.reportingCurrency";
type GainColorScheme = Parameters<typeof signedToneClass>[1];

export function MonthlySummaryPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const maxSelectableMonth = getAppBusinessDate().slice(0, 7);
  const [month, setMonth] = useState(() => maxSelectableMonth);
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [review, setReview] = useState<MonthlyReview | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState("");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingReview, setSavingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(monthlySummaryCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadMonthlySummary(month, reportingCurrency);
    }
  }, [currencyInitialized, month, reportingCurrency]);

  async function loadMonthlySummary(selectedMonth: string, currency: SnapshotDisplayCurrency) {
    setLoading(true);
    setError(null);
    setReviewMessage(null);

    if (selectedMonth > maxSelectableMonth) {
      setError("不能查看未来月份的月度回顾。");
      setLoading(false);
      return;
    }

    try {
      const query = new URLSearchParams({ month: selectedMonth, currency });
      const reviewQuery = new URLSearchParams({ month: selectedMonth });
      const [summaryData, reviewData] = await Promise.all([
        apiGet<MonthlySummaryResponse>(`/reports/monthly-summary?${query.toString()}`),
        apiGet<MonthlyReviewResponse>(`/reports/monthly-review?${reviewQuery.toString()}`)
      ]);
      setUser(summaryData.user);
      setSummary(summaryData.monthlySummary);
      setReview(reviewData.monthlyReview);
      setReviewNotesDraft(reviewData.monthlyReview.familyNotes);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function saveReview(nextStatus?: MonthlyReviewStatus) {
    if (nextStatus === "complete" && dataNeedsAttention) {
      const confirmed = window.confirm("当前月度数据仍有提醒。确认标记为已完成吗？");
      if (!confirmed) {
        return;
      }
    }

    setSavingReview(true);
    setError(null);
    setReviewMessage(null);

    try {
      const query = new URLSearchParams({ month });
      const data = await apiPatch<MonthlyReviewResponse>(`/reports/monthly-review?${query.toString()}`, {
        familyNotes: reviewNotesDraft,
        ...(nextStatus ? { reviewStatus: nextStatus } : {})
      });
      setUser(data.user);
      setReview(data.monthlyReview);
      setReviewNotesDraft(data.monthlyReview.familyNotes);
      setReviewMessage(nextStatus === "complete" ? "月度复盘已标记完成。" : nextStatus === "in_progress" ? "月度复盘已重新打开。" : "家庭备注已保存。");
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSavingReview(false);
    }
  }

  const pageLoading = loading || !currencyInitialized;
  const activeCurrency = summary?.currency ?? reportingCurrency;
  const bridgeLines = summary?.bridgeLines ?? [];
  const warningMessages = useMemo(() => unique((summary?.warnings ?? []).map(formatWarning)), [summary?.warnings]);
  const snapshotWarningMessages = useMemo(
    () => unique((summary?.snapshotWarnings ?? []).map(formatSnapshotWarning)),
    [summary?.snapshotWarnings]
  );
  const dataNeedsAttention = warningMessages.length > 0 || snapshotWarningMessages.length > 0;
  const isAdmin = user?.role === "admin";
  const reviewStatus = review?.reviewStatus ?? "in_progress";

  return (
    <section className="monthly-report-page">
      <header className="page-header account-header">
        <div className="monthly-title-area">
          <div className="monthly-title-row">
            <PageTitle route="/reports/monthly-summary">月度回顾</PageTitle>
            <label className="monthly-title-month">
              回顾月份
              <input
                type="month"
                value={month}
                max={maxSelectableMonth}
                onChange={(event) => setMonth(event.target.value)}
                disabled={pageLoading}
              />
            </label>
          </div>
          <p>用快照、净投入和现金校准解释一个月的家庭资产变化。</p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label="报告币种"
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
              writeStoredDisplayCurrency(monthlySummaryCurrencyStorageKey, nextCurrency);
              setCurrencyManuallySelected(true);
              setReportingCurrency(nextCurrency);
            }}
            disabled={!currencyInitialized}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadMonthlySummary(month, reportingCurrency)}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
          <button className="secondary-button print-hidden" type="button" onClick={() => window.print()} disabled={pageLoading}>
            <Printer size={17} aria-hidden="true" />
            <span>打印 / 导出</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {reviewMessage ? <p className="form-success print-hidden">{reviewMessage}</p> : null}

      <div className="metric-grid monthly-summary-metrics">
        {[
          { label: "月初资产", value: summary?.startValue, signed: false },
          { label: "月末资产", value: summary?.endValue, signed: false },
          { label: "资产变化", value: summary?.assetChange, signed: true },
          { label: "净投入", value: summary?.netPrincipalFlow, signed: true },
          { label: "现金校准", value: summary?.cashAdjustmentImpact, signed: true },
          { label: "估值变动", value: summary?.valuationMovement, signed: true }
        ].map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <small className="metric-currency">
              <CurrencyFlagIcon currency={activeCurrency} />
              {activeCurrency}
            </small>
            <strong className={metric.signed ? signedToneClass(metric.value, preferences.gainColorScheme, 3) : undefined}>
              {formatWholeMetric(metric.value, pageLoading, metric.signed)}
            </strong>
          </article>
        ))}
      </div>

      {summary ? (
        <p className="quote-update-note">
          快照范围：{summary.startSnapshotDate ?? "缺少月初快照"} 至 {summary.endSnapshotDate ?? "缺少月末快照"}
        </p>
      ) : null}

      <section className="flow-card monthly-review-workflow">
        <div className="monthly-review-header">
          <div>
            <h2>本月复盘</h2>
            <p>记录家庭讨论结论，并标记本月是否已经复盘完成。</p>
          </div>
          <div className="monthly-review-statuses">
            <span className={`status-pill ${dataNeedsAttention ? "status-pill-paused" : "status-pill-active"}`}>
              数据状态：{pageLoading ? "加载中" : dataNeedsAttention ? "数据需关注" : "数据正常"}
            </span>
            <span className={`status-pill ${reviewStatus === "complete" ? "status-pill-active" : ""}`}>
              复盘状态：{reviewStatus === "complete" ? "已完成" : "复盘中"}
            </span>
          </div>
        </div>
        <label className="monthly-review-notes">
          家庭备注
          <textarea
            value={reviewNotesDraft}
            onChange={(event) => setReviewNotesDraft(event.target.value)}
            readOnly={!isAdmin || pageLoading}
            placeholder="记录本月主要变化、家庭讨论结论或需要下月跟进的事项。"
          />
        </label>
        <div className="monthly-review-footer">
          <p className="readonly-note">
            {isAdmin ? "admin 可保存备注并更新复盘状态；viewer 只能查看。" : "当前角色为 viewer，可查看家庭备注和复盘状态。"}
            {review?.updatedAt ? ` 最后保存：${formatReviewTimestamp(review.updatedAt)}` : ""}
          </p>
          {isAdmin ? (
            <div className="monthly-review-actions print-hidden">
              <button className="secondary-button" type="button" onClick={() => void saveReview()} disabled={pageLoading || savingReview}>
                <Save size={17} aria-hidden="true" />
                <span>保存备注</span>
              </button>
              {reviewStatus === "complete" ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void saveReview("in_progress")}
                  disabled={pageLoading || savingReview}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                  <span>重新打开</span>
                </button>
              ) : (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void saveReview("complete")}
                  disabled={pageLoading || savingReview}
                >
                  <CheckCircle2 size={17} aria-hidden="true" />
                  <span>标记为已完成</span>
                </button>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>资产变化拆解</h2>
              <p>资产变化 = 净投入 + 现金校准 + 估值变动。</p>
            </div>
          </div>
          <div className="table-wrap compact-table-wrap monthly-bridge-wrap">
            <table className="monthly-bridge-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th className="numeric-cell">金额 ({activeCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <LoadingRow colSpan={2} label="正在加载月度回顾" />
                ) : bridgeLines.length === 0 ? (
                  <EmptyRow colSpan={2} label="暂无月度回顾数据。" />
                ) : (
                  bridgeLines.map((line) => {
                    const signed = line.key !== "start_value" && line.key !== "end_value";
                    return (
                      <tr key={line.key}>
                        <td>{line.label}</td>
                        <td className={`numeric-cell ${signed ? signedToneClass(line.amount, preferences.gainColorScheme, 3) : ""}`}>
                          {formatBridgeLineAmount(line, false, signed)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>净投入明细</h2>
              <p>列出本月手动期初、入金和出金记录，用于解释资产变化拆解中的净投入。</p>
            </div>
          </div>
          <PrincipalFlowTable
            loading={pageLoading}
            transactions={summary?.principalTransactions ?? []}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>
      </section>

      <section className="monthly-single-panel">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>账户贡献</h2>
              <p>按账户拆解本月估值变动，已剔除净投入和现金校准；贡献/拖累以各账户估值变动绝对值合计为分母。</p>
            </div>
          </div>
          <div className="table-wrap compact-table-wrap monthly-account-contribution-wrap">
            <table className="monthly-account-contribution-table">
              <thead>
                <tr>
                  <th>账户</th>
                  <th className="numeric-cell">月初</th>
                  <th className="numeric-cell">月末</th>
                  <th className="numeric-cell">净投入</th>
                  <th className="numeric-cell">现金校准</th>
                  <th className="numeric-cell">估值变动</th>
                  <th className="numeric-cell">贡献/拖累</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <LoadingRow colSpan={7} label="正在加载账户贡献" />
                ) : (summary?.accountChanges.length ?? 0) === 0 ? (
                  <EmptyRow colSpan={7} label="暂无账户贡献数据。" />
                ) : (
                  summary?.accountChanges.map((account) => (
                    <tr key={account.accountId}>
                      <td>{account.accountName}</td>
                      <td className="numeric-cell">{formatMetric(account.startValue, false, false)}</td>
                      <td className="numeric-cell">{formatMetric(account.endValue, false, false)}</td>
                      <td className={`numeric-cell ${signedToneClass(account.netPrincipalFlow, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.netPrincipalFlow, false, true)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.cashAdjustmentImpact, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.cashAdjustmentImpact, false, true)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.valuationMovement, preferences.gainColorScheme, 3)}`}>
                        {formatMetric(account.valuationMovement, false, true)}
                      </td>
                      <td className={`numeric-cell ${signedToneClass(account.valuationContributionPct, preferences.gainColorScheme, 3)}`}>
                        {account.valuationContributionPct === null ? "--" : `${formatSignedDisplayPercent(account.valuationContributionPct)}%`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>本月交易</h2>
              <p>只列出手动买入和卖出；自动现金流水作为结算信息展示。</p>
            </div>
          </div>
          <TradeActivityTable
            loading={pageLoading}
            trades={summary?.tradeActivity ?? []}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>

        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>现金校准说明</h2>
              <p>月末手动校准现金时，可在备注中记录主要差异来源。</p>
            </div>
          </div>
          <CashAdjustmentTable
            loading={pageLoading}
            adjustments={summary?.cashAdjustments ?? []}
            currency={activeCurrency}
            gainColorScheme={preferences.gainColorScheme}
          />
        </article>
      </section>

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>数据质量提醒</h2>
              <p>展示月度计算和快照估值中的数据缺口。</p>
            </div>
          </div>
          {pageLoading ? (
            <LoadingState label="正在加载数据提醒" />
          ) : warningMessages.length === 0 && snapshotWarningMessages.length === 0 ? (
            <p className="readonly-note">暂无数据质量提醒。</p>
          ) : (
            <div className="monthly-warning-list">
              {[...warningMessages, ...snapshotWarningMessages].map((message) => (
                <p className="form-warning" key={message}>{message}</p>
              ))}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

function formatReviewTimestamp(value: string): string {
  return formatDateTimeInTimeZone(value, Intl.DateTimeFormat().resolvedOptions().timeZone, "zh-CN", value);
}

function TradeActivityTable({
  loading,
  trades,
  gainColorScheme
}: {
  loading: boolean;
  trades: MonthlyTradeActivitySummary[];
  gainColorScheme: GainColorScheme;
}) {
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">日期</th>
            <th className="type-column">类型</th>
            <th>标的</th>
            <th className="numeric-cell">价格</th>
            <th className="numeric-cell">结算现金</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={6} label="正在加载交易" />
          ) : trades.length === 0 ? (
            <EmptyRow colSpan={6} label="本月暂无买入或卖出交易。" />
          ) : (
            trades.map((item) => (
              <tr key={item.transaction.id}>
                <td className="date-column">{formatMonthDay(item.transaction.tradeDate)}</td>
                <td className="type-column">{TRANSACTION_TYPE_LABELS[item.transaction.transactionType]}</td>
                <td>{formatInstrument(item.transaction)}</td>
                <td className="numeric-cell">{formatTransactionPrice(item.transaction)}</td>
                <td className={`numeric-cell ${signedToneClass(getLinkedCashLegSignedAmount(item.linkedCashLeg), gainColorScheme, 3)}`}>
                  {formatLinkedCashLeg(item.linkedCashLeg)}
                </td>
                <td>{item.transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CashAdjustmentTable({
  loading,
  adjustments,
  currency,
  gainColorScheme
}: {
  loading: boolean;
  adjustments: MonthlyCashAdjustmentSummary[];
  currency: SnapshotDisplayCurrency;
  gainColorScheme: GainColorScheme;
}) {
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">日期</th>
            <th>标的</th>
            <th className="numeric-cell">校准金额 ({currency})</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={4} label="正在加载现金校准" />
          ) : adjustments.length === 0 ? (
            <EmptyRow colSpan={4} label="本月暂无现金校准记录。" />
          ) : (
            adjustments.map((item) => (
              <tr key={item.transaction.id}>
                <td className="date-column">{formatMonthDay(item.transaction.tradeDate)}</td>
                <td>{formatInstrument(item.transaction)}</td>
                <td className={`numeric-cell ${signedToneClass(item.signedAmount, gainColorScheme, 3)}`}>
                  {formatMetric(item.signedAmount, false, true)}
                </td>
                <td>{item.transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PrincipalFlowTable({
  loading,
  transactions,
  gainColorScheme
}: {
  loading: boolean;
  transactions: InvestmentTransaction[];
  gainColorScheme: GainColorScheme;
}) {
  return (
    <div className="table-wrap compact-table-wrap">
      <table className="monthly-activity-table">
        <thead>
          <tr>
            <th className="date-column">日期</th>
            <th className="type-column">类型</th>
            <th>标的</th>
            <th className="numeric-cell">金额</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <LoadingRow colSpan={5} label="正在加载净投入" />
          ) : transactions.length === 0 ? (
            <EmptyRow colSpan={5} label="本月暂无入金、出金或期初记录。" />
          ) : (
            transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td className="date-column">{formatMonthDay(transaction.tradeDate)}</td>
                <td className="type-column">{TRANSACTION_TYPE_LABELS[transaction.transactionType]}</td>
                <td>{formatInstrument(transaction)}</td>
                <td className={`numeric-cell ${signedToneClass(getPrincipalSignedDisplayAmount(transaction), gainColorScheme, 3)}`}>
                  {formatPrincipalAmount(transaction)}
                </td>
                <td>{transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoadingRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td className="table-loading-cell" colSpan={colSpan}>
        <LoadingState label={label} />
      </td>
    </tr>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function formatMetric(value: string | null | undefined, loading: boolean, signed: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  if (value === null || value === undefined) {
    return "--";
  }

  return signed ? formatSignedDisplayAmount(value) : formatDisplayAmount(value);
}

function formatBridgeLineAmount(
  line: MonthlySummary["bridgeLines"][number],
  loading: boolean,
  signed: boolean
): ReactNode {
  return line.key === "cash_adjustment"
    ? formatMetric(line.amount, loading, signed)
    : formatWholeMetric(line.amount, loading, signed);
}

function formatWholeMetric(value: string | null | undefined, loading: boolean, signed: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  if (value === null || value === undefined) {
    return "--";
  }

  const numericValue = Number(String(value).trim());
  if (!Number.isFinite(numericValue)) {
    return value;
  }

  const roundedValue = Math.round(numericValue);
  const normalizedValue = Object.is(roundedValue, -0) ? 0 : roundedValue;
  const formatted = Math.abs(normalizedValue).toLocaleString("zh-CN", { maximumFractionDigits: 0 });

  if (!signed) {
    return normalizedValue < 0 ? `-${formatted}` : formatted;
  }

  if (normalizedValue > 0) {
    return `+${formatted}`;
  }

  return normalizedValue < 0 ? `-${formatted}` : formatted;
}

function formatTransactionPrice(transaction: InvestmentTransaction): string {
  return transaction.price ? `${transaction.currency} ${formatDisplayAmount(transaction.price)}` : "--";
}

function getLinkedCashLegSignedAmount(transaction: InvestmentTransaction | null): string | null {
  if (!transaction || !transaction.grossAmount) {
    return null;
  }

  return transaction.transactionType === "withdrawal" ? `-${transaction.grossAmount}` : transaction.grossAmount;
}

function formatLinkedCashLeg(transaction: InvestmentTransaction | null): string {
  if (!transaction || !transaction.grossAmount) {
    return "--";
  }

  const sign = transaction.transactionType === "withdrawal" ? "-" : "+";
  return `${sign}${transaction.currency} ${formatDisplayAmount(transaction.grossAmount)}`;
}

function getPrincipalSignedDisplayAmount(transaction: InvestmentTransaction): string | null {
  if (!transaction.grossAmount) {
    return null;
  }

  return transaction.transactionType === "withdrawal" ? `-${transaction.grossAmount}` : transaction.grossAmount;
}

function formatPrincipalAmount(transaction: InvestmentTransaction): string {
  const amount = transaction.grossAmount;

  if (!amount) {
    return "--";
  }

  const sign = transaction.transactionType === "withdrawal" ? "-" : "+";
  return `${sign}${transaction.currency} ${formatDisplayAmount(amount)}`;
}

function formatMonthDay(value: string): string {
  return value.length >= 10 ? value.slice(5, 10) : value;
}

function formatInstrument(transaction: InvestmentTransaction): string {
  return formatInstrumentName(transaction.instrumentSymbol, transaction.instrumentShortName, transaction.instrumentName);
}

function formatInstrumentName(symbol: string | null | undefined, shortName: string | null | undefined, name: string | null | undefined): string {
  const displayName = shortName ?? name ?? "未知标的";
  return symbol ? `${symbol} - ${displayName}` : displayName;
}

function formatWarning(warning: MonthlySummaryWarning): string {
  return warning.message;
}

function formatSnapshotWarning(warning: SnapshotWarning): string {
  const instrument = `${warning.accountName} / ${warning.instrumentShortName} (${warning.currency})`;

  switch (warning.code) {
    case "MISSING_LATEST_PRICE":
      return `${instrument} 缺少最新价格`;
    case "MISSING_PREVIOUS_PRICE":
      return `${instrument} 缺少前一收盘价`;
    case "MISSING_FX_RATE":
      return `${instrument} 缺少估值汇率`;
    case "COST_BASIS_UNAVAILABLE":
      return `${instrument} 成本不可用`;
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "月度回顾请求失败，请稍后重试。";
}
