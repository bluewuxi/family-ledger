import type { AuthenticatedUser, EducationFund, EducationEntry, EducationEntryInput, EducationCurrencyTotal, CashflowReport } from "@family-ledger/shared";
import { apiGet, apiRequest } from "./apiClient";
export interface EducationReserveResponse {
  user: AuthenticatedUser; fund: EducationFund; totals: EducationCurrencyTotal[]; periodTotals: EducationCurrencyTotal[];
  entries: EducationEntry[]; expenses: EducationEntry[]; pagination: CashflowReport["pagination"];
}
export const educationReserveClient = {
  load: (query: string) => apiGet<EducationReserveResponse>(`/education-reserve?${query}`),
  save: (entry: EducationEntryInput, existing?: EducationEntry) => apiRequest<{ entry: EducationEntry }>(existing ? `/education-reserve/entries/${existing.id}` : "/education-reserve/entries", {
    method: existing ? "PATCH" : "POST", body: { ...entry, ...(existing ? { version: existing.version } : {}) }
  }),
  remove: (entry: EducationEntry) => apiRequest(`/education-reserve/entries/${entry.id}`, { method: "DELETE", body: { version: entry.version } }),
  report: (query: string) => apiGet<CashflowReport>(`/cashflows?${query}`)
};
