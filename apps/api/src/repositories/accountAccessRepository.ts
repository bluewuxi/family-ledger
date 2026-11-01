import { parseAccountScope, type AccountAccessPolicy, type AccountScope } from "@family-ledger/shared";
import { getSupabaseAdmin } from "../db/supabaseServer";
import { ApiRequestError } from "../utils/apiError";

function parsePolicy(value: unknown): AccountAccessPolicy | null {
  if (value === null) return null;
  const policy = value as AccountAccessPolicy;
  if (!policy || typeof policy.userId !== "string" || !Number.isSafeInteger(policy.revision) || policy.revision < 0) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "账户权限暂时不可用。", 503);
  try { return { userId: policy.userId, revision: policy.revision, scope: parseAccountScope(policy.scope) }; }
  catch { throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "账户权限暂时不可用。", 503); }
}
export async function getAccountAccessPolicy(userId: string): Promise<AccountAccessPolicy | null> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("read_account_scope", { target: userId });
  if (error) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "账户权限暂时不可用。", 503);
  return parsePolicy(data);
}
export async function replaceAccountScope(input: { actorId: string; userId: string; expectedRevision: number; scope: AccountScope }): Promise<AccountAccessPolicy> {
  const db = await getSupabaseAdmin();
  const { data, error } = await db.rpc("replace_account_scope", { actor: input.actorId, target: input.userId, expected_revision: input.expectedRevision, new_scope: input.scope });
  if (error?.code === "40001") throw new ApiRequestError("CONFLICT", "账户权限已变化，请刷新重试。", 409);
  if (error?.code === "42501") throw new ApiRequestError("FORBIDDEN", "不能修改此用户的账户权限。", 403);
  if (error && ["23514", "23503", "22P02"].includes(error.code)) throw new ApiRequestError("VALIDATION_ERROR", "账户权限配置无效，请刷新后重试。", 400);
  if (error) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "账户权限暂时不可用。", 503);
  const policy = parsePolicy(data);
  if (!policy) throw new ApiRequestError("NOT_FOUND", "用户不存在。", 404);
  return policy;
}
