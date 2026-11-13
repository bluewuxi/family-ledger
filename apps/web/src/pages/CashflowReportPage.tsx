import { useTranslation } from "react-i18next";
import { cashflowScopeKeys } from "../i18n/cashflowLabels";
import { describeUiError, translateUiError, type UiErrorDescriptor } from "../i18n/uiErrors";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CashflowReport } from "@family-ledger/shared";
import { educationReserveClient } from "../lib/educationReserveClient";
import { familyCashflowFilters } from "../lib/familyCashflowNavigation";
import { CashflowFilters } from "../components/cashflow/CashflowFilters";
import { CashflowTable } from "../components/cashflow/CashflowTable";
import { formatSpendingAmount as money } from "../lib/spendingFormat";
import { PaginationControls } from "../components/PaginationControls";
import { useCashflowQuery } from "../lib/useCashflowQuery";
import { DatePresets } from "../components/cashflow/DatePresets";
export function CashflowReportPage() {
  const { t: translate } = useTranslation("cashflow");
  const { language } = useUiLanguage();
  const filters = useCashflowQuery("report");
  const [params, setParams] = useSearchParams(), [result, setResult] = useState<CashflowReport>(), [error, setError] = useState<UiErrorDescriptor | null>(null), [loading, setLoading] = useState(true);
  const query = familyCashflowFilters("report", params).toString();
  useEffect(() => { let active = true; setLoading(true); setError(null); setResult(undefined);
    void educationReserveClient.report(query).then(data => { if (active) setResult(data); }).catch((e: unknown) => { if (active) setError(describeUiError(e, "cashflowRead")); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);
  const change = (key: string, value: string) => setParams(old => { const p = new URLSearchParams(old); p.delete("offset"); if (value) p.set(key, value); else p.delete(key); return p; });
  const domain = params.get("domain") === "education" ? "education" : params.get("domain") === "daily_expense" ? "daily_expense" : "all";
  return <section><p>{translate("reportIntro")}</p>
    <div className="cashflow-range" role="group" aria-label={translate("scope")}><span>{translate("scope")}</span>
      {(["all", "daily_expense", "education"] as const).map(value => <button type="button" key={value} aria-pressed={domain === value} onClick={() => setParams(old => { const p = familyCashflowFilters("report", old); p.set("tab", "report"); p.set("domain", value); p.delete("category"); p.delete("offset"); return p; })}>{translate(cashflowScopeKeys[value])}</button>)}
    </div>
    <form onSubmit={event => { event.preventDefault(); filters.apply(); }}><DatePresets onChange={filters.change} /><CashflowFilters params={filters.draft} change={(key, value) => filters.change({ [key]: value })} education={domain === "education"} /><div className="spending-actions"><button className="primary-button" type="submit">{translate("search")}</button><button type="button" onClick={() => filters.apply(true)}>{translate("reset")}</button></div></form>{error && <p className="form-error">{translateUiError(error, language)}</p>}
    <div className="spending-totals">{result?.totals.map(t => <div key={`${t.domain}:${t.currency}`} className="spending-total-line"><strong>{translate(cashflowScopeKeys[t.domain])} · {t.currency}</strong>
      {t.domain === "daily_expense" && <span>{translate("income")} <b>{money(t.income)}</b></span>}<span>{translate("expenses")} <b>{money(t.expenses)}</b></span><span>{translate("refunds")} <b>{money(t.refunds)}</b></span><span>{translate("netExpenses")} <b>{money(t.netSpending)}</b></span></div>)}</div>
    <CashflowTable showScope={domain === "all"} rows={result?.rows ?? []} loading={loading} />
    {result && <PaginationControls pagination={result.pagination} loading={loading} onPageChange={offset => change("offset", String(offset))} />}
  </section>;
}
