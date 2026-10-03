import { EDUCATION_CATEGORIES, EDUCATION_CATEGORY_LABELS, SPENDING_CURRENCIES } from "@family-ledger/shared";
export function CashflowFilters({ params, change, education = false }: {
  params: URLSearchParams; change: (key: string, value: string) => void; education?: boolean;
}) {
  return <div className="filter-bar cashflow-filters">
    <label>开始日期<input type="date" value={params.get("from") ?? ""} onChange={e => change("from", e.target.value)} /></label>
    <label>结束日期<input type="date" value={params.get("to") ?? ""} onChange={e => change("to", e.target.value)} /></label>
    <label>币种<select value={params.get("currency") ?? ""} onChange={e => change("currency", e.target.value)}><option value="">全部币种</option>{SPENDING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
    {education && <label>教育分类<select value={params.get("category") ?? ""} onChange={e => change("category", e.target.value)}><option value="">全部分类</option>{EDUCATION_CATEGORIES.map(c => <option key={c} value={c}>{EDUCATION_CATEGORY_LABELS[c]}</option>)}</select></label>}
  </div>;
}
