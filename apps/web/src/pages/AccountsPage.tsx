import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  CURRENCY_CODES,
  MARKET_REGION_LABELS,
  MARKET_REGIONS,
  type AccountType,
  type AuthenticatedUser,
  type CreateInvestmentAccountInput,
  type CreateInvestmentTransactionInput,
  type CurrencyCode,
  type Instrument,
  type InvestmentAccount,
  type InvestmentTransaction,
  type MarketRegion
} from "@family-ledger/shared";
import { Drawer } from "../components/Drawer";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";

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

interface AccountResponse {
  account: InvestmentAccount;
}

interface TransactionResponse {
  transaction: InvestmentTransaction;
}

interface DeleteAccountResponse {
  deleted: boolean;
}

interface AccountFormState {
  name: string;
  broker: string;
  accountType: AccountType;
  baseCurrency: CurrencyCode;
  marketRegion: MarketRegion;
  notes: string;
}

interface OpeningEntryFormRow {
  id: string;
  instrumentId: string;
  quantity: string;
  grossAmount: string;
  notes: string;
}

const today = new Date().toISOString().slice(0, 10);

const emptyForm: AccountFormState = {
  name: "",
  broker: "",
  accountType: "brokerage",
  baseCurrency: "NZD",
  marketRegion: "NZ",
  notes: ""
};

export function AccountsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [includeOpeningAssets, setIncludeOpeningAssets] = useState(false);
  const [openingTradeDate, setOpeningTradeDate] = useState(today);
  const [openingRows, setOpeningRows] = useState<OpeningEntryFormRow[]>(() => [emptyOpeningRow()]);

  const isAdmin = user?.role === "admin";
  const formTitle = editingAccountId ? "编辑账户" : "新增账户";
  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId]
  );
  const editingAccountHasHistory = editingAccountId
    ? transactions.some((transaction) => transaction.accountId === editingAccountId)
    : false;

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError(null);

    try {
      const [accountData, instrumentData, transactionData] = await Promise.all([
        apiGet<AccountsResponse>("/accounts"),
        apiGet<InstrumentsResponse>("/instruments"),
        apiGet<TransactionsResponse>("/transactions")
      ]);
      setUser(accountData.user);
      setAccounts(accountData.accounts);
      setInstruments(instrumentData.instruments);
      setTransactions(transactionData.transactions);
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
      const payload = toAccountInput(form);
      const data = editingAccountId
        ? await apiPut<AccountResponse>(`/accounts/${editingAccountId}`, payload)
        : await apiPost<AccountResponse>("/accounts", payload);

      const createdOpeningTransactions = includeOpeningAssets
        ? await createOpeningTransactions(data.account.id)
        : [];

      setAccounts((current) =>
        editingAccountId
          ? current.map((account) => (account.id === data.account.id ? data.account : account))
          : [...current, data.account].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      );
      if (createdOpeningTransactions.length > 0) {
        setTransactions((current) => [...current, ...createdOpeningTransactions]);
      }
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
      setAccounts((current) => current.filter((item) => item.id !== account.id));

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
    resetDrawerForm();
    setDrawerOpen(true);
  }

  function startEdit(account: InvestmentAccount) {
    setEditingAccountId(account.id);
    setForm({
      name: account.name,
      broker: account.broker ?? "",
      accountType: account.accountType,
      baseCurrency: account.baseCurrency,
      marketRegion: account.marketRegion,
      notes: account.notes ?? ""
    });
    setIncludeOpeningAssets(false);
    setOpeningRows([emptyOpeningRow()]);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingAccountId(null);
    resetDrawerForm();
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

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>投资账户</h1>
          <p>维护券商、基金平台、银行和现金账户。可在保存账户时一并录入期初资产。</p>
        </div>
        <div className="header-actions">
          {isAdmin ? (
            <button className="primary-button" type="button" onClick={startCreate} disabled={loading || saving}>
              新增账户
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={loadAccounts} disabled={loading || saving}>
            刷新
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {!isAdmin && !loading && user ? (
        <p className="readonly-note">当前角色为 viewer，可查看账户信息。新增、编辑和删除仅限 admin。</p>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>账户名称</th>
              <th>券商/平台</th>
              <th>账户类型</th>
              <th>基准货币</th>
              <th>主要市场</th>
              <th>备注</th>
              {isAdmin ? <th>操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6}>正在加载账户...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6}>暂无投资账户。</td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.broker ?? "-"}</td>
                  <td>{ACCOUNT_TYPE_LABELS[account.accountType]}</td>
                  <td>{account.baseCurrency}</td>
                  <td>{MARKET_REGION_LABELS[account.marketRegion]}</td>
                  <td>{account.notes ?? "-"}</td>
                  {isAdmin ? (
                    <td>
                      <div className="table-actions">
                        <button
                          aria-label={`编辑账户 ${account.name}`}
                          className="icon-button"
                          title="编辑"
                          type="button"
                          onClick={() => startEdit(account)}
                          disabled={saving}
                        >
                          <span aria-hidden="true">✎</span>
                        </button>
                        <button
                          aria-label={`删除账户 ${account.name}`}
                          className="icon-button danger-icon-button"
                          title="删除"
                          type="button"
                          onClick={() => void handleDelete(account)}
                          disabled={saving}
                        >
                          <span aria-hidden="true">×</span>
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

      <Drawer
        open={drawerOpen}
        title={formTitle}
        subtitle={editingAccount ? `正在编辑：${editingAccount.name}` : "新增后会立即显示在列表中"}
        onClose={closeDrawer}
        footer={
          <>
            <button className="primary-button" type="submit" form="account-drawer-form" disabled={saving}>
              {saving ? "保存中..." : editingAccountId ? "保存修改" : "新增账户"}
            </button>
            <button className="secondary-button" type="button" onClick={closeDrawer} disabled={saving}>
              取消
            </button>
          </>
        }
      >
        <form className="account-form drawer-form" id="account-drawer-form" onSubmit={handleSubmit}>
          <label>
            账户名称
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="例如 Hatch 美股账户"
              required
            />
          </label>

          <label>
            券商/平台
            <input
              value={form.broker}
              onChange={(event) => setForm({ ...form, broker: event.target.value })}
              placeholder="例如 Hatch、IBKR、InvestNow"
            />
          </label>

          <label>
            账户类型
            <select
              value={form.accountType}
              onChange={(event) => setForm({ ...form, accountType: event.target.value as AccountType })}
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
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="可选" />
          </label>

          <label className="checkbox-field wide-field">
            <input
              type="checkbox"
              checked={includeOpeningAssets}
              onChange={(event) => setIncludeOpeningAssets(event.target.checked)}
            />
            同时录入期初资产
          </label>

          {includeOpeningAssets ? (
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
                        value={row.notes}
                        onChange={(event) => updateOpeningRow(row.id, { notes: event.target.value })}
                        placeholder="可选"
                      />
                      <button
                        aria-label="删除期初资产行"
                        className="icon-button danger-icon-button"
                        title="删除"
                        type="button"
                        onClick={() => removeOpeningRow(row.id)}
                        disabled={saving || openingRows.length === 1}
                      >
                        <span aria-hidden="true">×</span>
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
    notes: form.notes
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
  return instrument.symbol ? `${instrument.symbol} - ${instrument.name}` : instrument.name;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "账户请求失败，请稍后重试。";
}
