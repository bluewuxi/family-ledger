import { translateAccountDetailWarning } from "../i18n/investmentWarnings";
import { formatCalendarDate } from "../lib/timeFormat";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { i18n } from "../i18n/instance";
import { getInvestmentLabel } from "../i18n/investmentLabels";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { observeAsync } from "../lib/observeAsync";
import { PageBackLink } from "../components/PageBackLink";
import { AccountTrendChart } from "../components/AccountTrendChart";
import { useValuation } from "../lib/useValuation";
import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate, useParams, type NavigateFunction } from "react-router-dom";

import { Edit3, RefreshCw } from "lucide-react";
import {
  PORTFOLIO_TREND_RANGES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type AccountDetailSummary,
  type PortfolioTrendRange,
  type SnapshotDisplayCurrency,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingBlock } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { apiGet } from "../lib/apiClient";
import {
  formatHoldingInstrument,
  formatHoldingLatestPrice,
  formatHoldingQuantity,
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

const accountDetailCurrencyStorageKey = "family-ledger.account-detail.reportingCurrency";
const trendRangeStorageKey = "family-ledger.account-detail.trendRange";


export function AccountDetailPage() {
  const { language, displayLocale } = useUiLanguage();
  const a = i18n.getFixedT(language, "accounts");
  const trendRangeLabels: Record<PortfolioTrendRange, string> = {
  "1m": a("oneMonth"),
  "3m": a("threeMonths"),
  "1y": a("oneYear"),
  "3y": a("threeYears"),
  "5y": a("fiveYears"),
  inception: a("inception")
};
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
  const [trendError, setTrendError] = useState<UiErrorDescriptor | null>(null);
  useEffect(() => {
    if (!detail || !accountId) return;
    let active = true;
    setSelectedTrend(null);
    setTrendError(null);
    if (detail.trend.range === trendRange) { setTrendLoading(false); return; }
    setTrendLoading(true);
    void apiGet<AccountDetailResponse>(`/accounts/${encodeURIComponent(accountId)}/detail?currency=${reportingCurrency}&trendRange=${trendRange}&recentLimit=10&quoteMode=cached`)
      .then(result => { if (active) setSelectedTrend(result.accountDetail.trend); })
      .catch(failure => { if (active) setTrendError(describeUiError(failure, "investmentRead")); })
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

  async function loadDetail(_currency: SnapshotDisplayCurrency, _range: PortfolioTrendRange) { await reload(true); }

  const activeCurrency = detail?.reportingCurrency ?? reportingCurrency;
  const pageLoading = loading || !controlsInitialized;

return (
    <section>
      <header className="page-header account-header holding-detail-header account-detail-header">
        <div>
          <PageBackLink to="/accounts" label={a("investmentAccounts")} />
          <PageTitle route="/accounts">{a("performance")}</PageTitle>
          <p>
            {detail
              ? `${detail.account.name} · ${detail.account.broker ?? a("noBroker")} · ${getInvestmentLabel("marketRegion", detail.account.marketRegion, language)}`
              : a("detailHelp")}
          </p>
        </div>
        <div className="dashboard-controls account-detail-controls">
          <CurrencySelect
            label={a("reportingCurrency")}
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
            onClick={() => observeAsync(loadDetail(reportingCurrency, trendRange))}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>{a("refresh")}</span>
          </button>
          <button className="secondary-button" type="button" onClick={() => observeAsync((() => navigate("/accounts"))())}>
            <Edit3 size={17} aria-hidden="true" />
            <span>{a("manageInfo")}</span>
          </button>
        </div>
      </header>

      {refreshing && !loading ? <p role="status">{a("refreshing")}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {pageLoading ? (
        <LoadingBlock label={a("loadingDetail")} />
      ) : detail ? (
        <>
          <div className="metric-grid holdings-metrics account-detail-metrics">
            <MetricCard label={a("currentTotal")} currency={activeCurrency} value={formatNullableAmount(detail.currentValue.marketValue, language)} />
            <MetricCard label={a("cash")} currency={activeCurrency} value={formatNullableAmount(detail.currentValue.cashMarketValue, language)} />
            <MetricCard label={a("noncash")} currency={activeCurrency} value={formatNullableAmount(detail.currentValue.nonCashMarketValue, language)} />
            <MetricCard
              label={a("investmentProfit")}
              currency={activeCurrency}
              value={formatNullableSignedAmount(detail.investmentPerformance?.investmentProfit ?? null, language)}
              toneClass={signedToneClass(detail.investmentPerformance?.investmentProfit ?? null, preferences.gainColorScheme, 3)}
            />
            <MetricCard label={a("holdingCount")} value={String(detail.currentValue.holdingCount)} />
            <MetricCard label={a("latestSnapshotDate")} value={formatCalendarDate(detail.latestSnapshot?.snapshotDate ?? null, "--", language)} />
          </div>

          <section className="account-detail-grid">
            <article className="flow-card chart-panel account-detail-trend-panel">
              <div className="chart-section-header">
                <div>
                  <h2>{a("trend")}</h2>
                  <p>
                    {trendRangeLabels[chartDetail?.trend.range ?? detail.trend.range]}  {a("valuationDatePrefix")} {formatCalendarDate(detail.currentValue.valuationBusinessDate, "--", language)}
                  </p>
                </div>
          <label className="chart-range-select account-detail-range-select">

            {a("trendRange")}
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
              <div className="trend-tabs" role="tablist" aria-label={a("trend")}>
                {(["profit", "assets"] as const).map(view => <button type="button" role="tab" aria-selected={trendView === view} key={view} onClick={() => setTrendView(view)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "profit" : event.key === "End" ? "assets" : view === "profit" ? "assets" : "profit"; setTrendView(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next === "profit" ? 0 : 1]?.focus(); } }} tabIndex={trendView === view ? 0 : -1}>{view === "profit" ? a("periodProfit") : a("assetTrend")}</button>)}
              </div>
              {trendError ? <p className="form-error">{translateUiError(trendError, language)}</p> : null}
              {trendLoading ? <LoadingBlock label={a("loadingTrend")} /> : chartDetail ? <AccountTrendChart detail={chartDetail} view={trendView} gainColorScheme={preferences.gainColorScheme} /> : null}
            </article>

            <article className="flow-card holding-detail-panel">
              <h2>{a("accountInfo")}</h2>
              <dl className="detail-list">
                <DetailRow label={a("name")} value={detail.account.name} />
                <DetailRow label={a("broker")} value={detail.account.broker ?? "-"} />
                <DetailRow label={a("accountType")} value={getInvestmentLabel("accountType", detail.account.accountType, language)} />
                <DetailRow label={a("baseCurrency")} value={detail.account.baseCurrency} />
                <DetailRow label={a("market")} value={getInvestmentLabel("marketRegion", detail.account.marketRegion, language)} />
                <DetailRow label={a("notes")} value={detail.account.notes ?? "-"} />
              </dl>
            </article>
          </section>

          <section className="flow-card holding-detail-panel">
            <div className="holding-detail-section-header">
              <h2>{a("currentHoldings")}</h2>
              <span>{detail.holdings.length}  {a("items")}</span>
            </div>
            <div className="table-wrap">
              <table className="holding-detail-table">
                <thead>
                  <tr>
                    <th>{a("instrument")}</th>
                    <th>{a("assetType")}</th>
                    <th>{a("currency")}</th>
                    <th className="numeric-cell">{a("quantityBalance")}</th>
                    <th className="numeric-cell">{a("averageCost")}</th>
                    <th className="numeric-cell">{a("latestPrice")}</th>
                    <th className="numeric-cell">{a("marketValue", { currency: activeCurrency })}</th>
                    <th className="numeric-cell">{a("unrealizedGain")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.holdings.length === 0 ? (
                    <tr>
                      <td colSpan={8}>{a("emptyHoldings")}</td>
                    </tr>
                  ) : (
                    detail.holdings.map((holding) => (
                      <tr
                        className="clickable-detail-row"
                        key={`${holding.accountId}:${holding.instrumentId}`}
                        role="button"
                        tabIndex={0}
                        aria-label={a("viewHolding", { name: formatHoldingInstrument(holding) })}
                        onClick={(event) => handleHoldingRowClick(event, holding, navigate)}
                        onKeyDown={(event) => handleHoldingRowKeyDown(event, holding, navigate)}
                      >
                        <td>{formatHoldingInstrument(holding)}</td>
                        <td>{getInvestmentLabel("assetType", holding.assetType, language)}</td>
                        <td>{holding.currency}</td>
                        <td className="numeric-cell">{formatHoldingQuantity(holding, language)}</td>
                        <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost, displayLocale) : "-"}</td>
                        <td className="numeric-cell">{formatHoldingLatestPrice(holding, "compact", language)}</td>
                        <td className="numeric-cell">{formatNullableAmount(holding.marketValue, language)}</td>
                        <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, preferences.gainColorScheme, 3)}`}>
                          {formatNullableSignedAmount(holding.unrealizedGain, language)}
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
                <h2>{a("recentTransactions")}</h2>
                <span>{a("tenRows")}</span>
              </div>
              <div className="table-wrap">
                <table className="holding-detail-table account-recent-table">
                  <thead>
                    <tr>
                      <th>{a("date")}</th>
                      <th>{a("assetType")}</th>
                      <th>{a("instrument")}</th>
                      <th className="numeric-cell">{a("amount")}</th>
                      <th>{a("settlementCash")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={5}>{a("emptyTransactions")}</td>
                      </tr>
                    ) : (
                      detail.recentTransactions.map((row) => (
                        <tr key={row.transaction.id}>
                          <td>{formatCalendarDate(row.transaction.tradeDate, "-", language)}</td>
                          <td>{getInvestmentLabel("transactionType", row.transaction.transactionType, language)}</td>
                          <td>{formatTransactionInstrument(row.transaction)}</td>
                          <td className="numeric-cell">{formatTransactionAmount(row.transaction, language)}</td>
                          <td>{row.linkedCashLeg ? formatTransactionAmount(row.linkedCashLeg, language) : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          {detail.warnings?.length ? (
            <section className="dashboard-warning-panel" aria-label={a("dataWarnings")}>
              <h2>{a("dataWarnings")}</h2><p>{a("unavailableHelp")}</p>
              <div className="holding-warnings">{detail.warnings.map((warning, index) => <span className="warning-pill" key={index}>{translateAccountDetailWarning(warning, language)}</span>)}</div>
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
    observeAsync(navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`));
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
  observeAsync(navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`));
}

function formatNullableAmount(value: string | null, language: UiLanguage = "zh-CN"): string {
  const displayLocale = getDisplayLocale(language);
  return value === null ? "--" : formatDisplayAmount(value, displayLocale);
}

function formatNullableSignedAmount(value: string | null, language: UiLanguage = "zh-CN"): string {
  const displayLocale = getDisplayLocale(language);
  return value === null ? "--" : formatSignedDisplayAmount(value, displayLocale);
}

function formatTransactionInstrument(transaction: AccountDetailSummary["recentTransactions"][number]["transaction"]): string {
  return transaction.instrumentSymbol
    ? `${transaction.instrumentSymbol} - ${transaction.instrumentShortName ?? transaction.instrumentName ?? "-"}`
    : transaction.instrumentShortName ?? transaction.instrumentName ?? "-";
}

function formatTransactionAmount(transaction: AccountDetailSummary["recentTransactions"][number]["transaction"], language: UiLanguage = "zh-CN"): string {
  const displayLocale = getDisplayLocale(language);
  if (transaction.grossAmount) {
    return `${transaction.currency} ${formatDisplayAmount(transaction.grossAmount, displayLocale)}`;
  }

  if (transaction.fee !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.fee, displayLocale)}`;
  }

  if (transaction.tax !== "0") {
    return `${transaction.currency} ${formatDisplayAmount(transaction.tax, displayLocale)}`;
  }

  return "-";
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
