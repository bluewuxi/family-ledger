import { useTranslation } from "react-i18next";
import { educationCategoryKeys } from "../../i18n/cashflowLabels";
import { EDUCATION_CATEGORIES, SPENDING_CURRENCIES } from "@family-ledger/shared";
export function CashflowFilters({ params, change, education = false }: {
  params: URLSearchParams; change: (key: string, value: string) => void; education?: boolean;
}) {
  const { t: translate } = useTranslation("cashflow");
  const { t: translateEducation } = useTranslation("educationReserve");
  return <div className="filter-bar cashflow-filters">
    <label>{translate("fromDate")}<input type="date" value={params.get("from") ?? ""} onChange={e => change("from", e.target.value)} /></label>
    <label>{translate("toDate")}<input type="date" value={params.get("to") ?? ""} onChange={e => change("to", e.target.value)} /></label>
    <label>{translate("currency")}<select value={params.get("currency") ?? ""} onChange={e => change("currency", e.target.value)}><option value="">{translate("allCurrencies")}</option>{SPENDING_CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
    {education && <label>{translate("educationCategory")}<select value={params.get("category") ?? ""} onChange={e => change("category", e.target.value)}><option value="">{translate("allCategories")}</option>{EDUCATION_CATEGORIES.map(c => <option key={c} value={c}>{translateEducation(educationCategoryKeys[c])}</option>)}</select></label>}
  </div>;
}
