import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EDUCATION_ENTRY_TYPES, EDUCATION_ENTRY_LABELS, EDUCATION_CATEGORIES, EDUCATION_CATEGORY_LABELS, SPENDING_CURRENCIES, getAppBusinessDate, type EducationEntry, type EducationEntryInput, type EducationEntryType, type EducationCategory } from "@family-ledger/shared";
import { educationReserveClient, type EducationReserveResponse } from "../lib/educationReserveClient";
import { formatSpendingAmount as money } from "../lib/spendingFormat";
import { familyCashflowFilters } from "../lib/familyCashflowNavigation";
import { CashflowFilters } from "../components/cashflow/CashflowFilters";
import { CashflowTable } from "../components/cashflow/CashflowTable";
import { Drawer } from "../components/Drawer";
import { PaginationControls } from "../components/PaginationControls";

function emptyEntry(): EducationEntryInput { return { entryDate: getAppBusinessDate(), entryType: "expense", currency: "CNY", amount: "", expenseCategory: "tuition", relatedExpenseId: null, targetCurrency: null, targetAmount: null, notes: null }; }
import { useCashflowQuery } from "../lib/useCashflowQuery";
import { DatePresets } from "../components/cashflow/DatePresets";
export function EducationReservePage() {
  const filters = useCashflowQuery("education");
  const [params, setParams] = useSearchParams(), [result, setResult] = useState<EducationReserveResponse>(), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [open, setOpen] = useState(false), [existing, setExisting] = useState<EducationEntry>(), [form, setForm] = useState<EducationEntryInput>(emptyEntry), [busy, setBusy] = useState(false), [formError, setFormError] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const admin = result?.user.role === "admin", query = familyCashflowFilters("education", params).toString();
  useEffect(() => { let active = true; setLoading(true); setError(""); setResult(undefined);
    void educationReserveClient.load(query).then(data => { if (active) setResult(data); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "加载失败。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, revision]);
  const change = (key: string, value: string) => setParams(old => { const p = new URLSearchParams(old); p.delete("offset"); if (value) p.set(key, value); else p.delete(key); return p; });
  function edit(entry?: EducationEntry) { setExisting(entry); setForm(entry ?? emptyEntry()); setFormError(""); setConfirmDelete(false); setOpen(true); }
  async function save(remove = false) {
    setBusy(true); setFormError("");
    try { if (remove && existing) await educationReserveClient.remove(existing); else await educationReserveClient.save(form, existing); setOpen(false); setRevision(n => n + 1); }
    catch (e: unknown) { setFormError(e instanceof Error ? e.message : "保存失败。"); } finally { setBusy(false); }
  }
  function type(value: EducationEntryType) { setForm(old => ({ ...old, entryType: value, expenseCategory: ["expense", "refund"].includes(value) ? old.expenseCategory ?? "tuition" : null,
    relatedExpenseId: null, targetCurrency: value === "exchange" ? old.currency === "HKD" ? "CNY" : "HKD" : null, targetAmount: value === "exchange" ? "" : null })); }
  const expense = ["expense", "refund"].includes(form.entryType);
  return <section>
    <p>专用于大学教育的多币种资金池。独立于日常收支和投资统计。</p>
    {error && <p className="form-error">{error}</p>}{loading && <p role="status">加载中…</p>}
    <h2>累计概览</h2><div className="education-totals">{result?.totals.map(t => <section key={t.currency} className="education-total"><h2>{t.currency}</h2><p>剩余教育储备 <strong>{money(t.balance)}</strong></p><p>累计教育支出 <strong>{money(t.netSpending)}</strong></p><p className="spending-hint">已支付 {money(t.grossExpenses)} · 退款 {money(t.refunds)}</p>{t.balance.startsWith("-") && <p className="form-error">余额为负，请核对是否漏记储备投入。</p>}</section>)}{result && !result.totals.length && <p>尚未录入教育储备，可先新增期初储备或储备投入。</p>}</div>
    <div className="spending-toolbar"><h2>资金记录</h2>{admin && <button className="primary-button" disabled={!result?.fund.cutoverAt} onClick={() => edit()}>手动新增</button>}</div>
    {result && !result.fund.cutoverAt && <p className="spending-hint">教育数据正在准备迁移，完成切换后即可录入。</p>}
    <form onSubmit={event => { event.preventDefault(); filters.apply(); }}><DatePresets onChange={filters.change} /><CashflowFilters params={filters.draft} change={(key, value) => filters.change({ [key]: value })} education /><div className="spending-actions"><button className="primary-button" type="submit">查询</button><button type="button" onClick={() => filters.apply(true)}>重置</button></div></form>
    <p className="spending-hint">上方为累计数据，以下为所选期间统计。</p>
    <h3>期间统计</h3><div className="spending-totals">{result?.periodTotals.map(t => <div key={t.currency} className="spending-total-line"><strong>{t.currency}</strong><span>期间教育支出 <b>{money(t.netSpending)}</b></span><span>已支付 {money(t.grossExpenses)}</span><span>退款 {money(t.refunds)}</span></div>)}</div>
    <CashflowTable showScope={false} loading={loading} rows={result?.entries.map(e => ({ domain: "education", sourceId: e.id, date: e.entryDate, kind: e.entryType, category: e.expenseCategory, currency: e.currency,
      amount: ["expense", "withdrawal", "exchange"].includes(e.entryType) ? `-${e.amount}` : e.amount,
      notes: [e.notes, e.targetCurrency && e.targetAmount ? `兑换为 ${e.targetCurrency} ${money(e.targetAmount)}` : null, e.entryType === "refund" && !e.relatedExpenseId ? "未关联历史支出的退款" : null].filter(Boolean).join(" · ") || null })) ?? []}
      open={id => edit(result?.entries.find(e => e.id === id))} />
    {result && <PaginationControls pagination={result.pagination} loading={loading} onPageChange={offset => change("offset", String(offset))} />}
    <Drawer title={existing ? "教育储备记录" : "新增教育储备记录"} open={open} onClose={() => { if (!busy) setOpen(false); }}>
      <form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy || !admin} className="spending-form">
        <label>日期<input type="date" required value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} /></label>
        <label>类型<select value={form.entryType} onChange={e => type(e.target.value as EducationEntryType)}>{EDUCATION_ENTRY_TYPES.map(t => <option key={t} value={t}>{EDUCATION_ENTRY_LABELS[t]}</option>)}</select></label>
        <label>{form.entryType === "exchange" ? "原币种" : "币种"}<select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, relatedExpenseId: null })}>{SPENDING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>{form.entryType === "exchange" ? "转出金额" : "金额"}<input inputMode="decimal" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        {expense && <label>教育分类<select value={form.expenseCategory ?? "tuition"} onChange={e => setForm({ ...form, expenseCategory: e.target.value as EducationCategory, relatedExpenseId: null })}>{EDUCATION_CATEGORIES.map(c => <option key={c} value={c}>{EDUCATION_CATEGORY_LABELS[c]}</option>)}</select></label>}
        {form.entryType === "refund" && <label>关联支出<select value={form.relatedExpenseId ?? ""} onChange={e => setForm({ ...form, relatedExpenseId: e.target.value || null })}><option value="">未关联（迁移前的教育支出）</option>{result?.expenses.filter(e => e.currency === form.currency && e.expenseCategory === form.expenseCategory && e.id !== existing?.id).map(e => <option key={e.id} value={e.id}>{e.entryDate} · {e.currency} {money(e.amount)} · {e.notes}</option>)}</select></label>}
        {form.entryType === "exchange" && <><label>目标币种<select value={form.targetCurrency ?? "HKD"} onChange={e => setForm({ ...form, targetCurrency: e.target.value })}>{SPENDING_CURRENCIES.filter(c => c !== form.currency).map(c => <option key={c}>{c}</option>)}</select></label><label>到账金额<input inputMode="decimal" required value={form.targetAmount ?? ""} onChange={e => setForm({ ...form, targetAmount: e.target.value })} /></label></>}
        <label>备注<textarea value={form.notes ?? ""} maxLength={4000} onChange={e => setForm({ ...form, notes: e.target.value || null })} /></label>
        <p className="spending-hint">投入、转出和换汇不计入教育支出。生活费在实际划转时记录。若来源资金也在应用中管理，请另记来源划转。</p>
        {formError && <p className="form-error">{formError}</p>}
        <div className="spending-actions"><button className="primary-button" type="submit">{busy ? "处理中…" : "保存"}</button>{existing && <button type="button" onClick={() => { setExisting(undefined); setForm({ ...form, entryDate: getAppBusinessDate(), relatedExpenseId: null }); setConfirmDelete(false); }}>复制为新记录</button>}{existing && <button type="button" onClick={() => setConfirmDelete(true)}>删除</button>}</div>
        {confirmDelete && <div><p>确认删除这条记录？余额与支出汇总将重新计算。</p><div className="spending-actions"><button type="button" onClick={() => void save(true)}>确认删除</button><button type="button" onClick={() => setConfirmDelete(false)}>取消</button></div></div>}
      </fieldset></form>
    </Drawer>
  </section>;
}
