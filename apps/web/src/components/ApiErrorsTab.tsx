import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiErrorGroup, ApiErrorGroupsPage, ApiErrorEventsPage, ApiErrorQueryResult, ApiErrorTrackingStatus } from "@family-ledger/shared";
import { apiGet, apiPatch, apiPost } from "../lib/apiClient";
import { formatLocalDateTime } from "../lib/timeFormat";
import { Drawer } from "./Drawer";
import { PaginationControls } from "./PaginationControls";

const labels: Record<ApiErrorTrackingStatus, string> = { open: "待处理", in_progress: "处理中", resolved: "已解决" };
const emptyPage = { limit: 20, offset: 0, total: 0, hasMore: false };
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function initialFilters() {
  const now = new Date();
  return { from: localInput(new Date(now.getTime() - 7 * 86400000)), to: localInput(now), path: "", status: "" };
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "错误记录请求失败，请重试。"; }

export function ApiErrorsTab({ refreshVersion }: { refreshVersion: number }) {
  const [filters, setFilters] = useState(initialFilters);
  const [activeFilters, setActiveFilters] = useState(filters);
  const [allSaved, setAllSaved] = useState(false);
  const [page, setPage] = useState<ApiErrorGroupsPage>({ items: [], pagination: emptyPage });
  const [offset, setOffset] = useState(0), [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false), [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState<ApiErrorQueryResult | null>(null);
  const [queryRange, setQueryRange] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<ApiErrorGroup | null>(null);
  const [events, setEvents] = useState<ApiErrorEventsPage>({ items: [], pagination: emptyPage });
  const [detailLoading, setDetailLoading] = useState(false), [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [status, setStatus] = useState<ApiErrorTrackingStatus>("open"), [notes, setNotes] = useState("");
  const request = useRef(0), detailRequest = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true); setError(null);
    const search = new URLSearchParams({ path: activeFilters.path.trim(), status: activeFilters.status, offset: String(offset), limit: "20" });
    if (!allSaved) { search.set("from", new Date(activeFilters.from).toISOString()); search.set("to", new Date(activeFilters.to).toISOString()); }
    void apiGet<ApiErrorGroupsPage>(`/data-maintenance/errors?${search}`).then(data => { if (id === request.current) setPage(data); })
      .catch(reason => { if (id === request.current) setError(errorText(reason)); })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [activeFilters, allSaved, offset, version, refreshVersion]);
  useEffect(() => () => { detailRequest.current++; }, []);

  async function queryLogs(continueQuery = false) {
    setError(null); setNotice(null); setQuerying(true);
    try {
      const range = continueQuery && queryRange ? queryRange : { from: new Date(filters.from).toISOString(), to: new Date(filters.to).toISOString() };
      const elapsed = Date.parse(range.to) - Date.parse(range.from);
      if (elapsed < 0 || elapsed > 30 * 86400000 || (!continueQuery && Date.parse(range.from) < Date.now() - 30 * 86400000 - 60000)) throw new Error("查询范围须在最近 30 天内，且开始时间不能晚于结束时间。");
      const result = await apiPost<ApiErrorQueryResult>("/data-maintenance/errors/query", { ...range, ...(continueQuery && query?.nextCursor ? { cursor: query.nextCursor } : {}) });
      setQuery(result); setQueryRange(range); setAllSaved(false); setActiveFilters({ ...filters, from: localInput(new Date(range.from)), to: localInput(new Date(range.to)) }); setOffset(0); setVersion(value => value + 1);
      setNotice(`本次新增观察 ${result.observed} 条 ERROR。${result.nextCursor ? "查询尚未完成，请继续加载。" : "所选时间范围查询完成。"}`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setQuerying(false); }
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(Date.parse(filters.from)) || !Number.isFinite(Date.parse(filters.to)) || filters.from > filters.to) { setError("请选择有效的开始和结束时间。"); return; }
    setActiveFilters({ ...filters }); setOffset(0); setVersion(value => value + 1); setQuery(null); setQueryRange(null); setNotice(null);
  }
  async function loadEvents(group: ApiErrorGroup, eventOffset: number) {
    const id = ++detailRequest.current;
    setDetailLoading(true); setDetailError(null);
    try {
      const data = await apiGet<ApiErrorEventsPage>(`/data-maintenance/errors/${group.id}/events?limit=5&offset=${eventOffset}`);
      if (id === detailRequest.current) setEvents(data);
    } catch (reason) { if (id === detailRequest.current) setDetailError(errorText(reason)); }
    finally { if (id === detailRequest.current) setDetailLoading(false); }
  }
  function open(group: ApiErrorGroup) {
    setSelected(group); setStatus(group.status); setNotes(group.notes); setEvents({ items: [], pagination: { ...emptyPage, limit: 5 } });
    void loadEvents(group, 0);
  }
  async function save() {
    if (!selected) return;
    setSaving(true); setDetailError(null);
    try {
      const data = await apiPatch<{ item: ApiErrorGroup }>(`/data-maintenance/errors/${selected.id}`, { status, notes });
      setSelected(data.item); setVersion(value => value + 1);
    } catch (reason) { setDetailError(errorText(reason)); }
    finally { setSaving(false); }
  }
  return <section className="data-maintenance-panel api-errors-panel">
    <h2>错误记录</h2>
    <p>仅显示 ERROR。查询时发现新错误及复发；次数为已观察到的日志条数，不代表失败请求数。原始日志保留 30 天，处理摘要继续保留。</p>
    <form className="snapshot-filters api-error-filters" onSubmit={apply}>
      <label>开始时间（本地）<input required type="datetime-local" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
      <label>结束时间（本地）<input required type="datetime-local" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
      <label>接口<input placeholder="例如 /portfolio-snapshots" value={filters.path} maxLength={300} onChange={e => setFilters({ ...filters, path: e.target.value })} /></label>
      <label>处理状态<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">全部</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="api-error-checkbox"><input type="checkbox" checked={allSaved} onChange={e => { setAllSaved(e.target.checked); setOffset(0); }} />包含所有已保存摘要</label>
      <button className="secondary-button" disabled={loading || querying} type="submit">筛选摘要</button>
      <button className="primary-button" disabled={loading || querying || !filters.from || !filters.to} type="button" onClick={() => void queryLogs()}>查询新错误</button>
      {query?.nextCursor ? <button className="secondary-button" disabled={querying} type="button" onClick={() => void queryLogs(true)}>继续加载日志</button> : null}
    </form>
    {queryRange ? <p>查询范围：{formatLocalDateTime(queryRange.from)} 至 {formatLocalDateTime(queryRange.to)}（本地时间）{query?.nextCursor ? " · 尚未加载完" : ""}</p> : null}
    {notice ? <p className="form-success" role="status">{notice}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="table-wrap"><table className="api-errors-table"><thead><tr><th>错误摘要 / 接口</th><th>首次发生</th><th>最近发生</th><th>已观察次数</th><th>状态</th><th>操作</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={6}>正在加载错误记录…</td></tr> : error ? <tr><td colSpan={6}>查询失败，请重试。</td></tr> : !page.items.length ? <tr><td colSpan={6}>暂无已观察到的错误。可点击「查询新错误」读取所选范围的日志。</td></tr> : page.items.map(group => <tr key={group.id}>
        <td><strong>{group.summary}</strong><br /><span>{group.method} {group.path || "接口未知"}</span><br /><small>{group.operation}</small></td>
        <td>{formatLocalDateTime(group.firstSeenAt)}</td><td>{formatLocalDateTime(group.lastSeenAt)}</td><td>{group.observedCount}</td>
        <td>{labels[group.status]}{group.recurring ? <><br /><span>再次发生</span></> : null}</td><td><button className="secondary-button" type="button" onClick={() => open(group)}>查看 / 处理</button></td>
      </tr>)}
    </tbody></table></div>
    <PaginationControls pagination={page.pagination} loading={loading || querying || error !== null} onPageChange={setOffset} />
    <Drawer title="错误详情" subtitle={selected?.summary} open={selected !== null} onClose={() => { if (!saving) { detailRequest.current++; setSelected(null); } }} footer={<button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存处理记录"}</button>}>
      {selected ? <div className="api-error-detail">
        <p>{selected.method} {selected.path}<br />{selected.operation}</p>
        <label>处理状态<select value={status} disabled={saving} onChange={e => setStatus(e.target.value as ApiErrorTrackingStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>处理备注<textarea maxLength={2000} rows={4} disabled={saving} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <p>「已解决」表示人工确认；查询发现解决时间之后的新错误时会重新打开。</p>
        <p>最后处理：{selected.updatedBy ? formatLocalDateTime(selected.updatedAt) : "尚未处理"}<br />操作者：{selected.updatedBy ?? "尚未处理"}<br />解决时间：{selected.resolvedAt ? formatLocalDateTime(selected.resolvedAt) : "尚未解决"}</p>
        {detailError ? <p className="form-error" role="alert">{detailError}<button className="secondary-button" disabled={detailLoading} type="button" onClick={() => void loadEvents(selected, events.pagination.offset)}>重试读取日志</button></p> : null}
        {detailLoading ? <p>正在读取原始日志…</p> : !detailError ? events.items.map(event => <section key={event.eventId}>
          <p>{formatLocalDateTime(event.occurredAt)}（本地时间）<br />请求标识：{event.requestId ?? "未知"}</p>
          {event.legacy ? <p>历史日志可能缺少原始原因。</p> : null}
          {event.unavailable ? <p>原始日志已过期、被删除或不在当前日志组中；处理摘要仍保留。</p> : <pre className="api-error-log">{event.message}</pre>}
        </section>) : null}
        <PaginationControls pagination={events.pagination} loading={detailLoading || detailError !== null} onPageChange={value => void loadEvents(selected, value)} />
      </div> : null}
    </Drawer>
  </section>;
}
