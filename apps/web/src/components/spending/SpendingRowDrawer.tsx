import { useState } from "react";
import {
  SPENDING_CLASSES,
  SPENDING_CLASS_LABELS,
  getLocalDateString,
  type SpendingAccount,
  type StatementRow,
  type SpendingClass,
} from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { spendingClient } from "../../lib/spendingClient";
export function SpendingRowDrawer({
  row,
  accounts,
  tags,
  admin,
  onClose,
  onSaved,
}: {
  row?: StatementRow;
  accounts: SpendingAccount[];
  tags: string[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    account_id: row?.account_id ?? accounts.find((a) => a.is_active)?.id ?? "",
    transaction_date: row?.transaction_date ?? getLocalDateString(),
    description: row?.description ?? "",
    amount: row?.amount ?? "",
    classification: row?.classification ?? ("review" as SpendingClass),
    tag: row?.tag ?? "",
    notes: row?.notes ?? "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      if (remove && row) await spendingClient.deleteRow(row.id);
      else await spendingClient.saveRow(form, row?.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open
      title={row ? "交易详情" : "手动新增交易"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <fieldset className="spending-form" disabled={busy || !admin}>
        <label>
          账户
          <select
            disabled={!!row}
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
          >
            <option value="">请选择账户</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.default_currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          交易日期
          <input
            type="date"
            value={form.transaction_date}
            onChange={(e) =>
              setForm({ ...form, transaction_date: e.target.value })
            }
          />
        </label>
        <label>
          交易描述
          <input
            maxLength={1000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          金额（支出为负数，入账为正数）
          <input
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </label>
        <label>
          统计归类
          <select
            value={form.classification}
            onChange={(e) =>
              setForm({
                ...form,
                classification: e.target.value as SpendingClass,
              })
            }
          >
            {SPENDING_CLASSES.map((c) => (
              <option key={c} value={c}>
                {SPENDING_CLASS_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          标签
          <input
            list="spending-tags"
            maxLength={80}
            value={form.tag}
            onChange={(e) => setForm({ ...form, tag: e.target.value })}
          />
          <datalist id="spending-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          备注
          <textarea
            maxLength={4000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        {admin && (
          <div className="spending-actions">
            <button className="primary-button" onClick={() => void save()}>
              保存
            </button>
            {row && (
              <button
                className="secondary-button"
                onClick={() => {
                  if (window.confirm("删除此交易？")) void save(true);
                }}
              >
                删除
              </button>
            )}
          </div>
        )}
      </fieldset>
      {row && (
        <details>
          <summary>原始银行记录</summary>
          <dl className="spending-source-details">
            {Object.entries(row.source_metadata).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{Array.isArray(v) ? v.join(" · ") : v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Drawer>
  );
}
