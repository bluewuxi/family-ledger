import { useTranslation } from "react-i18next";
import { useUiLanguage } from "../../i18n/LanguageProvider";
import { formatCalendarDate } from "../../lib/timeFormat";
import type { CashflowRecord, EducationEntryType, EducationCategory, SpendingClass } from "@family-ledger/shared";
import { cashflowScopeKeys, educationCategoryKeys, educationEntryKeys } from "../../i18n/cashflowLabels";
import { formatSpendingAmount } from "../../lib/spendingFormat";
export function CashflowTable({ rows, loading, open, showScope = true }: { rows: CashflowRecord[]; loading: boolean; showScope?: boolean; open?: (id: string) => void }) {
  const { t: translate } = useTranslation("cashflow");
  const { t: education } = useTranslation("educationReserve");
  const { t: spending } = useTranslation("spending");
  const { language } = useUiLanguage();
  return <div className="table-wrap"><table className="cashflow-table"><thead><tr><th>{translate("date")}</th>{showScope && <th>{translate("scope")}</th>}<th>{translate("type")}</th><th className="numeric-cell">{translate("amount")}</th><th>{translate("currency")}</th><th>{translate("category")}</th><th>{translate("notes")}</th></tr></thead><tbody>
    {rows.map(row => <tr key={`${row.domain}:${row.sourceId}`}><td>{open ? <button className="spending-text-button" onClick={() => open(row.sourceId)}>{formatCalendarDate(row.date, "—", language)}</button> : formatCalendarDate(row.date, "—", language)}</td>{showScope && <td>{translate(cashflowScopeKeys[row.domain])}</td>}
      <td>{row.domain === "education" ? education(educationEntryKeys[row.kind as EducationEntryType]) : spending(`classifications.${row.kind as SpendingClass}`)}</td><td className="numeric-cell">{formatSpendingAmount(row.amount)}</td><td>{row.currency}</td><td>{row.domain === "education" && row.category ? education(educationCategoryKeys[row.category as EducationCategory]) : row.category ?? "—"}</td><td>{row.notes ?? "—"}</td></tr>)}
    {!rows.length && <tr><td colSpan={showScope ? 7 : 6}>{loading ? translate("loading") : translate("empty")}</td></tr>}
  </tbody></table></div>;
}
