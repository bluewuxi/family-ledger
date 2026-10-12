import type { TransactionBalancesResponse } from "@family-ledger/shared";

export function validateTransactionBalances(data: TransactionBalancesResponse): void {
  if (!data || !Array.isArray(data.cashBalances) || !Array.isArray(data.holdings)) throw new Error("余额响应数据异常，请刷新或联系管理员。");
  const accounts = new Set<string>();
  for (const balance of data.cashBalances) {
    if (!balance || typeof balance.accountId !== "string" || !balance.accountId || typeof balance.instrumentId !== "string" || !balance.instrumentId ||
      typeof balance.quantity !== "string" || !/^-?\d+(?:\.\d+)?$/.test(balance.quantity) || !Array.isArray(balance.warnings) || accounts.has(balance.accountId)) {
      throw new Error("账户余额数据异常，请刷新或联系管理员。");
    }
    accounts.add(balance.accountId);
  }
}
