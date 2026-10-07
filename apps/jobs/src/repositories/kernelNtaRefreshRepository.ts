import { kernelNtaRpcArguments, type KernelNtaPlan } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { readAllRows } from "./readAllRows";

export interface KernelNtaRefreshResult {
  pending_snapshot_from: string | null;
  refresh_token: string;
  changed_count: number;
}
export async function refreshKernelNta(plan: KernelNtaPlan): Promise<KernelNtaRefreshResult> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("refresh_kernel_nta", kernelNtaRpcArguments(plan));
  if (error || !data) throw new Error("Kernel NTA atomic refresh failed.");
  return data;
}
export async function listKernelAffectedSnapshotDates(fromDate: string): Promise<string[]> {
  const db = await getSupabaseAdmin();
  const { data, error } = await readAllRows(db.from("portfolio_snapshot_headers")
    .select("snapshot_date").gte("snapshot_date", fromDate).order("snapshot_date"));
  if (error) throw new Error("Kernel snapshot refresh could not read dates.");
  return data.map(row => row.snapshot_date);
}
export async function completeKernelNtaSnapshots(instrumentId: string, token: string): Promise<void> {
  const db = await getSupabaseAdmin();
  const { error } = await db.rpc("complete_kernel_nta_snapshots", { p_instrument_id: instrumentId, p_refresh_token: token });
  if (error) throw new Error("Kernel snapshot refresh completion failed.");
}
