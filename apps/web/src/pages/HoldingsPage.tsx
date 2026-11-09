import { getInvestmentLabel } from "../i18n/investmentLabels";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { holdingsCopy as copy } from "../i18n/investmentCopy";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { observeAsync } from "../lib/observeAsync";
import { useValuation } from "../lib/useValuation";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
  ASSET_TYPES,
  CURRENCY_CODES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type AssetType,
  type CurrencyCode,
  type HoldingsValuationSummary,
  type SnapshotDisplayCurrency,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { InvestmentPerformanceCard } from "../components/InvestmentPerformanceCard";
import { ValuationStatus } from "../components/ValuationStatus";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";

import {
  formatHoldingInstrument,
  formatHoldingLatestPrice,
  formatHoldingQuantity,
  formatHoldingWarnings
} from "../lib/holdingDisplay";
import { formatDisplayAmount, formatDisplayPrice, formatSignedDisplayAmount } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";
import { isInteractiveRowTarget, isRowActivationKey } from "../lib/tableInteraction";

type HoldingsResponse = HoldingsValuationSummary;

type AssetTypeFilter = "all" | AssetType;
const holdingsCurrencyStorageKey = "family-ledger.holdings.reportingCurrency";

export function HoldingsPage() {
  const { language } = useUiLanguage();
  const navigate = useNavigate();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [currencyFilter, setCurrencyFilter] = useState<"all" | CurrencyCode>("all");
  const { data: summary, loading, refreshing, error, reload } = useValuation<HoldingsResponse>(currencyInitialized ? `/holdings?currency=${reportingCurrency}` : null);

  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(holdingsCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  async function loadHoldings(_currency: SnapshotDisplayCurrency) { await reload(true); }

  function openHoldingDetail(holding: ValuedHoldingSummary) {
    observeAsync(navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`));
  }

  function handleHoldingRowClick(event: MouseEvent<HTMLTableRowElement>, holding: ValuedHoldingSummary) {
    if (!isInteractiveRowTarget(event.target, event.currentTarget)) {
      openHoldingDetail(holding);
    }
  }

  function handleHoldingRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, holding: ValuedHoldingSummary) {
    if (!isRowActivationKey(event.key) || isInteractiveRowTarget(event.target, event.currentTarget)) {
      return;
    }

    event.preventDefault();
    openHoldingDetail(holding);
  }

  const holdings = useMemo(() => summary?.holdings ?? [], [summary?.holdings]);
  const accounts = useMemo(
    () =>
      [...new Map(holdings.map((holding) => [holding.accountId, holding.accountName])).entries()].sort((left, right) =>
        left[1].localeCompare(right[1], "zh-CN")
      ),
    [holdings]
  );
  const visibleHoldings = useMemo(
    () =>
      holdings.filter(
        (holding) =>
          (accountFilter === "all" || holding.accountId === accountFilter) &&
          (assetTypeFilter === "all" || holding.assetType === assetTypeFilter) &&
          (currencyFilter === "all" || holding.currency === currencyFilter)
      ),
    [accountFilter, assetTypeFilter, currencyFilter, holdings]
  );
  const visibleTotals = useMemo(() => summarizeVisibleHoldings(visibleHoldings), [visibleHoldings]);
  const visibleCashTotal = useMemo(() => summarizeVisibleCash(visibleHoldings), [visibleHoldings]);
  const activeCurrency = summary?.reportingCurrency ?? reportingCurrency;
  const pageLoading = loading || !currencyInitialized;

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/holdings">{copy("title", language)}</PageTitle>
          <p>{copy("intro", language)}</p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label={copy("reportingCurrency", language)}
            options={SNAPSHOT_DISPLAY_CURRENCIES}
            value={reportingCurrency}
            onChange={(nextCurrency) => {
                writeStoredDisplayCurrency(holdingsCurrencyStorageKey, nextCurrency);
                setCurrencyManuallySelected(true);
                setReportingCurrency(nextCurrency);
            }}
            disabled={!currencyInitialized}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={() => observeAsync(loadHoldings(reportingCurrency))}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>{copy("refresh", language)}</span>
          </button>
        </div>
      </header>

      {refreshing && !loading ? <p role="status">{copy("refreshing", language)}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="metric-grid portfolio-overview-metrics">
        <article className="metric-card"><span>{copy("currentValuation", language)}</span><small className="metric-currency">{activeCurrency}</small><strong>{formatMetric(summary?.totalMarketValue ?? null, pageLoading, language)}</strong></article>
        <InvestmentPerformanceCard performance={summary?.investmentPerformance} currency={activeCurrency} loading={pageLoading} fullScope />
      </div>
      {!pageLoading && summary ? <ValuationStatus metadata={summary.valuationMetadata} performance={summary.investmentPerformance} warnings={summary.warnings} /> : null}
      <h2 className="filter-results-title">{copy("filteredResults", language)}</h2>
      <div className="holding-filters">
        <label>
          {copy("account", language)}<select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">{copy("allAccounts", language)}</option>
            {accounts.map(([accountId, accountName]) => (
              <option key={accountId} value={accountId}>
                {accountName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("type", language)}<select value={assetTypeFilter} onChange={(event) => setAssetTypeFilter(event.target.value as AssetTypeFilter)}>
            <option value="all">{copy("allTypes", language)}</option>
            {ASSET_TYPES.map((assetType) => (
              <option key={assetType} value={assetType}>
                {getInvestmentLabel("assetType", assetType, language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("currency", language)}<select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value as "all" | CurrencyCode)}>
            <option value="all">{copy("allCurrencies", language)}</option>
            {CURRENCY_CODES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="metric-grid holdings-metrics">
        <article className="metric-card">
          <span>{copy("filteredValue", language)}</span>
          <small className="metric-currency">
            <CurrencyFlagIcon currency={activeCurrency} />
            {activeCurrency}
          </small>
          <strong>{formatMetric(visibleTotals.totalMarketValue, pageLoading, language)}</strong>
        </article>
        <article className="metric-card">
          <span>{copy("filteredCash", language)}</span>
          <small className="metric-currency">
            <CurrencyFlagIcon currency={activeCurrency} />
            {activeCurrency}
          </small>
          <strong>{formatMetric(visibleCashTotal, pageLoading, language)}</strong>
        </article>
        <article className="metric-card metric-card-compact">
          <span>{copy("filteredCount", language)}</span>
          <strong>{pageLoading ? <LoadingState label={copy("loading", language)} /> : String(visibleHoldings.length)}</strong>
        </article>
      </div>

      <p className="table-scroll-hint">{copy("scrollHint", language)}</p>
      <div className="table-wrap">
        <table className="holding-table">
          <thead>
            <tr>
              <th>{copy("account", language)}</th>
              <th>{copy("instrument", language)}</th>
              <th>{copy("type", language)}</th>
              <th>{copy("currency", language)}</th>
              <th className="numeric-cell">{copy("quantityBalance", language)}</th>
              <th className="numeric-cell">{copy("averageCost", language)}</th>
              <th className="numeric-cell">{copy("carryingCost", language)}</th>
              <th className="numeric-cell">{copy("latestPrice", language)}</th>
              <th className="numeric-cell">{copy("marketValue", language)}{activeCurrency})</th>
              <th className="numeric-cell">{copy("unrealizedValue", language)}{activeCurrency})</th>
              <th>{copy("dataNotices", language)}</th>
            </tr>
          </thead>
          <tbody>
            {pageLoading ? (
              <tr>
                <td className="table-loading-cell" colSpan={11}>
                  <LoadingState label={copy("loadingHoldings", language)} />
                </td>
              </tr>
            ) : visibleHoldings.length === 0 ? (
              <tr>
                <td colSpan={11}>{copy("empty", language)}</td>
              </tr>
            ) : (
              visibleHoldings.map((holding) => (
                <tr
                  className="clickable-detail-row"
                  key={`${holding.accountId}:${holding.instrumentId}`}
                  role="button"
                  tabIndex={0}
                  aria-label={copy("viewDetail", language, {account:holding.accountName,instrument:formatHoldingInstrument(holding)})}
                  onClick={(event) => handleHoldingRowClick(event, holding)}
                  onKeyDown={(event) => handleHoldingRowKeyDown(event, holding)}
                >
                  <td>{holding.accountName}</td>
                  <td>{formatHoldingInstrument(holding)}</td>
                  <td>{getInvestmentLabel("assetType", holding.assetType, language)}</td>
                  <td>{holding.currency}</td>
                  <td className="numeric-cell">{formatHoldingQuantity(holding, language)}</td>
                  <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost, getDisplayLocale(language)) : "-"}</td>
                  <td className="numeric-cell">{holding.costAmount ? formatDisplayAmount(holding.costAmount, getDisplayLocale(language)) : "-"}</td>
                  <td className="numeric-cell">{formatHoldingLatestPrice(holding, "compact", language)}</td>
                  <td className="numeric-cell">{holding.marketValue ? formatDisplayAmount(holding.marketValue, getDisplayLocale(language)) : "--"}</td>
                  <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, preferences.gainColorScheme, 3)}`}>
                    {holding.unrealizedGain ? formatSignedDisplayAmount(holding.unrealizedGain, getDisplayLocale(language)) : "--"}
                  </td>
                  <td>{formatHoldingWarnings(holding, language)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function summarizeVisibleHoldings(holdings: ValuedHoldingSummary[]): {
  totalMarketValue: string | null;
} {
  if (holdings.length === 0) {
    return { totalMarketValue: "0.00" };
  }

  const marketValues = holdings.map((holding) => holding.marketValue);

  return {
    totalMarketValue: marketValues.every((value): value is string => value !== null) ? sumMoney(marketValues) : null
  };
}

function summarizeVisibleCash(holdings: ValuedHoldingSummary[]): string | null {
  const cashValues = holdings.filter((holding) => holding.assetType === "cash").map((holding) => holding.marketValue);

  if (cashValues.length === 0) {
    return "0.00";
  }

  return cashValues.every((value): value is string => value !== null) ? sumMoney(cashValues) : null;
}

function sumMoney(values: string[]): string {
  const total = values.reduce((sum, value) => sum + Number(value), 0);
  return Number.isFinite(total) ? String(total) : "0";
}

function formatMetric(value: string | null, loading: boolean, language: UiLanguage = "zh-CN"): ReactNode {
  if (loading) {
    return <LoadingState label={copy("loading", language)} />;
  }

  return value === null ? "--" : formatDisplayAmount(value, getDisplayLocale(language));
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
