import type { CashflowRecord } from "@family-ledger/shared";
import { EDUCATION_ENTRY_LABELS, EDUCATION_CATEGORY_LABELS, SPENDING_CLASS_LABELS, type EducationEntryType, type EducationCategory, type SpendingClass } from "@family-ledger/shared";
import { formatSpendingAmount } from "../../lib/spendingFormat";
export function CashflowTable({ rows, loading, open, showScope = true }: { rows: CashflowRecord[]; loading: boolean; showScope?: boolean; open?: (id: string) => void }) {
  return <div className="table-wrap"><table className="cashflow-table"><thead><tr><th>日期</th>{showScope && <th>收支范围</th>}<th>类型</th><th className="numeric-cell">金额</th><th>币种</th><th>分类</th><th>备注</th></tr></thead><tbody>
    {rows.map(row => <tr key={`${row.domain}:${row.sourceId}`}><td>{open ? <button className="spending-text-button" onClick={() => open(row.sourceId)}>{row.date}</button> : row.date}</td>{showScope && <td>{row.domain === "education" ? "教育" : "日常"}</td>}
      <td>{row.domain === "education" ? EDUCATION_ENTRY_LABELS[row.kind as EducationEntryType] : SPENDING_CLASS_LABELS[row.kind as SpendingClass]}</td><td className="numeric-cell">{formatSpendingAmount(row.amount)}</td><td>{row.currency}</td><td>{row.domain === "education" && row.category ? EDUCATION_CATEGORY_LABELS[row.category as EducationCategory] : row.category ?? "—"}</td><td>{row.notes ?? "—"}</td></tr>)}
    {!rows.length && <tr><td colSpan={showScope ? 7 : 6}>{loading ? "加载中…" : "暂无记录。"}</td></tr>}
  </tbody></table></div>;
}
