import { parseAccountScope, type AuthenticatedUser } from "@family-ledger/shared";
import { getAccountAccessPolicy, replaceAccountScope } from "../repositories/accountAccessRepository";
import { ApiRequestError } from "../utils/apiError";

export async function readManagedAccountAccess(userId: string, actor: AuthenticatedUser) {
  assertManager(userId, actor, false);
  const policy = await getAccountAccessPolicy(userId);
  if (!policy) throw new ApiRequestError("NOT_FOUND", "用户不存在。", 404);
  return policy;
}
export async function saveManagedAccountAccess(userId: string, body: unknown, actor: AuthenticatedUser) {
  assertManager(userId, actor, true);
  const input = body as { expectedRevision?: unknown; scope?: unknown } | null;
  if (!input || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0) throw new ApiRequestError("VALIDATION_ERROR", "账户权限版本无效。", 400);
  let scope;
  try { scope = parseAccountScope(input.scope); } catch { throw new ApiRequestError("VALIDATION_ERROR", "账户权限配置无效。", 400); }
  return replaceAccountScope({ actorId: actor.id, userId, expectedRevision: Number(input.expectedRevision), scope });
}
function assertManager(userId: string, actor: AuthenticatedUser, writing: boolean): void {
  if (actor.role !== "admin" || (writing && actor.id === userId)) throw new ApiRequestError("FORBIDDEN", "不能修改此用户的账户权限。", 403);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new ApiRequestError("VALIDATION_ERROR", "用户标识无效。", 400);
}
