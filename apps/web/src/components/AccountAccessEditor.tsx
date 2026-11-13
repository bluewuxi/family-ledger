import { observeAsync } from "../lib/observeAsync";
import { useEffect, useState } from "react";
import type { AccountAccessPolicy, AccountResourceRef, AccountScope, InvestmentAccount, ManagedUser, SpendingAccount } from "@family-ledger/shared";
import { apiGet, apiPatch, apiPut } from "../lib/apiClient";
import { canSaveAccountScope } from "../lib/accountScopeState";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";

export function AccountAccessEditor({ user, demoting = false, onClose, onSaved }: { user: ManagedUser; demoting?: boolean; onClose(): void; onSaved(): void }) {
  const { t } = useTranslation("settings");
  const { language } = useUiLanguage();
  const [policy, setPolicy] = useState<AccountAccessPolicy>();
  const [scope, setScope] = useState<AccountScope>({ mode: "all" });
  const [catalog, setCatalog] = useState<Array<AccountResourceRef & { name: string }>>([]);
  const [error, setError] = useState<UiErrorDescriptor | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPolicy(undefined); setCatalog([]); setError(null);
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
    }).catch(e => { if (active) setError(describeUiError(e, "accessRead")); });
    return () => { active = false; };
  }, [user.id, demoting]);
  async function save() {
    if (!policy || !canSaveAccountScope(policy, user.id)) return;
    setSaving(true); setError(null);
    try {
      if (demoting) await apiPatch(`/users/${user.id}`, { role: "viewer", accountScope: scope, expectedScopeRevision: policy.revision });
      else await apiPut(`/settings/users/${user.id}/account-access`, { scope, expectedRevision: policy.revision });
      onSaved(); onClose();
    } catch (e) { setError(describeUiError(e, "accessSave")); }
    finally { setSaving(false); }
  }
  const fixed = user.role === "admin" && !demoting;
  return <section className="account-access-editor" aria-label={t("accessHeading")}>
    <h3>{t(demoting ? "demote" : "accessHeading")} · {user.email}</h3>
    {demoting && <p role="note">{t("demoteHint")}</p>}
    {fixed ? <p>{t("adminScope")}</p> : <>
      <label>{t("accessMode")} <select disabled={!policy || saving} value={scope.mode} onChange={e => setScope(e.target.value === "all" ? { mode: "all" } : { mode: "selected", resources: [] })}>
        <option value="all">{t("all")}</option><option value="selected">{t("selected")}</option></select></label>
      <p>{t(scope.mode === "all" ? "allHint" : "selectedHint")}</p>
      {scope.mode === "selected" && (["ledger", "spending", "education"] as const).map(kind => <fieldset key={kind} disabled={saving}>
        <legend>{t(kind)}</legend>
        {catalog.filter(item => item.kind === kind).map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" checked={scope.resources.some(ref => ref.kind === kind && ref.id === item.id)} onChange={e => {
            const resources = scope.resources.filter(ref => ref.kind !== kind || ref.id !== item.id);
            if (e.target.checked) resources.push({ kind, id: item.id }); setScope({ mode: "selected", resources });
          }} />{item.name}</label>)}
      </fieldset>)}
    </>}
    {error && <p className="form-error" role="alert">{translateUiError(error, language)}</p>}
    <div className="form-actions">{!fixed && <button type="button" className="primary-button" disabled={!canSaveAccountScope(policy, user.id) || saving} onClick={() => observeAsync(save())}>{t(saving ? "accessSaving" : "save")}</button>}
      <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>{t("close")}</button></div>
  </section>;
}
