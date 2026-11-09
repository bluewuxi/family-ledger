import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { dashboardCopy as copy } from "../i18n/investmentCopy";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { formatCalendarDate } from "../lib/timeFormat";
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
import { apiGet } from "../lib/apiClient";
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

const trendRanges = [
 {value:"1m",label:"rangeMonth"},{value:"3m",label:"rangeQuarter"},{value:"1y",label:"rangeYear"},{value:"3y",label:"rangeThreeYears"},{value:"5y",label:"rangeFiveYears"},{value:"inception",label:"rangeInception"}
] as const;
const dashboardCurrencyStorageKey = "family-ledger.dashboard.reportingCurrency";
export function DashboardPage() {
  const { language } = useUiLanguage();
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
  const [snapshotsError, setSnapshotsError] = useState<UiErrorDescriptor | null>(null);
  const [activityError, setActivityError] = useState<UiErrorDescriptor | null>(null);
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
      setSnapshotsError(describeUiError(requestError, "investmentRead"));

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
      setActivityError(describeUiError(requestError, "investmentRead"));
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
  const businessDayNote = useMemo(() => buildBusinessDayCountdownParts(businessDayNow, language), [businessDayNow, language]);
  const accountNames = useMemo(
    () => new Map((dashboard?.accounts ?? []).map((account) => [account.accountId, account.accountName])),
    [dashboard?.accounts]
  );
  const metrics = [
    { id: "daily", label: copy("businessDayChange", language), value: formatPlainTodayChange(dashboard, dashboardLoading, language), currency: activeCurrency, toneClass: signedToneClass(dashboard?.todayChange, preferences.gainColorScheme, 3) },
    { id: "cash", label: copy("cash", language), value: formatPlainMoneyMetric(cashValue, dashboardLoading, language), currency: activeCurrency, toneClass: undefined }
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
    () => buildTrendSummary(trendChartData, language),
    [trendChartData, language]
  );
  const profitChartData = useMemo(
    () => buildProfitChartData(trendChartData),
    [trendChartData]
  );
  const profitSummary = useMemo(
    () => buildProfitSummary(profitChartData, language),
    [profitChartData, language]
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
            {copy("title", language)}<span className="dashboard-title-tagline">{copy("tagline", language)}</span>
          </PageTitle>
          <p>{copy("intro", language)}</p>
        </div>
        <p className="business-day-note dashboard-business-day-note-mobile">
          {copy("countdown", language, {date: formatCalendarDate(businessDayNote.businessDate, "-", language), duration: businessDayNote.remainingTime})}
        </p>
        <div className="dashboard-controls dashboard-header-controls">
          <CurrencySelect
            label={copy("reportingCurrency", language)}
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
            <span>{copy("refresh", language)}</span>
          </button>
        </div>
      </header>

      {refreshing && !dashboardLoading ? <p role="status">{copy("refreshing", language)}</p> : null}
      {dashboardError ? <p className="form-error">{dashboardError}</p> : null}

      <p className="business-day-note dashboard-business-day-note-desktop">
        {copy("countdown", language, {date: formatCalendarDate(businessDayNote.businessDate, "-", language), duration: businessDayNote.remainingTime})}
      </p>

      <div className="metric-grid dashboard-metric-grid">
        <article className="metric-card"><span>{copy("currentValuation", language)}</span><small className="metric-currency"><CurrencyFlagIcon currency={activeCurrency} />{activeCurrency}</small><strong>{formatPlainMoneyMetric(dashboard?.totalAssets, dashboardLoading, language)}</strong></article>
        <InvestmentPerformanceCard performance={dashboard?.investmentPerformance} currency={activeCurrency} loading={dashboardLoading} wholeAmounts />
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.id}>
            <span>{metric.label}</span>
            {metric.currency ? (
              <small className="metric-currency">
                <CurrencyFlagIcon currency={metric.currency} />
                {metric.currency}
              </small>
            ) : null}
            <strong className={metric.toneClass}>{metric.value}</strong>
            {metric.id === "daily" ? <small>{copy("dailyEligibility", language)}</small> : null}
          </article>
        ))}
      </div>

      <p className="dashboard-secondary-stats">{copy("secondaryStats", language, {trades: dashboardLoading ? "--" : dashboard?.dailyTradeCount ?? 0, accounts: dashboardLoading ? "--" : dashboard?.accountCount ?? 0})}</p>
      {!dashboardLoading && dashboard ? <ValuationStatus metadata={dashboard.valuationMetadata} performance={dashboard.investmentPerformance} warnings={dashboard.warnings} /> : null}

      <section className="dashboard-card-flow dashboard-chart-flow" aria-label={copy("chartsLabel", language)}>
        <article ref={trendPanelRef} className="flow-card chart-panel trend-chart-panel" style={chartToneStyle} id="trend-panel" role="tabpanel" aria-labelledby={`trend-tab-${trendView}`}>
          <div className="chart-section-header">
            <div className="trend-tabs" role="tablist" aria-label={copy("trendView", language)}>
              {(["profit", "assets"] as const).map(view => <button key={view} id={`trend-tab-${view}`} type="button" role="tab" aria-selected={trendView === view} aria-controls="trend-panel" tabIndex={trendView === view ? 0 : -1} onClick={() => setTrendView(view)} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "profit" : event.key === "End" ? "assets" : view === "profit" ? "assets" : "profit";
                setTrendView(next);
                document.getElementById(`trend-tab-${next}`)?.focus();
              }}>{view === "profit" ? copy("periodProfit", language) : copy("assetTrend", language)}</button>)}
            </div>
            <div className="chart-header-controls">
              <span className="chart-currency-indicator" aria-label={copy("chartCurrency", language, {currency:activeCurrency})}>
                <CurrencyFlagIcon currency={activeCurrency} />
                {activeCurrency}
              </span>
              <div className="chart-range-select">
                <select
                  aria-label={copy("trendRange", language)}
                  value={trendRange}
                  onChange={(event) => setTrendRange(event.target.value as PortfolioTrendRange)}
                  disabled={trendLoading}
                >
                  {trendRanges.map((range) => (
                    <option key={range.value} value={range.value}>
                      {copy(range.label, language)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        {snapshotsError ? <p className="form-error">{translateUiError(snapshotsError, language)}</p> : null}
        {trendView === "assets" ? <>
          {hasPrincipalWarning ? (
            <p className="form-error">{copy("principalMissing", language)}</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label={copy("loadingAssets", language)} />
          ) : trendChartData.length === 0 ? (
            <div className="empty-chart-state">{copy("noSnapshots", language)}</div>
          ) : (
            <>
              <div className="trend-panel-metrics">
                <div className="trend-legend" aria-label={copy("legend", language)}>
                  <span>
                    <i className="trend-legend-portfolio" />
                    {copy("netAssets", language)}</span>
                  <span>
                    <i className="trend-legend-principal" />
                    {copy("netInvestment", language)}</span>
                </div>
              </div>
              <InvestmentTrendChart points={trendChartData} view="assets" gainColorScheme={preferences.gainColorScheme} />
              {trendSummary ? (
                <p className="trend-summary">
                  {copy("initialValue", language, {range:trendSummary.rangeLabel, value:trendSummary.initialValue})}
                  <span className="trend-summary-change">
                    {copy("assetChange", language)}<span className={signedToneClass(trendSummary.changeAmountRaw, preferences.gainColorScheme, 3)}>
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
            <p className="form-error">{copy("periodPrincipalMissing", language)}</p>
          ) : null}
          {trendLoading ? (
            <LoadingBlock label={copy("loadingProfit", language)} />
          ) : profitChartData.length === 0 ? (
            <div className="empty-chart-state">{copy("noProfit", language)}</div>
          ) : (
            <>
              <div className="trend-panel-metrics profit-panel-metrics">
                <div className="trend-legend" aria-label={copy("legend", language)}>
                  <span>
                    <i className="trend-legend-profit" />
                    {copy("periodProfit", language)}</span>
                </div>
              </div>
              <InvestmentTrendChart points={trendChartData} view="profit" gainColorScheme={preferences.gainColorScheme} />
              <p className="panel-description">{copy("profitHelp", language)}</p>
              {profitSummary ? (
                <p className="trend-summary">
                  {profitSummary.rangeLabel}，
                  <span className="trend-summary-change">
                    {copy("periodProfit", language)}<span className={signedToneClass(profitSummary.changeAmountRaw, preferences.gainColorScheme, 3)}>
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
            <h2>{copy("recentTrades", language)}</h2>
            <span>{copy("tenTrades", language)}</span>
          </div>
          {activityError ? <p className="form-error">{translateUiError(activityError, language)}</p> : null}
          {activityLoading ? (
            <LoadingBlock label={copy("loadingTrades", language)} />
          ) : recentTransactions.length === 0 ? (
            <div className="empty-chart-state">{copy("noTrades", language)}</div>
          ) : (
            <div className="activity-table-wrap">
              <div className="activity-list compact-activity-list trade-activity-list">
                {recentTransactions.map((transaction) => (
                  <div className="compact-activity-row trade-activity-row" key={transaction.id}>
                    <span className="activity-date">{formatCalendarDate(transaction.tradeDate, "-", language)}</span>
                    <span className="activity-account">{accountNames.get(transaction.accountId) ?? "-"}</span>
                    <span className="activity-trade-instrument">
                      <span
                        className={`trade-type ${transaction.transactionType === "buy" ? "trade-type-buy" : "trade-type-sell"}`}
                      >
                        {formatTransactionType(transaction, language)}
                      </span>
                      <strong>{formatTransactionInstrument(transaction, language)}</strong>
                    </span>
                    <span className="activity-quantity-currency">
                      <span>{formatTransactionQuantityPrice(transaction, language)}</span>
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
          <Link className="activity-more-link" to="/transactions">{copy("more", language)}</Link>
        </article>
        <InvestmentDistributionPanel dashboard={dashboard} loading={allocationLoading} isAdmin={session?.user.role === "admin"} onRetry={() => observeAsync(reloadDashboard())} />
        <DistributionPanel title={copy("accountDistribution", language)} description={copy("accountDistributionHelp", language)} rows={dashboard?.allocations ?? []} total={dashboard?.totalAssets} loading={allocationLoading} />


      </section>

    </section>
  );
}

function formatPlainMoneyMetric(value: string | null | undefined, loading: boolean, language: UiLanguage = "zh-CN"): ReactNode {
  if (loading) {
    return <LoadingState label={copy("loading", language)} />;
  }

  return value === null || value === undefined ? "--" : formatMetricWholeNumber(value, {}, language);
}

function formatPlainTodayChange(dashboard: DashboardSummary | null, loading: boolean, language: UiLanguage = "zh-CN"): ReactNode {
  if (loading) {
    return <LoadingState label={copy("loading", language)} />;
  }

  if (!dashboard || dashboard.todayChange === null) {
    return "--";
  }

  return (
    <span className="metric-inline-pair">
      <span>{formatMetricWholeNumber(dashboard.todayChange, { signed: true }, language)}</span>
      {dashboard.todayChangePct === null ? null : (
        <span className="metric-inline-secondary">{formatSignedDisplayPercent(dashboard.todayChangePct, getDisplayLocale(language))}%</span>
      )}
    </span>
  );
}

function formatMetricWholeNumber(value: string | number, options: { signed?: boolean } = {}, language: UiLanguage = "zh-CN"): string {
  const numericValue = Number(String(value).trim());

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  const roundedValue = Math.round(numericValue);
  const formatted = Math.abs(roundedValue).toLocaleString(getDisplayLocale(language), { maximumFractionDigits: 0 });

  if (options.signed && roundedValue > 0) {
    return `+${formatted}`;
  }

  if (roundedValue < 0) {
    return `-${formatted}`;
  }

  return formatted;
}

function buildBusinessDayCountdownParts(now: Date, language: UiLanguage = "zh-CN"): { businessDate: string; remainingTime: string } {
  const businessDate = getAppBusinessDate(now);
  const endInstant = new Date(getAppBusinessDayEndInstant(now));
  const remainingMinutes = Math.max(0, Math.ceil((endInstant.getTime() - now.getTime()) / 60_000));

  return {
    businessDate,
    remainingTime: formatHoursMinutes(remainingMinutes, language)
  };
}

function buildTrendSummary(chartPoints: TrendChartPoint[], language: UiLanguage = "zh-CN"): {
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
    rangeLabel: copy("range", language, {from:formatCalendarDate(firstPoint.date, "-", language),to:formatCalendarDate(endDate, "-", language)}),
    initialValue: formatChartMoney(firstPoint.value),
    changeAmount: formatMetricWholeNumber(changeAmount, { signed: true }, language),
    changeAmountRaw: String(changeAmount),
    changePct: changePct === null ? "--" : `${formatSignedDisplayPercent(changePct, getDisplayLocale(language))}%`,
    changePctRaw: changePct === null ? "0" : String(changePct)
  };
}

function buildProfitSummary(chartPoints: ProfitChartPoint[], language: UiLanguage = "zh-CN"): { rangeLabel: string; changeAmount: string; changeAmountRaw: string } | null {
  const points = chartPoints.filter(point => point.profitValue !== null && Number.isFinite(point.profitValue));
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  const amount = last.profitValue! - first.profitValue!;
  const endDate = isSyntheticTrendDate(last.date) ? getAppBusinessDate() : last.date;
  return { rangeLabel: copy("profitRange", language, {from:formatCalendarDate(first.date, "-", language),to:formatCalendarDate(endDate, "-", language)}), changeAmount: formatMetricWholeNumber(amount, { signed: true }, language), changeAmountRaw: String(amount) };
}

function formatTransactionInstrument(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  return transaction.instrumentShortName ?? transaction.instrumentName ?? transaction.instrumentSymbol ?? copy("unknownInstrument", language);
}

function formatTransactionType(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  return transaction.transactionType === "buy" ? copy("buy", language) : copy("sell", language);
}

function formatTransactionQuantityPrice(transaction: InvestmentTransaction, language: UiLanguage = "zh-CN"): string {
  if (transaction.quantity === null || transaction.price === null) {
    return "--";
  }

  return `${formatDisplayAmount(transaction.quantity, getDisplayLocale(language))}@${formatDisplayAmount(transaction.price, getDisplayLocale(language))}`;
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
