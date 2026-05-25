import { type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  AuthenticatedUser,
  CurrencyCode,
  DataProviderRun,
  ExchangeRateRecord,
  Instrument,
  InstrumentPriceRecord,
  JobRun,
  JobRunStatus,
  JobTriggerSource,
  MarketDataRetrievalKind,
  Pagination
} from "@family-ledger/shared";
import { CURRENCY_CODES, JOB_RUN_STATUSES, JOB_TRIGGER_SOURCES } from "@family-ledger/shared";
import { ApiClientError, apiGet, apiPost } from "../lib/apiClient";
import { formatDisplayPrice } from "../lib/numberFormat";

type MarketDataTab = "fx" | "prices" | "logs";

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

interface InstrumentsResponse {
  instruments: Instrument[];
}

interface RetrievalResponse {
  retrieval: {
    kind: MarketDataRetrievalKind;
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
const emptyPagination: Pagination = { limit: pageSize, offset: 0, hasMore: false };

export function MarketDataPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [activeTab, setActiveTab] = useState<MarketDataTab>("fx");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [fxRates, setFxRates] = useState<ExchangeRateRecord[]>([]);
  const [prices, setPrices] = useState<InstrumentPriceListRecord[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [providerRuns, setProviderRuns] = useState<DataProviderRun[]>([]);
  const [selectedJobRunId, setSelectedJobRunId] = useState<string | null>(null);
  const [fxPagination, setFxPagination] = useState<Pagination>(emptyPagination);
  const [pricePagination, setPricePagination] = useState<Pagination>(emptyPagination);
  const [logPagination, setLogPagination] = useState<Pagination>(emptyPagination);
  const [fxFilters, setFxFilters] = useState<FxFilters>({ from: "", to: "", fromCurrency: "", toCurrency: "USD", provider: "" });
  const [priceFilters, setPriceFilters] = useState<PriceFilters>({ from: "", to: "", instrumentId: "", provider: "" });
  const [logFilters, setLogFilters] = useState<LogFilters>({ jobName: "", status: "", triggerSource: "" });
  const [loading, setLoading] = useState(false);
  const [triggeringKind, setTriggeringKind] = useState<MarketDataRetrievalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const selectedJobRun = useMemo(
    () => jobRuns.find((jobRun) => jobRun.id === selectedJobRunId) ?? null,
    [jobRuns, selectedJobRunId]
  );

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
        apiGet<FxRatesResponse>(`/market-data/fx-rates?${toQuery({ limit: pageSize, offset: 0, toCurrency: "USD" })}`)
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
    } else {
      await loadJobRuns(offset);
    }
  }

