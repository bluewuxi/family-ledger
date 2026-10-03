import type { EducationEntry, EducationEntryInput, EducationFund, CashflowReport } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { ApiRequestError } from "../utils/apiError";

export async function educationRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc(name, args);
  if (error?.code === "40001") throw new ApiRequestError("CONFLICT", "记录已变化，请刷新后重试。", 409);
  if (error?.code === "P0002") throw new ApiRequestError("NOT_FOUND", "教育储备记录不存在。", 404);
  if (error?.code === "23514" || error?.code === "23503") throw new ApiRequestError("VALIDATION_ERROR", "关联退款、币种或金额不符合规则，请检查记录。", 400);
  if (error) throw new Error("Education reserve database operation failed.");
  return data as T;
}
export async function readEducationReserve(): Promise<{ fund: EducationFund; entries: EducationEntry[] }> {
  return educationRpc("read_education_reserve", {});
}
export async function mutateEducationEntry(input: { operation: string; id: string; actorId: string; version: number | null; entry: EducationEntryInput | null }): Promise<EducationEntry | null> {
  return educationRpc("mutate_education_reserve_entry", { operation: input.operation, entry_id: input.id, actor_id: input.actorId, expected_version: input.version, entry: input.entry });
}
export async function queryCashflows(filters: Record<string, string | number>): Promise<CashflowReport> {
  return educationRpc("query_family_cashflows", { filters });
}
