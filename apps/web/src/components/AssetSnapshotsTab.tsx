import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { translateSnapshotWarning } from "../i18n/investmentWarnings";
import { formatCalendarDate } from "../lib/timeFormat";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getAppBusinessDate, shiftCalendarDateMonths, SNAPSHOT_DISPLAY_CURRENCIES, type Pagination, type PortfolioSnapshotSummary, type SnapshotComparison, type SnapshotDisplayCurrency } from "@family-ledger/shared";
import { apiGet } from "../lib/apiClient";
import { formatDisplayAmount, formatSignedDisplayAmount, formatSignedDisplayPercent } from "../lib/numberFormat";
import { usePreferences, signedToneClass } from "../lib/preferencesContext";
import { CurrencySelect } from "./CurrencySelect";
import { PaginationControls } from "./PaginationControls";
import { LoadingState } from "./LoadingState";

interface SnapshotPage {
  snapshots: PortfolioSnapshotSummary[];
  pagination: Pagination;
  comparisons: Record<string, SnapshotComparison>;
}

export function AssetSnapshotsTab({ refreshVersion = 0 }: { refreshVersion?: number }) {
  const { t } = useTranslation("maintenance");
  const { language, displayLocale } = useUiLanguage();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [filters, setFilters] = useState(() => ({ from: shiftCalendarDateMonths(getAppBusinessDate(), -3), to: getAppBusinessDate(), currency: "NZD" as SnapshotDisplayCurrency }));
  const [activeFilters, setActiveFilters] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<SnapshotPage>({ snapshots: [], comparisons: {}, pagination: { offset: 0, limit: 20, total: 0, hasMore: false } });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<UiErrorDescriptor | { key: "snapshotDatesInvalid" } | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    if (preferencesLoading || initialized) return;
    const currency = SNAPSHOT_DISPLAY_CURRENCIES.includes(preferences.preferredCurrency as SnapshotDisplayCurrency) ? preferences.preferredCurrency as SnapshotDisplayCurrency : "NZD";
    setFilters(current => ({ ...current, currency }));
    setActiveFilters(current => ({ ...current, currency }));
    setInitialized(true);
  }, [preferencesLoading, initialized, preferences.preferredCurrency]);
  useEffect(() => {
    if (!initialized) return;
    const id = ++requestId.current;
    setLoading(true); setError(null);
    const query = new URLSearchParams({ ...activeFilters, purpose: "investment", limit: "20", offset: String(offset), order: "desc", includeComparison: "true" });
    void apiGet<SnapshotPage>(`/portfolio-snapshots?${query}`).then(result => { if (id === requestId.current) setData(result); })
      .catch(reason => { if (id === requestId.current) setError(describeUiError(reason, "maintenanceRead")); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    const requests = requestId;
    return () => { requests.current++; };
  }, [initialized, activeFilters, offset, refresh, refreshVersion]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if (filters.from > filters.to) { setError({ key: "snapshotDatesInvalid" }); return; }
    setActiveFilters({ ...filters }); setOffset(0);
  }
  return <section className="data-maintenance-panel">
    <div className="settings-section-header"><div><h2>{t("snapshots")}</h2><p>{t("snapshotIntro")}</p></div></div>
    <form className="snapshot-filters" onSubmit={apply}>
      <label>{t("fromDate")}<input type="date" required value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>{t("toDate")}<input type="date" required value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <CurrencySelect label={t("snapshotReportCurrency")} options={SNAPSHOT_DISPLAY_CURRENCIES} value={filters.currency} onChange={currency => setFilters({ ...filters, currency })} />
      <button className="secondary-button" disabled={loading} type="submit">{t("snapshotQuery")}</button>
      <button className="secondary-button" disabled={loading} type="button" onClick={() => setRefresh(value => value + 1)}>{t("refresh")}</button>
    </form>
    {error ? <p className="form-error" role="alert">{error.key === "snapshotDatesInvalid" ? t(error.key) : translateUiError(error, language)}</p> : null}
    <div className="table-wrap"><table><thead><tr><th>{t("snapshotDate")}</th><th className="numeric-cell">{t("snapshotNetAssets", { currency: activeFilters.currency })}</th><th className="numeric-cell">{t("snapshotChange")}</th><th className="numeric-cell">{t("snapshotChangePercent")}</th><th>{t("snapshotDataStatus")}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={5}><LoadingState label={t("snapshotLoading")} /></td></tr> : error ? <tr><td colSpan={5}>{t("snapshotLoadFailed")}</td></tr> : data.snapshots.length === 0 ? <tr><td colSpan={5}>{t("snapshotEmpty")}</td></tr> : data.snapshots.map(snapshot => {
        const comparison = data.comparisons[snapshot.id];
        return <tr key={snapshot.id}><td>{formatCalendarDate(snapshot.snapshotDate, "--", language)}</td><td className="numeric-cell">{formatDisplayAmount(snapshot.marketValue, displayLocale)}</td>
          <td className={`numeric-cell ${signedToneClass(comparison?.changeAmount, preferences.gainColorScheme, 3)}`}>{formatSignedDisplayAmount(comparison?.changeAmount, displayLocale)}<br /><small>{t("snapshotBaseline", { date: formatCalendarDate(comparison?.previousSnapshotDate ?? null, "--", language) })}</small></td>
          <td className={`numeric-cell ${signedToneClass(comparison?.changePct, preferences.gainColorScheme, 1)}`}>{comparison?.changePct == null ? "--" : `${formatSignedDisplayPercent(comparison.changePct, displayLocale)}%`}</td>
          <td>{snapshot.isAvailable === false ? t("snapshotWaitingForRepair") : snapshot.warnings.length ? new Intl.ListFormat(displayLocale).format(snapshot.warnings.map(warning => translateSnapshotWarning(warning, language))) : snapshot.marketValue === null ? t("snapshotValuationUnavailable") : t("snapshotComplete")}</td></tr>;
      })}
    </tbody></table></div>
    <PaginationControls pagination={data.pagination} loading={loading || error !== null} onPageChange={setOffset} />
  </section>;
}
