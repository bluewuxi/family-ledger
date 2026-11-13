import { useTranslation } from "react-i18next";
import { educationCategoryKeys, educationEntryKeys } from "../i18n/cashflowLabels";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { formatCalendarDate } from "../lib/timeFormat";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { observeAsync } from "../lib/observeAsync";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EDUCATION_ENTRY_TYPES, EDUCATION_CATEGORIES, SPENDING_CURRENCIES, getAppBusinessDate, type EducationEntry, type EducationEntryInput, type EducationEntryType, type EducationCategory } from "@family-ledger/shared";
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
  const { t: translate } = useTranslation("educationReserve");
  const { t: cashflow } = useTranslation("cashflow");
  const { language } = useUiLanguage();
  const filters = useCashflowQuery("education");
  const [params, setParams] = useSearchParams(), [result, setResult] = useState<EducationReserveResponse>(), [loading, setLoading] = useState(true), [error, setError] = useState<UiErrorDescriptor | null>(null);
  const [revision, setRevision] = useState(0), [open, setOpen] = useState(false), [existing, setExisting] = useState<EducationEntry>(), [form, setForm] = useState<EducationEntryInput>(emptyEntry), [busy, setBusy] = useState(false), [formError, setFormError] = useState<UiErrorDescriptor | null>(null), [confirmDelete, setConfirmDelete] = useState(false);
  const admin = result?.user.role === "admin", query = familyCashflowFilters("education", params).toString();
  useEffect(() => { let active = true; setLoading(true); setError(null); setResult(undefined);
    void educationReserveClient.load(query).then(data => { if (active) setResult(data); }).catch((e: unknown) => { if (active) setError(describeUiError(e, "educationRead")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, revision]);
  const change = (key: string, value: string) => setParams(old => { const p = new URLSearchParams(old); p.delete("offset"); if (value) p.set(key, value); else p.delete(key); return p; });
  function edit(entry?: EducationEntry) { setExisting(entry); setForm(entry ?? emptyEntry()); setFormError(null); setConfirmDelete(false); setOpen(true); }
  async function save(remove = false) {
    setBusy(true); setFormError(null);
    try { if (remove && existing) await educationReserveClient.remove(existing); else await educationReserveClient.save(form, existing); setOpen(false); setRevision(n => n + 1); }
    catch (e: unknown) { setFormError(describeUiError(e, remove ? "educationDelete" : "educationSave")); } finally { setBusy(false); }
  }
  function type(value: EducationEntryType) { setForm(old => ({ ...old, entryType: value, expenseCategory: ["expense", "refund"].includes(value) ? old.expenseCategory ?? "tuition" : null,
    relatedExpenseId: null, targetCurrency: value === "exchange" ? old.currency === "HKD" ? "CNY" : "HKD" : null, targetAmount: value === "exchange" ? "" : null })); }
  const expense = ["expense", "refund"].includes(form.entryType);
  return <section>
    <p>{translate("intro")}</p>
    {error && <p className="form-error" role="alert">{translateUiError(error, language)}</p>}{loading && <p role="status">{cashflow("loading")}</p>}
    {error?.key === "educationNotFound" ? null : <h2>{translate("lifetimeOverview")}</h2>}<div className="education-totals">{result?.totals.map(t => <section key={t.currency} className="education-total"><h2>{t.currency}</h2><p>{translate("remainingReserve")} <strong>{money(t.balance)}</strong></p><p>{translate("lifetimeSpending")} <strong>{money(t.netSpending)}</strong></p><p className="spending-hint">{translate("paid")} {money(t.grossExpenses)} · {translate("refunds")} {money(t.refunds)}</p>{t.balance.startsWith("-") && <p className="form-error">{translate("negativeBalance")}</p>}</section>)}{result && !result.totals.length && <p>{translate("emptyReserve")}</p>}</div>
    <div className="spending-toolbar"><h2>{translate("records")}</h2>{admin && <button className="primary-button" disabled={!result?.fund.cutoverAt} onClick={() => edit()}>{translate("addManual")}</button>}</div>
    {result && !result.fund.cutoverAt && <p className="spending-hint">{translate("cutoverPending")}</p>}
    <form onSubmit={event => { event.preventDefault(); filters.apply(); }}><DatePresets onChange={filters.change} /><CashflowFilters params={filters.draft} change={(key, value) => filters.change({ [key]: value })} education /><div className="spending-actions"><button className="primary-button" type="submit">{cashflow("search")}</button><button type="button" onClick={() => filters.apply(true)}>{cashflow("reset")}</button></div></form>
    <p className="spending-hint">{translate("periodHint")}</p>
    <h3>{translate("periodTotals")}</h3><div className="spending-totals">{result?.periodTotals.map(t => <div key={t.currency} className="spending-total-line"><strong>{t.currency}</strong><span>{translate("periodSpending")} <b>{money(t.netSpending)}</b></span><span>{translate("paid")} {money(t.grossExpenses)}</span><span>{translate("refunds")} {money(t.refunds)}</span>{t.netSpending.startsWith("-") && <p className="spending-hint">{translate("negativePeriod")}</p>}</div>)}</div>
    <CashflowTable showScope={false} loading={loading} rows={result?.entries.map(e => ({ domain: "education", sourceId: e.id, date: e.entryDate, kind: e.entryType, category: e.expenseCategory, currency: e.currency,
      amount: ["expense", "withdrawal", "exchange"].includes(e.entryType) ? `-${e.amount}` : e.amount,
      notes: [e.notes, e.targetCurrency && e.targetAmount ? translate("exchangeNote", { currency: e.targetCurrency, amount: money(e.targetAmount) }) : null, e.entryType === "refund" && !e.relatedExpenseId ? translate("standaloneRefund") : null].filter(Boolean).join(" · ") || null })) ?? []}
      open={id => edit(result?.entries.find(e => e.id === id))} />
    {result && <PaginationControls pagination={result.pagination} loading={loading} onPageChange={offset => change("offset", String(offset))} />}
    <Drawer title={existing ? translate("editRecord") : translate("newRecord")} open={open} onClose={() => { if (!busy) setOpen(false); }}>
      <form onSubmit={e => { e.preventDefault(); observeAsync(save()); }}><fieldset disabled={busy || !admin} className="spending-form">
        <label>{cashflow("date")}<input type="date" required value={form.entryDate} onChange={e => setForm({ ...form, entryDate: e.target.value })} /></label>
        <label>{cashflow("type")}<select value={form.entryType} onChange={e => type(e.target.value as EducationEntryType)}>{EDUCATION_ENTRY_TYPES.map(t => <option key={t} value={t}>{translate(educationEntryKeys[t])}</option>)}</select></label>
        <label>{form.entryType === "exchange" ? translate("sourceCurrency") : cashflow("currency")}<select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, relatedExpenseId: null })}>{SPENDING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>{form.entryType === "exchange" ? translate("outgoingAmount") : cashflow("amount")}<input inputMode="decimal" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        {expense && <label>{cashflow("educationCategory")}<select value={form.expenseCategory ?? "tuition"} onChange={e => setForm({ ...form, expenseCategory: e.target.value as EducationCategory, relatedExpenseId: null })}>{EDUCATION_CATEGORIES.map(c => <option key={c} value={c}>{translate(educationCategoryKeys[c])}</option>)}</select></label>}
        {form.entryType === "refund" && <label>{translate("relatedExpense")}<select value={form.relatedExpenseId ?? ""} onChange={e => setForm({ ...form, relatedExpenseId: e.target.value || null })}><option value="">{translate("legacyExpense")}</option>{result?.expenses.filter(e => e.currency === form.currency && e.expenseCategory === form.expenseCategory && e.id !== existing?.id).map(e => <option key={e.id} value={e.id}>{formatCalendarDate(e.entryDate, "—", language)} · {e.currency} {money(e.amount)} · {e.notes}</option>)}</select></label>}
        {form.entryType === "exchange" && <><label>{translate("targetCurrency")}<select value={form.targetCurrency ?? "HKD"} onChange={e => setForm({ ...form, targetCurrency: e.target.value })}>{SPENDING_CURRENCIES.filter(c => c !== form.currency).map(c => <option key={c}>{c}</option>)}</select></label><label>{translate("receivedAmount")}<input inputMode="decimal" required value={form.targetAmount ?? ""} onChange={e => setForm({ ...form, targetAmount: e.target.value })} /></label></>}
        <label>{cashflow("notes")}<textarea value={form.notes ?? ""} maxLength={4000} onChange={e => setForm({ ...form, notes: e.target.value || null })} /></label>
        <p className="spending-hint">{translate("recordingHint")}</p>
        {formError && <p className="form-error" role="alert">{translateUiError(formError, language)}</p>}
        <div className="spending-actions"><button className="primary-button" type="submit">{busy ? translate("saving") : translate("save")}</button>{existing && <button type="button" onClick={() => { setExisting(undefined); setForm({ ...form, entryDate: getAppBusinessDate(), relatedExpenseId: null }); setConfirmDelete(false); }}>{translate("copy")}</button>}{existing && <button type="button" onClick={() => setConfirmDelete(true)}>{translate("delete")}</button>}</div>
        {confirmDelete && <div><p>{translate("deleteHint")}</p><div className="spending-actions"><button type="button" onClick={() => observeAsync(save(true))}>{translate("confirmDelete")}</button><button type="button" onClick={() => setConfirmDelete(false)}>{translate("cancel")}</button></div></div>}
      </fieldset></form>
    </Drawer>
  </section>;
}
