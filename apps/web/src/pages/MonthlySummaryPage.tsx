import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  getAppBusinessDate,
  SNAPSHOT_DISPLAY_CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  type InvestmentTransaction,
  type MonthlySummary,
  type MonthlySummaryWarning,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet } from "../lib/apiClient";
import { formatDisplayAmount, formatSignedDisplayAmount } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface MonthlySummaryResponse {
  monthlySummary: MonthlySummary;
}

const monthlySummaryCurrencyStorageKey = "family-ledger.monthly-summary.reportingCurrency";

export function MonthlySummaryPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [month, setMonth] = useState(() => getAppBusinessDate().slice(0, 7));
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    try {
      const query = new URLSearchParams({ month: selectedMonth, currency });
      const data = await apiGet<MonthlySummaryResponse>(`/reports/monthly-summary?${query.toString()}`);
      setSummary(data.monthlySummary);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const pageLoading = loading || !currencyInitialized;
  const activeCurrency = summary?.currency ?? reportingCurrency;
  const bridgeLines = summary?.bridgeLines ?? [];
  const warningMessages = useMemo(() => unique((summary?.warnings ?? []).map(formatWarning)), [summary?.warnings]);

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/reports/monthly-summary">月度归因</PageTitle>
          <p>用快照、投入和现金校准解释一个月的资产变化；股息作为收益来源单独展示，不参与资产桥计算。</p>
        </div>
        <div className="dashboard-controls">
          <label>
            月份
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} disabled={pageLoading} />
          </label>
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
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

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
              {formatMetric(metric.value, pageLoading, metric.signed)}
            </strong>
          </article>
        ))}
      </div>

      {summary ? (
        <p className="quote-update-note">
          快照范围：{summary.startSnapshotDate ?? "缺少月初快照"} 至 {summary.endSnapshotDate ?? "缺少月末快照"}
        </p>
      ) : null}

      {warningMessages.length > 0 ? (
        <div className="monthly-warning-list">
          {warningMessages.map((message) => (
            <p className="form-warning" key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <section className="monthly-summary-grid">
        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>资产桥</h2>
              <p>资产变化 = 净投入 + 现金校准 + 估值变动。</p>
            </div>
          </div>
          <div className="table-wrap compact-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th className="numeric-cell">金额 ({activeCurrency})</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <tr>
                    <td className="table-loading-cell" colSpan={2}>
                      <LoadingState label="正在加载月度归因" />
                    </td>
                  </tr>
                ) : bridgeLines.length === 0 ? (
                  <tr>
                    <td colSpan={2}>暂无月度归因数据。</td>
                  </tr>
                ) : (
                  bridgeLines.map((line) => {
                    const signed = line.key !== "start_value" && line.key !== "end_value";
                    return (
                      <tr key={line.key}>
                        <td>{line.label}</td>
                        <td className={`numeric-cell ${signed ? signedToneClass(line.amount, preferences.gainColorScheme, 3) : ""}`}>
                          {formatMetric(line.amount, false, signed)}
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
              <h2>股息记录</h2>
              <p>股息用于解释收益来源；当前不会自动增加现金余额。</p>
            </div>
          </div>
          <p className="readonly-note">
            股息记录用于解释收益来源；当前不会自动增加现金余额。若股息已入账，请通过现金校准或后续股息现金流水功能反映。
          </p>
          <div className="monthly-dividend-summary">
            <MetricBlock label="股息总额" value={formatMetric(summary?.dividendSummary.grossAmount, pageLoading, false)} />
            <MetricBlock label="记录扣税" value={formatMetric(summary?.dividendSummary.taxAmount, pageLoading, false)} />
            <MetricBlock label="净股息" value={formatMetric(summary?.dividendSummary.netAmount, pageLoading, false)} />
            <MetricBlock label="记录数" value={pageLoading ? <LoadingState label="加载中" /> : String(summary?.dividendSummary.transactionCount ?? 0)} />
          </div>
          <div className="table-wrap compact-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>标的</th>
                  <th>币种</th>
                  <th className="numeric-cell">总额</th>
                  <th className="numeric-cell">扣税记录</th>
                  <th className="numeric-cell">净额</th>
                </tr>
              </thead>
              <tbody>
                {pageLoading ? (
                  <tr>
                    <td className="table-loading-cell" colSpan={5}>
                      <LoadingState label="正在加载股息" />
                    </td>
                  </tr>
                ) : (summary?.dividendSummary.instruments.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={5}>本月暂无股息记录。</td>
                  </tr>
                ) : (
                  summary?.dividendSummary.instruments.map((item) => (
                    <tr key={item.instrumentId}>
                      <td>{formatInstrument(item.instrumentSymbol, item.instrumentShortName, item.instrumentName)}</td>
                      <td>{item.currency}</td>
                      <td className="numeric-cell">{formatDisplayAmount(item.grossAmount)}</td>
                      <td className="numeric-cell">{formatDisplayAmount(item.taxAmount)}</td>
                      <td className="numeric-cell">{formatDisplayAmount(item.netAmount)}</td>
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
              <h2>现金校准</h2>
              <p>月末手动校准现金时，可在备注中记录主要差异来源。</p>
            </div>
          </div>
          <TransactionTable
            emptyLabel="本月暂无现金校准记录。"
            loading={pageLoading}
            transactions={summary?.cashAdjustments.map((item) => item.transaction) ?? []}
            amountOf={(transaction) => summary?.cashAdjustments.find((item) => item.transaction.id === transaction.id)?.signedAmount ?? null}
            amountCurrency={activeCurrency}
            signed
          />
        </article>

        <article className="flow-card monthly-panel">
          <div className="chart-section-header">
            <div>
              <h2>本月投入</h2>
              <p>只统计手动期初、入金和出金；买卖自动现金流水不计入净投入。</p>
            </div>
          </div>
          <TransactionTable
            emptyLabel="本月暂无投入或出金记录。"
            loading={pageLoading}
            transactions={summary?.principalTransactions ?? []}
            amountOf={(transaction) => transaction.grossAmount}
            amountCurrency={null}
            signed={false}
          />
        </article>
      </section>
    </section>
  );
}

function MetricBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="monthly-mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TransactionTable({
  emptyLabel,
  loading,
  transactions,
  amountOf,
  amountCurrency,
  signed
}: {
  emptyLabel: string;
  loading: boolean;
  transactions: InvestmentTransaction[];
  amountOf: (transaction: InvestmentTransaction) => string | null | undefined;
  amountCurrency: SnapshotDisplayCurrency | null;
  signed: boolean;
}) {
  return (
    <div className="table-wrap compact-table-wrap">
      <table>
        <thead>
          <tr>
            <th>日期</th>
            <th>类型</th>
            <th>标的</th>
            <th className="numeric-cell">金额{amountCurrency ? ` (${amountCurrency})` : ""}</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className="table-loading-cell" colSpan={5}>
                <LoadingState label="正在加载记录" />
              </td>
            </tr>
          ) : transactions.length === 0 ? (
            <tr>
              <td colSpan={5}>{emptyLabel}</td>
            </tr>
          ) : (
            transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.tradeDate}</td>
                <td>{TRANSACTION_TYPE_LABELS[transaction.transactionType]}</td>
                <td>{formatInstrument(transaction.instrumentSymbol, transaction.instrumentShortName, transaction.instrumentName)}</td>
                <td className="numeric-cell">{formatMetric(amountOf(transaction), false, signed)}</td>
                <td>{transaction.notes || "-"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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

function formatInstrument(symbol: string | null | undefined, shortName: string | null | undefined, name: string | null | undefined): string {
  const displayName = shortName ?? name ?? "未知标的";
  return symbol ? `${symbol} - ${displayName}` : displayName;
}

function formatWarning(warning: MonthlySummaryWarning): string {
  return warning.message;
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

  return "月度归因请求失败，请稍后重试。";
}
