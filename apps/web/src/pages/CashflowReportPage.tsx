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
  const filters = useCashflowQuery("report");
  const [params, setParams] = useSearchParams(), [result, setResult] = useState<CashflowReport>(), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const query = familyCashflowFilters("report", params).toString();
  useEffect(() => { let active = true; setLoading(true); setError(""); setResult(undefined);
    void educationReserveClient.report(query).then(data => { if (active) setResult(data); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "加载失败。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);
  const change = (key: string, value: string) => setParams(old => { const p = new URLSearchParams(old); p.delete("offset"); if (value) p.set(key, value); else p.delete(key); return p; });
  const domain = params.get("domain") === "education" ? "education" : params.get("domain") === "daily_expense" ? "daily_expense" : "all";
  return <section><p>日常与教育分别统计。储备投入、转出和换汇不计入收入或支出。</p>
    <div className="cashflow-range" role="group" aria-label="收支范围"><span>收支范围</span>
      {([{ value: "all", label: "全部" }, { value: "daily_expense", label: "日常" }, { value: "education", label: "教育" }] as const).map(item => <button type="button" key={item.value} aria-pressed={domain === item.value} onClick={() => setParams(old => { const p = familyCashflowFilters("report", old); p.set("tab", "report"); p.set("domain", item.value); p.delete("category"); p.delete("offset"); return p; })}>{item.label}</button>)}
    </div>
    <form onSubmit={event => { event.preventDefault(); filters.apply(); }}><DatePresets onChange={filters.change} /><CashflowFilters params={filters.draft} change={(key, value) => filters.change({ [key]: value })} education={domain === "education"} /><div className="spending-actions"><button className="primary-button" type="submit">查询</button><button type="button" onClick={() => filters.apply(true)}>重置</button></div></form>{error && <p className="form-error">{error}</p>}
    <div className="spending-totals">{result?.totals.map(t => <div key={`${t.domain}:${t.currency}`} className="spending-total-line"><strong>{t.domain === "education" ? "教育" : "日常"} · {t.currency}</strong>
      {t.domain === "daily_expense" && <span>收入 <b>{money(t.income)}</b></span>}<span>支出 <b>{money(t.expenses)}</b></span><span>退款 <b>{money(t.refunds)}</b></span><span>净支出 <b>{money(t.netSpending)}</b></span></div>)}</div>
    <CashflowTable showScope={domain === "all"} rows={result?.rows ?? []} loading={loading} />
    {result && <PaginationControls pagination={result.pagination} loading={loading} onPageChange={offset => change("offset", String(offset))} />}
  </section>;
}
