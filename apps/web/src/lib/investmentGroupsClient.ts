import type { InvestmentGroup, InvestmentGroupConfiguration, SaveInvestmentGroupInput, DeleteInvestmentGroupInput } from "@family-ledger/shared";
import { apiRequest } from "./apiClient";
export function loadInvestmentGroups(): Promise<InvestmentGroupConfiguration> { return apiRequest("/investment-groups"); }
export function saveInvestmentGroup(id: string | null, input: SaveInvestmentGroupInput): Promise<{revision:string;group:InvestmentGroup|null}> {
  return apiRequest(id ? `/investment-groups/${encodeURIComponent(id)}` : "/investment-groups", {method:id?"PUT":"POST",body:input});
}
export function deleteInvestmentGroup(id: string, input: DeleteInvestmentGroupInput): Promise<{revision:string;group:null}> {
  return apiRequest(`/investment-groups/${encodeURIComponent(id)}`,{method:"DELETE",body:input});
}
