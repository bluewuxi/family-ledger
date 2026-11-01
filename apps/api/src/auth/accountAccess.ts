import { getSupabaseAdmin } from "../db/supabaseServer";
import { canAccessAccount, type AccountAccessPolicy, type AccountResourceKind, type AccountResourceRef, type AuthenticatedUser } from "@family-ledger/shared";
import { getAccountAccessPolicy } from "../repositories/accountAccessRepository";
import { ApiRequestError } from "../utils/apiError";

export async function resolveAccountAccess(user: AuthenticatedUser): Promise<AccountAccessPolicy> {
  const policy = await getAccountAccessPolicy(user.id);
  if (!policy || policy.userId !== user.id) throw new ApiRequestError("FORBIDDEN", "尚未配置账户访问范围，请联系管理员。", 403);
  if (user.role === "admin") return { ...policy, scope: { mode: "all" } };
  if (policy.scope.mode === "selected") {
    const db = await getSupabaseAdmin();
    const { data, error } = await db.from("investment_accounts").select("id").eq("purpose", "education");
    if (error) throw new ApiRequestError("DEPENDENCY_UNAVAILABLE", "账户权限暂时不可用。", 503);
    const legacyIds = new Set((data ?? []).map(row => row.id));
    const educationAllowed = policy.scope.resources.some(ref => ref.kind === "education");
    policy.scope.resources = policy.scope.resources.filter(ref => ref.kind !== "ledger" || !legacyIds.has(ref.id));
    if (educationAllowed) policy.scope.resources.push(...[...legacyIds].map(id => ({ kind: "ledger" as const, id })));
  }
  return policy;
}
export function assertAccountVisible(policy: AccountAccessPolicy, resource: AccountResourceRef): void {
  if (!canAccessAccount(policy.scope, resource)) throw new ApiRequestError("NOT_FOUND", "记录不存在。", 404);
}
export function visibleAccountIds(policy: AccountAccessPolicy, kind: AccountResourceKind): readonly string[] | null {
  return policy.scope.mode === "all" ? null : policy.scope.resources.filter(ref => ref.kind === kind).map(ref => ref.id);
}
