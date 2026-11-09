import { LanguageSwitch } from "../components/LanguageSwitch";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { i18n } from "../i18n/instance";
import { getInvestmentLabel } from "../i18n/investmentLabels";
import { getDisplayLocale, type UiLanguage } from "../i18n/language";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { AccountCreateWorkspace } from "../components/AccountCreateWorkspace";
import { useWorkflowDeparture } from "../lib/useWorkflowDeparture";
import { useEditDismissal } from "../lib/useEditDismissal";
import { observeAsync } from "../lib/observeAsync";
import { Fragment, type FormEvent, type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Eye, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  ACCOUNT_TYPES,
  ACCOUNT_PURPOSES,
  CURRENCY_CODES,
  MARKET_REGIONS,
  SNAPSHOT_DISPLAY_CURRENCIES,
  getLocalDateString,
  type AccountType,
  type AccountPurpose,
  type AuthenticatedUser,
  type CreateInvestmentAccountInput,
  type CreateInvestmentTransactionInput,
  type CurrencyCode,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type MarketRegion,
  type SnapshotDisplayCurrency,
  type HoldingsValuationSummary,
  type ValuedHoldingSummary
} from "@family-ledger/shared";
import { Drawer } from "../components/Drawer";
import { PageTitle } from "../components/PageTitle";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";
import {
  formatHoldingInstrument,
  formatHoldingLatestPrice,
  formatHoldingQuantity,
  formatHoldingWarnings
} from "../lib/holdingDisplay";
import { formatDisplayAmount, formatDisplayPrice, formatSignedDisplayAmount } from "../lib/numberFormat";
import { signedToneClass, usePreferences } from "../lib/preferencesContext";
import { isInteractiveRowTarget, isRowActivationKey } from "../lib/tableInteraction";

interface AccountsResponse {
  user: AuthenticatedUser;
  accounts: InvestmentAccount[];
}

interface InstrumentsResponse {
  instruments: Instrument[];
}

type HoldingsResponse = HoldingsValuationSummary;

interface AccountResponse {
  account: InvestmentAccount;
}

interface TransactionResponse {
  transaction: InvestmentTransaction;
}

interface DeleteAccountResponse {
  deleted: boolean;
}

interface AccountPasswordRevealResponse {
  tradingPassword: string;
}

interface AccountPasswordUpdateResponse {
  updated: true;
}

interface AccountFormState {
  name: string;
  broker: string;
  accountType: AccountType;
  purpose: AccountPurpose;
  baseCurrency: CurrencyCode;
  marketRegion: MarketRegion;
  notes: string;
  tradingInfo: string;
}

interface OpeningEntryFormRow {
  id: string;
  instrumentId: string;
  quantity: string;
  grossAmount: string;
  notes: string;
}

type DrawerMode = "create" | "view" | "modify";

const today = getLocalDateString();

const emptyForm: AccountFormState = {
  name: "",
  broker: "",
  accountType: "brokerage",
  purpose: "investment",
  baseCurrency: "NZD",
  marketRegion: "NZ",
  notes: "",
  tradingInfo: ""
};

interface AccountTotalDisplay {
  currency: SnapshotDisplayCurrency;
  marketValue: string | null;
}

