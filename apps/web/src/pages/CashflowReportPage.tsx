import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CashflowReport } from "@family-ledger/shared";
import { educationReserveClient } from "../lib/educationReserveClient";
import { CashflowScope } from "../components/cashflow/CashflowScope";
import { CashflowFilters } from "../components/cashflow/CashflowFilters";
import { CashflowTable } from "../components/cashflow/CashflowTable";
import { formatSpendingAmount as money } from "../lib/spendingFormat";
import { PaginationControls } from "../components/PaginationControls";
export function CashflowReportPage() {
  const [params, setParams] = useSearchParams(), [result, setResult] = useState<CashflowReport>(), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const query = params.toString();
  useEffect(() => { let active = true; setLoading(true); setError(""); setResult(undefined);
    void educationReserveClient.report(query).then(data => { if (active) setResult(data); }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "加载失败。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query]);
  const change = (key: string, value: string) => setParams(old => { const p = new URLSearchParams(old); p.delete("offset"); if (value) p.set(key, value); else p.delete(key); return p; });
  const domain = params.get("domain") === "education" ? "education" : params.get("domain") === "daily_expense" ? "daily_expense" : "all";
  return <section><header className="page-header"><div><h1>家庭收支汇总</h1><p>日常与教育分别统计。储备投入、转出和换汇不计入收入或支出。</p></div><CashflowScope value={domain} onChange={value => setParams(old => { const p = new URLSearchParams(old); p.set("domain", value); p.delete("category"); p.delete("offset"); return p; })} /></header>
    <CashflowFilters params={params} change={change} education={domain === "education"} />{error && <p className="form-error">{error}</p>}
    <div className="spending-totals">{result?.totals.map(t => <div key={`${t.domain}:${t.currency}`} className="spending-total-line"><strong>{t.domain === "education" ? "教育储备" : "日常收支"} · {t.currency}</strong>
      {t.domain === "daily_expense" && <span>收入 <b>{money(t.income)}</b></span>}<span>支出 <b>{money(t.expenses)}</b></span><span>退款 <b>{money(t.refunds)}</b></span><span>净支出 <b>{money(t.netSpending)}</b></span></div>)}</div>
    <CashflowTable rows={result?.rows ?? []} loading={loading} />
    {result && <PaginationControls pagination={result.pagination} loading={loading} onPageChange={offset => change("offset", String(offset))} />}
  </section>;
}
