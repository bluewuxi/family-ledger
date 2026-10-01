import { useState } from "react";
import {
  SPENDING_CURRENCIES,
  SPENDING_FORMATS,
  SPENDING_FORMAT_LABELS,
  type SpendingFormat,
  type SpendingAccount,
} from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { spendingClient } from "../../lib/spendingClient";
interface Props {
  accounts: SpendingAccount[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}
export function SpendingAccountsDrawer({
  accounts,
  admin,
  onClose,
  onSaved,
}: Props) {
  const [id, setId] = useState<string>(),
    [form, setForm] = useState({
      name: "",
      source_format: "ccb_debit" as SpendingFormat,
      identity_suffix: "",
      default_currency: "CNY",
      is_active: true,
    });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function reset() {
    setId(undefined);
    setForm({
      name: "",
      source_format: "ccb_debit" as SpendingFormat,
      identity_suffix: "",
      default_currency: "CNY",
      is_active: true,
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await spendingClient.saveAccount(form, id);
      onSaved();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!id || !window.confirm("删除此收支账户？已有账单的账户无法删除。"))
      return;
    setBusy(true);
    try {
      await spendingClient.deleteAccount(id);
      onSaved();
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open
      title="收支账户"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="spending-account-list">
        {accounts.map((a) => (
          <button
            className="secondary-button"
            key={a.id}
            onClick={() => {
              setId(a.id);
              setForm({
                name: a.name,
                source_format: a.source_format,
                identity_suffix: a.identity_suffix ?? "",
                default_currency: a.default_currency,
                is_active: a.is_active,
              });
            }}
          >
            {a.name} · {SPENDING_FORMAT_LABELS[a.source_format]} ·{" "}
            {a.default_currency}
            {!a.is_active ? " · 已停用" : ""}
          </button>
        ))}
      </div>
      {!accounts.length && <p>暂无收支账户。</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {admin && (
        <>
          <h3>{id ? "编辑账户" : "新建账户"}</h3>
          <fieldset disabled={busy} className="spending-form">
            <label>
              账户名称
              <input
                value={form.name}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              银行格式
              <select
                value={form.source_format}
                onChange={(e) =>
                  setForm({
                    ...form,
                    source_format: e.target.value as SpendingFormat,
                    default_currency: e.target.value === "bnz" ? "NZD" : "CNY",
                  })
                }
              >
                {SPENDING_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {SPENDING_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              账号/卡号后四位（可选）
              <input
                value={form.identity_suffix}
                maxLength={4}
                onChange={(e) =>
                  setForm({ ...form, identity_suffix: e.target.value })
                }
              />{" "}
            </label>
            {form.source_format === "ccb_credit" && (
              <p className="spending-hint">同一信用卡账单可包含多张卡，交易尾号按 CSV 每行读取，不限制为此处的卡号。</p>
            )}
            <label>
              默认币种
              <select
                value={form.default_currency}
                onChange={(e) =>
                  setForm({ ...form, default_currency: e.target.value })
                }
              >
                {SPENDING_CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="spending-checkbox">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              启用账户
            </label>
            <div className="spending-actions">
              <button className="primary-button" onClick={() => void save()}>
                保存
              </button>
              {id && (
                <>
                  <button className="secondary-button" onClick={reset}>
                    新建账户
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void remove()}
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </fieldset>
        </>
      )}
    </Drawer>
  );
}
