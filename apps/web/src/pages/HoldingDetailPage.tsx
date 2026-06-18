import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  ASSET_TYPE_LABELS,
  MARKET_REGION_LABELS,
  SNAPSHOT_DISPLAY_CURRENCIES,
  TRANSACTION_TYPE_LABELS,
  type HoldingDetailLinkedCashLeg,
  type HoldingDetailSummary,
  type InvestmentTransaction,
  type SnapshotDisplayCurrency
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
  formatSignedDisplayAmount,
  formatSignedDisplayPercent
} from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface HoldingDetailResponse {
  holdingDetail: HoldingDetailSummary;
}

const holdingDetailCurrencyStorageKey = "family-ledger.holding-detail.reportingCurrency";

export function HoldingDetailPage() {
  const { accountId, instrumentId } = useParams();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [detail, setDetail] = useState<HoldingDetailSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(holdingDetailCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadDetail(reportingCurrency);
    }
  }, [currencyInitialized, reportingCurrency, accountId, instrumentId]);

  async function loadDetail(currency: SnapshotDisplayCurrency) {
    if (!accountId || !instrumentId) {
      setError("持仓地址缺少账户或标的信息。");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<HoldingDetailResponse>(
        `/holdings/detail?accountId=${encodeURIComponent(accountId)}&instrumentId=${encodeURIComponent(instrumentId)}&currency=${currency}`
      );
      setDetail(data.holdingDetail);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const activeCurrency = detail?.reportingCurrency ?? reportingCurrency;
  const pageLoading = loading || !currencyInitialized;
  const linkedCashLegsByParentId = useMemo(() => groupLinkedCashLegs(detail?.linkedCashLegs ?? []), [detail?.linkedCashLegs]);
  const sortedDividendTransactions = detail?.dividendTransactions ?? [];

  return (
    <section>
      <header className="page-header account-header holding-detail-header">
        <div>
          <Link className="text-button holding-detail-back" to="/holdings">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>返回持仓总览</span>
          </Link>
          <PageTitle route="/holdings">持仓详情</PageTitle>
          <p>
            {detail
              ? `${detail.account.name} · ${formatHoldingInstrument(detail.holding)} · ${MARKET_REGION_LABELS[detail.instrument.marketRegion]}`
              : "查看单个账户下的持仓、估值、交易和股息记录。"}
          </p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label="报告币种"
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
              writeStoredDisplayCurrency(holdingDetailCurrencyStorageKey, nextCurrency);
              setCurrencyManuallySelected(true);
              setReportingCurrency(nextCurrency);
            }}
            disabled={!currencyInitialized}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => void loadDetail(reportingCurrency)}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {pageLoading ? (
        <LoadingBlock label="正在加载持仓详情" />
      ) : detail ? (
        <>
          <div className="metric-grid holdings-metrics holding-detail-metrics">
            <MetricCard label="当前数量" value={formatHoldingQuantity(detail.holding)} />
            <MetricCard
              label="当前估值"
              currency={activeCurrency}
              value={formatNullableAmount(detail.holding.marketValue)}
            />
            <MetricCard label="持仓成本" value={formatNullableAmount(detail.holding.costAmount)} />
            <MetricCard
              label="动态盈亏"
              currency={activeCurrency}
              value={formatNullableSignedAmount(detail.holding.unrealizedGain)}
              toneClass={signedToneClass(detail.holding.unrealizedGain, preferences.gainColorScheme, 3)}
            />
            <MetricCard label="最新价格" value={formatHoldingLatestPrice(detail.holding)} />
            <MetricCard
              label="累计股息"
              value={`${detail.dividendSummary.currency} ${formatDisplayAmount(detail.dividendSummary.totalGrossAmount)}`}
            />
          </div>

          <section className="holding-detail-grid">
            <article className="flow-card holding-detail-panel">
              <h2>估值概览</h2>
              <dl className="detail-list">
                <DetailRow label="账户" value={detail.account.name} />
                <DetailRow label="标的" value={formatHoldingInstrument(detail.holding)} />
                <DetailRow label="状态" value={detail.hasCurrentPosition ? "当前持仓" : "已清仓"} />
                <DetailRow label="类型" value={ASSET_TYPE_LABELS[detail.holding.assetType]} />
                <DetailRow label="币种" value={detail.holding.currency} />
                <DetailRow label="最新价格日期" value={detail.holding.latestPriceDate ?? "--"} />
                <DetailRow label="数据提示" value={formatHoldingWarnings(detail.holding)} />
              </dl>
              <p className="holding-detail-note">股息不会改变持仓数量；记录股息会生成入账现金。如果股息再投资，请另行记录买入交易。</p>
            </article>

            <article className="flow-card holding-detail-panel">
              <h2>价格参考</h2>
              <dl className="detail-list">
                <DetailRow label="数据来源" value={detail.priceContext.provider ?? "--"} />
                <DetailRow label="最新价格" value={formatPriceRecord(detail.priceContext.latestPrice)} />
                <DetailRow label="前一价格" value={formatPriceRecord(detail.priceContext.previousPrice)} />
                <DetailRow label="价格变动" value={formatPriceMovement(detail, preferences.gainColorScheme)} />
              </dl>
            </article>
          </section>

          <section className="flow-card holding-detail-panel">
            <h2>交易记录</h2>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>类型</th>
                    <th className="numeric-cell">数量</th>
                    <th className="numeric-cell">价格</th>
                    <th className="numeric-cell">金额</th>
                    <th className="numeric-cell">税务记录</th>
                    <th>结算现金</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8}>暂无相关交易记录。</td>
                    </tr>
                  ) : (
                    detail.transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.tradeDate}</td>
                        <td>{TRANSACTION_TYPE_LABELS[transaction.transactionType]}</td>
                        <td className="numeric-cell">{transaction.quantity ? formatDisplayAmount(transaction.quantity) : "-"}</td>
                        <td className="numeric-cell">{transaction.price ? formatDisplayPrice(transaction.price) : "-"}</td>
                        <td className="numeric-cell">{formatTransactionAmount(transaction)}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.tax)}</td>
                        <td>{formatLinkedCashLeg(linkedCashLegsByParentId.get(transaction.id))}</td>
                        <td>{transaction.notes ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flow-card holding-detail-panel">
            <div className="holding-detail-section-header">
              <h2>股息记录</h2>
              <span>
                合计 {detail.dividendSummary.currency} {formatDisplayAmount(detail.dividendSummary.totalGrossAmount)}
                {detail.dividendSummary.latestDividendDate ? ` · 最近 ${detail.dividendSummary.latestDividendDate}` : ""}
              </span>
            </div>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th className="numeric-cell">股息金额</th>
                    <th className="numeric-cell">记录税额</th>
                    <th>入账现金</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDividendTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5}>暂无股息记录。</td>
                    </tr>
                  ) : (
                    sortedDividendTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{transaction.tradeDate}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.grossAmount)}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.tax)}</td>
                        <td>{formatLinkedCashLeg(linkedCashLegsByParentId.get(transaction.id))}</td>
                        <td>{transaction.notes ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
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

function groupLinkedCashLegs(linkedCashLegs: HoldingDetailLinkedCashLeg[]): Map<string, InvestmentTransaction> {
  return new Map(linkedCashLegs.map((linkedCashLeg) => [linkedCashLeg.parentTransactionId, linkedCashLeg.transaction]));
}

function formatNullableAmount(value: string | null): string {
  return value === null ? "--" : formatDisplayAmount(value);
}

function formatNullableSignedAmount(value: string | null): string {
  return value === null ? "--" : formatSignedDisplayAmount(value);
}

function formatPriceRecord(price: HoldingDetailSummary["priceContext"]["latestPrice"]): string {
  if (!price) {
    return "--";
  }

  return `${price.currency} ${formatDisplayPrice(price.closePrice)} (${price.priceDate})`;
}

function formatPriceMovement(
  detail: HoldingDetailSummary,
  gainColorScheme: Parameters<typeof signedToneClass>[1]
): ReactNode {
  const { movementAmount, movementPct } = detail.priceContext;

  if (movementAmount === null) {
    return "--";
  }

  return (
    <span className={signedToneClass(movementAmount, gainColorScheme, 3)}>
      {formatSignedDisplayAmount(movementAmount)}
      {movementPct ? ` / ${formatSignedDisplayPercent(movementPct)}%` : ""}
    </span>
  );
}

function formatTransactionAmount(transaction: InvestmentTransaction): string {
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

function formatLinkedCashLeg(transaction: InvestmentTransaction | undefined): string {
  if (!transaction?.grossAmount) {
    return "-";
  }

  return `${TRANSACTION_TYPE_LABELS[transaction.transactionType]} ${transaction.currency} ${formatDisplayAmount(transaction.grossAmount)}`;
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

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "持仓详情请求失败，请稍后重试。";
}
