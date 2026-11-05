import type { AccountStatement, SpendingImportDecision } from "@family-ledger/shared";
export interface StatementCommitAttempt { id: string; token: string; decisions: SpendingImportDecision[] }
export async function commitStatementWithRecovery(attempt: StatementCommitAttempt, commit: (id: string, token: string, choices: SpendingImportDecision[]) => Promise<AccountStatement>, read: (id: string) => Promise<AccountStatement>): Promise<AccountStatement> {
  try { return await commit(attempt.id, attempt.token, attempt.decisions); }
  catch (error) {
    try { const current = await read(attempt.id); if (current.status === "committed") return current; }
    catch { /* Preserve the original write error and exact retry identity. */ }
    throw error;
  }
}

export function isDefinitiveStatementRejection(error: unknown): boolean { if (!error || typeof error !== "object" || !("status" in error)) return false;
  const status = error.status;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429; }
