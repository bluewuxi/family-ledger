import { PaginationControls } from "../components/PaginationControls";
import { type FormEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { CloudDownload, Eye, Filter, RefreshCw } from "lucide-react";
import type {
  AuthenticatedUser,
  CurrencyCode,
  DataMaintenanceBackupRun,
  DataMaintenanceBackupSummary,
  DataMaintenanceRetrievalKind,
  DataProviderRun,
  ExchangeRateRecord,
  Instrument,
  InstrumentPriceRecord,
  KernelPriceAnchor,
  JobRun,
  JobRunStatus,
  JobTriggerSource,
  Pagination,
  MarketDataSourceSummary
} from "@family-ledger/shared";
import { CURRENCY_CODES, JOB_RUN_STATUSES, JOB_TRIGGER_SOURCES } from "@family-ledger/shared";
import { PageTitle } from "../components/PageTitle";
import { Drawer } from "../components/Drawer";
import { ApiClientError, apiGet, apiPost } from "../lib/apiClient";
import { formatDisplayPrice } from "../lib/numberFormat";
import { isInteractiveRowTarget } from "../lib/tableInteraction";
import { formatLocalDateTime } from "../lib/timeFormat";

type DataMaintenanceTab = "sources" | "fx" | "prices" | "logs" | "backups" | "restore";

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
  jobRuns: JobRun[];
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

export function DataMaintenancePage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<DataMaintenanceTab>("sources");
  const [dataSources, setDataSources] = useState<MarketDataSourceSummary[]>([]);
  const [kernelAnchors, setKernelAnchors] = useState<KernelPriceAnchor[]>([]);
  const [kernelDrawerOpen, setKernelDrawerOpen] = useState(false);
  const [anchorDate, setAnchorDate] = useState("");
  const [kernelUnitPrice, setKernelUnitPrice] = useState("");
  const [savingAnchor, setSavingAnchor] = useState(false);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [fxRates, setFxRates] = useState<ExchangeRateRecord[]>([]);
  const [prices, setPrices] = useState<InstrumentPriceListRecord[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const selectedJobRun = useMemo(
    () => jobRuns.find((jobRun) => jobRun.id === selectedJobRunId) ?? null,
    [jobRuns, selectedJobRunId]
  );
  const latestBackupRun = backupSummary.latestRun;

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    void loadActiveTab(0);
  }, [activeTab]);

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
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

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

  async function loadDataSources() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<DataSourcesResponse>("/data-maintenance/data-sources");
      setUser(data.user);
      setDataSources(data.dataSources);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
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
      setError(toErrorMessage(requestError));
    }
  }

  async function submitKernelAnchor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAnchor(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost<KernelAnchorResponse>("/data-maintenance/data-sources/kernel-estimate/anchors", {
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
      setNotice("锚点已保存，并已按下一 NZX 交易日的 USF 公布净值（NTA）重新计算估算价格。");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.code === "DATA_SOURCE_DATE_UNAVAILABLE") {
        setError("所选 Kernel 估值日期之后暂无已公布的 USF 净值（NTA），请稍后重试或检查日期。");
      } else if (requestError instanceof ApiClientError && requestError.code === "DATA_SOURCE_UNAVAILABLE") {
        setError("USF.NZ 数据源暂时不可用，请稍后重试。");
      } else {
        setError(toErrorMessage(requestError));
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
      setError(toErrorMessage(requestError));
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
      setError(toErrorMessage(requestError));
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
      setError(toErrorMessage(requestError));
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
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadProviderRuns(jobRunId: string) {
    try {
      const data = await apiGet<ProviderRunsResponse>(`/data-maintenance/job-runs/${jobRunId}/provider-runs`);
      setProviderRuns(data.providerRuns);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
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
      setNotice(`已提交抓取任务，请稍后刷新任务日志。请求编号：${data.retrieval.triggerRequestId}`);
      await loadActiveTab(0);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setTriggeringKind(null);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/data-maintenance">数据维护</PageTitle>
          <p>查看数据源、汇率、价格、任务日志、数据备份和数据恢复说明。写入由 Lambda API 和计划任务负责。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadActiveTab(0)} disabled={loading || triggeringKind !== null}>
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <div className="tabs" role="tablist" aria-label="数据维护分类">
        <button className={activeTab === "sources" ? "active" : undefined} type="button" onClick={() => setActiveTab("sources")}>
          数据源
        </button>
        <button className={activeTab === "fx" ? "active" : undefined} type="button" onClick={() => setActiveTab("fx")}>
          汇率
        </button>
        <button className={activeTab === "prices" ? "active" : undefined} type="button" onClick={() => setActiveTab("prices")}>
          价格
        </button>
        <button className={activeTab === "logs" ? "active" : undefined} type="button" onClick={() => setActiveTab("logs")}>
          任务日志
        </button>
        <button className={activeTab === "backups" ? "active" : undefined} type="button" onClick={() => setActiveTab("backups")}>
          数据备份
        </button>
        <button className={activeTab === "restore" ? "active" : undefined} type="button" onClick={() => setActiveTab("restore")}>
          数据恢复
        </button>
      </div>

      {activeTab === "sources" ? renderSourcesTab() : null}
      {activeTab === "fx" ? renderFxTab() : null}
      {activeTab === "prices" ? renderPricesTab() : null}
      {activeTab === "logs" ? renderLogsTab() : null}
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
            <h2>市场数据源</h2>
            <p>集中查看汇率、收盘价和估算价格的数据来源及配置状态。</p>
          </div>
        </div>
        <DataMaintenanceTable title="已接入数据源">
          <table className="data-maintenance-source-table">
            <thead>
              <tr>
                <th>数据源</th>
                <th>数据类型</th>
                <th>获取方式</th>
                <th>状态</th>
                <th className="numeric-cell">已配置标的</th>
                <th>最近批处理</th>
                <th>最新锚点</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={8} label="正在加载数据源..." />
              ) : dataSources.length === 0 ? (
                <EmptyRow colSpan={8} label="暂无数据源。" />
              ) : dataSources.map((source) => (
                <tr key={source.key}>
                  <td>{source.name}</td>
                  <td>{formatCapabilities(source.capabilities)}</td>
                  <td>{formatAcquisitionMethod(source.acquisitionMethod)}</td>
                  <td><span className={`status-badge source-status-${source.status}`}>{formatSourceStatus(source.status)}</span></td>
                  <td className="numeric-cell">{source.configuredTargetCount ?? "-"}</td>
                  <td>{source.latestBatchRun ? `${formatStatus(source.latestBatchRun.status)} · ${formatDateTime(source.latestBatchRun.providerStartedAt)}` : "-"}</td>
                  <td>{source.latestAnchorDate ?? "-"}</td>
                  <td>
                    {source.key === "kernel_estimate" ? (
                      <button className="secondary-button compact-button" type="button" onClick={() => void openKernelSource()}>
                        {isAdmin ? "新增锚点" : "查看"}
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
          title="汇率更新"
          description="提交后台任务，更新外币估值汇率。完成情况请查看任务日志。"
        >
          <ManualUpdateButton
            label={triggeringKind === "exchange_rates" ? "提交中..." : "提交汇率更新"}
            onClick={() => void triggerRetrieval("exchange_rates")}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar data-maintenance-filter-bar fx-filter-bar" onSubmit={(event) => { event.preventDefault(); void loadFxRates(0); }}>
          <label>
            开始日期
            <input type="date" value={fxFilters.from} onChange={(event) => setFxFilters({ ...fxFilters, from: event.target.value })} />
          </label>
          <label>
            结束日期
            <input type="date" value={fxFilters.to} onChange={(event) => setFxFilters({ ...fxFilters, to: event.target.value })} />
          </label>
          <label>
            源币种
            <select
              value={fxFilters.fromCurrency}
              onChange={(event) => setFxFilters({ ...fxFilters, fromCurrency: event.target.value as "" | CurrencyCode })}
            >
              <option value="">全部</option>
              {CURRENCY_CODES.filter((currency) => currency !== "USD").map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标币种
            <select
              value={fxFilters.toCurrency}
              onChange={(event) => setFxFilters({ ...fxFilters, toCurrency: event.target.value as "" | CurrencyCode })}
            >
              <option value="">全部</option>
              {CURRENCY_CODES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            数据源
            <input value={fxFilters.provider} onChange={(event) => setFxFilters({ ...fxFilters, provider: event.target.value })} placeholder="Frankfurter" />
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            筛选
          </button>
        </form>

        <DataMaintenanceTable title="汇率记录">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>币种</th>
                <th className="numeric-cell">汇率</th>
                <th>用途</th>
                <th>数据源</th>
                <th>抓取时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={6} label="正在加载汇率..." />
              ) : fxRates.length === 0 ? (
                <EmptyRow colSpan={6} label="暂无汇率记录。" />
              ) : (
                fxRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.rateDate}</td>
                    <td>
                      {rate.fromCurrency} / {rate.toCurrency}
                    </td>
                    <td className="numeric-cell">{formatDisplayPrice(rate.rate)}</td>
                    <td>{rate.rateType === "valuation" ? "估值" : "税务辅助"}</td>
                    <td>{rate.provider}</td>
                    <td>{formatDateTime(rate.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={fxPagination} loading={loading} onPageChange={(offset) => void loadFxRates(offset)} />
      </section>
    );
  }

  function renderPricesTab() {
    return (
      <section className="data-maintenance-panel">
        <Toolbar
          isAdmin={isAdmin}
          triggeringKind={triggeringKind}
          title="价格更新"
          description="提交后台任务，抓取投资标的收盘价。完成情况请查看任务日志。"
        >
          <ManualUpdateButton
            label={triggeringKind === "instrument_prices" ? "提交中..." : "提交收盘价更新"}
            onClick={() => void triggerRetrieval("instrument_prices")}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar data-maintenance-filter-bar price-filter-bar" onSubmit={(event) => { event.preventDefault(); void loadPrices(0); }}>
          <label>
            开始日期
            <input type="date" value={priceFilters.from} onChange={(event) => setPriceFilters({ ...priceFilters, from: event.target.value })} />
          </label>
          <label>
            结束日期
            <input type="date" value={priceFilters.to} onChange={(event) => setPriceFilters({ ...priceFilters, to: event.target.value })} />
          </label>
          <label>
            标的
            <select
              value={priceFilters.instrumentId}
              onChange={(event) => setPriceFilters({ ...priceFilters, instrumentId: event.target.value })}
            >
              <option value="">全部</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {formatInstrument(instrument)}
                </option>
              ))}
            </select>
          </label>
          <label>
            数据源
            <input value={priceFilters.provider} onChange={(event) => setPriceFilters({ ...priceFilters, provider: event.target.value })} />
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            筛选
          </button>
        </form>

        <DataMaintenanceTable title="价格记录">
          <table className="data-maintenance-price-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>标的</th>
                <th className="numeric-cell">价格</th>
                <th>币种</th>
                <th>数据源</th>
                <th>数据源代码</th>
                <th>抓取时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label="正在加载价格..." />
              ) : prices.length === 0 ? (
                <EmptyRow colSpan={7} label="暂无价格记录。" />
              ) : (
                prices.map((price) => (
                  <tr key={price.id}>
                    <td>{price.priceDate}</td>
                    <td>{formatInstrumentLabel(price)}</td>
                    <td className="numeric-cell">{formatDisplayPrice(price.closePrice)}</td>
                    <td>{price.currency}</td>
                    <td>
                      {price.provider}
                      {price.isEstimated ? <span className="estimate-badge">估算</span> : null}
                    </td>
                    <td>{price.sourceSymbol ?? "-"}</td>
                    <td>{formatDateTime(price.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={pricePagination} loading={loading} onPageChange={(offset) => void loadPrices(offset)} />
      </section>
    );
  }

  function renderLogsTab() {
    return (
      <section className="data-maintenance-panel">
        <form className="filter-bar data-maintenance-filter-bar log-filter-bar" onSubmit={(event) => { event.preventDefault(); void loadJobRuns(0); }}>
          <label>
            任务
            <input value={logFilters.jobName} onChange={(event) => setLogFilters({ ...logFilters, jobName: event.target.value })} />
          </label>
          <label>
            状态
            <select value={logFilters.status} onChange={(event) => setLogFilters({ ...logFilters, status: event.target.value as "" | JobRunStatus })}>
              <option value="">全部</option>
              {JOB_RUN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>
          <label>
            触发方式
            <select
              value={logFilters.triggerSource}
              onChange={(event) => setLogFilters({ ...logFilters, triggerSource: event.target.value as "" | JobTriggerSource })}
            >
              <option value="">全部</option>
              {JOB_TRIGGER_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {formatTriggerSource(source)}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            <Filter size={16} aria-hidden="true" />
            筛选
          </button>
        </form>

        <DataMaintenanceTable title="任务日志">
          <table className="data-maintenance-job-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>触发方式</th>
                <th>开始时间</th>
                <th>完成时间</th>
                <th className="numeric-cell">新增 / 跳过</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label="正在加载任务日志..." />
              ) : jobRuns.length === 0 ? (
                <EmptyRow colSpan={7} label="暂无任务日志。" />
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
                      <button className="text-button" type="button" onClick={() => void handleSelectJobRun(jobRun.id)}>
                        <Eye size={15} aria-hidden="true" />
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={logPagination} loading={loading} onPageChange={(offset) => void loadJobRuns(offset)} />
      </section>
    );
  }

  function handleJobRunRowClick(event: MouseEvent<HTMLTableRowElement>, jobRunId: string) {
    if (!isInteractiveRowTarget(event.target)) {
      void handleSelectJobRun(jobRunId);
    }
  }

  function renderKernelDrawer() {
    const latestAnchor = kernelAnchors.find(anchor => !anchor.derivedFromAnchorId) ?? null;
    const kernelSource = dataSources.find((source) => source.key === "kernel_estimate") ?? null;
    return (
      <Drawer
        open={kernelDrawerOpen}
        title="Kernel 价格估算"
        subtitle="S&P 500（非对冲）基金"
        onClose={() => setKernelDrawerOpen(false)}
        footer={
          <button className="secondary-button" type="button" onClick={() => setKernelDrawerOpen(false)}>
            关闭
          </button>
        }
      >
        <div className="detail-drawer-content kernel-source-drawer">
          <section className="detail-section">
            <h3>估算方法</h3>
            <dl className="detail-grid">
              <div><dt>目标基金</dt><dd>Kernel S&P 500 (Unhedged)</dd></div>
              <div><dt>代理标的</dt><dd>USF（NZD，公布净值 NTA）</dd></div>
              <div><dt>当前状态</dt><dd>{kernelSource ? formatSourceStatus(kernelSource.status) : "-"}</dd></div>
              <div><dt>最新锚点</dt><dd>{latestAnchor?.anchorDate ?? "尚未配置"}</dd></div>
              <div><dt>最新准确价格</dt><dd>{latestAnchor ? formatDisplayPrice(latestAnchor.kernelUnitPrice) : "-"}</dd></div>
            </dl>
            <p className="form-hint">估算价格 = 实际基准基金价格 × 对应日期的 USF 净值 ÷ 基准对应的 USF 净值。</p>
            <p className="form-hint">Kernel 日期按美国市场估值日填写；系统使用下一 NZX 交易日日期对应的 USF 公布净值（NTA），并将估算记录在对应的前一估值日。尚未公布时沿用最近价格；缺失日期不补值。</p>
            <p className="form-hint">该结果属于估算，可能因费用、现金和分红日期差异产生偏差。建议每季度及基金分红后新增锚点。</p>
          </section>

          {isAdmin ? (
            <section className="detail-section">
              <h3>新增锚点</h3>
              {error ? <p className="form-error">{error}</p> : null}
              {notice ? <p className="form-success">{notice}</p> : null}
              <form className="kernel-anchor-form" onSubmit={(event) => void submitKernelAnchor(event)}>
                <label>
                  Kernel 估值日期
                  <input type="date" required value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} />
                </label>
                <label>
                  Kernel 单位价格（NZD）
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    pattern="[0-9]+(?:\.[0-9]{1,10})?"
                    value={kernelUnitPrice}
                    onChange={(event) => setKernelUnitPrice(event.target.value)}
                    placeholder="例如 6.67"
                  />
                </label>
                <button className="primary-button" type="submit" disabled={savingAnchor}>
                  {savingAnchor ? "保存中..." : "新增锚点"}
                </button>
              </form>
            </section>
          ) : <p className="readonly-note">当前角色为 viewer，可查看锚点记录；新增锚点仅限 admin。</p>}

          <section className="detail-section">
            <h3>锚点历史</h3>
            <div className="table-wrap">
              <table className="kernel-anchor-table">
                <thead><tr><th>Kernel 估值日期</th><th className="numeric-cell">Kernel 价格</th><th>USF 参考日期</th><th className="numeric-cell">USF 参考值</th><th>创建时间</th></tr></thead>
                <tbody>
                  {kernelAnchors.length === 0 ? <EmptyRow colSpan={5} label="暂无锚点。" /> : kernelAnchors.map((anchor) => (
                    <tr key={anchor.id}>
                      <td>{anchor.anchorDate}</td>
                      <td className="numeric-cell">{formatDisplayPrice(anchor.kernelUnitPrice)}</td>
                      <td>{anchor.proxyPriceDate}</td>
                      <td className="numeric-cell">{formatDisplayPrice(anchor.proxyClose)}（{anchor.proxyValueType === "nta" ? "净值" : "历史开盘价"}）</td>
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
        title="任务详情"
        subtitle={selectedJobRun.jobName}
        onClose={() => setJobRunDetailOpen(false)}
        footer={
          <button className="secondary-button" type="button" onClick={() => setJobRunDetailOpen(false)}>
            关闭
          </button>
        }
      >
        <div className="detail-drawer-content">
          <section className="detail-section">
            <h3>任务信息</h3>
            <dl className="detail-grid">
              <div>
                <dt>状态</dt>
                <dd>{formatStatus(selectedJobRun.status)}</dd>
              </div>
              <div>
                <dt>触发方式</dt>
                <dd>{formatTriggerSource(selectedJobRun.triggerSource)}</dd>
              </div>
              <div>
                <dt>开始时间</dt>
                <dd>{formatDateTime(selectedJobRun.jobStartedAt)}</dd>
              </div>
              <div>
                <dt>完成时间</dt>
                <dd>{formatDateTime(selectedJobRun.jobFinishedAt)}</dd>
              </div>
              <div>
                <dt>新增 / 跳过</dt>
                <dd>
                  {selectedJobRun.recordsInserted} / {selectedJobRun.recordsSkipped}
                </dd>
              </div>
              <div>
                <dt>请求编号</dt>
                <dd>{selectedJobRun.triggerRequestId ?? "-"}</dd>
              </div>
              <div>
                <dt>触发用户</dt>
                <dd>{selectedJobRun.triggeredByUserId ?? "-"}</dd>
              </div>
              <div>
                <dt>记录更新时间</dt>
                <dd>{formatDateTime(selectedJobRun.updatedAt)}</dd>
              </div>
            </dl>
            {selectedJobRun.errorMessage ? <p className="form-error">{selectedJobRun.errorMessage}</p> : null}
          </section>

          <section className="detail-section">
            <h3>数据源日志</h3>
            <div className="table-wrap">
              <table className="data-maintenance-provider-table">
                <thead>
                  <tr>
                    <th>数据源</th>
                    <th>数据类型</th>
                    <th>状态</th>
                    <th>开始时间</th>
                    <th>完成时间</th>
                    <th className="numeric-cell">新增 / 跳过</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {providerRuns.length === 0 ? (
                    <EmptyRow colSpan={7} label="暂无数据源日志。" />
                  ) : (
                    providerRuns.map((run) => (
                      <tr key={run.id}>
                        <td>{run.provider}</td>
                        <td>{run.dataKind === "exchange_rates" ? "汇率" : "价格"}</td>
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
        <section className="data-maintenance-backup-summary" aria-label="备份状态">
          <MetricBlock label="最新状态" value={latestBackupRun ? formatStatus(latestBackupRun.status) : "暂无备份记录"} />
          <MetricBlock
            label="最近成功"
            value={backupSummary.latestSucceededRun ? formatDateTime(backupSummary.latestSucceededRun.finishedAt) : "--"}
          />
          <MetricBlock label="备份行数" value={formatOptionalNumber(latestBackupRun?.recordsInserted ?? null)} />
          <MetricBlock label="耗时" value={formatDuration(latestBackupRun?.durationSeconds ?? null)} />
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
              <h2>暂无备份记录</h2>
              <p>计划任务完成后会在这里显示最近的账本备份状态。</p>
            </div>
          </section>
        )}

        <section className="settings-section-header">
          <div>
            <h2>备份范围</h2>
            <p>备份写入私有加密 S3，保留 30 天；不包含 Supabase Auth 内部表、SSM 参数、服务密钥或交易密码明文。</p>
          </div>
        </section>

        <DataMaintenanceTable title="备份记录">
          <table className="data-maintenance-backup-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>触发方式</th>
                <th>开始时间</th>
                <th>完成时间</th>
                <th className="numeric-cell">备份行数</th>
                <th className="numeric-cell">耗时</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label="正在加载备份记录..." />
              ) : backupRuns.length === 0 ? (
                <EmptyRow colSpan={7} label="暂无备份记录。" />
              ) : (
                backupRuns.map((backupRun) => (
                  <tr key={backupRun.id}>
                    <td>{formatStatus(backupRun.status)}</td>
                    <td>{formatOptionalTriggerSource(backupRun.triggerSource)}</td>
                    <td>{formatDateTime(backupRun.startedAt)}</td>
                    <td>{formatDateTime(backupRun.finishedAt)}</td>
                    <td className="numeric-cell">{formatOptionalNumber(backupRun.recordsInserted)}</td>
                    <td className="numeric-cell">{formatDuration(backupRun.durationSeconds)}</td>
                    <td>{backupRun.friendlyFailureReason ?? "--"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataMaintenanceTable>
        <PaginationControls pagination={backupPagination} loading={loading} onPageChange={(offset) => void loadBackupRuns(offset)} />
      </section>
    );
  }

  function renderRestoreTab() {
    return (
      <section className="data-maintenance-panel">
        <section className="settings-section-header">
          <div>
            <h2>数据恢复说明</h2>
            <p>数据恢复目前不在网页中执行。需要恢复时，由维护人员在受控环境中使用最近一次可用备份进行验证和恢复。</p>
          </div>
        </section>

        <section className="data-maintenance-restore-instructions" aria-label="数据恢复步骤">
          <h3>恢复步骤</h3>
          <ol>
            <li>确认需要恢复的目标时间点，并在“数据备份”页查看最近一次成功备份的完成时间和备份行数。</li>
            <li>暂停会写入账本数据的计划任务和手动维护操作，避免恢复过程中产生新的价格、汇率或账本变更。</li>
            <li>在后端受控环境中从私有加密 S3 备份桶取回对应备份对象，不要把备份文件下载到个人设备或提交到仓库。</li>
            <li>先执行恢复 dry-run，确认备份文件可读、表结构匹配、记录数量符合预期，并保存验证日志。</li>
            <li>确认 dry-run 通过后，再执行正式恢复；恢复完成后单独重建或重置交易密码 SSM 参数和额外密码 SecureString gate。</li>
            <li>运行数据校验脚本，并检查登录、持仓、交易、汇率、价格、任务日志和交易密码查看流程。</li>
            <li>恢复验证完成后重新启用计划任务，并记录恢复原因、备份时间点、操作者和验证结果。</li>
          </ol>
        </section>

        <section className="settings-section-header">
          <div>
            <h2>注意事项</h2>
            <p>恢复操作可能覆盖现有数据，只允许在明确批准后由维护人员执行。网页只展示说明，不提供恢复按钮、下载链接或备份对象路径。</p>
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
  return (
    <div className="settings-section-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {isAdmin ? (
        <div className="data-maintenance-actions">{children}</div>
      ) : (
        <p className="readonly-note">当前角色为 viewer，可查看维护数据和日志；手动抓取仅限 admin。</p>
      )}
      {triggeringKind ? <span className="sr-only">正在提交 {triggeringKind}</span> : null}
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

function formatCapabilities(capabilities: MarketDataSourceSummary["capabilities"]): string {
  return capabilities.map((capability) => {
    if (capability === "exchange_rates") return "汇率";
    if (capability === "dashboard_quotes") return "实时行情";
    return "价格";
  }).join("、");
}

function formatAcquisitionMethod(method: MarketDataSourceSummary["acquisitionMethod"]): string {
  if (method === "public_api") return "公开 API";
  if (method === "public_web_page") return "公开网页";
  return "代理估算";
}

function formatSourceStatus(status: MarketDataSourceSummary["status"]): string {
  if (status === "ready") return "已就绪";
  if (status === "inactive") return "未启用";
  return "待配置";
}

function formatStatus(status: JobRunStatus): string {
  if (status === "succeeded") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  return "进行中";
}

function formatTriggerSource(source: JobTriggerSource): string {
  return source === "manual" ? "手动" : "计划任务";
}

function formatOptionalTriggerSource(source: JobTriggerSource | null): string {
  return source ? formatTriggerSource(source) : "--";
}

function formatBackupHeadline(backupRun: DataMaintenanceBackupRun): string {
  if (backupRun.status === "started") {
    return "备份进行中";
  }

  if (backupRun.status === "succeeded") {
    return "最近备份成功";
  }

  return backupRun.friendlyFailureReason === "有批处理任务仍在运行，备份会稍后重试。" ? "备份暂缓" : "最近备份失败";
}

function formatBackupDetail(backupRun: DataMaintenanceBackupRun): string {
  if (backupRun.status === "started") {
    return "备份任务已开始，完成后会更新记录。";
  }

  if (backupRun.status === "succeeded") {
    return `完成时间：${formatDateTime(backupRun.finishedAt)}，备份行数：${formatOptionalNumber(backupRun.recordsInserted)}。`;
  }

  return backupRun.friendlyFailureReason ?? "备份失败，请查看后台日志。";
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? "--" : String(value);
}

function formatDuration(value: number | null): string {
  if (value === null) {
    return "--";
  }

  if (value < 60) {
    return `${value} 秒`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return seconds === 0 ? `${minutes} 分钟` : `${minutes} 分 ${seconds} 秒`;
}

function formatDateTime(value: string | null): string {
  return formatLocalDateTime(value);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "数据维护请求失败，请稍后重试。";
}
