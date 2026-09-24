import { useState } from "react";
import {
  SPENDING_CURRENCIES,
  SPENDING_TYPES,
  SPENDING_TYPE_LABELS,
  getLocalDateString,
  defaultSpendingInclusion,
  type AccountStatement,
  type StatementRow,
} from "@family-ledger/shared";
import { Drawer } from "../Drawer";
import { spendingClient } from "../../lib/spendingClient";

interface Props {
  row?: StatementRow;
  statementId?: string;
  statements: AccountStatement[];
  tags: string[];
  admin: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCreateStatement: () => void;
}
export function SpendingRowDrawer({
  row,
  statementId,
  statements,
  tags,
  admin,
  onClose,
  onSaved,
  onCreateStatement,
}: Props) {
  const initialStatement =
    statements.find((s) => s.id === (row?.statement_id ?? statementId)) ??
    statements[0];
  const [sid, setSid] = useState(
    row?.statement_id ?? initialStatement?.id ?? "",
  );
  const [inclusionOverride, setInclusionOverride] = useState<
    boolean | undefined
  >(row?.is_spending);
  const [form, setForm] = useState({
    transaction_date: row?.transaction_date ?? getLocalDateString(),
    posting_date: row?.posting_date ?? getLocalDateString(),
    suffix_number: row?.suffix_number ?? "",
    description: row?.description ?? "",
    transaction_type: row?.transaction_type ?? "",
    original_currency:
      row?.original_currency ?? initialStatement?.currency ?? "CNY",
    original_amount: row?.original_amount ?? "",
    settlement_amount: row?.settlement_amount ?? "",
    tag: row?.tag ?? "",
    notes: row?.notes ?? "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const field = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  const isSpending =
    inclusionOverride ?? defaultSpendingInclusion(form.settlement_amount);
  async function save(keep: boolean) {
    setBusy(true);
    setError("");
    try {
      await spendingClient.saveRow(
        sid,
        { ...form, is_spending: isSpending },
        row?.id,
      );
      onSaved();
      if (keep) {
        setInclusionOverride(undefined);
        setForm((old) => ({
          ...old,
          description: "",
          transaction_type: "",
          original_amount: "",
          settlement_amount: "",
          tag: "",
          notes: "",
        }));
      } else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!row || !window.confirm("删除这条消费明细？")) return;
    setBusy(true);
    try {
      await spendingClient.deleteRow(row.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer
      open
      title={row ? "消费明细" : "新增消费"}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        admin ? (
          <div className="spending-actions">
            <button
              className="primary-button"
              disabled={busy || !sid}
              onClick={() => void save(false)}
            >
              保存
            </button>
            {!row && (
              <button
                className="secondary-button"
                disabled={busy || !sid}
                onClick={() => void save(true)}
              >
                保存并继续
              </button>
            )}
            {row && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void remove()}
              >
                删除
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!statements.length && admin && (
        <button className="primary-button" onClick={onCreateStatement}>
          新建账单
        </button>
      )}
      <fieldset disabled={!admin || busy} className="spending-form">
        <label>
          所属账单
          <select
            value={sid}
            disabled={!!row}
            onChange={(e) => {
              setSid(e.target.value);
              field(
                "original_currency",
                statements.find((s) => s.id === e.target.value)?.currency ??
                  "CNY",
              );
            }}
          >
            <option value="">请选择账单</option>
            {statements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.account_name} · {s.statement_date} · {s.currency}
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
              setForm((old) => ({
                ...old,
                transaction_date: e.target.value,
                posting_date:
                  old.posting_date === old.transaction_date
                    ? e.target.value
                    : old.posting_date,
              }))
            }
          />
        </label>
        <label>
          银行记账日期
          <input
            type="date"
            value={form.posting_date}
            onChange={(e) => field("posting_date", e.target.value)}
          />
        </label>
        <label>
          卡号后四位
          <input
            inputMode="numeric"
            maxLength={4}
            value={form.suffix_number}
            onChange={(e) => field("suffix_number", e.target.value)}
            placeholder="可留空"
          />
        </label>
        <label>
          交易描述
          <input
            maxLength={1000}
            value={form.description}
            onChange={(e) => field("description", e.target.value)}
          />
        </label>
        <label>
          交易类型
          <select
            value={form.transaction_type}
            onChange={(e) => field("transaction_type", e.target.value)}
          >
            <option value="">正金额默认消费；零或负金额请选择</option>
            {SPENDING_TYPES.map((t) => (
              <option key={t} value={t}>
                {SPENDING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          原币种
          <select
            value={form.original_currency}
            onChange={(e) => field("original_currency", e.target.value)}
          >
            {SPENDING_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          原币金额
          <input
            inputMode="decimal"
            value={form.original_amount}
            onChange={(e) => field("original_amount", e.target.value)}
          />
        </label>
        <label>
          结算金额（{statements.find((s) => s.id === sid)?.currency ?? "—"}）
          <input
            inputMode="decimal"
            value={form.settlement_amount}
            onChange={(e) => field("settlement_amount", e.target.value)}
          />
        </label>
        <label className="spending-checkbox">
          <input
            type="checkbox"
            role="switch"
            checked={isSpending}
            onChange={(e) => setInclusionOverride(e.target.checked)}
          />
          计入消费
        </label>
        <p className="spending-hint">
          新增正金额默认计入；零或负金额默认不计入。开启后，负金额会抵扣消费。手动选择或保存后，更改金额不会重置此选项。
        </p>
        <label>
          标签
          <input
            list="spending-row-tags"
            maxLength={80}
            value={form.tag}
            onChange={(e) => field("tag", e.target.value)}
            placeholder="未分类"
          />
          <datalist id="spending-row-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          备注
          <textarea
            value={form.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        </label>
      </fieldset>
    </Drawer>
  );
}
