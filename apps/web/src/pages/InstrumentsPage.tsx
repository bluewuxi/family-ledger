import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPES,
  CURRENCY_CODES,
  MARKET_REGION_LABELS,
  MARKET_REGIONS,
  PRICE_SOURCE_LABELS,
  PRICE_SOURCES,
  type AssetType,
  type AuthenticatedUser,
  type CreateInstrumentInput,
  type CurrencyCode,
  type Instrument,
  type MarketRegion,
  type PriceSource
} from "@family-ledger/shared";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";

interface InstrumentsResponse {
  user: AuthenticatedUser;
  instruments: Instrument[];
}

interface InstrumentResponse {
  instrument: Instrument;
}

interface DeleteInstrumentResponse {
  deleted: boolean;
}

interface InstrumentFormState {
  symbol: string;
  name: string;
  description: string;
  marketRegion: MarketRegion;
  exchange: string;
  currency: CurrencyCode;
  assetType: AssetType;
  isin: string;
  provider: string;
  priceSource: PriceSource;
  priceSourceSymbol: string;
  priceSourceExchange: string;
  priceUpdateEnabled: boolean;
  priceUpdatePriority: number;
  sourceUrl: string;
  sourceCheckedAt: string;
  notes: string;
}

const emptyForm: InstrumentFormState = {
  symbol: "",
  name: "",
  description: "",
  marketRegion: "US",
  exchange: "",
  currency: "USD",
  assetType: "stock",
  isin: "",
  provider: "",
  priceSource: "manual",
  priceSourceSymbol: "",
  priceSourceExchange: "",
  priceUpdateEnabled: false,
  priceUpdatePriority: 9,
  sourceUrl: "",
  sourceCheckedAt: "",
  notes: ""
};

