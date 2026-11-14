import { getInvestmentLabel } from "../i18n/investmentLabels";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { holdingsCopy as copy } from "../i18n/investmentCopy";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { formatCalendarDate } from "../lib/timeFormat";
import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { PageBackLink } from "../components/PageBackLink";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
  SNAPSHOT_DISPLAY_CURRENCIES,
  type HoldingDetailLinkedCashLeg,
  type HoldingDetailSummary,
  type InvestmentTransaction,
  type SnapshotDisplayCurrency
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingBlock } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { apiGet } from "../lib/apiClient";
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
  const { language } = useUiLanguage();
  const { accountId, instrumentId } = useParams();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [detail, setDetail] = useState<HoldingDetailSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiErrorDescriptor | "invalidAddress" | null>(null);

const loadDetail = useEventCallback(async function(currency: SnapshotDisplayCurrency) {
    if (!accountId || !instrumentId) {
      setError("invalidAddress");
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
      setError(describeUiError(requestError, "investmentRead"));
    } finally {
      setLoading(false);
    }
  });
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
      observeAsync(loadDetail(reportingCurrency));
    }
  }, [currencyInitialized, reportingCurrency, accountId, instrumentId, loadDetail]);

const activeCurrency = detail?.reportingCurrency ?? reportingCurrency;
  const pageLoading = loading || !currencyInitialized;
  const linkedCashLegsByParentId = useMemo(() => groupLinkedCashLegs(detail?.linkedCashLegs ?? []), [detail?.linkedCashLegs]);
  const sortedDividendTransactions = detail?.dividendTransactions ?? [];

  return (
    <section>
      <header className="page-header account-header holding-detail-header">
        <div>
          <PageBackLink to="/holdings" label={copy("title", language)} />
          <PageTitle route="/holdings">{copy("detailTitle", language)}</PageTitle>
          <p>
            {detail
              ? `${detail.account.name} · ${formatHoldingInstrument(detail.holding)} · ${getInvestmentLabel("marketRegion", detail.instrument.marketRegion, language)}`
              : copy("detailIntro", language)}
          </p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label={copy("reportingCurrency", language)}
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
            onClick={() => observeAsync(loadDetail(reportingCurrency))}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>{copy("refresh", language)}</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error === "invalidAddress" ? copy("invalidAddress", language) : translateUiError(error, language)}</p> : null}

      {pageLoading ? (
        <LoadingBlock label={copy("loadingDetail", language)} />
      ) : detail ? (
        <>
          <div className="metric-grid holdings-metrics holding-detail-metrics">
            <MetricCard label={copy("currentQuantity", language)} value={formatHoldingQuantity(detail.holding, language)} />
            <MetricCard
              label={copy("currentValuation", language)}
              currency={activeCurrency}
              value={formatNullableAmount(detail.holding.marketValue, language)}
            />
            <MetricCard label={copy("cost", language)} value={formatNullableAmount(detail.holding.costAmount, language)} />
            <MetricCard
              label={copy("unrealizedGainLoss", language)}
              currency={activeCurrency}
              value={formatNullableSignedAmount(detail.holding.unrealizedGain, language)}
              toneClass={signedToneClass(detail.holding.unrealizedGain, preferences.gainColorScheme, 3)}
            />
            <MetricCard label={copy("latestPrice", language)} value={formatHoldingLatestPrice(detail.holding, "detailed", language)} />
            <MetricCard
              label={copy("totalDividends", language)}
              value={`${detail.dividendSummary.currency} ${formatDisplayAmount(detail.dividendSummary.totalGrossAmount, getDisplayLocale(language))}`}
            />
          </div>

          <section className="holding-detail-grid">
            <article className="flow-card holding-detail-panel">
              <h2>{copy("valuationOverview", language)}</h2>
              <dl className="detail-list">
                <DetailRow label={copy("account", language)} value={detail.account.name} />
                <DetailRow label={copy("instrument", language)} value={formatHoldingInstrument(detail.holding)} />
                <DetailRow label={copy("status", language)} value={detail.hasCurrentPosition ? copy("openPosition", language) : copy("closedPosition", language)} />
                <DetailRow label={copy("type", language)} value={getInvestmentLabel("assetType", detail.holding.assetType, language)} />
                <DetailRow label={copy("currency", language)} value={detail.holding.currency} />
                <DetailRow label={copy("latestPriceDate", language)} value={formatCalendarDate(detail.holding.latestPriceDate, "--", language)} />
                <DetailRow label={copy("dataNotices", language)} value={formatHoldingWarnings(detail.holding, language)} />
              </dl>
              <p className="holding-detail-note">{copy("dividendHelp", language)}</p>
            </article>

            <article className="flow-card holding-detail-panel">
              <h2>{copy("priceReference", language)}</h2>
              <dl className="detail-list">
                <DetailRow label={copy("source", language)} value={detail.priceContext.provider ?? "--"} />
                <DetailRow label={copy("latestPrice", language)} value={formatPriceRecord(detail.priceContext.latestPrice, language)} />
                <DetailRow label={copy("previousPrice", language)} value={formatPriceRecord(detail.priceContext.previousPrice, language)} />
                <DetailRow label={copy("priceMovement", language)} value={formatPriceMovement(detail, preferences.gainColorScheme, language)} />
              </dl>
            </article>
          </section>

          <section className="flow-card holding-detail-panel">
            <h2>{copy("transactions", language)}</h2>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>{copy("date", language)}</th>
                    <th>{copy("type", language)}</th>
                    <th className="numeric-cell">{copy("quantity", language)}</th>
                    <th className="numeric-cell">{copy("price", language)}</th>
                    <th className="numeric-cell">{copy("amount", language)}</th>
                    <th className="numeric-cell">{copy("taxRecords", language)}</th>
                    <th>{copy("settlementCash", language)}</th>
                    <th>{copy("notes", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={8}>{copy("noTransactions", language)}</td>
                    </tr>
                  ) : (
                    detail.transactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{formatCalendarDate(transaction.tradeDate, "-", language)}</td>
                        <td>{getInvestmentLabel("transactionType", transaction.transactionType, language)}</td>
                        <td className="numeric-cell">{transaction.quantity ? formatDisplayAmount(transaction.quantity, getDisplayLocale(language)) : "-"}</td>
                        <td className="numeric-cell">{transaction.price ? formatDisplayPrice(transaction.price, getDisplayLocale(language)) : "-"}</td>
                        <td className="numeric-cell">{formatTransactionAmount(transaction, language)}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.tax, getDisplayLocale(language))}</td>
                        <td>{formatLinkedCashLeg(linkedCashLegsByParentId.get(transaction.id), language)}</td>
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
              <h2>{copy("dividends", language)}</h2>
              <span>
                {copy("total", language, {
                  currency: detail.dividendSummary.currency,
                  amount: formatDisplayAmount(detail.dividendSummary.totalGrossAmount, getDisplayLocale(language))
                })}
                {detail.dividendSummary.latestDividendDate ? copy("latestDividend", language, {date:formatCalendarDate(detail.dividendSummary.latestDividendDate, "-", language)}) : ""}
              </span>
            </div>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>{copy("date", language)}</th>
                    <th className="numeric-cell">{copy("dividendAmount", language)}</th>
                    <th className="numeric-cell">{copy("recordedTax", language)}</th>
                    <th>{copy("creditedCash", language)}</th>
                    <th>{copy("notes", language)}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDividendTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{copy("noDividends", language)}</td>
                    </tr>
                  ) : (
                    sortedDividendTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td>{formatCalendarDate(transaction.tradeDate, "-", language)}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.grossAmount, getDisplayLocale(language))}</td>
                        <td className="numeric-cell">{formatDisplayAmount(transaction.tax, getDisplayLocale(language))}</td>
                        <td>{formatLinkedCashLeg(linkedCashLegsByParentId.get(transaction.id), language)}</td>
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

