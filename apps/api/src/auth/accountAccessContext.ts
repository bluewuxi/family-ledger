import { AsyncLocalStorage } from "node:async_hooks";
import type { AccountAccessPolicy, AccountResourceKind } from "@family-ledger/shared";
import { ApiRequestError } from "../utils/apiError";
import { visibleAccountIds } from "./accountAccess";

const storage = new AsyncLocalStorage<{ policy?: AccountAccessPolicy }>();
export function withAccountAccessRequest<T>(action: () => Promise<T>): Promise<T> { return storage.run({}, action); }
export function setRequestAccountAccess(policy: AccountAccessPolicy): void {
  const context = storage.getStore();
  if (context) context.policy = policy;
}
export function requestAccountPolicy(): AccountAccessPolicy | null {
  const context = storage.getStore();
  // No request context denotes trusted internal batch/fixture work, never an HTTP request.
  if (!context) return null;
  if (!context.policy) throw new ApiRequestError("FORBIDDEN", "尚未确认账户访问范围。", 403);
  return context.policy;
}
export function requestAccountIds(kind: AccountResourceKind): readonly string[] | null {
  const policy = requestAccountPolicy();
  return policy ? visibleAccountIds(policy, kind) : null;
}
export function requestScopeKey(): string {
  const policy = requestAccountPolicy();
  return policy ? JSON.stringify(policy) : "trusted";
}
export function isSelectedAccountRequest(): boolean { return requestAccountPolicy()?.scope.mode === "selected"; }
// Every SQL read applies this before ordering/pagination; an empty scope never becomes an absent filter.
export function scopeAccountQuery<T>(query: T, kind: AccountResourceKind, column: string): T {
  const ids = requestAccountIds(kind);
  return ids === null ? query : (query as unknown as { in(column: string, values: readonly string[]): unknown }).in(column, ids) as T;
}
