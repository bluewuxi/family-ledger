import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { useEventCallback } from "../lib/useEventCallback";
import { observeAsync } from "../lib/observeAsync";
import { useAuth } from "../lib/authContext";
import { PaginationControls } from "../components/PaginationControls";
import { AssetSnapshotsTab } from "../components/AssetSnapshotsTab";
import { ApiErrorsTab } from "../components/ApiErrorsTab";
import { type FormEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { CloudDownload, Eye, Filter, RefreshCw } from "lucide-react";
import type {
  AuthenticatedUser,
  CurrencyCode,
  DataMaintenanceBackupRun,
  DataMaintenanceBackupSummary,
  DataMaintenanceJobRun,
  DataMaintenanceRetrievalKind,
  DataProviderRun,
  ExchangeRateRecord,
  Instrument,
  InstrumentPriceRecord,
  KernelPriceAnchor,
  JobRunStatus,
  JobTriggerSource,
  Pagination,
  MarketDataSourceSummary
} from "@family-ledger/shared";
import { CURRENCY_CODES, JOB_RUN_STATUSES, JOB_TRIGGER_SOURCES } from "@family-ledger/shared";
import { PageTitle } from "../components/PageTitle";
import { Drawer } from "../components/Drawer";
import { ApiClientError, apiGet, apiPost } from "../lib/apiClient";
import { formatDisplayPrice as displayPrice } from "../lib/numberFormat";
import { isInteractiveRowTarget } from "../lib/tableInteraction";
import { formatCalendarDate, formatLocalDateTime } from "../lib/timeFormat";

type DataMaintenanceTab = "sources" | "fx" | "prices" | "snapshots" | "logs" | "errors" | "backups" | "restore";

interface DataSourcesResponse {
  user: AuthenticatedUser;
  dataSources: MarketDataSourceSummary[];
}

interface KernelAnchorsResponse {
  user: AuthenticatedUser;
  anchors: KernelPriceAnchor[];
}

interface KernelAnchorResponse {
  user: AuthenticatedUser;
  anchor: KernelPriceAnchor;
}

interface FxRatesResponse {
  user: AuthenticatedUser;
  fxRates: ExchangeRateRecord[];
  pagination: Pagination;
}

interface InstrumentPriceListRecord extends InstrumentPriceRecord {
  instrumentName: string;
  instrumentSymbol: string | null;
}

interface PricesResponse {
  user: AuthenticatedUser;
  prices: InstrumentPriceListRecord[];
  pagination: Pagination;
}

interface JobRunsResponse {
  user: AuthenticatedUser;
  jobRuns: DataMaintenanceJobRun[];
  pagination: Pagination;
}

interface ProviderRunsResponse {
  user: AuthenticatedUser;
  providerRuns: DataProviderRun[];
}

interface BackupRunsResponse {
  user: AuthenticatedUser;
  backupRuns: DataMaintenanceBackupRun[];
  backupSummary: DataMaintenanceBackupSummary;
  pagination: Pagination;
}

interface InstrumentsResponse {
  instruments: Instrument[];
}

interface RetrievalResponse {
  retrieval: {
    kind: DataMaintenanceRetrievalKind;
    triggered: string[];
    triggerRequestId: string;
  };
}

interface FxFilters {
  from: string;
  to: string;
  fromCurrency: "" | CurrencyCode;
  toCurrency: "" | CurrencyCode;
  provider: string;
}

interface PriceFilters {
  from: string;
  to: string;
  instrumentId: string;
  provider: string;
}

interface LogFilters {
  jobName: string;
  status: "" | JobRunStatus;
  triggerSource: "" | JobTriggerSource;
}

const pageSize = 20;
const backupPageSize = 10;
const emptyPagination: Pagination = { limit: pageSize, offset: 0, hasMore: false, total: 0 };
const emptyBackupPagination: Pagination = { limit: backupPageSize, offset: 0, hasMore: false, total: 0 };
const emptyBackupSummary: DataMaintenanceBackupSummary = { latestRun: null, latestSucceededRun: null };

type MaintenanceError = UiErrorDescriptor | { key: "kernelDateUnavailable" } | { key: "kernelSourceUnavailable" };
type MaintenanceNotice = { key: "anchorPaired" | "anchorSaved" } | { key: "retrievalQueued"; requestId: string };

export function DataMaintenancePage() {
  const { t } = useTranslation("maintenance");
  const { language, displayLocale } = useUiLanguage();
  const formatDateTime = (value: string | null) => formatLocalDateTime(value, "-", undefined, language);
  const calendarDate = (value: string | null) => formatCalendarDate(value, "-", language);
  const formatDisplayPrice = (value: Parameters<typeof displayPrice>[0]) => displayPrice(value, displayLocale);
  const formatOptionalNumber = (value: number | null) => value === null ? "--" : new Intl.NumberFormat(displayLocale).format(value);
  const { session } = useAuth();
  const selectedScope = session?.accountAccess?.scope.mode === "selected";
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<DataMaintenanceTab>(selectedScope ? "snapshots" : "sources");
  const [snapshotRefreshVersion, setSnapshotRefreshVersion] = useState(0);
  const [errorRefreshVersion, setErrorRefreshVersion] = useState(0);
  const [dataSources, setDataSources] = useState<MarketDataSourceSummary[]>([]);
  const [kernelAnchors, setKernelAnchors] = useState<KernelPriceAnchor[]>([]);
  const [kernelDrawerOpen, setKernelDrawerOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState("");
  const [kernelUnitPrice, setKernelUnitPrice] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [fxRates, setFxRates] = useState<ExchangeRateRecord[]>([]);
  const [prices, setPrices] = useState<InstrumentPriceListRecord[]>([]);
  const [jobRuns, setJobRuns] = useState<DataMaintenanceJobRun[]>([]);
  const [providerRuns, setProviderRuns] = useState<DataProviderRun[]>([]);
  const [backupRuns, setBackupRuns] = useState<DataMaintenanceBackupRun[]>([]);
  const [backupSummary, setBackupSummary] = useState<DataMaintenanceBackupSummary>(emptyBackupSummary);
  const [selectedJobRunId, setSelectedJobRunId] = useState<string | null>(null);
  const [jobRunDetailOpen, setJobRunDetailOpen] = useState(false);
  const [fxPagination, setFxPagination] = useState<Pagination>(emptyPagination);
  const [pricePagination, setPricePagination] = useState<Pagination>(emptyPagination);
  const [logPagination, setLogPagination] = useState<Pagination>(emptyPagination);
  const [backupPagination, setBackupPagination] = useState<Pagination>(emptyBackupPagination);
  const [fxFilters, setFxFilters] = useState<FxFilters>({ from: "", to: "", fromCurrency: "", toCurrency: "USD", provider: "" });
  const [priceFilters, setPriceFilters] = useState<PriceFilters>({ from: "", to: "", instrumentId: "", provider: "" });
  const [logFilters, setLogFilters] = useState<LogFilters>({ jobName: "", status: "", triggerSource: "" });
  const [loading, setLoading] = useState(false);
  const [triggeringKind, setTriggeringKind] = useState<DataMaintenanceRetrievalKind | null>(null);
  const [error, setError] = useState<MaintenanceError | null>(null);
  const [notice, setNotice] = useState<MaintenanceNotice | null>(null);
  const errorMessage = error && (error.key === "kernelDateUnavailable" || error.key === "kernelSourceUnavailable"
    ? t(error.key)
    : translateUiError(error, language));
  const noticeMessage = notice && (notice.key === "retrievalQueued"
    ? t(notice.key, { requestId: notice.requestId })
    : t(notice.key));

  const isAdmin = user?.role === "admin";
  const selectedJobRun = useMemo(
    () => jobRuns.find((jobRun) => jobRun.id === selectedJobRunId) ?? null,
    [jobRuns, selectedJobRunId]
  );
  const latestBackupRun = backupSummary.latestRun;

  async function loadActiveTab(offset: number) {
    if (activeTab === "sources") {
      await loadDataSources();
    } else if (activeTab === "fx") {
      await loadFxRates(offset);
    } else if (activeTab === "prices") {
      await loadPrices(offset);
    } else if (activeTab === "logs") {
      await loadJobRuns(offset);
    } else if (activeTab === "backups") {
      await loadBackupRuns(offset);
    } else {
      setError(null);
    }
  }
  // Effects use current values; in-flight actions retain their initiating render's tab/filter snapshot.
  const loadActiveTabForEffect = useEventCallback(loadActiveTab);
  useEffect(() => {
    observeAsync(loadInitialData());
  }, []);

  useEffect(() => {
    observeAsync(loadActiveTabForEffect(0));
  }, [activeTab, loadActiveTabForEffect]);

  async function loadInitialData() {
    setLoading(true);
    setError(null);

    try {
      const [instrumentData, sourceData] = await Promise.all([
        apiGet<InstrumentsResponse>("/instruments"),
        apiGet<DataSourcesResponse>("/data-maintenance/data-sources")
      ]);
      setInstruments(instrumentData.instruments);
      setUser(sourceData.user);
      setDataSources(sourceData.dataSources);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

async function loadDataSources() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DataSourcesResponse>("/data-maintenance/data-sources");
      setUser(data.user);
      setDataSources(data.dataSources);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

  async function openKernelSource() {
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<KernelAnchorsResponse>("/data-maintenance/data-sources/kernel-estimate/anchors");
      setUser(data.user);
      setKernelAnchors(data.anchors);
      setKernelDrawerOpen(true);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    }
  }

  async function submitKernelAnchor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAnchor(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await apiPost<KernelAnchorResponse>("/data-maintenance/data-sources/kernel-estimate/anchors", {
        anchorDate,
        kernelUnitPrice
      });
      const [sourceData, anchorData] = await Promise.all([
        apiGet<DataSourcesResponse>("/data-maintenance/data-sources"),
        apiGet<KernelAnchorsResponse>("/data-maintenance/data-sources/kernel-estimate/anchors")
      ]);
      setDataSources(sourceData.dataSources);
      setKernelAnchors(anchorData.anchors);
      setAnchorDate("");
      setKernelUnitPrice("");
      setNotice({ key: saved.anchor.pairingStatus === "paired" ? "anchorPaired" : "anchorSaved" });
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.code === "DATA_SOURCE_DATE_UNAVAILABLE") {
        setError({ key: "kernelDateUnavailable" });
      } else if (requestError instanceof ApiClientError && requestError.code === "DATA_SOURCE_UNAVAILABLE") {
        setError({ key: "kernelSourceUnavailable" });
      } else {
        setError(describeUiError(requestError, "maintenanceSave"));
      }
    } finally {
      setSavingAnchor(false);
    }
  }

  async function loadFxRates(offset = fxPagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<FxRatesResponse>(
        `/data-maintenance/fx-rates?${toQuery({
          ...fxFilters,
          limit: pageSize,
          offset
        })}`
      );
      setUser(data.user);
      setFxRates(data.fxRates);
      setFxPagination(data.pagination);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

  async function loadPrices(offset = pricePagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<PricesResponse>(
        `/data-maintenance/instrument-prices?${toQuery({
          ...priceFilters,
          limit: pageSize,
          offset
        })}`
      );
      setUser(data.user);
      setPrices(data.prices);
      setPricePagination(data.pagination);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

  async function loadJobRuns(offset = logPagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<JobRunsResponse>(
        `/data-maintenance/job-runs?${toQuery({
          ...logFilters,
          limit: pageSize,
          offset
        })}`
      );
      setUser(data.user);
      setJobRuns(data.jobRuns);
      setLogPagination(data.pagination);

      const nextSelectedJobRunId =
        selectedJobRunId && data.jobRuns.some((jobRun) => jobRun.id === selectedJobRunId) ? selectedJobRunId : null;
      setSelectedJobRunId(nextSelectedJobRunId);
      if (nextSelectedJobRunId && jobRunDetailOpen) {
        await loadProviderRuns(nextSelectedJobRunId);
      } else {
        setProviderRuns([]);
      }
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

  async function loadBackupRuns(offset = backupPagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<BackupRunsResponse>(
        `/data-maintenance/backups?${toQuery({
          limit: backupPageSize,
          offset
        })}`
      );
      setUser(data.user);
      setBackupRuns(data.backupRuns);
      setBackupSummary(data.backupSummary);
      setBackupPagination(data.pagination);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    } finally {
      setLoading(false);
    }
  }

  async function loadProviderRuns(jobRunId: string) {
    try {
      const data = await apiGet<ProviderRunsResponse>(`/data-maintenance/job-runs/${jobRunId}/provider-runs`);
      setProviderRuns(data.providerRuns);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRead"));
    }
  }

  async function handleSelectJobRun(jobRunId: string) {
    setSelectedJobRunId(jobRunId);
    setJobRunDetailOpen(true);
    setError(null);
    await loadProviderRuns(jobRunId);
  }

  async function triggerRetrieval(kind: DataMaintenanceRetrievalKind) {
    setTriggeringKind(kind);
    setError(null);
    setNotice(null);

    try {
      const data = await apiPost<RetrievalResponse>("/data-maintenance/retrievals", { kind });
      setNotice({ key: "retrievalQueued", requestId: data.retrieval.triggerRequestId });
      await loadActiveTab(0);
    } catch (requestError) {
      setError(describeUiError(requestError, "maintenanceRetrieve"));
    } finally {
      setTriggeringKind(null);
    }
  }

  function formatCapabilities(capabilities: MarketDataSourceSummary["capabilities"]): string {
    return new Intl.ListFormat(displayLocale).format(capabilities.map(capability => t(capability === "exchange_rates" ? "fx" : capability === "dashboard_quotes" ? "liveQuotes" : "prices")));
  }

  const formatAcquisitionMethod = (method: MarketDataSourceSummary["acquisitionMethod"]) => t(method === "public_api" ? "publicApi" : method === "public_web_page" ? "publicWebPage" : "proxyEstimate");
  const formatSourceStatus = (status: MarketDataSourceSummary["status"]) => t(status === "ready" ? "sourceReady" : status === "inactive" ? "sourceInactive" : "sourceNeedsConfiguration");
  const formatStatus = (status: JobRunStatus) => t(status === "succeeded" ? "runSucceeded" : status === "failed" ? "runFailed" : "runStarted");
  const formatTriggerSource = (source: JobTriggerSource) => t(source === "manual" ? "manual" : "scheduled");
  const backupStatus = (run: DataMaintenanceBackupRun) => run.status === "failed" && run.failureReasonCode === "blocked_by_running_job" ? t("backupDelayed") : formatStatus(run.status);
  const backupFailure = (reason: DataMaintenanceBackupRun["failureReasonCode"]) => t(reason === "blocked_by_running_job" ? "backupDelayDetail" : "backupFailureDetail");

  function formatBackupHeadline(run: DataMaintenanceBackupRun): string {
    if (run.status === "started") return t("backupRunning");
    if (run.status === "succeeded") return t("backupSucceeded");
    return t(run.failureReasonCode === "blocked_by_running_job" ? "backupDelayed" : "backupFailed");
  }

  function formatBackupDetail(run: DataMaintenanceBackupRun): string {
    if (run.status === "started") return t("backupRunningDetail");
    if (run.status === "succeeded") return t("backupSuccessDetail", { time: formatDateTime(run.finishedAt), rows: formatOptionalNumber(run.recordsInserted) });
    return backupFailure(run.failureReasonCode);
  }

  function formatDuration(value: number | null): string {
    if (value === null) return "--";
    if (value < 60) return t("durationSeconds", { count: value });
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return seconds === 0 ? t("durationMinutes", { count: minutes }) : t("durationMinutesSeconds", { minutes, seconds });
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/data-maintenance">{t("pageTitle")}</PageTitle>
          <p>{t("pageIntro")}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => activeTab === "snapshots" ? setSnapshotRefreshVersion(value => value + 1) : activeTab === "errors" ? setErrorRefreshVersion(value => value + 1) : void loadActiveTab(0)} disabled={loading || triggeringKind !== null}>
          <RefreshCw size={16} aria-hidden="true" />
          {t("refresh")}
        </button>
      </header>

      {!kernelDrawerOpen && activeTab !== "snapshots" && errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      {!kernelDrawerOpen && noticeMessage ? <p className="form-success" role="status">{noticeMessage}</p> : null}

      <div className="tabs" role="group" aria-label={t("categories")}>
        {!selectedScope && <button className={activeTab === "sources" ? "active" : undefined} aria-current={activeTab === "sources" ? "page" : undefined} type="button" onClick={() => setActiveTab("sources")}>
          {t("source")}
        </button>}
        <button className={activeTab === "fx" ? "active" : undefined} aria-current={activeTab === "fx" ? "page" : undefined} type="button" onClick={() => setActiveTab("fx")}>
          {t("fx")}
        </button>
        {!selectedScope && <button className={activeTab === "prices" ? "active" : undefined} aria-current={activeTab === "prices" ? "page" : undefined} type="button" onClick={() => setActiveTab("prices")}>
          {t("prices")}
        </button>}
        <button className={activeTab === "snapshots" ? "active" : undefined} aria-current={activeTab === "snapshots" ? "page" : undefined} type="button" onClick={() => setActiveTab("snapshots")}>{t("snapshots")}</button>
        {!selectedScope && <button className={activeTab === "logs" ? "active" : undefined} aria-current={activeTab === "logs" ? "page" : undefined} type="button" onClick={() => setActiveTab("logs")}>
          {t("jobLogs")}
        </button>}
        {isAdmin ? <button className={activeTab === "errors" ? "active" : undefined} aria-current={activeTab === "errors" ? "page" : undefined} type="button" onClick={() => setActiveTab("errors")}>{t("errorLog")}</button> : null}
        {!selectedScope && <button className={activeTab === "backups" ? "active" : undefined} aria-current={activeTab === "backups" ? "page" : undefined} type="button" onClick={() => setActiveTab("backups")}>
          {t("backups")}
        </button>}
        {!selectedScope && <button className={activeTab === "restore" ? "active" : undefined} aria-current={activeTab === "restore" ? "page" : undefined} type="button" onClick={() => setActiveTab("restore")}>
          {t("restore")}
        </button>}
      </div>

      {activeTab === "sources" ? renderSourcesTab() : null}
      {activeTab === "fx" ? renderFxTab() : null}
      {activeTab === "prices" ? renderPricesTab() : null}
      {activeTab === "snapshots" ? <AssetSnapshotsTab refreshVersion={snapshotRefreshVersion} /> : null}
      {activeTab === "logs" ? renderLogsTab() : null}
      {activeTab === "errors" && isAdmin ? <ApiErrorsTab refreshVersion={errorRefreshVersion} /> : null}
      {activeTab === "backups" ? renderBackupsTab() : null}
      {activeTab === "restore" ? renderRestoreTab() : null}
      {renderKernelDrawer()}
      {renderJobRunDrawer()}
    </section>
  );

  function renderSourcesTab() {
    return (
      <section className="data-maintenance-panel">
        <div className="settings-section-header">
          <div>
            <h2>{t("marketSources")}</h2>
            <p>{t("marketSourcesIntro")}</p>
          </div>
        </div>
        <DataMaintenanceTable title={t("connectedSources")}>
          <table className="data-maintenance-source-table">
            <thead>
              <tr>
                <th>{t("source")}</th>
                <th>{t("dataType")}</th>
                <th>{t("acquisition")}</th>
                <th>{t("status")}</th>
                <th className="numeric-cell">{t("configuredInstruments")}</th>
                <th>{t("latestBatch")}</th>
                <th>{t("latestAnchor")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={8} label={t("sourcesLoading")} />
              ) : dataSources.length === 0 ? (
                <EmptyRow colSpan={8} label={t("noSources")} />
              ) : dataSources.map((source) => (
                <tr key={source.key}>
                  <td>{source.name}</td>
                  <td>{formatCapabilities(source.capabilities)}</td>
                  <td>{formatAcquisitionMethod(source.acquisitionMethod)}</td>
                  <td><span className={`status-badge source-status-${source.status}`}>{formatSourceStatus(source.status)}</span>
                    {source.recovery && source.recovery.pending + source.recovery.needsAttention > 0 ? <p className="field-hint" role="status">
                      {[
                        t("recoveryGaps", { pending: source.recovery.pending, needsAttention: source.recovery.needsAttention }),
                        source.recovery.unsupported > 0 && t("recoveryUnsupported", { unsupported: source.recovery.unsupported }),
                        source.recovery.oldestMissingDate && t("recoveryOldest", { date: calendarDate(source.recovery.oldestMissingDate) }),
                        source.recovery.nextAttemptAt && t("recoveryNext", { time: formatDateTime(source.recovery.nextAttemptAt) }),
                        isAdmin && t("retryPrices")
                      ].filter(Boolean).join(language === "zh-CN" ? "" : " ")}
                    </p> : null}
                  </td>
                  <td className="numeric-cell">{source.configuredTargetCount ?? "-"}</td>
                  <td>{source.latestBatchRun ? `${formatStatus(source.latestBatchRun.status)} · ${formatDateTime(source.latestBatchRun.providerStartedAt)}` : "-"}</td>
                  <td>{calendarDate(source.latestAnchorDate ?? null)}</td>
                  <td>
                    {source.key === "kernel_estimate" ? (
                      <button className="secondary-button compact-button" type="button" onClick={() => observeAsync(openKernelSource())}>
                        {isAdmin ? t("addAnchor") : t("view")}
                      </button>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataMaintenanceTable>
      </section>
    );
  }

  function renderFxTab() {
    return (
      <section className="data-maintenance-panel">
        <Toolbar
          isAdmin={isAdmin}
          triggeringKind={triggeringKind}
          title={t("fxUpdates")}
          description={t("fxUpdatesIntro")}
        >
          <ManualUpdateButton
            label={triggeringKind === "exchange_rates" ? t("submitting") : t("submitFx")}
            onClick={() => observeAsync(triggerRetrieval("exchange_rates"))}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar data-maintenance-filter-bar fx-filter-bar" onSubmit={(event) => { event.preventDefault(); observeAsync(loadFxRates(0)); }}>
          <label>
            {t("fromDate")}
            <input type="date" value={fxFilters.from} onChange={(event) => setFxFilters({ ...fxFilters, from: event.target.value })} />
          </label>
          <label>
            {t("toDate")}
            <input type="date" value={fxFilters.to} onChange={(event) => setFxFilters({ ...fxFilters, to: event.target.value })} />
          </label>
          <label>
            {t("fromCurrency")}
            <select
              value={fxFilters.fromCurrency}
              onChange={(event) => setFxFilters({ ...fxFilters, fromCurrency: event.target.value as "" | CurrencyCode })}
            >
              <option value="">{t("all")}</option>
              {CURRENCY_CODES.filter((currency) => currency !== "USD").map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("toCurrency")}
            <select
              value={fxFilters.toCurrency}
              onChange={(event) => setFxFilters({ ...fxFilters, toCurrency: event.target.value as "" | CurrencyCode })}
            >
              <option value="">{t("all")}</option>
              {CURRENCY_CODES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("source")}
            <input value={fxFilters.provider} onChange={(event) => setFxFilters({ ...fxFilters, provider: event.target.value })} placeholder="Frankfurter" />
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            {t("filter")}
          </button>
        </form>

        <DataMaintenanceTable title={t("fxRecords")}>
          <table>
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("currency")}</th>
                <th className="numeric-cell">{t("fx")}</th>
                <th>{t("purpose")}</th>
                <th>{t("source")}</th>
                <th>{t("fetchedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={6} label={t("fxLoading")} />
              ) : fxRates.length === 0 ? (
                <EmptyRow colSpan={6} label={t("noFx")} />
              ) : (
                fxRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{calendarDate(rate.rateDate)}</td>
                    <td>
                      {rate.fromCurrency} / {rate.toCurrency}
                    </td>
                    <td className="numeric-cell">{formatDisplayPrice(rate.rate)}</td>
                    <td>{rate.rateType === "valuation" ? t("valuation") : t("taxSupport")}</td>
                    <td>{rate.provider}</td>
                    <td>{formatDateTime(rate.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={fxPagination} loading={loading} onPageChange={(offset) => observeAsync(loadFxRates(offset))} />
      </section>
    );
  }

  function renderPricesTab() {
    return (
      <section className="data-maintenance-panel">
        <Toolbar
          isAdmin={isAdmin}
          triggeringKind={triggeringKind}
          title={t("priceUpdates")}
          description={t("priceUpdatesIntro")}
        >
          <ManualUpdateButton
            label={triggeringKind === "instrument_prices" ? t("submitting") : t("submitPrices")}
            onClick={() => observeAsync(triggerRetrieval("instrument_prices"))}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar data-maintenance-filter-bar price-filter-bar" onSubmit={(event) => { event.preventDefault(); observeAsync(loadPrices(0)); }}>
          <label>
            {t("fromDate")}
            <input type="date" value={priceFilters.from} onChange={(event) => setPriceFilters({ ...priceFilters, from: event.target.value })} />
          </label>
          <label>
            {t("toDate")}
            <input type="date" value={priceFilters.to} onChange={(event) => setPriceFilters({ ...priceFilters, to: event.target.value })} />
          </label>
          <label>
            {t("instrument")}
            <select
              value={priceFilters.instrumentId}
              onChange={(event) => setPriceFilters({ ...priceFilters, instrumentId: event.target.value })}
            >
              <option value="">{t("all")}</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {formatInstrument(instrument)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("source")}
            <input value={priceFilters.provider} onChange={(event) => setPriceFilters({ ...priceFilters, provider: event.target.value })} />
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            {t("filter")}
          </button>
        </form>

        <DataMaintenanceTable title={t("priceRecords")}>
          <table className="data-maintenance-price-table">
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("instrument")}</th>
                <th className="numeric-cell">{t("prices")}</th>
                <th>{t("currency")}</th>
                <th>{t("source")}</th>
                <th>{t("sourceCode")}</th>
                <th>{t("fetchedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label={t("pricesLoading")} />
              ) : prices.length === 0 ? (
                <EmptyRow colSpan={7} label={t("noPrices")} />
              ) : (
                prices.map((price) => (
                  <tr key={price.id}>
                    <td>{calendarDate(price.priceDate)}</td>
                    <td>{formatInstrumentLabel(price)}</td>
                    <td className="numeric-cell">{formatDisplayPrice(price.closePrice)}</td>
                    <td>{price.currency}</td>
                    <td>
                      {price.provider}
                      {price.isEstimated ? <span className="estimate-badge">{t("estimate")}</span> : null}
                    </td>
                    <td>{price.sourceSymbol ?? "-"}</td>
                    <td>{formatDateTime(price.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={pricePagination} loading={loading} onPageChange={(offset) => observeAsync(loadPrices(offset))} />
      </section>
    );
  }

  function renderLogsTab() {
    return (
      <section className="data-maintenance-panel">
        <form className="filter-bar data-maintenance-filter-bar log-filter-bar" onSubmit={(event) => { event.preventDefault(); observeAsync(loadJobRuns(0)); }}>
          <label>
            {t("job")}
            <input value={logFilters.jobName} onChange={(event) => setLogFilters({ ...logFilters, jobName: event.target.value })} />
          </label>
          <label>
            {t("status")}
            <select value={logFilters.status} onChange={(event) => setLogFilters({ ...logFilters, status: event.target.value as "" | JobRunStatus })}>
              <option value="">{t("all")}</option>
              {JOB_RUN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("trigger")}
            <select
              value={logFilters.triggerSource}
              onChange={(event) => setLogFilters({ ...logFilters, triggerSource: event.target.value as "" | JobTriggerSource })}
            >
              <option value="">{t("all")}</option>
              {JOB_TRIGGER_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {formatTriggerSource(source)}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            {t("filter")}
          </button>
        </form>

        <DataMaintenanceTable title={t("jobLogs")}>
          <table className="data-maintenance-job-table">
            <thead>
              <tr>
                <th>{t("job")}</th>
                <th>{t("status")}</th>
                <th>{t("trigger")}</th>
                <th>{t("startedAt")}</th>
                <th>{t("finishedAt")}</th>
                <th className="numeric-cell">{t("addedSkipped")}</th>
                <th>{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label={t("jobsLoading")} />
              ) : jobRuns.length === 0 ? (
                <EmptyRow colSpan={7} label={t("noJobs")} />
              ) : (
                jobRuns.map((jobRun) => (
                  <tr
                    className={[selectedJobRunId === jobRun.id ? "selected-row" : "", "clickable-detail-row"]
                      .filter(Boolean)
                      .join(" ")}
                    key={jobRun.id}
                    onClick={(event) => handleJobRunRowClick(event, jobRun.id)}
                  >
                    <td>{jobRun.jobName}</td>
                    <td>{formatStatus(jobRun.status)}</td>
                    <td>{formatTriggerSource(jobRun.triggerSource)}</td>
                    <td>{formatDateTime(jobRun.jobStartedAt)}</td>
                    <td>{formatDateTime(jobRun.jobFinishedAt)}</td>
                    <td className="numeric-cell">
                      {jobRun.recordsInserted} / {jobRun.recordsSkipped}
                    </td>
                    <td>
                      <button className="text-button" type="button" onClick={() => observeAsync(handleSelectJobRun(jobRun.id))}>
                        <Eye size={15} aria-hidden="true" />
                        {t("view")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={logPagination} loading={loading} onPageChange={(offset) => observeAsync(loadJobRuns(offset))} />
      </section>
    );
  }

  function handleJobRunRowClick(event: MouseEvent<HTMLTableRowElement>, jobRunId: string) {
    if (!isInteractiveRowTarget(event.target)) {
      observeAsync(handleSelectJobRun(jobRunId));
    }
  }

  function renderKernelDrawer() {
    const latestAnchor = kernelAnchors.find(anchor => !anchor.derivedFromAnchorId) ?? null;
    const kernelSource = dataSources.find((source) => source.key === "kernel_estimate") ?? null;
    return (
      <Drawer
        open={kernelDrawerOpen}
        title={t("kernelEstimate")}
        subtitle={t("kernelFund")}
        onClose={() => setKernelDrawerOpen(false)}
        footer={
          <button className="secondary-button" type="button" onClick={() => setKernelDrawerOpen(false)}>
            {t("close")}
          </button>
        }
      >
        <div className="detail-drawer-content kernel-source-drawer">
          <section className="detail-section">
            <h3>{t("estimateMethod")}</h3>
            <dl className="detail-grid">
              <div><dt>{t("targetFund")}</dt><dd>Kernel S&P 500 (Unhedged)</dd></div>
              <div><dt>{t("proxyInstrument")}</dt><dd>{t("proxyDescription")}</dd></div>
              <div><dt>{t("currentStatus")}</dt><dd>{kernelSource ? formatSourceStatus(kernelSource.status) : "-"}</dd></div>
              <div><dt>{t("latestAnchor")}</dt><dd>{latestAnchor ? calendarDate(latestAnchor.anchorDate) : t("notConfigured")}</dd></div>
              <div><dt>{t("latestActualPrice")}</dt><dd>{latestAnchor ? formatDisplayPrice(latestAnchor.kernelUnitPrice) : "-"}</dd></div>
            </dl>
            <p className="form-hint">{t("estimateFormula")}</p>
            <p className="form-hint">{t("estimateDates")}</p>
            <p className="form-hint">{t("estimateLimit")}</p>
          </section>

          {isAdmin ? (
            <section className="detail-section">
              <h3>{t("addAnchor")}</h3>
              {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
              {noticeMessage ? <p className="form-success" role="status">{noticeMessage}</p> : null}
              <form className="kernel-anchor-form" onSubmit={(event) => observeAsync(submitKernelAnchor(event))}>
                <label>
                  {t("kernelDate")}
                  <input type="date" required value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
                </label>
                <label>
                  {t("kernelUnitPrice")}
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    pattern="[0-9]+(?:\.[0-9]{1,10})?"
                    value={kernelUnitPrice}
                    onChange={(event) => setKernelUnitPrice(event.target.value)}
                    placeholder={t("priceExample")}
                  />
                </label>
                <button className="primary-button" type="submit" disabled={savingAnchor}>
                  {savingAnchor ? t("saving") : t("addAnchor")}
                </button>
              </form>
            </section>
          ) : <p className="readonly-note">{t("anchorReadOnly")}</p>}

          <section className="detail-section">
            <h3>{t("anchorHistory")}</h3>
            <div className="table-wrap">
              <table className="kernel-anchor-table">
                <thead><tr><th>{t("kernelDate")}</th><th className="numeric-cell">{t("kernelPrice")}</th><th>{t("proxyDate")}</th><th className="numeric-cell">{t("proxyAmount")}</th><th>{t("createdAt")}</th></tr></thead>
                <tbody>
                  {kernelAnchors.length === 0 ? <EmptyRow colSpan={5} label={t("noAnchors")} /> : kernelAnchors.map((anchor) => (
                    <tr key={anchor.id}>
                      <td>{calendarDate(anchor.anchorDate)}</td>
                      <td className="numeric-cell">{formatDisplayPrice(anchor.kernelUnitPrice)}</td>
                      <td>{anchor.proxyPriceDate ? calendarDate(anchor.proxyPriceDate) : anchor.pairingStatus === "paired" ? t("pairedReference") : t("pendingPairing")}</td>
                      <td className="numeric-cell">{anchor.proxyClose === null ? "—" : t("proxyValue", { value: formatDisplayPrice(anchor.proxyClose), type: anchor.proxyValueType === "nta" ? t("nta") : t("historicalOpen") })}</td>
                      <td>{formatDateTime(anchor.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Drawer>
    );
  }

  function renderJobRunDrawer() {
    if (!selectedJobRun) {
      return null;
    }

    return (
      <Drawer
        open={jobRunDetailOpen}
        title={t("jobDetail")}
        subtitle={selectedJobRun.jobName}
        onClose={() => setJobRunDetailOpen(false)}
        footer={
          <button className="secondary-button" type="button" onClick={() => setJobRunDetailOpen(false)}>
            {t("close")}
          </button>
        }
      >
        <div className="detail-drawer-content">
          <section className="detail-section">
            <h3>{t("jobInfo")}</h3>
            <dl className="detail-grid">
              <div>
                <dt>{t("status")}</dt>
                <dd>{formatStatus(selectedJobRun.status)}</dd>
              </div>
              <div>
                <dt>{t("trigger")}</dt>
                <dd>{formatTriggerSource(selectedJobRun.triggerSource)}</dd>
              </div>
              <div>
                <dt>{t("startedAt")}</dt>
                <dd>{formatDateTime(selectedJobRun.jobStartedAt)}</dd>
              </div>
              <div>
                <dt>{t("finishedAt")}</dt>
                <dd>{formatDateTime(selectedJobRun.jobFinishedAt)}</dd>
              </div>
              <div>
                <dt>{t("addedSkipped")}</dt>
                <dd>
                  {selectedJobRun.recordsInserted} / {selectedJobRun.recordsSkipped}
                </dd>
              </div>
              <div>
                <dt>{t("requestId")}</dt>
                <dd>{selectedJobRun.triggerRequestId ?? "-"}</dd>
              </div>
              <div>
                <dt>{t("triggerUser")}</dt>
                <dd>{selectedJobRun.triggeredByUserId ?? "-"}</dd>
              </div>
              <div>
                <dt>{t("recordUpdatedAt")}</dt>
                <dd>{formatDateTime(selectedJobRun.updatedAt)}</dd>
              </div>
            </dl>
            {selectedJobRun.jobName === "backup-ledger-data"
              ? selectedJobRun.status === "failed" && <p className="form-error">{backupFailure(selectedJobRun.failureReasonCode)}</p>
              : selectedJobRun.errorMessage && <p className="form-error">{selectedJobRun.errorMessage}</p>}
          </section>

          <section className="detail-section">
            <h3>{t("providerLogs")}</h3>
            <div className="table-wrap">
              <table className="data-maintenance-provider-table">
                <thead>
                  <tr>
                    <th>{t("source")}</th>
                    <th>{t("dataType")}</th>
                    <th>{t("status")}</th>
                    <th>{t("startedAt")}</th>
                    <th>{t("finishedAt")}</th>
                    <th className="numeric-cell">{t("addedSkipped")}</th>
                    <th>{t("error")}</th>
                  </tr>
                </thead>
                <tbody>
                  {providerRuns.length === 0 ? (
                    <EmptyRow colSpan={7} label={t("noProviderLogs")} />
                  ) : (
                    providerRuns.map((run) => (
                      <tr key={run.id}>
                        <td>{run.provider}</td>
                        <td>{run.dataKind === "exchange_rates" ? t("fx") : t("prices")}</td>
                        <td>{formatStatus(run.status)}</td>
                        <td>{formatDateTime(run.providerStartedAt)}</td>
                        <td>{formatDateTime(run.providerFinishedAt)}</td>
                        <td className="numeric-cell">
                          {run.recordsInserted} / {run.recordsSkipped}
                        </td>
                        <td>{run.errorMessage ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Drawer>
    );
  }

  function renderBackupsTab() {
    return (
      <section className="data-maintenance-panel">
        <section className="data-maintenance-backup-summary" aria-label={t("backupStatus")}>
          <MetricBlock label={t("latestStatus")} value={latestBackupRun ? backupStatus(latestBackupRun) : t("noBackupRun")} />
          <MetricBlock
            label={t("lastSuccess")}
            value={backupSummary.latestSucceededRun ? formatDateTime(backupSummary.latestSucceededRun.finishedAt) : "--"}
          />
          <MetricBlock label={t("backupRows")} value={formatOptionalNumber(latestBackupRun?.recordsInserted ?? null)} />
          <MetricBlock label={t("duration")} value={formatDuration(latestBackupRun?.durationSeconds ?? null)} />
        </section>

        {latestBackupRun ? (
          <section className="settings-section-header">
            <div>
              <h2>{formatBackupHeadline(latestBackupRun)}</h2>
              <p>{formatBackupDetail(latestBackupRun)}</p>
            </div>
          </section>
        ) : (
          <section className="settings-section-header">
            <div>
              <h2>{t("noBackupRun")}</h2>
              <p>{t("backupEmptyIntro")}</p>
            </div>
          </section>
        )}

        <section className="settings-section-header">
          <div>
            <h2>{t("backupScope")}</h2>
            <p>{t("backupScopeIntro")}</p>
          </div>
        </section>

        <DataMaintenanceTable title={t("backupRecords")}>
          <table className="data-maintenance-backup-table">
            <thead>
              <tr>
                <th>{t("status")}</th>
                <th>{t("trigger")}</th>
                <th>{t("startedAt")}</th>
                <th>{t("finishedAt")}</th>
                <th className="numeric-cell">{t("backupRows")}</th>
                <th className="numeric-cell">{t("duration")}</th>
                <th>{t("notes")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label={t("backupLoading")} />
              ) : backupRuns.length === 0 ? (
                <EmptyRow colSpan={7} label={t("noBackupRecords")} />
              ) : (
                backupRuns.map((backupRun) => (
                  <tr key={backupRun.id}>
                    <td>{backupStatus(backupRun)}</td>
                    <td>{backupRun.triggerSource ? formatTriggerSource(backupRun.triggerSource) : "--"}</td>
                    <td>{formatDateTime(backupRun.startedAt)}</td>
                    <td>{formatDateTime(backupRun.finishedAt)}</td>
                    <td className="numeric-cell">{formatOptionalNumber(backupRun.recordsInserted)}</td>
                    <td className="numeric-cell">{formatDuration(backupRun.durationSeconds)}</td>
                    <td>{backupRun.status === "failed" ? backupFailure(backupRun.failureReasonCode) : "--"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={backupPagination} loading={loading} onPageChange={(offset) => observeAsync(loadBackupRuns(offset))} />
      </section>
    );
  }

  function renderRestoreTab() {
    return (
      <section className="data-maintenance-panel">
        <section className="settings-section-header">
          <div>
            <h2>{t("restoreGuide")}</h2>
            <p>{t("restoreIntro")}</p>
          </div>
        </section>

        <section className="data-maintenance-restore-instructions" aria-label={t("restoreStepsAria")}>
          <h3>{t("restoreSteps")}</h3>
          <ol>
            <li>{t("restoreChoosePoint")}</li>
            <li>{t("restorePauseWrites")}</li>
            <li>{t("restoreRetrieve")}</li>
            <li>{t("restoreDryRun")}</li>
            <li>{t("restoreApply")}</li>
            <li>{t("restoreVerify")}</li>
            <li>{t("restoreResume")}</li>
          </ol>
        </section>

        <section className="settings-section-header">
          <div>
            <h2>{t("caution")}</h2>
            <p>{t("restoreCaution")}</p>
          </div>
        </section>
      </section>
    );
  }
}

function Toolbar({
  isAdmin,
  triggeringKind,
  title,
  description,
  children
}: {
  isAdmin: boolean;
  triggeringKind: DataMaintenanceRetrievalKind | null;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("maintenance");
  return (
    <div className="settings-section-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {isAdmin ? (
        <div className="data-maintenance-actions">{children}</div>
      ) : (
        <p className="readonly-note">{t("retrievalReadOnly")}</p>
      )}
      {triggeringKind ? <span className="sr-only">{t("submittingRetrieval", { kind: t(triggeringKind === "all" ? "all" : triggeringKind === "exchange_rates" ? "fx" : "prices") })}</span> : null}
    </div>
  );
}

function ManualUpdateButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button className="primary-button" type="button" onClick={onClick} disabled={disabled}>
      <CloudDownload size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

function DataMaintenanceTable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="data-maintenance-section">
      <h3>{title}</h3>
      <div className="table-wrap">{children}</div>
    </section>
  );
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-maintenance-backup-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function toQuery(input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

function formatInstrument(instrument: Instrument): string {
  return instrument.symbol ? `${instrument.symbol} - ${instrument.shortName}` : instrument.shortName;
}

function formatInstrumentLabel(price: InstrumentPriceListRecord): string {
  const symbol = price.instrumentSymbol ?? price.sourceSymbol;
  return symbol ? `${symbol} ${price.instrumentName}` : price.instrumentName || price.instrumentId;
}