  async function loadFxRates(offset = fxPagination.offset) {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<FxRatesResponse>(
        `/market-data/fx-rates?${toQuery({
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
        `/market-data/instrument-prices?${toQuery({
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
        `/market-data/job-runs?${toQuery({
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

  async function loadProviderRuns(jobRunId: string) {
    try {
      const data = await apiGet<ProviderRunsResponse>(`/market-data/job-runs/${jobRunId}/provider-runs`);
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

  async function triggerRetrieval(kind: MarketDataRetrievalKind) {
    setTriggeringKind(kind);
    setError(null);
    setNotice(null);

    try {
      const data = await apiPost<RetrievalResponse>("/market-data/retrievals", { kind });
      setNotice(`已提交抓取任务，请稍后刷新日志。请求编号：${data.retrieval.triggerRequestId}`);
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
          <h1>数据同步</h1>
          <p>查看汇率、价格和同步日志。写入由 Lambda API 和计划任务负责。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadActiveTab(0)} disabled={loading || triggeringKind !== null}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <div className="tabs" role="tablist" aria-label="数据同步分类">
        <button className={activeTab === "fx" ? "active" : undefined} type="button" onClick={() => setActiveTab("fx")}>
          汇率
        </button>
        <button className={activeTab === "prices" ? "active" : undefined} type="button" onClick={() => setActiveTab("prices")}>
          价格
        </button>
        <button className={activeTab === "logs" ? "active" : undefined} type="button" onClick={() => setActiveTab("logs")}>
          同步日志
        </button>
      </div>

      {activeTab === "fx" ? renderFxTab() : null}
      {activeTab === "prices" ? renderPricesTab() : null}
      {activeTab === "logs" ? renderLogsTab() : null}
    </section>
  );

  function renderFxTab() {
    return (
      <section className="market-data-panel">
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <button
            className="primary-button"
            type="button"
            onClick={() => void triggerRetrieval("exchange_rates")}
            disabled={triggeringKind !== null}
          >
            {triggeringKind === "exchange_rates" ? "提交中..." : "抓取汇率"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void triggerRetrieval("all")} disabled={triggeringKind !== null}>
            {triggeringKind === "all" ? "提交中..." : "全部抓取"}
          </button>
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
            筛选
          </button>
        </form>

        <MarketDataTable title="汇率记录">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>币种</th>
                <th>汇率</th>
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
                    <td>{formatDisplayPrice(rate.rate)}</td>
                    <td>{rate.rateType === "valuation" ? "估值" : "税务辅助"}</td>
                    <td>{rate.provider}</td>
                    <td>{formatDateTime(rate.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </MarketDataTable>
        <PaginationControls pagination={fxPagination} loading={loading} onPageChange={(offset) => void loadFxRates(offset)} />
      </section>
    );
  }

  function renderPricesTab() {
    return (
      <section className="market-data-panel">
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <button
            className="primary-button"
            type="button"
            onClick={() => void triggerRetrieval("instrument_prices")}
            disabled={triggeringKind !== null}
          >
            {triggeringKind === "instrument_prices" ? "提交中..." : "抓取价格"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void triggerRetrieval("all")} disabled={triggeringKind !== null}>
            {triggeringKind === "all" ? "提交中..." : "全部抓取"}
          </button>
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
            筛选
          </button>
        </form>

        <MarketDataTable title="价格记录">
          <table className="market-price-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>标的</th>
                <th>价格</th>
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
                    <td>{formatDisplayPrice(price.closePrice)}</td>
                    <td>{price.currency}</td>
                    <td>{price.provider}</td>
                    <td>{price.sourceSymbol ?? "-"}</td>
                    <td>{formatDateTime(price.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </MarketDataTable>
        <PaginationControls pagination={pricePagination} loading={loading} onPageChange={(offset) => void loadPrices(offset)} />
      </section>
    );
  }

  function renderLogsTab() {
    return (
      <section className="market-data-panel">
        <Toolbar isAdmin={isAdmin} triggeringKind={triggeringKind}>
          <button
            className="primary-button"
            type="button"
            onClick={() => void triggerRetrieval("exchange_rates")}
            disabled={triggeringKind !== null}
          >
            抓取汇率
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void triggerRetrieval("instrument_prices")}
            disabled={triggeringKind !== null}
          >
            抓取价格
          </button>
          <button className="secondary-button" type="button" onClick={() => void triggerRetrieval("all")} disabled={triggeringKind !== null}>
            全部抓取
          </button>
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
                  {source === "manual" ? "手动" : "计划任务"}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit" disabled={loading}>
            筛选
          </button>
        </form>

        <MarketDataTable title="同步日志">
          <table className="market-job-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>触发方式</th>
                <th>开始时间</th>
                <th>完成时间</th>
                <th>新增 / 跳过</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <EmptyRow colSpan={7} label="正在加载日志..." />
              ) : jobRuns.length === 0 ? (
                <EmptyRow colSpan={7} label="暂无同步日志。" />
              ) : (
                jobRuns.map((jobRun) => (
                  <tr key={jobRun.id}>
                    <td>{jobRun.jobName}</td>
                    <td>{formatStatus(jobRun.status)}</td>
                    <td>{jobRun.triggerSource === "manual" ? "手动" : "计划任务"}</td>
                    <td>{formatDateTime(jobRun.jobStartedAt)}</td>
                    <td>{formatDateTime(jobRun.jobFinishedAt)}</td>
                    <td>
                      {jobRun.recordsInserted} / {jobRun.recordsSkipped}
                    </td>
                    <td>
                      <button className="text-button" type="button" onClick={() => void handleSelectJobRun(jobRun.id)}>
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </MarketDataTable>
        <PaginationControls pagination={logPagination} loading={loading} onPageChange={(offset) => void loadJobRuns(offset)} />

        {selectedJobRun ? (
          <MarketDataTable title={`提供方日志：${selectedJobRun.jobName}`}>
            <table>
              <thead>
                <tr>
                  <th>提供方</th>
                  <th>数据类型</th>
                  <th>状态</th>
                  <th>开始时间</th>
                  <th>完成时间</th>
                  <th>新增 / 跳过</th>
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
                      <td>
                        {run.recordsInserted} / {run.recordsSkipped}
                      </td>
                      <td>{run.errorMessage ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </MarketDataTable>
        ) : null}
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
  triggeringKind: MarketDataRetrievalKind | null;
  children: ReactNode;
}) {
  return (
    <div className="settings-section-header">
      <div>
        <h2>同步控制</h2>
        <p>手动抓取只提交后台任务，完成情况请查看同步日志。</p>
      </div>
      {isAdmin ? (
        <div className="market-data-actions">{children}</div>
      ) : (
        <p className="readonly-note">当前角色为 viewer，可查看行情数据和日志；手动抓取仅限 admin。</p>
      )}
      {triggeringKind ? <span className="sr-only">正在提交 {triggeringKind}</span> : null}
    </div>
  );
}

function MarketDataTable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="market-data-section">
      <h3>{title}</h3>
      <div className="table-wrap">{children}</div>
    </section>
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
        上一页
      </button>
      <span>第 {page} 页</span>
      <button
        className="secondary-button"
        type="button"
        disabled={loading || !pagination.hasMore}
        onClick={() => onPageChange(pagination.offset + pagination.limit)}
      >
        下一页
      </button>
    </div>
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
  return instrument.symbol ? `${instrument.symbol} - ${instrument.name}` : instrument.name;
}

function formatInstrumentLabel(price: InstrumentPriceListRecord): string {
  const symbol = price.instrumentSymbol ?? price.sourceSymbol;
  return symbol ? `${symbol} ${price.instrumentName}` : price.instrumentName || price.instrumentId;
}

function formatStatus(status: JobRun["status"]): string {
  if (status === "succeeded") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  return "进行中";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "行情数据请求失败，请稍后重试。";
}