function formatNullableAmount(value: string | null, language: UiLanguage = "zh-CN"): string {
  return value === null ? "--" : formatDisplayAmount(value, getDisplayLocale(language));
}

function formatNullableSignedAmount(value: string | null, language: UiLanguage = "zh-CN"): string {
  return value === null ? "--" : formatSignedDisplayAmount(value, getDisplayLocale(language));
}

function formatPriceRecord(price: HoldingDetailSummary["priceContext"]["latestPrice"], language: UiLanguage = "zh-CN"): ReactNode {
  if (!price) {
    return "--";
  }

  return (
    <>
      {price.currency} {formatDisplayPrice(price.closePrice, getDisplayLocale(language))} ({formatCalendarDate(price.priceDate, "-", language)})
      {price.isEstimated ? <span className="estimate-badge">{copy("estimated", language)}</span> : null}
    </>
  );
}

function formatPriceMovement(
  detail: HoldingDetailSummary,
  gainColorScheme: Parameters<typeof signedToneClass>[1], language: UiLanguage = "zh-CN"
): ReactNode {
  const { movementAmount, movementPct } = detail.priceContext;

  if (movementAmount === null) {
    return "--";
  }

  return (
    <span className={signedToneClass(movementAmount, gainColorScheme, 3)}>
      {formatSignedDisplayAmount(movementAmount, getDisplayLocale(language))}
      {movementPct ? ` / ${formatSignedDisplayPercent(movementPct, getDisplayLocale(language))}%` : ""}
    </span>
  );
}

function formatTransactionAmount(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  if (transaction.grossAmount) {
    return `${transaction.currency} ${formatDisplayAmount(transaction.grossAmount, getDisplayLocale(language))}`;
  }

  if (transaction.fee !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.fee, getDisplayLocale(language))}`;
  }

  if (transaction.tax !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.tax, getDisplayLocale(language))}`;
  }

  return "-";
}

function formatLinkedCashLeg(transaction: InvestmentTransaction | undefined, language: UiLanguage = "zh-CN"): string {
  if (!transaction?.grossAmount) {
    return "-";
  }

  return `${getInvestmentLabel("transactionType", transaction.transactionType, language)} ${transaction.currency} ${formatDisplayAmount(transaction.grossAmount, getDisplayLocale(language))}`;
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
