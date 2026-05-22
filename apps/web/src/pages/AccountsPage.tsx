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
  type CurrencyCode,
  type InvestmentAccount,
  type MarketRegion
} from "@family-ledger/shared";
import { ApiClientError, apiDelete, apiGet, apiPost, apiPut } from "../lib/apiClient";

interface AccountsResponse {
  user: AuthenticatedUser;
  accounts: InvestmentAccount[];
}

interface AccountResponse {
  account: InvestmentAccount;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";
  const formTitle = editingAccountId ? "编辑账户" : "新增账户";
  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId]
  );

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError(null);

    try {
      const data = await apiGet<AccountsResponse>("/accounts");
      setUser(data.user);
      setAccounts(data.accounts);
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

      setAccounts((current) =>
        editingAccountId
          ? current.map((account) => (account.id === data.account.id ? data.account : account))
          : [...current, data.account].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
      );
      clearForm();
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
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
        clearForm();
      }
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
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
  }

  function clearForm() {
    setEditingAccountId(null);
    setForm(emptyForm);
  }

  return (
    <section>
      <header className="page-header account-header">
        <div>
          <h1>投资账户</h1>
          <p>维护券商、基金平台、银行和现金账户。写入操作会通过 Lambda API 校验 admin 权限。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadAccounts} disabled={loading || saving}>
          刷新
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {isAdmin ? (
        <form className="account-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <h2>{formTitle}</h2>
            {editingAccount ? <span>正在编辑：{editingAccount.name}</span> : <span>新增后会立即显示在列表中</span>}
          </div>

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
            <input
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="可选"
            />
          </label>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "保存中..." : editingAccountId ? "保存修改" : "新增账户"}
            </button>
            {editingAccountId ? (
              <button className="secondary-button" type="button" onClick={clearForm} disabled={saving}>
                取消编辑
              </button>
            ) : null}
          </div>
        </form>
      ) : !loading && user ? (
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
                        <button className="text-button" type="button" onClick={() => startEdit(account)} disabled={saving}>
                          编辑
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => void handleDelete(account)}
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

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return "账户请求失败，请稍后重试。";
}
