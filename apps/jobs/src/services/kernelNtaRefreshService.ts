import type { KernelNtaPlan } from "@family-ledger/shared";
import { refreshKernelNta, listKernelAffectedSnapshotDates, completeKernelNtaSnapshots, type KernelNtaRefreshResult } from "../repositories/kernelNtaRefreshRepository";
import { generatePortfolioSnapshot } from "./portfolioSnapshotGenerationService";

interface KernelNtaRefreshDependencies {
  refresh(plan: KernelNtaPlan): Promise<KernelNtaRefreshResult>;
  listDates(fromDate: string): Promise<string[]>;
  recalculate(date: string): Promise<unknown>;
  complete(instrumentId: string, token: string): Promise<void>;
}
const defaultDependencies: KernelNtaRefreshDependencies = {
  refresh: refreshKernelNta, listDates: listKernelAffectedSnapshotDates,
  recalculate: date => generatePortfolioSnapshot({ snapshotDate: date }), complete: completeKernelNtaSnapshots
};
export async function applyKernelNtaPlan(plan: KernelNtaPlan, dependencies = defaultDependencies): Promise<number> {
  const result = await dependencies.refresh(plan);
  if (result.pending_snapshot_from) {
    const dates = await dependencies.listDates(result.pending_snapshot_from);
    for (const date of dates) await dependencies.recalculate(date);
    await dependencies.complete(plan.instrumentId, result.refresh_token);
  }
  return result.changed_count;
}
