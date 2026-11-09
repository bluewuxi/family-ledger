import { LanguageSwitch } from "../components/LanguageSwitch";
import { i18n } from "../i18n/instance";
import { getInvestmentLabel } from "../i18n/investmentLabels";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { InvestmentInstrumentTabs } from "../components/investments/InvestmentInstrumentTabs";
import { PageBackLink } from "../components/PageBackLink";
import { useAuth } from "../lib/authContext";
import { useSearchParams } from "react-router-dom";
import { InvestmentGroupsManager } from "../components/investments/InvestmentGroupsManager";
import { loadInvestmentGroups } from "../lib/investmentGroupsClient";
import type { InvestmentGroupConfiguration } from "@family-ledger/shared";
import { useEditDismissal } from "../lib/useEditDismissal";
import { observeAsync } from "../lib/observeAsync";
import { type FormEvent, type MouseEvent, useEffect, useId, useMemo, useState } from "react";
import { Eye, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import {
  ASSET_TYPES,
  CURRENCY_CODES,
  INSTRUMENT_SHORT_NAME_MAX_LENGTH,
  MARKET_REGIONS,
  PRICE_SOURCES,
  type AssetType,
  type AuthenticatedUser,
  type CreateInstrumentInput,
  type CurrencyCode,
  type Instrument,
  type MarketRegion,
  type PriceSource
} from "@family-ledger/shared";
import { Drawer } from "../components/Drawer";
import { PageTitle } from "../components/PageTitle";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";
import { isInteractiveRowTarget } from "../lib/tableInteraction";

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
  active: boolean;
  symbol: string;
  name: string;
  shortName: string;
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

type DrawerMode = "create" | "view" | "modify";

const emptyForm: InstrumentFormState = {
  active: true,
  symbol: "",
  name: "",
  shortName: "",
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

const supportedPriceSources = new Set<PriceSource>(["manual", "yahoo_finance", "eastmoney", "custom", "investnow_manual"]);

export function InstrumentsPage() {
  const {session}=useAuth();
  return <InstrumentsWorkspace key={`${session?.user.id}:${session?.user.role}:${session?.expiresAt}`} />;
}

function InstrumentsWorkspace() {
    const {t} = useTranslation(["investmentGroups", "navigation", "common"]);
  const {language} = useUiLanguage();
  const a = i18n.getFixedT(language, "instruments");
  const {session} = useAuth();
  const [groupReadError,setGroupReadError] = useState<UiErrorDescriptor|null>(null);
  const [params,setParams]=useSearchParams();
  const [groupConfiguration,setGroupConfiguration]=useState<InvestmentGroupConfiguration|null>(null);
  const groupTab=params.get("tab")==="groups";
  const tabsId=useId();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiErrorDescriptor | "requiredField" | "invalidField" | null>(null);
  const [form, setForm] = useState<InstrumentFormState>(emptyForm);
  const [editingInstrumentId, setEditingInstrumentId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isAdmin = session?.user.role === "admin" && !session.mustChangePassword;
  useEffect(()=>{if(!isAdmin||groupTab)return;let active=true;void loadInvestmentGroups().then(value=>{if(active)setGroupConfiguration(value);}).catch(()=>{if(active)setGroupConfiguration(null);});return()=>{active=false;};},[isAdmin,groupTab]);
  const tabs=<InvestmentInstrumentTabs id={tabsId} groups={groupTab&&isAdmin} isAdmin={isAdmin} onSelect={groups=>{const next=new URLSearchParams(params);if(groups)next.set('tab','groups');else next.delete('tab');setParams(next);}}/>;
  const formTitle = drawerMode === "create" ? a("create") : drawerMode === "modify" ? a("editInstrument") : a("details");
  const editingInstrument = useMemo(
    () => instruments.find((instrument) => instrument.id === editingInstrumentId) ?? null,
    [instruments, editingInstrumentId]
  );
  const isDrawerReadOnly = drawerMode === "view";

  useEffect(() => {
    observeAsync(loadInstruments());
  }, []);

  async function loadInstruments(bypassCache = false) {
    setGroupReadError(null);
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<InstrumentsResponse>("/instruments", { bypassCache });
      setUser(data.user);
      setInstruments(data.instruments);
    } catch (requestError) {
      setGroupReadError(describeUiError(requestError,"groupLoad"));
      setError(describeUiError(requestError, "investmentRead"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isDrawerReadOnly) {
      return;
    }

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
      closeDrawer();
    } catch (requestError) {
      setError(describeUiError(requestError, "instrumentSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(instrument: Instrument) {
    const label = instrument.symbol ? `${instrument.symbol} ${instrument.name}` : instrument.name;
    const confirmed = window.confirm(a("deleteConfirm", { name: label }));

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiDelete<DeleteInstrumentResponse>(`/instruments/${instrument.id}`);
      setInstruments((current) => current.filter((item) => item.id !== instrument.id));

      if (editingInstrumentId === instrument.id) {
        closeDrawer();
      }
    } catch (requestError) {
      setError(describeUiError(requestError, "instrumentDelete"));
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setEditingInstrumentId(null);
    setDrawerMode("create");
    setForm(emptyForm);
    setDrawerOpen(true);
  }

  function startDetail(instrument: Instrument) {
    setEditingInstrumentId(instrument.id);
    setDrawerMode(isAdmin ? "modify" : "view");
    setForm({
      symbol: instrument.symbol ?? "",
      name: instrument.name,
      shortName: instrument.shortName,
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
      active: instrument.active,
      priceUpdateEnabled: instrument.priceUpdateEnabled,
      priceUpdatePriority: instrument.priceUpdatePriority,
      sourceUrl: instrument.sourceUrl ?? "",
      sourceCheckedAt: toLocalDateTimeValue(instrument.sourceCheckedAt),
      notes: instrument.notes ?? ""
    });
    setDrawerOpen(true);
  }

  function handleInstrumentRowClick(event: MouseEvent<HTMLTableRowElement>, instrument: Instrument) {
    if (!isInteractiveRowTarget(event.target)) {
      startDetail(instrument);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingInstrumentId(null);
    setDrawerMode("create");
    setForm(emptyForm);
  }

  const requestDismiss = useEditDismissal(drawerOpen, saving, form, closeDrawer);

  if(groupTab) return <section>{params.get('from')==='distribution'?<PageBackLink to="/dashboard?distribution=groups" label={t("distribution")}/>:null}<header className="page-header"><PageTitle route="/instruments">{t("navigation:instruments")}</PageTitle></header>{tabs}<div id={tabsId+'-panel'} role="tabpanel" aria-labelledby={isAdmin?tabsId+'-tab-1':undefined}>{!isAdmin?<p role="alert">{translateUiError({key:session?.mustChangePassword?"passwordRequired":"forbidden"},language)}</p>:loading?<p role="status">{t("instrumentLoading")}</p>:groupReadError?<div role="alert"><p>{translateUiError(groupReadError,language)}</p><button type="button" className="secondary-button" onClick={()=>observeAsync(loadInstruments(true))}>{t("common:retry")}</button></div>:<InvestmentGroupsManager instruments={instruments} onConfiguration={setGroupConfiguration}/>}</div></section>;

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/instruments">{a("heading")}</PageTitle>
          <p>{a("help")}</p>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving}>
              <Plus size={17} aria-hidden="true" />
              <span>{a("add")}</span>
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => observeAsync(loadInstruments(true))} disabled={loading || saving}>
            <RefreshCw size={17} aria-hidden="true" />
            <span>{a("refresh")}</span>
          </button>
        </div>
      </header>

      {tabs}
      {error ? <p className="form-error">{typeof error === "string" ? a(error) : translateUiError(error, language)}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">{a("viewerHelp")}</p>
      ) : null}

      <div className="table-wrap" id={tabsId+"-panel"} role="tabpanel" aria-labelledby={tabsId+"-tab-0"}>
        <table className="instrument-table">
          <thead>
            <tr>
              <th>{a("symbol")}</th>
              <th>{a("shortName")}</th>
              <th>{a("name")}</th>{isAdmin?<th>{a("group")}</th>:null}
              <th>{a("market")}</th>
              <th>{a("exchange")}</th>
              <th>{a("currency")}</th>
              <th>{a("assetType")}</th>
              <th>{a("priceSource")}</th>
              <th>{a("status")}</th><th>{a("automaticUpdate")}</th>
              <th>{a("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10}>{a("loading")}</td>
              </tr>
            ) : instruments.length === 0 ? (
              <tr>
                <td colSpan={10}>{a("empty")}</td>
              </tr>
            ) : (
              instruments.map((instrument) => (
                <tr
                  className={[editingInstrumentId === instrument.id ? "editing-row" : "", "clickable-detail-row"]
                    .filter(Boolean)
                    .join(" ")}
                  key={instrument.id}
                  onClick={(event) => handleInstrumentRowClick(event, instrument)}
                >
                  <td>{instrument.symbol ?? "-"}</td>
                  <td>{instrument.shortName}</td>
                  <td>{instrument.name}</td>{isAdmin?<td>{instrument.assetType==="cash"?"—":<button type="button" className="text-button" onClick={()=>{const next=new URLSearchParams(params);next.set("tab","groups");setParams(next);}}>{groupConfiguration?groupConfiguration.groups.find(group=>group.instrumentIds.includes(instrument.id))?.name??a("ungrouped"):a("groupManagement")}</button>}</td>:null}
                  <td>{getInvestmentLabel("marketRegion", instrument.marketRegion, language)}</td>
                  <td>{instrument.exchange ?? "-"}</td>
                  <td>{instrument.currency}</td>
                  <td>{getInvestmentLabel("assetType", instrument.assetType, language)}</td>
                  <td>{instrument.assetType === "cash" ? "-" : getInvestmentLabel("priceSource", instrument.priceSource, language)}</td>
                  <td>{instrument.active === false ? a("inactive") : a("active")}</td><td>{instrument.assetType === "cash" ? "-" : instrument.priceUpdateEnabled ? a("yes") : a("no")}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        aria-label={a("instrumentAction", { action: isAdmin ? a("edit") : a("view"), name: instrument.name })}
                        className="icon-button"
                        title={isAdmin ? a("viewEdit") : a("view")}
                        type="button"
                        onClick={() => startDetail(instrument)}
                        disabled={saving}
                      >
                        <Eye size={15} aria-hidden="true" />
                      </button>
                      {isAdmin ? (
                        <button
                          aria-label={a("instrumentAction", { action: a("delete"), name: instrument.name })}
                          className="icon-button danger-icon-button"
                          title={a("delete")}
                          type="button"
                          onClick={() => observeAsync(handleDelete(instrument))}
                          disabled={saving}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={drawerOpen}
        title={formTitle}
        subtitle={
          editingInstrument
            ? a(drawerMode === "modify" ? "editingName" : "viewingName", { name: editingInstrument.name })
            : a("configurationOnly")
        }
        busy={saving}
        onClose={requestDismiss}
        footer={
          drawerMode === "view" ? (
            <button className="secondary-button" type="button" onClick={requestDismiss}>
              <X size={17} aria-hidden="true" />
              <span>{a("close")}</span>
            </button>
          ) : (
            <>
              <button className="primary-button" type="submit" form="instrument-drawer-form" disabled={saving}>
                {saving ? <RefreshCw size={17} aria-hidden="true" /> : editingInstrumentId ? <Save size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                <span>{saving ? a("saving") : editingInstrumentId ? a("saveChanges") : a("add")}</span>
              </button>
              <button className="secondary-button" type="button" onClick={requestDismiss} disabled={saving}>
                <X size={17} aria-hidden="true" />
                <span>{a("cancel")}</span>
              </button>
            </>
          )
        }
      >
        {error ? <p role="alert" className="form-error">{typeof error === "string" ? a(error) : translateUiError(error, language)}</p> : null}
        <LanguageSwitch />
        <form className="instrument-form drawer-form" id="instrument-drawer-form" onInvalidCapture={event => { event.preventDefault(); setError((event.target as HTMLInputElement).validity.valueMissing ? "requiredField" : "invalidField"); }} onSubmit={(...args) => observeAsync((handleSubmit)(...args))}>
          <label>

            {a("symbol")}
            <input
              value={form.symbol}
              onChange={(event) => setForm({ ...form, symbol: event.target.value })}
              placeholder={a("symbolExample")}
              disabled={isDrawerReadOnly}
              required={form.assetType !== "other"}
            />
          </label>

          <label>

            {a("name")}
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={a("nameExample")}
              disabled={isDrawerReadOnly}
              required
            />
          </label>

          <label>

            {a("shortName")}
            <input
              value={form.shortName}
              onChange={(event) => setForm({ ...form, shortName: event.target.value })}
              placeholder={a("shortNameExample")}
              disabled={isDrawerReadOnly}
              maxLength={INSTRUMENT_SHORT_NAME_MAX_LENGTH}
              required
            />
          </label>

          <label>

            {a("assetType")}
            <select
              value={form.assetType}
              onChange={(event) => setForm({ ...form, assetType: event.target.value as AssetType })}
              disabled={isDrawerReadOnly}
            >
              {ASSET_TYPES.map((assetType) => (
                <option key={assetType} value={assetType}>
                  {getInvestmentLabel("assetType", assetType, language)}
                </option>
              ))}
            </select>
          </label>

          <label>

            {a("market")}
            <select
              value={form.marketRegion}
              onChange={(event) => setForm({ ...form, marketRegion: event.target.value as MarketRegion })}
              disabled={isDrawerReadOnly}
            >
              {MARKET_REGIONS.map((marketRegion) => (
                <option key={marketRegion} value={marketRegion}>
                  {getInvestmentLabel("marketRegion", marketRegion, language)}
                </option>
              ))}
            </select>
          </label>

          <label>

            {a("exchange")}
            <input
              value={form.exchange}
              onChange={(event) => setForm({ ...form, exchange: event.target.value })}
              placeholder={a("exchangeExample")}
              disabled={isDrawerReadOnly}
              required={form.assetType !== "other"}
            />
          </label>

          <label>

            {a("currency")}
            <select
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value as CurrencyCode })}
              disabled={isDrawerReadOnly}
            >
              {CURRENCY_CODES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>

          <label>

            {a("provider")}
            <input
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              placeholder={a("providerExample")}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>
            ISIN
            <input value={form.isin} onChange={(event) => setForm({ ...form, isin: event.target.value })} placeholder={a("optional")} disabled={isDrawerReadOnly} />
          </label>

          <label>

            {a("priceSource")}
            <select
              value={form.priceSource}
              onChange={(event) => setForm({ ...form, priceSource: event.target.value as PriceSource })}
              disabled={isDrawerReadOnly}
            >
              {PRICE_SOURCES.map((priceSource) => (
                <option key={priceSource} value={priceSource} disabled={!supportedPriceSources.has(priceSource)}>
                  {getInvestmentLabel("priceSource", priceSource, language)}
                </option>
              ))}
            </select>
          </label>

          <label>

            {a("sourceSymbol")}
            <input
              value={form.priceSourceSymbol}
              onChange={(event) => setForm({ ...form, priceSourceSymbol: event.target.value })}
              placeholder={a("sourceSymbolExample")}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>

            {a("sourceExchange")}
            <input
              value={form.priceSourceExchange}
              onChange={(event) => setForm({ ...form, priceSourceExchange: event.target.value })}
              placeholder={a("sourceExchangeExample")}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>

            {a("priority")}
            <input
              type="number"
              min={0}
              step={1}
              value={form.priceUpdatePriority}
              onChange={(event) => setForm({ ...form, priceUpdatePriority: Number(event.target.value) })}
              disabled={isDrawerReadOnly}
              required
            />
          </label>
          <label className="checkbox-field">{a("enable")}<input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} disabled={isDrawerReadOnly} /></label>

          <label className="checkbox-field">

            {a("enableUpdates")}
            <input
              type="checkbox"
              checked={form.priceUpdateEnabled}
              onChange={(event) => setForm({ ...form, priceUpdateEnabled: event.target.checked })}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>

            {a("sourceCheckedAt")}
            <input
              type="datetime-local"
              value={form.sourceCheckedAt}
              onChange={(event) => setForm({ ...form, sourceCheckedAt: event.target.value })}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label className="wide-field">

            {a("sourceUrl")}
            <input
              value={form.sourceUrl}
              onChange={(event) => setForm({ ...form, sourceUrl: event.target.value })}
              placeholder={a("sourceUrlHint")}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label className="wide-field">

            {a("description")}
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={a("descriptionHint")}
              rows={3}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label className="wide-field">

            {a("notes")}
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={a("optional")}
              rows={2}
              disabled={isDrawerReadOnly}
            />
          </label>
        </form>
      </Drawer>
    </section>
  );
}

function toInstrumentInput(form: InstrumentFormState): CreateInstrumentInput {
  return {
    symbol: form.symbol,
    name: form.name,
    shortName: form.shortName,
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
    active: form.active,
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
    const leftLabel = [left.marketRegion, left.exchange ?? "", left.symbol ?? "", left.shortName].join("|");
    const rightLabel = [right.marketRegion, right.exchange ?? "", right.symbol ?? "", right.shortName].join("|");
    return leftLabel.localeCompare(rightLabel, "zh-CN");
  });
}
