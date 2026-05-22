import type { InvestmentAccount } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";

export async function getAccounts(): Promise<InvestmentAccount[]> {
  return listAccounts();
}
