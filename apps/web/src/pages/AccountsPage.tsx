import { Fragment, type FormEvent, type MouseEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  ASSET_TYPE_LABELS,
  CURRENCY_CODES,
  MARKET_REGION_LABELS,
  MARKET_REGIONS,
  SNAPSHOT_DISPLAY_CURRENCIES,
  getAppBusinessDate,
  getLocalDateString,
  type AccountType,
  type AuthenticatedUser,
  type CreateInvestmentAccountInput,
  type CreateInvestmentTransactionInput,
  type CurrencyCode,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type MarketRegion,
  type PortfolioSnapshotSummary,
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
import { isInteractiveRowTarget } from "../lib/tableInteraction";

interface AccountsResponse {
  user: AuthenticatedUser;
  accounts: InvestmentAccount[];
}

interface InstrumentsResponse {
  instruments: Instrument[];
}

interface TransactionsResponse {
  transactions: InvestmentTransaction[];
}

interface PortfolioSnapshotsResponse {
  snapshots: PortfolioSnapshotSummary[];
}

interface HoldingsResponse extends HoldingsValuationSummary {}

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
const snapshotStartDate = "2000-01-01";

const emptyForm: AccountFormState = {
  name: "",
  broker: "",
  accountType: "brokerage",
  baseCurrency: "NZD",
  marketRegion: "NZ",
  notes: "",
  tradingInfo: ""
};

interface AccountTotalDisplay {
  currency: SnapshotDisplayCurrency;
  marketValue: string | null;
}

export function AccountsPage() {
  const { preferences, loading: preferencesLoading } = usePreferences();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [accountTotals, setAccountTotals] = useState<Map<string, AccountTotalDisplay>>(new Map());
  const [accountHoldings, setAccountHoldings] = useState<ValuedHoldingSummary[]>([]);
  const [holdingsReportingCurrency, setHoldingsReportingCurrency] = useState<SnapshotDisplayCurrency>("CNY");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [includeOpeningAssets, setIncludeOpeningAssets] = useState(false);
  const [openingTradeDate, setOpeningTradeDate] = useState(today);
  const [openingRows, setOpeningRows] = useState<OpeningEntryFormRow[]>(() => [emptyOpeningRow()]);
  const [extraPassword, setExtraPassword] = useState("");
  const [revealedTradingPassword, setRevealedTradingPassword] = useState<string | null>(null);
  const [newTradingPassword, setNewTradingPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const fallbackSnapshotCurrency = toSnapshotDisplayCurrency(preferences.preferredCurrency);
  const formTitle = drawerMode === "create" ? "新增账户" : drawerMode === "modify" ? "编辑账户" : "账户详情";
  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId]
  );
  const isDrawerReadOnly = drawerMode === "view";
  const editingAccountHasHistory = editingAccountId
    ? transactions.some((transaction) => transaction.accountId === editingAccountId)
    : false;
  const holdingsByAccount = useMemo(() => groupHoldingsByAccount(accountHoldings), [accountHoldings]);

  useEffect(() => {
    if (!preferencesLoading) {
      void loadAccounts();
    }
  }, [preferencesLoading, fallbackSnapshotCurrency]);

  async function loadAccounts() {
    setLoading(true);
    setError(null);

    try {
      const [accountData, instrumentData, transactionData, holdingsData] = await Promise.all([
        apiGet<AccountsResponse>("/accounts"),
        apiGet<InstrumentsResponse>("/instruments"),
        apiGet<TransactionsResponse>("/transactions"),
        apiGet<HoldingsResponse>(`/holdings?currency=${fallbackSnapshotCurrency}`)
      ]);
      setUser(accountData.user);
      setAccounts(accountData.accounts);
      setInstruments(instrumentData.instruments);
      setTransactions(transactionData.transactions);
      setAccountHoldings(holdingsData.holdings);
      setHoldingsReportingCurrency(holdingsData.reportingCurrency);
      setExpandedAccountId((current) =>
        current && accountData.accounts.some((account) => account.id === current) ? current : null
      );
      setAccountTotals(await loadAccountTotals(accountData.accounts, fallbackSnapshotCurrency));
    } catch (requestError) {
      setError(toErrorMessage(requestError));
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
    setPasswordError(null);

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
        await apiPut<AccountPasswordUpdateResponse>(`/accounts/${editingAccountId}/trading-password`, {
          extraPassword,
          tradingPassword: newTradingPassword
        });
      }

      const createdOpeningTransactions = includeOpeningAssets
        ? await createOpeningTransactions(data.account.id)
        : [];

      void data;
      void createdOpeningTransactions;
      await loadAccounts();
      closeDrawer();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
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
          throw new ApiClientError("请选择投资标的。", "MISSING_INSTRUMENT");
        }

        return toOpeningTransactionInput(accountId, openingTradeDate, row, instrument);
      });

    if (payloads.length === 0) {
      throw new ApiClientError("请至少填写一条期初资产。", "EMPTY_OPENING_ROWS");
    }

    const created: InvestmentTransaction[] = [];

    for (const payload of payloads) {
      const data = await apiPost<TransactionResponse>("/transactions", payload);
      created.push(data.transaction);
    }

    return created;
  }

  async function handleDelete(account: InvestmentAccount) {
    const confirmed = window.confirm(`确定删除账户“${account.name}”？`);

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
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function startCreate() {
    setEditingAccountId(null);
    setDrawerMode("create");
    resetDrawerForm();
    resetTradingPasswordReveal();
    setDrawerOpen(true);
  }

  function startDetail(account: InvestmentAccount) {
    setEditingAccountId(account.id);
    setDrawerMode(isAdmin ? "modify" : "view");
    setForm({
      name: account.name,
      broker: account.broker ?? "",
      accountType: account.accountType,
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
    if (!isInteractiveRowTarget(event.target)) {
      startDetail(account);
    }
  }

  function toggleAccountHoldings(accountId: string) {
    setExpandedAccountId((current) => (current === accountId ? null : accountId));
  }

  function closeDrawer() {
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
      setPasswordError(toErrorMessage(requestError));
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <PageTitle route="/accounts">投资账户</PageTitle>
          <p>维护券商、基金平台、银行和现金账户。可在保存账户时一并录入期初资产。</p>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving}>
              <Plus size={17} aria-hidden="true" />
              <span>新账户</span>
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={loadAccounts} disabled={loading || saving}>
            <RefreshCw size={17} aria-hidden="true" />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看账户信息；持有额外密码时也可查看交易密码。新增、编辑、删除和更新交易密码仅限 admin。</p>
      ) : null}

      <div className="table-wrap">
        <table className="account-table">
          <thead>
            <tr>
              <th className="account-expand-column"></th>
              <th>账户名称</th>
              <th>券商/平台</th>
              <th>账户类型</th>
              <th>基准货币</th>
              <th className="numeric-cell">账户总额</th>
              <th>主要市场</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8}>正在加载账户...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={8}>暂无投资账户。</td>
              </tr>
            ) : (
              accounts.map((account) => {
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
                      onClick={(event) => handleAccountRowClick(event, account)}
                    >
                      <td className="account-expand-column">
                        <button
                          aria-label={isExpanded ? `收起账户 ${account.name} 的当前持仓` : `展开账户 ${account.name} 的当前持仓`}
                          className="transaction-expand-button"
                          title={isExpanded ? "收起当前持仓" : "展开当前持仓"}
                          type="button"
                          onClick={() => toggleAccountHoldings(account.id)}
                          disabled={saving}
                        >
                          {isExpanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        </button>
                      </td>
                      <td>{account.name}</td>
                      <td>{account.broker ?? "-"}</td>
                      <td>{ACCOUNT_TYPE_LABELS[account.accountType]}</td>
                      <td>{account.baseCurrency}</td>
                      <td className="numeric-cell">{formatAccountTotal(accountTotals.get(account.id))}</td>
                      <td>{MARKET_REGION_LABELS[account.marketRegion]}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            aria-label={`${isAdmin ? "编辑" : "查看"}账户 ${account.name}`}
                            className="icon-button"
                            title={isAdmin ? "查看/编辑" : "查看"}
                            type="button"
                            onClick={() => startDetail(account)}
                            disabled={saving}
                          >
                            <Eye size={17} aria-hidden="true" />
                          </button>
                          {isAdmin ? (
                            <button
                              aria-label={`删除账户 ${account.name}`}
                              className="icon-button danger-icon-button"
                              title="删除"
                              type="button"
                              onClick={() => void handleDelete(account)}
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
                        <td colSpan={8}>{renderAccountHoldings(accountHoldingsForRow, holdingsReportingCurrency, preferences.gainColorScheme)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Drawer
        open={drawerOpen}
        title={formTitle}
        subtitle={
          editingAccount
            ? `${drawerMode === "modify" ? "正在编辑" : "正在查看"}：${editingAccount.name}`
            : "新增后会立即显示在列表中"
        }
        onClose={closeDrawer}
        footer={
          drawerMode === "view" ? (
            <button className="secondary-button" type="button" onClick={closeDrawer}>
              关闭
            </button>
          ) : (
            <>
              <button className="primary-button" type="submit" form="account-drawer-form" disabled={saving}>
                {saving ? "保存中..." : editingAccountId ? "保存修改" : "新增账户"}
              </button>
              <button className="secondary-button" type="button" onClick={closeDrawer} disabled={saving}>
                取消
              </button>
            </>
          )
        }
      >
        <form className="account-form drawer-form" id="account-drawer-form" onSubmit={handleSubmit}>
          <label>
            账户名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例如 Hatch 美股账户"
              disabled={isDrawerReadOnly}
              required
            />
          </label>

          <label>
            券商/平台
            <input
              value={form.broker}
              onChange={(event) => setForm({ ...form, broker: event.target.value })}
              placeholder="例如 Hatch、IBKR、InvestNow"
              disabled={isDrawerReadOnly}
            />
          </label>

          <label>
            账户类型
            <select
              value={form.accountType}
              onChange={(event) => setForm({ ...form, accountType: event.target.value as AccountType })}
              disabled={isDrawerReadOnly}
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {ACCOUNT_TYPE_LABELS[accountType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            基准货币
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
            主要市场
            <select
              value={form.marketRegion}
              onChange={(event) => setForm({ ...form, marketRegion: event.target.value as MarketRegion })}
              disabled={isDrawerReadOnly}
            >
              {MARKET_REGIONS.map((marketRegion) => (
                <option key={marketRegion} value={marketRegion}>
                  {MARKET_REGION_LABELS[marketRegion]}
                </option>
              ))}
            </select>
          </label>

          <label className="wide-field">
            备注
            <textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="可选"
              rows={3}
              disabled={isDrawerReadOnly}
            />
          </label>

          <label className="wide-field">
            交易信息
            <textarea
              className="large-textarea"
              value={form.tradingInfo}
              onChange={(event) => setForm({ ...form, tradingInfo: event.target.value })}
              placeholder="例如 App 安装方式、登录入口、账号提示和操作注意事项"
              rows={6}
              disabled={isDrawerReadOnly}
            />
          </label>

          {editingAccountId ? (
            <section className="drawer-secret-section wide-field">
              <div className="settings-section-header drawer-inner-panel">
                <div>
                  <h2>交易密码</h2>
                  <p>输入额外密码后才会显示。未显示时，保存账户不会更新交易密码。</p>
                </div>
              </div>

              {passwordError ? <p className="form-error">{passwordError}</p> : null}

              <div className="secret-dialog-form">
                <label>
                  额外密码
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={extraPassword}
                    onChange={(event) => setExtraPassword(event.target.value)}
                    disabled={revealedTradingPassword !== null || passwordLoading || saving}
                    required
                  />
                </label>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleRevealPassword()}
                  disabled={revealedTradingPassword !== null || passwordLoading || saving || !extraPassword.trim()}
                >
                  <KeyRound size={17} aria-hidden="true" />
                  <span>{revealedTradingPassword !== null ? "已验证" : passwordLoading ? "验证中..." : "查看密码"}</span>
                </button>
              </div>

              {revealedTradingPassword !== null ? (
                <label className="secret-value-field">
                  当前交易密码
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

          {drawerMode !== "view" ? (
            <label className="checkbox-field wide-field">
              <input
                type="checkbox"
                checked={includeOpeningAssets}
                onChange={(event) => setIncludeOpeningAssets(event.target.checked)}
              />
              同时录入期初资产
            </label>
          ) : null}

          {drawerMode !== "view" && includeOpeningAssets ? (
            <>
              <label>
                期初日期
                <input
                  type="date"
                  value={openingTradeDate}
                  onChange={(event) => setOpeningTradeDate(event.target.value)}
                  required
                />
              </label>

              {editingAccountHasHistory ? (
                <p className="form-warning wide-field">
                  该账户已有交易记录。仍可录入期初资产，但请确认日期和备注，避免重复计算。
                </p>
              ) : null}

              <div className="opening-entry-table wide-field">
                <div className="opening-entry-row opening-entry-head">
                  <span>标的</span>
                  <span>数量</span>
                  <span>总成本/余额</span>
                  <span>备注</span>
                  <span>操作</span>
                </div>
                {openingRows.map((row) => {
                  const instrument = instruments.find((item) => item.id === row.instrumentId);
                  const isCash = instrument?.assetType === "cash";

                  return (
                    <div className="opening-entry-row" key={row.id}>
                      <select
                        value={row.instrumentId}
                        onChange={(event) => updateOpeningRow(row.id, { instrumentId: event.target.value, quantity: "" })}
                        required
                      >
                        <option value="">请选择标的</option>
                        {instruments.map((item) => (
                          <option key={item.id} value={item.id}>
                            {formatInstrument(item)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={isCash ? "现金余额" : row.quantity}
                        onChange={(event) => updateOpeningRow(row.id, { quantity: event.target.value })}
                        disabled={isCash}
                        placeholder="0.0000000000"
                        required={!isCash}
                      />
                      <input
                        value={row.grossAmount}
                        onChange={(event) => updateOpeningRow(row.id, { grossAmount: event.target.value })}
                        placeholder={isCash ? "期初余额" : "总成本"}
                        required
                      />
                      <input
                        className="opening-entry-notes"
                        value={row.notes}
                        onChange={(event) => updateOpeningRow(row.id, { notes: event.target.value })}
                        placeholder="可选"
                      />
                      <button
                        aria-label="删除期初资产行"
                        className="icon-button danger-icon-button opening-entry-delete"
                        title="删除"
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
                  添加一行
                </button>
              </div>
            </>
          ) : null}
        </form>
      </Drawer>
    </section>
  );
}

function toAccountInput(form: AccountFormState): CreateInvestmentAccountInput {
  return {
    name: form.name,
    broker: form.broker,
    accountType: form.accountType,
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

async function loadAccountTotals(
  accounts: InvestmentAccount[],
  fallbackCurrency: SnapshotDisplayCurrency
): Promise<Map<string, AccountTotalDisplay>> {
  if (accounts.length === 0) {
    return new Map();
  }

  const displayCurrencies = unique([
    fallbackCurrency,
    ...accounts
      .map((account) => account.baseCurrency)
      .filter((currency): currency is SnapshotDisplayCurrency =>
        SNAPSHOT_DISPLAY_CURRENCIES.includes(currency as SnapshotDisplayCurrency)
      )
  ]);
  const snapshotsByCurrency = new Map<SnapshotDisplayCurrency, PortfolioSnapshotSummary>();
  const to = getAppBusinessDate();

  await Promise.all(
    displayCurrencies.map(async (currency) => {
      const data = await apiGet<PortfolioSnapshotsResponse>(
        `/portfolio-snapshots?from=${snapshotStartDate}&to=${to}&currency=${currency}`
      );
      const latestSnapshot = data.snapshots.at(-1);

      if (latestSnapshot) {
        snapshotsByCurrency.set(currency, latestSnapshot);
      }
    })
  );

  const totals = new Map<string, AccountTotalDisplay>();

  for (const account of accounts) {
    const preferredCurrency = SNAPSHOT_DISPLAY_CURRENCIES.includes(account.baseCurrency as SnapshotDisplayCurrency)
      ? (account.baseCurrency as SnapshotDisplayCurrency)
      : fallbackCurrency;
    const accountSnapshot =
      snapshotsByCurrency.get(preferredCurrency)?.accounts.find((snapshotAccount) => snapshotAccount.accountId === account.id) ??
      snapshotsByCurrency.get(fallbackCurrency)?.accounts.find((snapshotAccount) => snapshotAccount.accountId === account.id);

    if (accountSnapshot) {
      totals.set(account.id, {
        currency: accountSnapshot.currency,
        marketValue: accountSnapshot.marketValue
      });
    }
  }

  return totals;
}

function formatAccountTotal(total: AccountTotalDisplay | undefined): string {
  if (!total || total.marketValue === null) {
    return "--";
  }

  return `${total.currency} ${formatDisplayAmount(total.marketValue)}`;
}

function renderAccountHoldings(
  holdings: ValuedHoldingSummary[],
  reportingCurrency: SnapshotDisplayCurrency,
  gainColorScheme: Parameters<typeof signedToneClass>[1]
) {
  if (holdings.length === 0) {
    return <div className="account-holdings-empty">暂无当前持仓或现金余额。</div>;
  }

  return (
    <div className="account-holdings-panel">
      <table className="account-holdings-table">
        <thead>
          <tr>
            <th>标的</th>
            <th>类型</th>
            <th>币种</th>
            <th className="numeric-cell">数量/现金余额</th>
            <th className="numeric-cell">平均成本</th>
            <th className="numeric-cell">剩余成本</th>
            <th className="numeric-cell">最新价格</th>
            <th className="numeric-cell">市值 ({reportingCurrency})</th>
            <th className="numeric-cell">动态盈亏 ({reportingCurrency})</th>
            <th>数据提示</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={`${holding.accountId}:${holding.instrumentId}`}>
              <td>{formatHoldingInstrument(holding)}</td>
              <td>{ASSET_TYPE_LABELS[holding.assetType]}</td>
              <td>{holding.currency}</td>
              <td className="numeric-cell">{formatHoldingQuantity(holding)}</td>
              <td className="numeric-cell">{holding.averageUnitCost ? formatDisplayPrice(holding.averageUnitCost) : "-"}</td>
              <td className="numeric-cell">{holding.costAmount ? formatDisplayAmount(holding.costAmount) : "-"}</td>
              <td className="numeric-cell">{formatHoldingLatestPrice(holding)}</td>
              <td className="numeric-cell">{holding.marketValue ? formatDisplayAmount(holding.marketValue) : "--"}</td>
              <td className={`numeric-cell ${signedToneClass(holding.unrealizedGain, gainColorScheme, 3)}`}>
                {holding.unrealizedGain ? formatSignedDisplayAmount(holding.unrealizedGain) : "--"}
              </td>
              <td>{formatHoldingWarnings(holding)}</td>
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "账户请求失败，请稍后重试。";
}