export function InstrumentsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<InstrumentFormState>(emptyForm);
  const [editingInstrumentId, setEditingInstrumentId] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const formTitle = editingInstrumentId ? "编辑投资标的" : "新增投资标的";
  const editingInstrument = useMemo(
    () => instruments.find((instrument) => instrument.id === editingInstrumentId) ?? null,
    [instruments, editingInstrumentId]
  );

  useEffect(() => {
    void loadInstruments();
  }, []);

  async function loadInstruments() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<InstrumentsResponse>("/instruments");
      setUser(data.user);
      setInstruments(data.instruments);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = toInstrumentInput(form);
      const data = editingInstrumentId
        ? await apiPut<InstrumentResponse>(`/instruments/${editingInstrumentId}`, payload)
        : await apiPost<InstrumentResponse>("/instruments", payload);

      setInstruments((current) =>
        sortInstruments(
          editingInstrumentId
            ? current.map((instrument) => (instrument.id === data.instrument.id ? data.instrument : instrument))
            : [...current, data.instrument]
        )
      );
      clearForm();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(instrument: Instrument) {
    const label = instrument.symbol ? `${instrument.symbol} ${instrument.name}` : instrument.name;
    const confirmed = window.confirm(`确定删除投资标的“${label}”？已有交易或价格记录的标的不能删除。`);

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiDelete<DeleteInstrumentResponse>(`/instruments/${instrument.id}`);
      setInstruments((current) => current.filter((item) => item.id !== instrument.id));

      if (editingInstrumentId === instrument.id) {
        clearForm();
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(instrument: Instrument) {
    setEditingInstrumentId(instrument.id);
    setForm({
      symbol: instrument.symbol ?? "",
      name: instrument.name,
      description: instrument.description ?? "",
      marketRegion: instrument.marketRegion,
      exchange: instrument.exchange ?? "",
      currency: instrument.currency,
      assetType: instrument.assetType,
      isin: instrument.isin ?? "",
      provider: instrument.provider ?? "",
      priceSource: instrument.priceSource,
      priceSourceSymbol: instrument.priceSourceSymbol ?? "",
      priceSourceExchange: instrument.priceSourceExchange ?? "",
      priceUpdateEnabled: instrument.priceUpdateEnabled,
      priceUpdatePriority: instrument.priceUpdatePriority,
      sourceUrl: instrument.sourceUrl ?? "",
      sourceCheckedAt: toLocalDateTimeValue(instrument.sourceCheckedAt),
      notes: instrument.notes ?? ""
    });
  }

  function clearForm() {
    setEditingInstrumentId(null);
    setForm(emptyForm);
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>投资标的</h1>
          <p>维护股票、ETF、基金和现金标的，以及后续行情任务使用的价格来源配置。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadInstruments} disabled={loading || saving}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {isAdmin ? (
        <form className="instrument-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h2>{formTitle}</h2>
            {editingInstrument ? <span>正在编辑：{editingInstrument.name}</span> : <span>价格来源仅保存配置，不会自动抓取行情</span>}
          </div>

          <label>
            代码
            <input
              value={form.symbol}
              onChange={(event) => setForm({ ...form, symbol: event.target.value })}
              placeholder="例如 AMD、00700"
              required={form.assetType !== "other"}
            />
          </label>

          <label>
            名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例如 Advanced Micro Devices"
              required
            />
          </label>

          <label>
            类型
            <select
              value={form.assetType}
              onChange={(event) => setForm({ ...form, assetType: event.target.value as AssetType })}
            >
              {ASSET_TYPES.map((assetType) => (
                <option key={assetType} value={assetType}>
                  {ASSET_TYPE_LABELS[assetType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            市场
            <select
              value={form.marketRegion}
              onChange={(event) => setForm({ ...form, marketRegion: event.target.value as MarketRegion })}
            >
              {MARKET_REGIONS.map((marketRegion) => (
                <option key={marketRegion} value={marketRegion}>
                  {MARKET_REGION_LABELS[marketRegion]}
                </option>
              ))}
            </select>
          </label>

          <label>
            交易所/平台
            <input
              value={form.exchange}
              onChange={(event) => setForm({ ...form, exchange: event.target.value })}
              placeholder="例如 NASDAQ、HKEX、CASH"
              required={form.assetType !== "other"}
            />
          </label>

          <label>
            币种
            <select
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value as CurrencyCode })}
            >
              {CURRENCY_CODES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>

          <label>
            提供方
            <input
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              placeholder="例如 Vanguard、InvestNow"
            />
          </label>

          <label>
            ISIN
            <input value={form.isin} onChange={(event) => setForm({ ...form, isin: event.target.value })} placeholder="可选" />
          </label>

          <label>
            价格来源
            <select
              value={form.priceSource}
              onChange={(event) => setForm({ ...form, priceSource: event.target.value as PriceSource })}
            >
              {PRICE_SOURCES.map((priceSource) => (
                <option key={priceSource} value={priceSource}>
                  {PRICE_SOURCE_LABELS[priceSource]}
                </option>
              ))}
            </select>
          </label>

          <label>
            来源代码
            <input
              value={form.priceSourceSymbol}
              onChange={(event) => setForm({ ...form, priceSourceSymbol: event.target.value })}
              placeholder="例如 1810.HK"
            />
          </label>

          <label>
            来源交易所
            <input
              value={form.priceSourceExchange}
              onChange={(event) => setForm({ ...form, priceSourceExchange: event.target.value })}
              placeholder="例如 HKEX"
            />
          </label>

          <label>
            更新优先级
            <input
              type="number"
              min={0}
              step={1}
              value={form.priceUpdatePriority}
              onChange={(event) => setForm({ ...form, priceUpdatePriority: Number(event.target.value) })}
              required
            />
          </label>

          <label className="checkbox-field">
            自动更新行情
            <input
              type="checkbox"
              checked={form.priceUpdateEnabled}
              onChange={(event) => setForm({ ...form, priceUpdateEnabled: event.target.checked })}
            />
          </label>

          <label>
            来源核对时间
            <input
              type="datetime-local"
              value={form.sourceCheckedAt}
              onChange={(event) => setForm({ ...form, sourceCheckedAt: event.target.value })}
            />
          </label>

          <label className="wide-field">
            来源网址
            <input
              value={form.sourceUrl}
              onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
              placeholder="可选，用于记录信息来源"
            />
          </label>

          <label className="wide-field">
            说明
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="可选，记录标的简介"
              rows={3}
            />
          </label>

          <label className="wide-field">
            备注
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="可选"
              rows={2}
            />
          </label>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "保存中..." : editingInstrumentId ? "保存修改" : "新增标的"}
            </button>
            {editingInstrumentId ? (
              <button className="secondary-button" type="button" onClick={clearForm} disabled={saving}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      ) : !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看投资标的信息。新增、编辑和删除仅限 admin。</p>
      ) : null}

      <div className="table-wrap">
        <table className="instrument-table">
          <thead>
            <tr>
              <th>代码</th>
              <th>名称</th>
              <th>市场</th>
              <th>交易所/平台</th>
              <th>币种</th>
              <th>类型</th>
              <th>价格来源</th>
              <th>自动更新</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8}>正在加载投资标的...</td>
              </tr>
            ) : instruments.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8}>暂无投资标的。</td>
              </tr>
            ) : (
              instruments.map((instrument) => (
                <tr key={instrument.id}>
                  <td>{instrument.symbol ?? "-"}</td>
                  <td>{instrument.name}</td>
                  <td>{MARKET_REGION_LABELS[instrument.marketRegion]}</td>
                  <td>{instrument.exchange ?? "-"}</td>
                  <td>{instrument.currency}</td>
                  <td>{ASSET_TYPE_LABELS[instrument.assetType]}</td>
                  <td>{PRICE_SOURCE_LABELS[instrument.priceSource]}</td>
                  <td>{instrument.priceUpdateEnabled ? "是" : "否"}</td>
                  {isAdmin ? (
                    <td>
                      <div className="table-actions">
                        <button className="text-button" type="button" onClick={() => startEdit(instrument)} disabled={saving}>
                          编辑
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => void handleDelete(instrument)}
                          disabled={saving}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function toInstrumentInput(form: InstrumentFormState): CreateInstrumentInput {
  return {
    symbol: form.symbol,
    name: form.name,
    description: form.description,
    marketRegion: form.marketRegion,
    exchange: form.exchange,
    currency: form.currency,
    assetType: form.assetType,
    isin: form.isin,
    provider: form.provider,
    priceSource: form.priceSource,
    priceSourceSymbol: form.priceSourceSymbol,
    priceSourceExchange: form.priceSourceExchange,
    priceUpdateEnabled: form.priceUpdateEnabled,
    priceUpdatePriority: form.priceUpdatePriority,
    sourceUrl: form.sourceUrl,
    sourceCheckedAt: form.sourceCheckedAt ? new Date(form.sourceCheckedAt).toISOString() : null,
    notes: form.notes
  };
}

function toLocalDateTimeValue(timestamp: string | null): string {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function sortInstruments(instruments: Instrument[]): Instrument[] {
  return [...instruments].sort((left, right) => {
    const leftLabel = [left.marketRegion, left.exchange ?? "", left.symbol ?? "", left.name].join("|");
    const rightLabel = [right.marketRegion, right.exchange ?? "", right.symbol ?? "", right.name].join("|");
    return leftLabel.localeCompare(rightLabel, "zh-CN");
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "投资标的请求失败，请稍后重试。";
}
