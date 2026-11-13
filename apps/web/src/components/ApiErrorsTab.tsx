import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { observeAsync } from "../lib/observeAsync";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ApiErrorGroup, ApiErrorGroupsPage, ApiErrorEventsPage, ApiErrorQueryResult, ApiErrorTrackingStatus } from "@family-ledger/shared";
import { apiGet, apiPatch, apiPost } from "../lib/apiClient";
import { formatLocalDateTime } from "../lib/timeFormat";
import { Drawer } from "./Drawer";
import { PaginationControls } from "./PaginationControls";

const labels = { open: "errorOpen", in_progress: "errorInProgress", resolved: "errorResolved" } as const satisfies Record<ApiErrorTrackingStatus, string>;
const emptyPage = { limit: 20, offset: 0, total: 0, hasMore: false };
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function initialFilters() {
  const now = new Date();
  return { from: localInput(new Date(now.getTime() - 7 * 86400000)), to: localInput(now), path: "", status: "" };
}
type ErrorLogError = UiErrorDescriptor | { key: "errorRangeInvalid" } | { key: "errorDatesInvalid" };

export function ApiErrorsTab({ refreshVersion }: { refreshVersion: number }) {
  const { t } = useTranslation("maintenance");
  const { language, displayLocale } = useUiLanguage();
  const dateTime = (value: string | null) => formatLocalDateTime(value, "-", undefined, language);
  const [filters, setFilters] = useState(initialFilters);
  const [activeFilters, setActiveFilters] = useState(filters);
  const [allSaved, setAllSaved] = useState(false);
  const [page, setPage] = useState<ApiErrorGroupsPage>({ items: [], pagination: emptyPage });
  const [offset, setOffset] = useState(0), [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false), [querying, setQuerying] = useState(false);
  const [error, setError] = useState<ErrorLogError | null>(null), [notice, setNotice] = useState<ApiErrorQueryResult | null>(null);
  const [query, setQuery] = useState<ApiErrorQueryResult | null>(null);
  const [queryRange, setQueryRange] = useState<{ from: string; to: string } | null>(null);
  const [selected, setSelected] = useState<ApiErrorGroup | null>(null);
  const [events, setEvents] = useState<ApiErrorEventsPage>({ items: [], pagination: emptyPage });
  const [detailLoading, setDetailLoading] = useState(false), [saving, setSaving] = useState(false);
  const [detailError, setDetailError] = useState<UiErrorDescriptor | null>(null);
  const [status, setStatus] = useState<ApiErrorTrackingStatus>("open"), [notes, setNotes] = useState("");
  const request = useRef(0), detailRequest = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setLoading(true); setError(null);
    const search = new URLSearchParams({ path: activeFilters.path.trim(), status: activeFilters.status, offset: String(offset), limit: "20" });
    if (!allSaved) { search.set("from", new Date(activeFilters.from).toISOString()); search.set("to", new Date(activeFilters.to).toISOString()); }
    void apiGet<ApiErrorGroupsPage>(`/data-maintenance/errors?${search}`).then(data => { if (id === request.current) setPage(data); })
      .catch(reason => { if (id === request.current) setError(describeUiError(reason, "maintenanceRead")); })
      .finally(() => { if (id === request.current) setLoading(false); });
    const requests = request;
    return () => { requests.current++; };
  }, [activeFilters, allSaved, offset, version, refreshVersion]);
  useEffect(() => () => { detailRequest.current++; }, []);

  async function queryLogs(continueQuery = false) {
    setError(null); setNotice(null); setQuerying(true);
    try {
      const range = continueQuery && queryRange ? queryRange : { from: new Date(filters.from).toISOString(), to: new Date(filters.to).toISOString() };
      const elapsed = Date.parse(range.to) - Date.parse(range.from);
      if (elapsed < 0 || elapsed > 30 * 86400000 || (!continueQuery && Date.parse(range.from) < Date.now() - 30 * 86400000 - 60000)) { setError({ key: "errorRangeInvalid" }); return; }
      const result = await apiPost<ApiErrorQueryResult>("/data-maintenance/errors/query", { ...range, ...(continueQuery && query?.nextCursor ? { cursor: query.nextCursor } : {}) });
      setQuery(result); setQueryRange(range); setAllSaved(false); setActiveFilters({ ...filters, from: localInput(new Date(range.from)), to: localInput(new Date(range.to)) }); setOffset(0); setVersion(value => value + 1);
      setNotice(result);
    } catch (reason) { setError(describeUiError(reason, "maintenanceQuery")); }
    finally { setQuerying(false); }
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    if (!Number.isFinite(Date.parse(filters.from)) || !Number.isFinite(Date.parse(filters.to)) || filters.from > filters.to) { setError({ key: "errorDatesInvalid" }); return; }
    setActiveFilters({ ...filters }); setOffset(0); setVersion(value => value + 1); setQuery(null); setQueryRange(null); setNotice(null);
  }
  async function loadEvents(group: ApiErrorGroup, eventOffset: number) {
    const id = ++detailRequest.current;
    setDetailLoading(true); setDetailError(null);
    try {
      const data = await apiGet<ApiErrorEventsPage>(`/data-maintenance/errors/${group.id}/events?limit=5&offset=${eventOffset}`);
      if (id === detailRequest.current) setEvents(data);
    } catch (reason) { if (id === detailRequest.current) setDetailError(describeUiError(reason, "maintenanceRead")); }
    finally { if (id === detailRequest.current) setDetailLoading(false); }
  }
  function open(group: ApiErrorGroup) {
    setSelected(group); setStatus(group.status); setNotes(group.notes); setEvents({ items: [], pagination: { ...emptyPage, limit: 5 } });
    observeAsync(loadEvents(group, 0));
  }
  async function save() {
    if (!selected) return;
    setSaving(true); setDetailError(null);
    try {
      const data = await apiPatch<{ item: ApiErrorGroup }>(`/data-maintenance/errors/${selected.id}`, { status, notes });
      setSelected(data.item); setVersion(value => value + 1);
    } catch (reason) { setDetailError(describeUiError(reason, "maintenanceSave")); }
    finally { setSaving(false); }
  }
  return <section className="data-maintenance-panel api-errors-panel">
    <h2>{t("errorLog")}</h2>
    <p>{t("errorIntro")}</p>
    <form className="snapshot-filters api-error-filters" onSubmit={apply}>
      <label>{t("errorStartLocal")}<input required type="datetime-local" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label>
      <label>{t("errorEndLocal")}<input required type="datetime-local" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label>
      <label>{t("errorEndpoint")}<input placeholder={t("errorEndpointExample")} value={filters.path} maxLength={300} onChange={e => setFilters({ ...filters, path: e.target.value })} /></label>
      <label>{t("errorHandlingStatus")}<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">{t("all")}</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label className="api-error-checkbox"><input type="checkbox" checked={allSaved} onChange={e => { setAllSaved(e.target.checked); setOffset(0); }} />{t("errorAllSaved")}</label>
      <button className="secondary-button" disabled={loading || querying} type="submit">{t("errorFilterSummaries")}</button>
      <button className="primary-button" disabled={loading || querying || !filters.from || !filters.to} type="button" onClick={() => observeAsync(queryLogs())}>{t("errorQuery")}</button>
      {query?.nextCursor ? <button className="secondary-button" disabled={querying} type="button" onClick={() => observeAsync(queryLogs(true))}>{t("errorContinue")}</button> : null}
    </form>
    {queryRange ? <p>{t(query?.nextCursor ? "errorRangeContinued" : "errorRange", { from: dateTime(queryRange.from), to: dateTime(queryRange.to) })}</p> : null}
    {notice ? <p className="form-success" role="status">{t(notice.nextCursor ? "errorMoreObserved" : "errorObservationComplete", { observed: new Intl.NumberFormat(displayLocale).format(notice.observed) })}</p> : null}
    {error ? <p className="form-error" role="alert">{error.key === "errorRangeInvalid" || error.key === "errorDatesInvalid" ? t(error.key) : translateUiError(error, language)}</p> : null}
    <div className="table-wrap"><table className="api-errors-table"><thead><tr><th>{t("errorSummaryEndpoint")}</th><th>{t("errorFirstSeen")}</th><th>{t("errorLastSeen")}</th><th>{t("errorObservedCount")}</th><th>{t("status")}</th><th>{t("actions")}</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={6}>{t("errorLoading")}</td></tr> : error ? <tr><td colSpan={6}>{t("errorLoadFailed")}</td></tr> : !page.items.length ? <tr><td colSpan={6}>{t("errorEmpty")}</td></tr> : page.items.map(group => <tr key={group.id}>
        <td><strong>{group.summary}</strong><br /><span>{group.method} {group.path || t("errorUnknownEndpoint")}</span><br /><small>{group.operation}</small></td>
        <td>{dateTime(group.firstSeenAt)}</td><td>{dateTime(group.lastSeenAt)}</td><td>{new Intl.NumberFormat(displayLocale).format(group.observedCount)}</td>
        <td>{t(labels[group.status])}{group.recurring ? <><br /><span>{t("errorRecurring")}</span></> : null}</td><td><button className="secondary-button" type="button" onClick={() => open(group)}>{t("errorViewHandle")}</button></td>
      </tr>)}
    </tbody></table></div>
    <PaginationControls pagination={page.pagination} loading={loading || querying || error !== null} onPageChange={setOffset} />
    <Drawer title={t("errorDetails")} subtitle={selected?.summary} open={selected !== null} onClose={() => { if (!saving) { detailRequest.current++; setSelected(null); } }} footer={<button className="primary-button" type="button" disabled={saving} onClick={() => observeAsync(save())}>{saving ? t("errorSaving") : t("errorSave")}</button>}>
      {selected ? <div className="api-error-detail">
        <p>{selected.method} {selected.path}<br />{selected.operation}</p>
        <label>{t("errorHandlingStatus")}<select value={status} disabled={saving} onChange={e => setStatus(e.target.value as ApiErrorTrackingStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label>{t("errorHandlingNotes")}<textarea maxLength={2000} rows={4} disabled={saving} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <p>{t("errorResolvedHelp")}</p>
        <p>{t("errorLastHandled", { time: selected.updatedBy ? dateTime(selected.updatedAt) : t("errorNotHandled") })}<br />{t("errorOperator", { actor: selected.updatedBy ?? t("errorNotHandled") })}<br />{t("errorResolvedAt", { time: selected.resolvedAt ? dateTime(selected.resolvedAt) : t("errorNotResolved") })}</p>
        {detailError ? <p className="form-error" role="alert">{translateUiError(detailError, language)}<button className="secondary-button" disabled={detailLoading} type="button" onClick={() => observeAsync(loadEvents(selected, events.pagination.offset))}>{t("errorRetryLogs")}</button></p> : null}
        {detailLoading ? <p>{t("errorLoadingLogs")}</p> : !detailError ? events.items.map(event => <section key={event.eventId}>
          <p>{t("errorLocalTime", { time: dateTime(event.occurredAt) })}<br />{t("errorEventRequest", { id: event.requestId ?? t("errorUnknown") })}</p>
          {event.legacy ? <p>{t("errorLegacy")}</p> : null}
          {event.unavailable ? <p>{t("errorUnavailable")}</p> : <pre className="api-error-log">{event.message}</pre>}
        </section>) : null}
        <PaginationControls pagination={events.pagination} loading={detailLoading || detailError !== null} onPageChange={value => observeAsync(loadEvents(selected, value))} />
      </div> : null}
    </Drawer>
  </section>;
}
