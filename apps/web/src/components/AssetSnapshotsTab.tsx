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
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [filters, setFilters] = useState(() => ({ from: shiftCalendarDateMonths(getAppBusinessDate(), -3), to: getAppBusinessDate(), currency: "NZD" as SnapshotDisplayCurrency }));
  const [activeFilters, setActiveFilters] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<SnapshotPage>({ snapshots: [], comparisons: {}, pagination: { offset: 0, limit: 20, total: 0, hasMore: false } });
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      .catch(reason => { if (id === requestId.current) setError(reason instanceof Error ? reason.message : "资产快照请求失败。"); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current++; };
  }, [initialized, activeFilters, offset, refresh, refreshVersion]);
  function apply(event: FormEvent) {
    event.preventDefault();
    if (filters.from > filters.to) { setError("开始日期不能晚于结束日期。"); return; }
    setActiveFilters({ ...filters }); setOffset(0);
  }
  return <section className="data-maintenance-panel">
    <div className="settings-section-header"><div><h2>资产快照</h2><p>净值变动包含资金进出，不等于投资盈利。比较基准为上一条已存快照，可能位于当前筛选范围之外。</p></div></div>
    <form className="snapshot-filters" onSubmit={apply}>
      <label>开始日期<input type="date" required value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
      <label>结束日期<input type="date" required value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      <CurrencySelect label="报告币种" options={SNAPSHOT_DISPLAY_CURRENCIES} value={filters.currency} onChange={currency => setFilters({ ...filters, currency })} />
      <button className="secondary-button" disabled={loading} type="submit">查询</button>
      <button className="secondary-button" disabled={loading} type="button" onClick={() => setRefresh(value => value + 1)}>刷新</button>
    </form>
    {error ? <p className="form-error">{error}</p> : null}
    <div className="table-wrap"><table><thead><tr><th>快照日期</th><th className="numeric-cell">资产净值 ({activeFilters.currency})</th><th className="numeric-cell">较上一快照变动</th><th className="numeric-cell">变动比例</th><th>数据状态</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={5}><LoadingState label="正在加载资产快照" /></td></tr> : error ? <tr><td colSpan={5}>请求失败，请重试。</td></tr> : data.snapshots.length === 0 ? <tr><td colSpan={5}>暂无符合条件的资产快照。</td></tr> : data.snapshots.map(snapshot => {
        const comparison = data.comparisons[snapshot.id];
        return <tr key={snapshot.id}><td>{snapshot.snapshotDate}</td><td className="numeric-cell">{formatDisplayAmount(snapshot.marketValue)}</td>
          <td className={`numeric-cell ${signedToneClass(comparison?.changeAmount, preferences.gainColorScheme, 3)}`}>{formatSignedDisplayAmount(comparison?.changeAmount)}<br /><small>基准 {comparison?.previousSnapshotDate ?? "--"}</small></td>
          <td className={`numeric-cell ${signedToneClass(comparison?.changePct, preferences.gainColorScheme, 1)}`}>{comparison?.changePct == null ? "--" : `${formatSignedDisplayPercent(comparison.changePct)}%`}</td>
          <td>{snapshot.warnings.length ? snapshot.warnings.map(warning => `${warning.instrumentShortName}：${warning.code === "MISSING_FX_RATE" ? "缺少汇率" : warning.code === "COST_BASIS_UNAVAILABLE" ? "成本不可用" : warning.code === "MISSING_LATEST_PRICE" ? "缺少价格" : "缺少前一价格"}`).join("；") : snapshot.marketValue === null ? "估值不可用" : "完整"}</td></tr>;
      })}
    </tbody></table></div>
    <PaginationControls pagination={data.pagination} loading={loading || error !== null} onPageChange={setOffset} />
  </section>;
}
