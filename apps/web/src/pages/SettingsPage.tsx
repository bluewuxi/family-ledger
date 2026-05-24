import { type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  AuthenticatedUser,
  DataProviderRun,
  ExchangeRateRecord,
  InstrumentPriceRecord,
  JobRun,
  MarketDataRetrievalKind
} from "@family-ledger/shared";
import { ApiClientError, apiGet, apiPost } from "../lib/apiClient";

interface FxRatesResponse {
  user: AuthenticatedUser;
  fxRates: ExchangeRateRecord[];
}

interface InstrumentPriceListRecord extends InstrumentPriceRecord {
  instrumentName: string;
  instrumentSymbol: string | null;
}

interface PricesResponse {
  user: AuthenticatedUser;
  prices: InstrumentPriceListRecord[];
}

interface JobRunsResponse {
  user: AuthenticatedUser;
  jobRuns: JobRun[];
}

interface ProviderRunsResponse {
  user: AuthenticatedUser;
  providerRuns: DataProviderRun[];
}

interface RetrievalResponse {
  retrieval: {
    kind: MarketDataRetrievalKind;
    triggered: string[];
    triggerRequestId: string;
  };
}

const limitQuery = "?limit=20";

export function SettingsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [fxRates, setFxRates] = useState<ExchangeRateRecord[]>([]);
  const [prices, setPrices] = useState<InstrumentPriceListRecord[]>([]);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [providerRuns, setProviderRuns] = useState<DataProviderRun[]>([]);
  const [selectedJobRunId, setSelectedJobRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggeringKind, setTriggeringKind] = useState<MarketDataRetrievalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const selectedJobRun = useMemo(
    () => jobRuns.find((jobRun) => jobRun.id === selectedJobRunId) ?? null,
    [jobRuns, selectedJobRunId]
  );

  useEffect(() => {
    void loadMarketData();
  }, []);

  async function loadMarketData() {
    setLoading(true);
    setError(null);

    try {
      const [fxRateData, priceData, jobRunData] = await Promise.all([
        apiGet<FxRatesResponse>(`/market-data/fx-rates${limitQuery}`),
        apiGet<PricesResponse>(`/market-data/instrument-prices${limitQuery}`),
        apiGet<JobRunsResponse>(`/market-data/job-runs${limitQuery}`)
      ]);
      setUser(fxRateData.user);
      setFxRates(fxRateData.fxRates);
      setPrices(priceData.prices);
      setJobRuns(jobRunData.jobRuns);

      const nextSelectedJobRunId = selectedJobRunId ?? jobRunData.jobRuns[0]?.id ?? null;
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
      await loadMarketData();
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
          <h1>设置</h1>
          <p>查看行情数据、手动触发行情抓取，并追踪每次抓取的执行日志。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadMarketData} disabled={loading || triggeringKind !== null}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-success">{notice}</p> : null}

      <section className="market-data-panel">
        <div className="settings-section-header">
          <div>
            <h2>行情数据</h2>
            <p>最近 20 条汇率、价格和抓取日志。写入仍由 Lambda API 和计划任务负责。</p>
          </div>
          {isAdmin ? (
            <div className="market-data-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => void triggerRetrieval("exchange_rates")}
                disabled={triggeringKind !== null}
              >
                {triggeringKind === "exchange_rates" ? "提交中..." : "抓取汇率"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void triggerRetrieval("instrument_prices")}
                disabled={triggeringKind !== null}
              >
                {triggeringKind === "instrument_prices" ? "提交中..." : "抓取价格"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void triggerRetrieval("all")}
                disabled={triggeringKind !== null}
              >
                {triggeringKind === "all" ? "提交中..." : "全部抓取"}
              </button>
            </div>
          ) : !loading && user ? (
            <p className="readonly-note">当前角色为 viewer，可查看行情数据和日志；手动抓取仅限 admin。</p>
          ) : null}
        </div>

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
                    <td>{rate.rate}</td>
                    <td>{rate.rateType === "valuation" ? "估值" : "税务辅助"}</td>
                    <td>{rate.provider}</td>
                    <td>{formatDateTime(rate.fetchedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </MarketDataTable>

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
                    <td>{price.closePrice}</td>
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

        <MarketDataTable title="抓取日志">
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
                <EmptyRow colSpan={7} label="暂无抓取日志。" />
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
    </section>
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
