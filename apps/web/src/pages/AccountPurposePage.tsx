import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AccountPurposeOverview } from "@family-ledger/shared";
import { ACCOUNT_PURPOSE_LABELS } from "@family-ledger/shared";
import { PageTitle } from "../components/PageTitle";
import { loadAccountPurposeOverview } from "../lib/accountPurposeClient";
import { formatDisplayAmount } from "../lib/numberFormat";
import { usePreferences } from "../lib/preferencesContext";

export function AccountPurposePage({ purpose }: { purpose: "daily_expense" | "education" }) {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [overview, setOverview] = useState<AccountPurposeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const label = ACCOUNT_PURPOSE_LABELS[purpose];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadAccountPurposeOverview({ purpose, currency: preferences.preferredCurrency, accountId, from, to })
      .then((data) => { if (active) { setOverview(data.overview); setIsAdmin(data.user.role === "admin"); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "加载失败，请稍后重试。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [purpose, preferences.preferredCurrency, accountId, from, to]);

  const accounts = overview?.balances.map((item) => item.account) ?? [];
  return <section>
    <header className="page-header">
      <div><PageTitle route={`/${purpose === "education" ? "education" : "daily-expense"}`}>{label}</PageTitle><p>查看账户余额和手动录入的入金、出金记录。</p></div>
      <button className="primary-button" type="button" onClick={() => navigate("/transactions")}>{isAdmin ? "管理交易" : "查看交易"}</button>
    </header>
    <div className="filter-bar">
      <label>账户<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">全部账户</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <label>开始日期<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>结束日期<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div>
    {error ? <p className="form-error">{error}</p> : null}
    {loading ? <p role="status">加载中…</p> : null}
    <div className="table-wrap"><table><thead><tr><th>账户</th><th>基准货币</th><th className="numeric-cell">当前余额</th></tr></thead><tbody>
      {overview?.balances.length ? overview.balances.filter(({ account }) => !accountId || account.id === accountId).map(({ account, balance, currency }) => <tr key={account.id}><td>{account.name}</td><td>{account.baseCurrency}</td><td className="numeric-cell">{balance === null ? "--" : `${currency} ${formatDisplayAmount(balance)}`}</td></tr>) : <tr><td colSpan={3}>{loading ? "正在加载账户…" : `暂无${label}账户。`}</td></tr>}
    </tbody></table></div>
    <h2>入金与出金</h2>
    <div className="table-wrap"><table><thead><tr><th>日期</th><th>账户</th><th>类型</th><th>币种</th><th className="numeric-cell">金额</th><th>备注</th></tr></thead><tbody>
      {overview?.flows.length ? overview.flows.map((flow) => <tr key={flow.id}><td>{flow.tradeDate}</td><td>{accounts.find((account) => account.id === flow.accountId)?.name ?? "-"}</td><td>{flow.transactionType === "deposit" ? "入金" : "出金"}</td><td>{flow.currency}</td><td className="numeric-cell">{formatDisplayAmount(flow.grossAmount ?? "0")}</td><td>{flow.notes ?? "-"}</td></tr>) : <tr><td colSpan={6}>暂无入金或出金记录。</td></tr>}
    </tbody></table></div>
  </section>;
}
