export type AccountResourceKind = "ledger" | "spending" | "education";
export interface AccountResourceRef { kind: AccountResourceKind; id: string }
export type AccountScope = { mode: "all" } | { mode: "selected"; resources: AccountResourceRef[] };
export interface AccountAccessPolicy { userId: string; revision: number; scope: AccountScope }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseAccountScope(input: unknown): AccountScope {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid account scope.");
  const value = input as Record<string, unknown>;
  if (value.mode === "all" && Object.keys(value).every(key => key === "mode")) return { mode: "all" };
  if (value.mode !== "selected" || !Array.isArray(value.resources) || Object.keys(value).some(key => key !== "mode" && key !== "resources")) throw new Error("Invalid account scope.");
  const resources = new Map<string, AccountResourceRef>();
  for (const item of value.resources) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid account resource.");
    const ref = item as Record<string, unknown>;
    if (!["ledger", "spending", "education"].includes(String(ref.kind)) || typeof ref.id !== "string" || !uuid.test(ref.id) || Object.keys(ref).some(key => key !== "kind" && key !== "id")) throw new Error("Invalid account resource.");
    const normalized = { kind: ref.kind as AccountResourceKind, id: ref.id.toLowerCase() };
    resources.set(`${normalized.kind}:${normalized.id}`, normalized);
  }
  return { mode: "selected", resources: [...resources.values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)) };
}

export function canAccessAccount(scope: AccountScope, resource: AccountResourceRef): boolean {
  return scope.mode === "all" || scope.resources.some(ref => ref.kind === resource.kind && ref.id === resource.id.toLowerCase());
}
