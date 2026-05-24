import { calculateHoldings as calculateSharedHoldings } from "@family-ledger/shared";
import type { HoldingSummary, Instrument, InvestmentAccount, InvestmentTransaction } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listTransactions } from "../repositories/transactionRepository";

export async function getHoldings(): Promise<HoldingSummary[]> {
  const [transactions, accounts, instruments] = await Promise.all([
    listTransactions(),
    listAccounts(),
    listInstruments()
  ]);

  return calculateHoldings(transactions, accounts, instruments);
}

export function calculateHoldings(
  transactions: InvestmentTransaction[],
  accounts: InvestmentAccount[],
  instruments: Instrument[]
): HoldingSummary[] {
  return calculateSharedHoldings(transactions, accounts, instruments);
}
