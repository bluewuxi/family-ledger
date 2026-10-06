import { monthDateRange } from "./cashflowDates";
export const familyCashflowTabs = [
  { value: "spending", label: "日常交易" },
  { value: "education", label: "教育收支" },
  { value: "report", label: "收支查询" },
] as const;
export type FamilyCashflowTab = typeof familyCashflowTabs[number]["value"];
const filterKeys: Record<FamilyCashflowTab, readonly string[]> = {
  spending: ["accountId", "statementId", "month", "from", "to", "currency", "classification", "tag", "untagged", "accountNumberLast4", "counterpartyAccountLast4", "q", "limit", "offset"],
  education: ["from", "to", "currency", "category", "limit", "offset"],
  report: ["domain", "from", "to", "currency", "category", "limit", "offset"],
};
export function getFamilyCashflowTab(params: URLSearchParams): FamilyCashflowTab {
  return familyCashflowTabs.find(tab => tab.value === params.get("tab"))?.value ?? "spending";
}
export function familyCashflowFilters(tab: FamilyCashflowTab, params: URLSearchParams): URLSearchParams {
  const filters = new URLSearchParams();
  for (const key of filterKeys[tab]) {
    const value = params.get(key);
    if (value) filters.set(key, value);
  }
  if (tab === "report") {
    const domain = filters.get("domain");
    if (domain !== "education" && domain !== "daily_expense") filters.set("domain", "all");
    if (filters.get("domain") !== "education") filters.delete("category");
  }
  if (tab === "spending" && filters.has("month")) {
    const range = monthDateRange(filters.get("month")!);
    if (range) { filters.set("from", range.from); filters.set("to", range.to); filters.delete("month"); }
  }
  return filters;
}
export function familyCashflowLocation(tab: FamilyCashflowTab, params = new URLSearchParams()): string {
  const filters = familyCashflowFilters(tab, params);
  filters.set("tab", tab);
  return `/daily-expense?${filters}`;
}

export function legacyAccountDates(params: URLSearchParams): URLSearchParams {
  const dates = new URLSearchParams();
  for (const key of ["from", "to"]) {
    const value = params.get(key);
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) dates.set(key, value);
  }
  return dates;
}
