import type { AccountAccessPolicy } from "@family-ledger/shared";
export async function reloadAccountScope(effects: { clearCache: () => void; remount: () => void; refreshSession: () => Promise<unknown> }): Promise<void> {
  effects.clearCache();
  effects.remount();
  await effects.refreshSession();
  // Publishing the refreshed identity invalidates reads started by the first remount.
  effects.remount();
}
export function canSaveAccountScope(policy: AccountAccessPolicy | undefined, userId: string): boolean { return policy?.userId === userId; }
let current: { user: string; revision: number } | null = null;
export function resetAccountScope(): void { current = null; }
export function observeAccountScope(token: string): "initial" | "same" | "changed" | "stale" {
  const split = token.lastIndexOf(":");
  const next = { user: token.slice(0, split), revision: Number(token.slice(split + 1)) };
  if (split < 1 || !Number.isSafeInteger(next.revision) || next.revision < 0) return "stale";
  if (!current) { current = next; return "initial"; }
  if (current.user === next.user && next.revision < current.revision) return "stale";
  if (current.user === next.user && next.revision === current.revision) return "same";
  current = next; return "changed";
}
