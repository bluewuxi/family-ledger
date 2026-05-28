import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPES,
  CURRENCY_CODES,
  SNAPSHOT_DISPLAY_CURRENCIES,
  type AssetType,
  type CurrencyCode,
  type DashboardWarning,
  type HoldingWarning,
  type HoldingsValuationSummary,
  type SnapshotDisplayCurrency,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { CurrencyFlagIcon, CurrencySelect } from "../components/CurrencySelect";
import { LoadingState } from "../components/LoadingState";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet } from "../lib/apiClient";
import { formatDisplayAmount, formatDisplayPrice } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";

interface HoldingsResponse extends HoldingsValuationSummary {}

type AssetTypeFilter = "all" | AssetType;
const holdingsCurrencyStorageKey = "family-ledger.holdings.reportingCurrency";

const HOLDING_WARNING_LABELS: Record<HoldingWarning, string> = {
  NEGATIVE_POSITION: "负数余额/持仓，请核对交易记录",
  COST_BASIS_UNAVAILABLE: "成本不可用"
};

export function HoldingsPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [reportingCurrency, setReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [currencyInitialized, setCurrencyInitialized] = useState(false);
  const [currencyManuallySelected, setCurrencyManuallySelected] = useState(false);
  const [summary, setSummary] = useState<HoldingsValuationSummary | null>(null);
  const [accountFilter, setAccountFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [currencyFilter, setCurrencyFilter] = useState<"all" | CurrencyCode>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!preferencesLoading && !currencyManuallySelected) {
      const storedCurrency = readStoredDisplayCurrency(holdingsCurrencyStorageKey);
      setReportingCurrency(storedCurrency ?? toDisplayCurrency(preferences.preferredCurrency));
      setCurrencyManuallySelected(storedCurrency !== null);
      setCurrencyInitialized(true);
    }
  }, [currencyManuallySelected, preferences.preferredCurrency, preferencesLoading]);

  useEffect(() => {
    if (currencyInitialized) {
      void loadHoldings(reportingCurrency);
    }
  }, [currencyInitialized, reportingCurrency]);

  async function loadHoldings(currency: SnapshotDisplayCurrency) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<HoldingsResponse>(`/holdings?currency=${currency}`);
      setSummary(data);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  const holdings = summary?.holdings ?? [];
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
          <PageTitle route="/holdings">持仓总览</PageTitle>
          <p>按账户、类型和币种查看当前持仓，使用已存储价格和估值汇率显示市值与未实现收益。</p>
        </div>
        <div className="dashboard-controls">
          <CurrencySelect
            label="报告币种"
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
            onClick={() => void loadHoldings(reportingCurrency)}
            disabled={pageLoading}
          >
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="metric-grid holdings-metrics">
        <article className="metric-card">
          <span>总市值</span>
          <small className="metric-currency">
            <CurrencyFlagIcon currency={activeCurrency} />
            {activeCurrency}
          </small>
          <strong>{formatMetric(visibleTotals.totalMarketValue, pageLoading)}</strong>
        </article>
        <article className="metric-card">
          <span>未实现收益/亏损</span>
          <small className="metric-currency">
            <CurrencyFlagIcon currency={activeCurrency} />
            {activeCurrency}
          </small>
          <strong className={signedToneClass(visibleTotals.totalUnrealizedGain, preferences.gainColorScheme)}>
            {formatMetric(visibleTotals.totalUnrealizedGain, pageLoading)}
          </strong>
        </article>
        <article className="metric-card">
          <span>现金</span>
          <small className="metric-currency">
            <CurrencyFlagIcon currency={activeCurrency} />
            {activeCurrency}
          </small>
          <strong>{formatMetric(visibleCashTotal, pageLoading)}</strong>
        </article>
        <article className="metric-card metric-card-compact">
          <span>持仓数量</span>
          <strong>{pageLoading ? <LoadingState label="加载中" /> : String(visibleHoldings.length)}</strong>
        </article>
        <article className="metric-card metric-card-compact">
          <span>数据提示</span>
          <strong>{pageLoading ? <LoadingState label="加载中" /> : String(summary?.warnings.length ?? 0)}</strong>
        </article>
      </div>

      <div className="holding-filters">
        <label>
          账户
          <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="all">全部账户</option>
            {accounts.map(([accountId, accountName]) => (
              <option key={accountId} value={accountId}>
                {accountName}
              </option>
            ))}
          </select>
        </label>
        <label>
          类型
          <select value={assetTypeFilter} onChange={(event) => setAssetTypeFilter(event.target.value as AssetTypeFilter)}>
            <option value="all">全部类型</option>
            {ASSET_TYPES.map((assetType) => (
              <option key={assetType} value={assetType}>
                {ASSET_TYPE_LABELS[assetType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          币种
          <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value as "all" | CurrencyCode)}>
            <option value="all">全部币种</option>
            {CURRENCY_CODES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="holding-table">
          <thead>
            <tr>
              <th>账户</th>
              <th>标的</th>
              <th>类型</th>
              <th>币种</th>
              <th className="numeric-cell">数量/现金余额</th>
              <th className="numeric-cell">平均成本</th>
              <th className="numeric-cell">剩余成本</th>
              <th className="numeric-cell">最新价格</th>
              <th className="numeric-cell">市值 ({activeCurrency})</th>
              <th className="numeric-cell">未实现收益/亏损 ({activeCurrency})</th>
              <th>数据提示</th>
            </tr>
          </thead>
          <tbody>
            {pageLoading ? (
              <tr>
                <td className="table-loading-cell" colSpan={11}>
                  <LoadingState label="正在加载持仓" />
                </td>
              </tr>
            ) : visibleHoldings.length === 0 ? (
              <tr>
                <td colSpan={11}>暂无符合筛选条件的持仓或现金余额。</td>
              </tr>
            ) : (
              visibleHoldings.map((holding) => (
                <tr key={`${holding.accountId}:${holding.instrumentId}`}>
                  <td>{holding.accountName}</td>
                  <td>{formatInstrument(holding)}</td>
                  <td>{ASSET_TYPE_LABELS[holding.assetType]}</td>
                  <td>{holding.currency}</td>
                  <td className="numeric-cell">{holding.quantity}</td>
                  <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost) : "-"}</td>
                  <td className="numeric-cell">{holding.costAmount ? formatDisplayAmount(holding.costAmount) : "-"}</td>
                  <td className="numeric-cell">{formatLatestPrice(holding)}</td>
                  <td className="numeric-cell">{holding.marketValue ? formatDisplayAmount(holding.marketValue) : "--"}</td>
                  <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, preferences.gainColorScheme)}`}>
                    {holding.unrealizedGain ? formatDisplayAmount(holding.unrealizedGain) : "--"}
                  </td>
                  <td>{formatWarnings(holding)}</td>
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
  totalUnrealizedGain: string | null;
} {
  if (holdings.length === 0) {
    return { totalMarketValue: "0.00", totalUnrealizedGain: "0.00" };
  }

  const marketValues = holdings.map((holding) => holding.marketValue);
  const gains = holdings.filter((holding) => holding.assetType !== "cash").map((holding) => holding.unrealizedGain);

  return {
    totalMarketValue: marketValues.every((value): value is string => value !== null) ? sumMoney(marketValues) : null,
    totalUnrealizedGain: gains.every((value): value is string => value !== null) ? sumMoney(gains) : null
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

function formatMetric(value: string | null, loading: boolean): ReactNode {
  if (loading) {
    return <LoadingState label="加载中" />;
  }

  return value === null ? "--" : formatDisplayAmount(value);
}

function formatWarnings(holding: ValuedHoldingSummary): ReactNode {
  const labels = unique([
    ...holding.warnings.map((warning) => HOLDING_WARNING_LABELS[warning]),
    ...holding.valuationWarnings.map(formatValuationWarning)
  ]);

  if (labels.length === 0) {
    return "-";
  }

  return (
    <div className="holding-warnings">
      {labels.map((label) => (
        <span className="warning-pill" key={label}>
          {label}
        </span>
      ))}
    </div>
  );
}

function formatLatestPrice(holding: ValuedHoldingSummary): ReactNode {
  if (!holding.latestPrice) {
    return "-";
  }

  return (
    <>
      <span>{formatDisplayPrice(holding.latestPrice)}</span>
      {holding.latestPriceDate ? (
        <>
          <br />
          <span className="price-date-label">{formatShortPriceDate(holding.latestPriceDate)}</span>
        </>
      ) : null}
    </>
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function formatValuationWarning(warning: DashboardWarning): string {
  const instrument = `${warning.instrumentName} (${warning.currency})`;

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

function formatInstrument(holding: ValuedHoldingSummary): string {
  return holding.instrumentSymbol ? `${holding.instrumentSymbol} - ${holding.instrumentName}` : holding.instrumentName;
}

function formatShortPriceDate(value: string): string {
  return value.length >= 10 ? value.slice(5) : value;
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

  return "持仓请求失败，请稍后重试。";
}
