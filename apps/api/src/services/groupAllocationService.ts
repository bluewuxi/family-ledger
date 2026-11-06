import Decimal from "decimal.js";
import type { DashboardHoldingAllocationSummary, GroupAllocationRow, GroupDistribution, InvestmentGroupConfiguration } from "@family-ledger/shared";

export function buildGroupDistribution(input: { allocations: DashboardHoldingAllocationSummary[]; totalAssets: string | null; configuration: InvestmentGroupConfiguration }): GroupDistribution {
  const memberships = new Map(input.configuration.groups.flatMap(group => group.instrumentIds.map(id => [id, group] as const)));
  const rows = new Map<string, GroupAllocationRow>();
  for (const source of input.allocations) {
    const cash = source.allocationType === "cash";
    const group = cash ? undefined : memberships.get(source.id);
    const id = cash ? "cash" : group ? `group:${group.id}` : `instrument:${source.id}`;
    const previous = rows.get(id);
    const member = { instrumentId: source.id, shortName: source.name };
    if (previous) {
      previous.marketValue = previous.marketValue === null || source.marketValue === null ? null : new Decimal(previous.marketValue).plus(source.marketValue).toFixed(2);
      if (!cash && !previous.members.some(m => m.instrumentId === source.id)) previous.members.push(member);
    } else rows.set(id, { id, allocationType: cash ? "cash" : group ? "group" : "instrument", name: group?.name ?? source.name,
      groupId: group?.id ?? null, instrumentId: cash || group ? null : source.id, marketValue: source.marketValue === null ? null : new Decimal(source.marketValue).toFixed(2), percentageOfTotal: null, members: cash ? [] : [member] });
  }
  const result = [...rows.values()];
  const reason: GroupDistribution["reason"] = input.totalAssets === null || input.allocations.some(row => row.marketValue === null) ? "missing_valuation"
    : input.allocations.some(row => new Decimal(row.marketValue!).lt(0)) || result.some(row => row.marketValue !== null && new Decimal(row.marketValue).lt(0)) ? "negative_value"
    : new Decimal(input.totalAssets).lte(0) ? "non_positive_total" : null;
  for (const row of result) if (reason === null && row.marketValue !== null) row.percentageOfTotal = new Decimal(row.marketValue).div(input.totalAssets!).times(100).toFixed(2);
  result.sort((a, b) => {
    if (a.allocationType === "cash" || b.allocationType === "cash") return a.allocationType === b.allocationType ? 0 : a.allocationType === "cash" ? 1 : -1;
    if (a.marketValue === null || b.marketValue === null) return a.marketValue === b.marketValue ? a.id.localeCompare(b.id) : a.marketValue === null ? 1 : -1;
    return new Decimal(b.marketValue).comparedTo(a.marketValue) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return { status: "ready", revision: input.configuration.revision, rows: result, canShowPercentages: reason === null, reason };
}
