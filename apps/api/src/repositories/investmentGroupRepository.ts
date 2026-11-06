import type { InvestmentGroup, InvestmentGroupConfiguration } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { ApiRequestError } from "../utils/apiError";

async function groupRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    const db = await getSupabaseAdmin();
    const { data, error } = await db.rpc(name, args);
    if (error?.code === "40001") throw new ApiRequestError("CONFLICT", "分组已变化，请重新加载并检查修改后再保存。", 409);
    if (error?.code === "P0002") throw new ApiRequestError("NOT_FOUND", "分组不存在。", 404);
    if (error?.code === "42501") throw new ApiRequestError("FORBIDDEN", "仅管理员可维护分组。", 403);
    if (error && ["23505", "23514", "23503", "23502"].includes(error.code)) throw new ApiRequestError("VALIDATION_ERROR", "分组名称重复或成员无效，请检查非现金证券和名称。", 400);
    if (error || !data) throw new Error("Group dependency unavailable");
    return data as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "分组服务暂时不可用，请稍后重试。", 503);
  }
}
export function readInvestmentGroupConfiguration(): Promise<InvestmentGroupConfiguration> { return groupRpc("read_investment_group_configuration", {}); }
export function writeInvestmentGroup(input: { operation: "create" | "update" | "delete"; groupId: string | null; name: string | null; instrumentIds: string[]; expectedRevision: string; actorId: string }): Promise<{ revision: string; group: InvestmentGroup | null }> {
  return groupRpc("write_investment_group", { operation: input.operation, target_group_id: input.groupId, group_name: input.name, member_ids: input.instrumentIds, expected_revision: input.expectedRevision, actor_id: input.actorId });
}