export function AccountsPage({ createOnly = false }: { createOnly?: boolean }) {
  const { language } = useUiLanguage();
  const a = i18n.getFixedT(language, "accounts");
  const FormSurface = createOnly ? AccountCreateWorkspace : Drawer;
  const completed = useRef(false);
  const createdAccount = useRef<string | null>(null);
  const openingProgress = useRef({ succeeded: 0, total: 0 });
  const navigate = useNavigate();
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [purposeFilter, setPurposeFilter] = useState<AccountPurpose | "">("");
  const visibleAccounts = accounts.filter((account) => !purposeFilter || account.purpose === purposeFilter);
  const [accountTotals, setAccountTotals] = useState<Map<string, AccountTotalDisplay>>(new Map());
  const [accountHoldings, setAccountHoldings] = useState<ValuedHoldingSummary[]>([]);
  const [holdingsReportingCurrency, setHoldingsReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const accountSequence = useRef(0);
  const holdingsSequence = useRef(0);
  const [auxError, setAuxError] = useState<UiErrorDescriptor | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [totalsLoading, setTotalsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UiErrorDescriptor | "partialCreated" | "chooseInstrument" | "openingRequired" | "requiredField" | "invalidField" | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(createOnly);
  const [includeOpeningAssets, setIncludeOpeningAssets] = useState(false);
  const [openingTradeDate, setOpeningTradeDate] = useState(today);
  const [openingRows, setOpeningRows] = useState<OpeningEntryFormRow[]>(() => [emptyOpeningRow()]);
  const [extraPassword, setExtraPassword] = useState("");
  const [revealedTradingPassword, setRevealedTradingPassword] = useState<string | null>(null);
  const [newTradingPassword, setNewTradingPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<UiErrorDescriptor | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const renderedError = error === null ? null : typeof error === "string" ? error === "partialCreated" ? a("partialCreated", { succeeded: openingProgress.current.succeeded, remaining: openingProgress.current.total - openingProgress.current.succeeded }) : a(error) : translateUiError(error, language);
  const isAdmin = user?.role === "admin";
  const fallbackSnapshotCurrency = toSnapshotDisplayCurrency(preferences.preferredCurrency);
  const formTitle = drawerMode === "create" ? a("create") : drawerMode === "modify" ? a("editAccount") : a("details");
  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId]
  );
  const isDrawerReadOnly = drawerMode === "view";
  const editingAccountHasHistory = editingAccountId
    ? accounts.find(account => account.id === editingAccountId)?.hasTransactions ?? false
    : false;
  const holdingsByAccount = useMemo(() => groupHoldingsByAccount(accountHoldings), [accountHoldings]);

  const totalsSequence = useRef(0);
  useEffect(() => { observeAsync(loadAccounts()); }, []);
  useEffect(() => {
    if (createOnly || preferencesLoading || !accounts.length) return;
    const id = ++totalsSequence.current;
    setTotalsLoading(true);
    void loadAccountTotals(accounts, fallbackSnapshotCurrency).then(totals => { if (id === totalsSequence.current) setAccountTotals(totals); })
      .catch(failure => { if (id === totalsSequence.current) setAuxError(describeUiError(failure, "investmentRead")); })
      .finally(() => { if (id === totalsSequence.current) setTotalsLoading(false); });
    const requests = totalsSequence;

    return () => { requests.current++; };
  }, [accounts, preferencesLoading, fallbackSnapshotCurrency, createOnly]);

  async function loadAccounts() {
    const id = ++accountSequence.current;
    holdingsSequence.current++; totalsSequence.current++;
    setLoading(true); setError(null); setAuxError(null); setAccountHoldings([]); setExpandedAccountId(null);
    try {
      const accountData = await apiGet<AccountsResponse>("/accounts");
      if (id !== accountSequence.current) return;
      setUser(accountData.user); setAccounts(accountData.accounts);
      setLoading(false);
    } catch (failure) { if (id === accountSequence.current) setError(describeUiError(failure, "investmentRead")); }
    finally { if (id === accountSequence.current) setLoading(false); }
  }

  async function loadOpeningInstruments() {
    try { const data = await apiGet<InstrumentsResponse>("/instruments"); setInstruments(data.instruments); }
    catch (failure) { setAuxError(describeUiError(failure, "investmentRead")); }
  }

  useEffect(() => { if (includeOpeningAssets && drawerOpen) observeAsync(loadOpeningInstruments()); }, [includeOpeningAssets, drawerOpen]);
  useEffect(() => () => { accountSequence.current++; holdingsSequence.current++; totalsSequence.current++; }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) { setError("requiredField"); return; }
    if (isDrawerReadOnly || saving || (createOnly && createdAccount.current)) {
      return;
    }

    setSaving(true);
    setError(null);
    setPasswordError(null);

    let writeContext: "accountSave" | "tradingPasswordUpdate" = "accountSave";
    try {
      const payload = toAccountInput(form);
      const data = editingAccountId
        ? await apiPut<AccountResponse>(`/accounts/${editingAccountId}`, payload)
        : await apiPost<AccountResponse>("/accounts", payload);

      if (
        editingAccountId &&
        revealedTradingPassword !== null &&
        newTradingPassword !== revealedTradingPassword
      ) {
        writeContext = "tradingPasswordUpdate";
        await apiPut<AccountPasswordUpdateResponse>(`/accounts/${editingAccountId}/trading-password`, {
          extraPassword,
          tradingPassword: newTradingPassword
        });
      }

      if (createOnly) createdAccount.current = data.account.id;
      const createdOpeningTransactions = includeOpeningAssets
        ? await createOpeningTransactions(data.account.id)
        : [];

      void data;
      void createdOpeningTransactions;
      if (createOnly) { completed.current = true; observeAsync(navigate("/accounts")); }
      else { await loadAccounts(); closeDrawer(); }
    } catch (requestError) {
      setError(createOnly && createdAccount.current ? "partialCreated" : requestError instanceof ApiClientError && requestError.code === "MISSING_INSTRUMENT" ? "chooseInstrument" : requestError instanceof ApiClientError && requestError.code === "EMPTY_OPENING_ROWS" ? "openingRequired" : describeUiError(requestError, writeContext));
    } finally {
      setSaving(false);
    }
  }

  async function createOpeningTransactions(accountId: string): Promise<InvestmentTransaction[]> {
    const payloads = openingRows
      .filter((row) => row.instrumentId && row.grossAmount.trim())
      .map((row) => {
        const instrument = instruments.find((item) => item.id === row.instrumentId);

        if (!instrument) {
          throw new ApiClientError(a("chooseInstrument"), "MISSING_INSTRUMENT");
        }

        return toOpeningTransactionInput(accountId, openingTradeDate, row, instrument);
      });

    if (payloads.length === 0) {
      throw new ApiClientError(a("openingRequired"), "EMPTY_OPENING_ROWS");
    }

    openingProgress.current = { succeeded: 0, total: payloads.length };
    const created: InvestmentTransaction[] = [];

    for (const payload of payloads) {
      const data = await apiPost<TransactionResponse>("/transactions", payload);
      created.push(data.transaction);
      openingProgress.current.succeeded++;
    }

    return created;
  }

  async function handleDelete(account: InvestmentAccount) {
    const confirmed = window.confirm(a("deleteConfirm", { name: account.name }));

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiDelete<DeleteAccountResponse>(`/accounts/${account.id}`);
      await loadAccounts();

      if (editingAccountId === account.id) {
        closeDrawer();
      }
    } catch (requestError) {
      setError(describeUiError(requestError, "accountDelete"));
    } finally {
      setSaving(false);
    }
  }

  function startCreate() { observeAsync(navigate("/accounts/new")); }

  function startDetail(account: InvestmentAccount) {
    setEditingAccountId(account.id);
    setDrawerMode(isAdmin ? "modify" : "view");
    setForm({
      name: account.name,
      broker: account.broker ?? "",
      accountType: account.accountType,
      purpose: account.purpose,
      baseCurrency: account.baseCurrency,
      marketRegion: account.marketRegion,
      notes: account.notes ?? "",
      tradingInfo: account.tradingInfo ?? ""
    });
    setIncludeOpeningAssets(false);
    setOpeningRows([emptyOpeningRow()]);
    resetTradingPasswordReveal();
    setDrawerOpen(true);
  }

  function handleAccountRowClick(event: MouseEvent<HTMLTableRowElement>, account: InvestmentAccount) {
    if (!isInteractiveRowTarget(event.target, event.currentTarget)) {
      observeAsync(navigate(`/accounts/${account.id}`));
    }
  }

  function handleAccountRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, account: InvestmentAccount) {
    if (!isRowActivationKey(event.key) || isInteractiveRowTarget(event.target, event.currentTarget)) {
      return;
    }

    event.preventDefault();
    observeAsync(navigate(`/accounts/${account.id}`));
  }

  function toggleAccountHoldings(accountId: string) {
    if (expandedAccountId === accountId) { setExpandedAccountId(null); holdingsSequence.current++; setHoldingsLoading(false); return; }
    setExpandedAccountId(accountId);
    const id = ++holdingsSequence.current;
    setHoldingsLoading(true); setAuxError(null);
    void apiGet<HoldingsResponse>(`/holdings?currency=${fallbackSnapshotCurrency}&quoteMode=cached`).then(data => {
      if (id !== holdingsSequence.current) return;
      setAccountHoldings(data.holdings); setHoldingsReportingCurrency(data.reportingCurrency);
    }).catch(failure => { if (id === holdingsSequence.current) setAuxError(describeUiError(failure, "investmentRead")); })
      .finally(() => { if (id === holdingsSequence.current) setHoldingsLoading(false); });
  }

  function openHoldingDetail(holding: ValuedHoldingSummary) {
    observeAsync(navigate(`/holdings/${holding.accountId}/${holding.instrumentId}`));
  }

  function closeDrawer() {
    if (createOnly) { observeAsync(navigate("/accounts")); return; }
    setDrawerOpen(false);
    setEditingAccountId(null);
    setDrawerMode("create");
    resetDrawerForm();
    resetTradingPasswordReveal();
  }

  function resetDrawerForm() {
    setForm(emptyForm);
    setIncludeOpeningAssets(false);
    setOpeningTradeDate(today);
    setOpeningRows([emptyOpeningRow()]);
  }

  function updateOpeningRow(id: string, patch: Partial<OpeningEntryFormRow>) {
    setOpeningRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addOpeningRow() {
    setOpeningRows((current) => [...current, emptyOpeningRow()]);
  }

  function removeOpeningRow(id: string) {
    setOpeningRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current));
  }

  function resetTradingPasswordReveal() {
    setExtraPassword("");
    setRevealedTradingPassword(null);
    setNewTradingPassword("");
    setPasswordError(null);
    setPasswordLoading(false);
  }

  async function handleRevealPassword() {
    if (!editingAccountId) {
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);

    try {
      const data = await apiPost<AccountPasswordRevealResponse>(
        `/accounts/${editingAccountId}/trading-password/reveal`,
        { extraPassword }
      );
      setRevealedTradingPassword(data.tradingPassword);
      setNewTradingPassword(data.tradingPassword);
    } catch (requestError) {
      setRevealedTradingPassword(null);
      setPasswordError(describeUiError(requestError, "tradingPasswordReveal"));
    } finally {
      setPasswordLoading(false);
    }
  }

  const requestDismiss = useEditDismissal(drawerOpen, saving, [form, includeOpeningAssets, openingTradeDate, openingRows, revealedTradingPassword !== null && newTradingPassword !== revealedTradingPassword ? newTradingPassword : null], closeDrawer);

  useWorkflowDeparture(createOnly && (JSON.stringify(form) !== JSON.stringify(emptyForm) || includeOpeningAssets), createOnly && saving, completed);

  return (
    <section>
      {!createOnly && <>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/accounts">{a("directory")}</PageTitle>
          <p>{a("directoryHelp")}</p>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving}>
              <Plus size={17} aria-hidden="true" />
              <span>{a("newAccount")}</span>
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={() => observeAsync((loadAccounts)())} disabled={loading || saving}>
            <RefreshCw size={17} aria-hidden="true" />
            <span>{a("refresh")}</span>
          </button>
        </div>
      </header>

      {auxError ? <p className="form-error">{a("auxiliaryFailure")}{translateUiError(auxError, language)} <button type="button" className="text-button" onClick={() => observeAsync(loadAccounts())}>{a("retry")}</button></p> : null}
      {error ? <p className="form-error">{renderedError}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">{a("viewerHelp")}</p>
      ) : null}

      <div className="filter-bar">
        <label>{a("purpose")}
          <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value as AccountPurpose | "")}>
            <option value="">{a("allPurposes")}</option>
            {ACCOUNT_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{getInvestmentLabel("accountPurpose", purpose, language)}</option>)}
          </select>
        </label>
      </div>
      <div className="table-wrap">
        <table className="account-table">
          <thead>
            <tr>
              <th className="account-expand-column"></th>
              <th>{a("name")}</th>
              <th>{a("broker")}</th>
              <th>{a("accountType")}</th>
              <th>{a("purposeColumn")}</th>
              <th>{a("baseCurrency")}</th>
              <th className="numeric-cell">{a("total")}</th>
              <th>{a("market")}</th>
              <th>{a("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>{a("loading")}</td>
              </tr>
            ) : visibleAccounts.length === 0 ? (
              <tr>
                <td colSpan={9}>{a("empty")}</td>
              </tr>
            ) : (
              visibleAccounts.map((account) => {
                const accountHoldingsForRow = holdingsByAccount.get(account.id) ?? [];
                const isExpanded = expandedAccountId === account.id;

                return (
                  <Fragment key={account.id}>
                    <tr
                      className={[
                        editingAccountId === account.id ? "editing-row" : "",
                        "clickable-detail-row"
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      role="button"
                      tabIndex={0}
                      aria-label={a("viewAccount", { name: account.name })}
                      onClick={(event) => handleAccountRowClick(event, account)}
                      onKeyDown={(event) => handleAccountRowKeyDown(event, account)}
                    >
                      <td className="account-expand-column">
                        <button
                          aria-label={isExpanded ? a("collapseAccount", { name: account.name }) : a("expandAccount", { name: account.name })}
                          className="transaction-expand-button"
                          title={isExpanded ? a("collapseHoldings") : a("expandHoldings")}
                          type="button"
                          onClick={() => toggleAccountHoldings(account.id)}
                          disabled={saving}
                        >
                          {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        </button>
                      </td>
                      <td>{account.name}</td>
                      <td>{account.broker ?? "-"}</td>
                      <td>{getInvestmentLabel("accountType", account.accountType, language)}</td>
                      <td>{getInvestmentLabel("accountPurpose", account.purpose, language)}</td>
                      <td>{account.baseCurrency}</td>
                      <td className="numeric-cell">{totalsLoading ? a("loadingValue") : formatAccountTotal(accountTotals.get(account.id), language)}</td>
                      <td>{getInvestmentLabel("marketRegion", account.marketRegion, language)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            aria-label={a("accountAction", { action: isAdmin ? a("edit") : a("view"), name: account.name })}
                            className="icon-button"
                            title={isAdmin ? a("viewEdit") : a("view")}
                            type="button"
                            onClick={() => startDetail(account)}
                            disabled={saving}
                          >
                            <Eye size={17} aria-hidden="true" />
                          </button>
                          {isAdmin ? (
                            <button
                              aria-label={a("accountAction", { action: a("delete"), name: account.name })}
                              className="icon-button danger-icon-button"
                              title={a("delete")}
                              type="button"
                              onClick={() => observeAsync(handleDelete(account))}
                              disabled={saving}
                            >
                              <Trash2 size={17} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="account-holdings-row">
                        <td colSpan={9}>
                          {holdingsLoading ? <p role="status">{a("loadingHoldings")}</p> : renderAccountHoldings(
                            accountHoldingsForRow,
                            holdingsReportingCurrency,
                            preferences.gainColorScheme,
                            openHoldingDetail, language
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      </>}
      {createOnly && error ? <p role="alert" className="form-error">{renderedError}</p> : null}
      {createOnly && !isAdmin ? <p role="status">{loading ? a("loadingAccounts") : a("adminCreate")}</p> : <FormSurface
        open={drawerOpen}
        title={formTitle}
        subtitle={
          editingAccount
            ? a(drawerMode === "modify" ? "editingName" : "viewingName", { name: editingAccount.name })
            : a("createHelp")
        }
        busy={saving}
        {...(createOnly ? { submitBlocked: !!createdAccount.current } : {})}
        onClose={createOnly ? closeDrawer : requestDismiss}
        footer={
          drawerMode === "view" ? (
            <button className="secondary-button" type="button" onClick={requestDismiss}>

              {a("close")}
            </button>
          ) : (
            <>
              <button className="primary-button" type="submit" form="account-drawer-form" disabled={saving}>
                {saving ? a("saving") : editingAccountId ? a("saveChanges") : a("create")}
              </button>
              <button className="secondary-button" type="button" onClick={requestDismiss} disabled={saving}>

                {a("cancel")}
              </button>
            </>
          )
        }
      >
        <LanguageSwitch />
        <form noValidate={createOnly} className="account-form drawer-form" id="account-drawer-form" onInvalidCapture={event => { event.preventDefault(); setError((event.target as HTMLInputElement).validity.valueMissing ? "requiredField" : "invalidField"); }} onSubmit={(...args) => observeAsync((handleSubmit)(...args))}>
          {!createOnly && error ? <p role="alert" className="form-error">{renderedError}</p> : null}
          <div className="account-basic-fields">
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

            {a("broker")}
            <input
              value={form.broker}
              onChange={(event) => setForm({ ...form, broker: event.target.value })}
              placeholder={a("brokerExample")}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>

            {a("accountType")}
            <select
              value={form.accountType}
              onChange={(event) => setForm({ ...form, accountType: event.target.value as AccountType })}
              disabled={isDrawerReadOnly}
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {getInvestmentLabel("accountType", accountType, language)}
                </option>
              ))}
            </select>
          </label>

          <label>

            {a("purpose")}
            <select
              value={form.purpose}
              onChange={(event) => setForm({ ...form, purpose: event.target.value as AccountPurpose })}
              disabled={isDrawerReadOnly}
            >
              {ACCOUNT_PURPOSES.filter(purpose => purpose !== "education").map((purpose) => (
                <option key={purpose} value={purpose}>{getInvestmentLabel("accountPurpose", purpose, language)}</option>
              ))}
            </select>
          </label>

          <label>

            {a("baseCurrency")}
            <select
              value={form.baseCurrency}
              onChange={(event) => setForm({ ...form, baseCurrency: event.target.value as CurrencyCode })}
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

          <label className="wide-field">

            {a("notes")}
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder={a("optional")}
              rows={3}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label className="wide-field">

            {a("tradingInfo")}
            <textarea
              className="large-textarea"
              value={form.tradingInfo}
              onChange={(event) => setForm({ ...form, tradingInfo: event.target.value })}
              placeholder={a("tradingInfoExample")}
              rows={6}
              disabled={isDrawerReadOnly}
            />
          </label>

          {editingAccountId ? (
            <section className="drawer-secret-section wide-field">
              <div className="settings-section-header drawer-inner-panel">
                <div>
                  <h2>{a("tradingPassword")}</h2>
                  <p>{a("passwordHelp")}</p>
                </div>
              </div>

              {passwordError ? <p className="form-error">{translateUiError(passwordError, language)}</p> : null}

              <div className="secret-dialog-form">
                <label>

                  {a("extraPassword")}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={extraPassword}
                    onChange={(event) => setExtraPassword(event.target.value)}
                    disabled={revealedTradingPassword !== null || passwordLoading || saving}
                    placeholder={a("extraPasswordHint")}
                  />
                </label>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => observeAsync(handleRevealPassword())}
                  disabled={revealedTradingPassword !== null || passwordLoading || saving || !extraPassword.trim()}
                >
                  <KeyRound size={17} aria-hidden="true" />
                  <span>{revealedTradingPassword !== null ? a("verified") : passwordLoading ? a("verifying") : a("revealPassword")}</span>
                </button>
              </div>

              {revealedTradingPassword !== null ? (
                <label className="secret-value-field">

                  {a("currentTradingPassword")}
                  <textarea
                    readOnly={!isAdmin}
                    value={isAdmin ? newTradingPassword : revealedTradingPassword}
                    onChange={(event) => setNewTradingPassword(event.target.value)}
                    rows={3}
                  />
                </label>
              ) : null}
            </section>
          ) : null}

          </div>
          <div className="account-opening-fields">
          {drawerMode !== "view" ? (
            <label className="checkbox-field wide-field">
              <input
                type="checkbox"
                checked={includeOpeningAssets}
                onChange={(event) => setIncludeOpeningAssets(event.target.checked)}
              />

              {a("includeOpenings")}
            </label>
          ) : null}

          {drawerMode !== "view" && includeOpeningAssets ? (
            <>
              <label>

                {a("openingDate")}
                <input
                  type="date"
                  value={openingTradeDate}
                  onChange={(event) => setOpeningTradeDate(event.target.value)}
                  required
                />
              </label>

              {editingAccountHasHistory ? (
                <p className="form-warning wide-field">

                  {a("historyHelp")}
                </p>
              ) : null}

              <div className="opening-entry-table wide-field">
                {openingRows.map((row, index) => {
                  const instrument = instruments.find((item) => item.id === row.instrumentId);
                  const isCash = instrument?.assetType === "cash";

                  return (
                    <div className="opening-entry-row" key={row.id}>
                      <label>{a("instrument")}<select
                        aria-label={a("rowInstrument", { row: index + 1 })}
                        value={row.instrumentId}
                        onChange={(event) => updateOpeningRow(row.id, { instrumentId: event.target.value, quantity: "" })}
                        required
                      >
                        <option value="">{a("selectInstrument")}</option>
                        {instruments.filter(item => item.active !== false).map((item) => (
                          <option key={item.id} value={item.id}>
                            {formatInstrument(item)}
                          </option>
                        ))}
                      </select></label>
                      <label>{a("quantity")}<input
                        aria-label={a("rowQuantity", { row: index + 1 })}
                        value={isCash ? a("cashBalance") : row.quantity}
                        onChange={(event) => updateOpeningRow(row.id, { quantity: event.target.value })}
                        disabled={isCash}
                        placeholder="0.0000000000"
                        required={!isCash}
                      /></label>
                      <label>{a("costBalance")}<input
                        aria-label={a("rowCost", { row: index + 1 })}
                        value={row.grossAmount}
                        onChange={(event) => updateOpeningRow(row.id, { grossAmount: event.target.value })}
                        placeholder={isCash ? a("openingBalance") : a("totalCost")}
                        required
                      /></label>
                      <label className="opening-entry-notes">{a("notes")}<input
                        aria-label={a("rowNotes", { row: index + 1 })}
                        value={row.notes}
                        onChange={(event) => updateOpeningRow(row.id, { notes: event.target.value })}
                        placeholder={a("optional")}
                      /></label>
                      <button
                        aria-label={a("removeOpening")}
                        className="icon-button danger-icon-button opening-entry-delete"
                        title={a("delete")}
                        type="button"
                        onClick={() => removeOpeningRow(row.id)}
                        disabled={saving || openingRows.length === 1}
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={addOpeningRow} disabled={saving}>

                  {a("addRow")}
                </button>
              </div>
            </>
          ) : null}
          </div>
        </form>
      </FormSurface>}
    </section>
  );
}

function toAccountInput(form: AccountFormState): CreateInvestmentAccountInput {
  return {
    name: form.name,
    broker: form.broker,
    accountType: form.accountType,
    purpose: form.purpose,
    baseCurrency: form.baseCurrency,
    marketRegion: form.marketRegion,
    notes: form.notes,
    tradingInfo: form.tradingInfo
  };
}

function emptyOpeningRow(): OpeningEntryFormRow {
  return {
    id: crypto.randomUUID(),
    instrumentId: "",
    quantity: "",
    grossAmount: "",
    notes: ""
  };
}

function toOpeningTransactionInput(
  accountId: string,
  tradeDate: string,
  row: OpeningEntryFormRow,
  instrument: Instrument
): CreateInvestmentTransactionInput {
  const isCash = instrument.assetType === "cash";

  return {
    accountId,
    instrumentId: instrument.id,
    transactionType: isCash ? "opening_balance" : "opening_position",
    tradeDate,
    settlementDate: null,
    quantity: isCash ? null : decimalString(row.quantity),
    price: null,
    grossAmount: decimalString(row.grossAmount),
    fee: "0",
    tax: "0",
    currency: instrument.currency,
    adjustmentDirection: null,
    notes: row.notes || (isCash ? "期初余额" : "期初持仓")
  };
}

function decimalString(value: string | number | null | undefined, fallback = ""): string {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  return normalized || fallback;
}

function formatInstrument(instrument: Instrument): string {
  return instrument.symbol ? `${instrument.symbol} - ${instrument.shortName}` : instrument.shortName;
}

async function loadAccountTotals(_accounts: InvestmentAccount[], fallbackCurrency: SnapshotDisplayCurrency): Promise<Map<string, AccountTotalDisplay>> {
  const data = await apiGet<{ totals: Array<{ accountId: string; currency: SnapshotDisplayCurrency; marketValue: string | null }> }>(`/accounts/totals?currency=${fallbackCurrency}`);
  return new Map(data.totals.map(total => [total.accountId, { currency: total.currency, marketValue: total.marketValue }]));
}

function formatAccountTotal(total: AccountTotalDisplay | undefined, language: UiLanguage = "zh-CN"): string {
  if (!total || total.marketValue === null) {
    return "--";
  }

  return `${total.currency} ${formatDisplayAmount(total.marketValue, getDisplayLocale(language))}`;
}

function renderAccountHoldings(
  holdings: ValuedHoldingSummary[],
  reportingCurrency: SnapshotDisplayCurrency,
  gainColorScheme: Parameters<typeof signedToneClass>[1],
  onOpenHoldingDetail: (holding: ValuedHoldingSummary) => void,
  language: UiLanguage = "zh-CN"
) {
  const a = i18n.getFixedT(language, "accounts");
  const displayLocale = getDisplayLocale(language);
  if (holdings.length === 0) {
    return <div className="account-holdings-empty">{a("emptyHoldings")}</div>;
  }

  return (
    <div className="account-holdings-panel">
      <table className="account-holdings-table">
        <thead>
          <tr>
            <th>{a("instrument")}</th>
            <th>{a("assetType")}</th>
            <th>{a("currency")}</th>
            <th className="numeric-cell">{a("quantityBalance")}</th>
            <th className="numeric-cell">{a("averageCost")}</th>
            <th className="numeric-cell">{a("carryingCost")}</th>
            <th className="numeric-cell">{a("latestPrice")}</th>
            <th className="numeric-cell">{a("marketValue", { currency: reportingCurrency })}</th>
            <th className="numeric-cell">{a("unrealizedValue", { currency: reportingCurrency })}</th>
            <th>{a("dataWarnings")}</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr
              className="clickable-detail-row"
              key={`${holding.accountId}:${holding.instrumentId}`}
              role="button"
              tabIndex={0}
              aria-label={a("viewHolding", { name: formatHoldingInstrument(holding) })}
              onClick={(event) => {
                if (!isInteractiveRowTarget(event.target, event.currentTarget)) {
                  onOpenHoldingDetail(holding);
                }
              }}
              onKeyDown={(event) => {
                if (!isRowActivationKey(event.key) || isInteractiveRowTarget(event.target, event.currentTarget)) {
                  return;
                }

                event.preventDefault();
                onOpenHoldingDetail(holding);
              }}
            >
              <td>{formatHoldingInstrument(holding)}</td>
              <td>{getInvestmentLabel("assetType", holding.assetType, language)}</td>
              <td>{holding.currency}</td>
              <td className="numeric-cell">{formatHoldingQuantity(holding, language)}</td>
              <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost, displayLocale) : "-"}</td>
              <td className="numeric-cell">{holding.costAmount ? formatDisplayAmount(holding.costAmount, displayLocale) : "-"}</td>
              <td className="numeric-cell">{formatHoldingLatestPrice(holding, "compact", language)}</td>
              <td className="numeric-cell">{holding.marketValue ? formatDisplayAmount(holding.marketValue, displayLocale) : "--"}</td>
              <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, gainColorScheme, 3)}`}>
                {holding.unrealizedGain ? formatSignedDisplayAmount(holding.unrealizedGain, displayLocale) : "--"}
              </td>
              <td>{formatHoldingWarnings(holding, language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function groupHoldingsByAccount(holdings: ValuedHoldingSummary[]): Map<string, ValuedHoldingSummary[]> {
  const grouped = new Map<string, ValuedHoldingSummary[]>();

  for (const holding of holdings) {
    const accountHoldings = grouped.get(holding.accountId) ?? [];
    accountHoldings.push(holding);
    grouped.set(holding.accountId, accountHoldings);
  }

  return grouped;
}

function toSnapshotDisplayCurrency(currency: string): SnapshotDisplayCurrency {
  return SNAPSHOT_DISPLAY_CURRENCIES.includes(currency as SnapshotDisplayCurrency)
    ? (currency as SnapshotDisplayCurrency)
    : "CNY";
}
