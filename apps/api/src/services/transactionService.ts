import type { InvestmentTransaction } from "@family-ledger/shared";
import { listTransactions } from "../repositories/transactionRepository";

export async function getTransactions(): Promise<InvestmentTransaction[]> {
  return listTransactions();
}
