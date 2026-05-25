import { calculateHoldings, calculatePortfolioSnapshotValuation } from "@family-ledger/shared";
import { listAccounts } from "../repositories/accountRepository";
import { listInstruments } from "../repositories/instrumentRepository";
import { listPricesUntil } from "../repositories/priceRepository";
import { listSnapshotDatesFrom, upsertPortfolioSnapshot } from "../repositories/portfolioSnapshotRepository";
import { listTransactionsUntil } from "../repositories/transactionRepository";
import { listValuationRatesToUsdUntil } from "../repositories/fxRateRepository";

export async function recalculateSnapshotsFrom(fromDate: string): Promise<void> {
  const snapshotDates = await listSnapshotDatesFrom(fromDate);

  for (const snapshotDate of snapshotDates) {
    await recalculateSnapshot(snapshotDate);
  }
}

async function recalculateSnapshot(snapshotDate: string): Promise<void> {
  const [accounts, instruments, transactions, prices, fxRates] = await Promise.all([
    listAccounts(),
    listInstruments(),
    listTransactionsUntil(snapshotDate),
    listPricesUntil(snapshotDate),
    listValuationRatesToUsdUntil(snapshotDate)
  ]);
  const holdings = calculateHoldings(transactions, accounts, instruments);
  const valuation = calculatePortfolioSnapshotValuation({
    snapshotDate,
    holdings,
    accounts,
    prices,
    fxRates
  });

  await upsertPortfolioSnapshot(valuation);
}
