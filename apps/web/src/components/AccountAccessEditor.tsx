import { observeAsync } from "../lib/observeAsync";
import { useEffect, useState } from "react";
import type { AccountAccessPolicy, AccountResourceRef, AccountScope, InvestmentAccount, ManagedUser, SpendingAccount } from "@family-ledger/shared";
import { apiGet, apiPatch, apiPut } from "../lib/apiClient";
import { canSaveAccountScope } from "../lib/accountScopeState";

export function AccountAccessEditor({ user, demoting = false, onClose, onSaved }: { user: ManagedUser; demoting?: boolean; onClose(): void; onSaved(): void }) {
  const [policy, setPolicy] = useState<AccountAccessPolicy>();
  const [scope, setScope] = useState<AccountScope>({ mode: "all" });
  const [catalog, setCatalog] = useState<Array<AccountResourceRef & { name: string }>>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPolicy(undefined); setCatalog([]); setError("");
    let active = true;
    void Promise.all([
      apiGet<{ accountAccess: AccountAccessPolicy }>(`/settings/users/${user.id}/account-access`),
      apiGet<{ accounts: InvestmentAccount[] }>("/accounts"), apiGet<{ accounts: SpendingAccount[] }>("/spending/accounts"),
      apiGet<{ fund: { id: string; name: string } }>("/education-reserve")
    ]).then(([access, ledger, spending, education]) => {
      if (!active) return;
      setPolicy(access.accountAccess); setScope(demoting ? { mode: "all" } : access.accountAccess.scope);
      setCatalog([...ledger.accounts.map(a => ({ kind: "ledger" as const, id: a.id, name: a.name })),
        ...spending.accounts.map(a => ({ kind: "spending" as const, id: a.id, name: a.name })),
        { kind: "education", id: education.fund.id, name: education.fund.name }]);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "加载失败。"); });
    return () => { active = false; };
  }, [user.id, demoting]);
  async function save() {
    if (!policy || !canSaveAccountScope(policy, user.id)) return;
    setSaving(true); setError("");
    try {
      if (demoting) await apiPatch(`/users/${user.id}`, { role: "viewer", accountScope: scope, expectedScopeRevision: policy.revision });
      else await apiPut(`/settings/users/${user.id}/account-access`, { scope, expectedRevision: policy.revision });
      onSaved(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败。"); }
    finally { setSaving(false); }
  }
  const fixed = user.role === "admin" && !demoting;
  return <section className="account-access-editor" aria-label="账户访问范围">
    <h3>{demoting ? "改为只读用户" : "账户访问范围"} · {user.email}</h3>
    {demoting && <p role="note">改为只读后将失去账本编辑权限，默认仍可查看全部现有及未来账户。你可以在保存前改为指定账户。</p>}
    {fixed ? <p>管理员始终可见全部账户。</p> : <>
      <label>访问范围 <select disabled={!policy || saving} value={scope.mode} onChange={e => setScope(e.target.value === "all" ? { mode: "all" } : { mode: "selected", resources: [] })}>
        <option value="all">全部账户</option><option value="selected">指定账户</option></select></label>
      <p>{scope.mode === "all" ? "包括全部现有及未来账户。" : "新账户不会自动授权。未选择任何账户时，用户暂无可访问账户。"}</p>
      {scope.mode === "selected" && (["ledger", "spending", "education"] as const).map(kind => <fieldset key={kind} disabled={saving}>
        <legend>{{ ledger: "投资及日常用途账户", spending: "日常收支账户", education: "教育储备" }[kind]}</legend>
        {catalog.filter(item => item.kind === kind).map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" checked={scope.resources.some(ref => ref.kind === kind && ref.id === item.id)} onChange={e => {
            const resources = scope.resources.filter(ref => ref.kind !== kind || ref.id !== item.id);
            if (e.target.checked) resources.push({ kind, id: item.id }); setScope({ mode: "selected", resources });
          }} />{item.name}</label>)}
      </fieldset>)}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions">{!fixed && <button type="button" className="primary-button" disabled={!canSaveAccountScope(policy, user.id) || saving} onClick={() => observeAsync(save())}>{saving ? "保存中…" : "保存"}</button>}
      <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>关闭</button></div>
  </section>;
}
