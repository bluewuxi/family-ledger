import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CloudDownload, Eye, Filter, RefreshCw } from "lucide-react";
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
  JobRun,
  JobRunStatus,
  JobTriggerSource,
  Pagination
} from "@family-ledger/shared";
import { CURRENCY_CODES, JOB_RUN_STATUSES, JOB_TRIGGER_SOURCES } from "@family-ledger/shared";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiGet, apiPost } from "../lib/apiClient";
import { formatDisplayPrice } from "../lib/numberFormat";
import { formatLocalDateTime } from "../lib/timeFormat";

type DataMaintenanceTab = "fx" | "prices" | "logs" | "backups" | "restore";

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
const emptyPagination: Pagination = { limit: pageSize, offset: 0, hasMore: false };
const emptyBackupPagination: Pagination = { limit: backupPageSize, offset: 0, hasMore: false };
const emptyBackupSummary: DataMaintenanceBackupSummary = { latestRun: null, latestSucceededRun: null };

export function DataMaintenancePage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<DataMaintenanceTab>("fx");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [fxRates, setFxRates] = useState<ExchangeRateRecord[]>([]);
  const [prices, setPrices] = useState<InstrumentPriceListRecord[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [providerRuns, setProviderRuns] = useState<DataProviderRun[]>([]);
  const [backupRuns, setBackupRuns] = useState<DataMaintenanceBackupRun[]>([]);
  const [backupSummary, setBackupSummary] = useState<DataMaintenanceBackupSummary>(emptyBackupSummary);
  const [selectedJobRunId, setSelectedJobRunId] = useState<string | null>(null);
  const [fxPagination, setFxPagination] = useState<Pagination>(emptyPagination);
  const [pricePagination, setPricePagination] = useState<Pagination>(emptyPagination);
  const [logPagination, setLogPagination] = useState<Pagination>(emptyPagination);
  const [backupPagination, setBackupPagination] = useState<Pagination>(emptyBackupPagination);
  const [fxFilters, setFxFilters] = useState<FxFilters>({ from: "", to: "", fromCurrency: "", toCurrency: "USD", provider: "" });
  const [priceFilters, setPriceFilters] = useState<PriceFilters>({ from: "", to: "", instrumentId: "", provider: "" });
  const [logFilters, setLogFilters] = useState<LogFilters>({ jobName: "", status: "", triggerSource: "" });
  const [loading, setLoading] = useState(false);
  const [triggeringKind, setTriggeringKind] = useState<DataMaintenanceRetrievalKind | null>(null);
  const [manualRetrievalSelection, setManualRetrievalSelection] = useState<Record<DataKindOption, boolean>>({
    exchange_rates: true,
    instrument_prices: true
  });
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
      const [instrumentData, fxData] = await Promise.all([
        apiGet<InstrumentsResponse>("/instruments"),
        apiGet<FxRatesResponse>(`/data-maintenance/fx-rates?${toQuery({ limit: pageSize, offset: 0, toCurrency: "USD" })}`)
      ]);
      setInstruments(instrumentData.instruments);
      setUser(fxData.user);
      setFxRates(fxData.fxRates);
      setFxPagination(fxData.pagination);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveTab(offset: number) {
    if (activeTab === "fx") {
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

      const nextSelectedJobRunId = selectedJobRunId ?? data.jobRuns[0]?.id ?? null;
      setSelectedJobRunId(nextSelectedJobRunId);
      if (nextSelectedJobRunId) {
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

  function triggerSelectedRetrieval() {
    const selectedKinds = dataKindOptions.filter((option) => manualRetrievalSelection[option.kind]);
    if (selectedKinds.length === 0) {
      setError("请至少选择一种要手动更新的数据。");
      setNotice(null);
      return;
    }

    const kind = selectedKinds.length === dataKindOptions.length ? "all" : selectedKinds[0].kind;
    void triggerRetrieval(kind);
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/data-maintenance">数据维护</PageTitle>
          <p>查看汇率、价格、任务日志、数据备份和数据恢复说明。写入由 Lambda API 和计划任务负责。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadActiveTab(0)} disabled={loading || triggeringKind !== null}>
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <div className="tabs" role="tablist" aria-label="数据维护分类">
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

      {activeTab === "fx" ? renderFxTab() : null}
      {activeTab === "prices" ? renderPricesTab() : null}
      {activeTab === "logs" ? renderLogsTab() : null}
      {activeTab === "backups" ? renderBackupsTab() : null}
      {activeTab === "restore" ? renderRestoreTab() : null}
    </section>
  );

  function renderFxTab() {
    return (
      <section className="data-maintenance-panel">
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <ManualUpdateButton
            label={triggeringKind === "exchange_rates" ? "提交中..." : "手动更新"}
            onClick={() => void triggerRetrieval("exchange_rates")}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void loadFxRates(0); }}>
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
            来源
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
                <th>来源</th>
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
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <ManualUpdateButton
            label={triggeringKind === "instrument_prices" ? "提交中..." : "手动更新"}
            onClick={() => void triggerRetrieval("instrument_prices")}
            disabled={triggeringKind !== null}
          />
        </Toolbar>

        <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void loadPrices(0); }}>
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
            来源
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
                <th>来源</th>
                <th>来源代码</th>
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
                    <td>{price.provider}</td>
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
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <div className="data-maintenance-manual-options" aria-label="手动更新范围">
            {dataKindOptions.map((option) => (
              <label key={option.kind}>
                <input
                  type="checkbox"
                  checked={manualRetrievalSelection[option.kind]}
                  onChange={(event) =>
                    setManualRetrievalSelection((current) => ({
                      ...current,
                      [option.kind]: event.target.checked
                    }))
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
          <ManualUpdateButton label={triggeringKind ? "提交中..." : "手动更新"} onClick={triggerSelectedRetrieval} disabled={triggeringKind !== null} />
        </Toolbar>

        <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void loadJobRuns(0); }}>
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
                  <tr className={selectedJobRunId === jobRun.id ? "selected-row" : undefined} key={jobRun.id}>
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

        {selectedJobRun ? (
          <DataMaintenanceTable title={`提供方日志：${selectedJobRun.jobName}`}>
            <table>
              <thead>
                <tr>
                  <th>提供方</th>
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
                  <EmptyRow colSpan={7} label="暂无提供方日志。" />
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
          </DataMaintenanceTable>
        ) : null}
      </section>
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
            <li>确认 dry-run 通过后，再执行正式恢复；恢复完成后运行数据校验脚本，并检查登录、持仓、交易、汇率、价格和任务日志页面。</li>
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
  children
}: {
  isAdmin: boolean;
  triggeringKind: DataMaintenanceRetrievalKind | null;
  children: ReactNode;
}) {
  return (
    <div className="settings-section-header">
      <div>
        <h2>维护控制</h2>
        <p>手动更新会提交后台任务：汇率更新外币估值汇率，价格更新投资标的收盘价。完成情况请查看任务日志。</p>
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

function PaginationControls({
  pagination,
  loading,
  onPageChange
}: {
  pagination: Pagination;
  loading: boolean;
  onPageChange: (offset: number) => void;
}) {
  const page = Math.floor(pagination.offset / pagination.limit) + 1;
  return (
    <div className="pagination-controls">
      <button
        className="secondary-button"
        type="button"
        disabled={loading || pagination.offset === 0}
        onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        上一页
      </button>
      <span>第 {page} 页</span>
      <button
        className="secondary-button"
        type="button"
        disabled={loading || !pagination.hasMore}
        onClick={() => onPageChange(pagination.offset + pagination.limit)}
      >
        <ChevronRight size={16} aria-hidden="true" />
        下一页
      </button>
    </div>
  );
}

type DataKindOption = "exchange_rates" | "instrument_prices";

const dataKindOptions: Array<{ kind: DataKindOption; label: string }> = [
  { kind: "exchange_rates", label: "汇率" },
  { kind: "instrument_prices", label: "价格" }
];

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
  return instrument.symbol ? `${instrument.symbol} - ${instrument.name}` : instrument.name;
}

function formatInstrumentLabel(price: InstrumentPriceListRecord): string {
  const symbol = price.instrumentSymbol ?? price.sourceSymbol;
  return symbol ? `${symbol} ${price.instrumentName}` : price.instrumentName || price.instrumentId;
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
